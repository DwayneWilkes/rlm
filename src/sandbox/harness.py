"""
RLM Python Sandbox Harness

This script runs inside the Python subprocess. It reads JSON commands from stdin,
executes them, and writes JSON responses to stdout.

Protocol:
  stdin  → {"cmd": "init", "context": "..."}
  stdout ← {"ok": true}

  stdin  → {"cmd": "exec", "code": "..."}
  stdout ← {"ok": true, "stdout": "...", "stderr": "..."}

  stdin  → {"cmd": "get_var", "name": "..."}
  stdout ← {"ok": true, "value": "..."}

  stdin  → {"cmd": "shutdown"}
  stdout ← {"ok": true}

Sub-calls (llm_query / rlm_query):
  When sandbox code calls llm_query() or rlm_query(), the harness sends a
  sub-call request to the Rust process and blocks until it receives a response.

  stdout → {"ok": true, "stdout": "...", "sub_calls": [{"call_type": "llm_query", "prompt": "...", "call_id": "..."}]}
  stdin  ← {"call_id": "...", "result": "..."}
"""

import sys
import io
import json
import traceback
import re
import contextlib
import threading

# Global namespace for executed code
_namespace = {}

# Sub-call tracking
_sub_call_counter = 0
_sub_call_lock = threading.Lock()
_pending_sub_calls = []


def _next_call_id():
    global _sub_call_counter
    with _sub_call_lock:
        _sub_call_counter += 1
        return f"sc_{_sub_call_counter}"


def _send(obj):
    """Send a JSON object to stdout (the Rust process)."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _recv():
    """Read a JSON object from stdin (from the Rust process)."""
    line = sys.stdin.readline()
    if not line:
        sys.exit(0)
    return json.loads(line.strip())


# ── Helper functions available in the sandbox ──

def parse_academic_paper(text):
    """Parse an academic paper into structured sections.

    Detects:
    - Title (first non-empty line)
    - Abstract (text after 'abstract' heading)
    - Numbered sections (e.g., '1. Introduction', '1.1 Background')
    - Markdown headings (# / ## / ###)
    - ALL-CAPS headings (e.g., 'INTRODUCTION')
    """
    sections = {}
    lines = text.split("\n")

    # Title: first non-empty line
    for line in lines:
        stripped = line.strip()
        if stripped:
            sections["title"] = stripped
            break

    current_section = None
    current_content = []

    for line in lines:
        stripped = line.strip()

        # Numbered section: "1. Introduction" or "1.1 Background"
        numbered = re.match(r'^(\d+(?:\.\d+)*)\s*[.)\s]\s*(.+)', stripped)
        if numbered:
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = numbered.group(2).strip()
            current_content = []
            continue

        # Markdown heading: # / ## / ###
        md_heading = re.match(r'^(#{1,3})\s+(.+)', stripped)
        if md_heading:
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = md_heading.group(2).strip()
            current_content = []
            continue

        # ALL-CAPS heading (at least 3 chars, all uppercase letters/spaces)
        if stripped and len(stripped) >= 3 and stripped == stripped.upper() and re.match(r'^[A-Z\s]+$', stripped):
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = stripped.title()
            current_content = []
            continue

        # Abstract detection
        if stripped.lower() == "abstract":
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = "Abstract"
            current_content = []
            continue

        if current_section:
            current_content.append(line)

    # Save last section
    if current_section:
        sections[current_section] = "\n".join(current_content).strip()

    return sections


# ── Command handlers ──

def _make_read_chunk(ctx):
    """Create a read_chunk closure bound to the given context string."""
    def read_chunk(start, end):
        """Return context[start:end]. Use to read large contexts in slices."""
        return ctx[start:end]
    return read_chunk


def _make_context_len(ctx):
    """Create a context_len closure bound to the given context string."""
    def context_len():
        """Return len(context) without printing the whole thing."""
        return len(ctx)
    return context_len


def handle_init(context):
    """Initialize the sandbox with the context variable."""
    _namespace.clear()
    _namespace["context"] = context
    _namespace["parse_academic_paper"] = parse_academic_paper
    _namespace["read_chunk"] = _make_read_chunk(context)
    _namespace["context_len"] = _make_context_len(context)
    _namespace["print"] = print  # ensure print is available
    return {"ok": True}


def handle_exec(code):
    """Execute code in the sandbox, capturing stdout/stderr."""
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()

    error = None
    try:
        with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
            exec(code, _namespace)
    except Exception:
        error = traceback.format_exc()

    result = {
        "ok": error is None,
        "stdout": stdout_capture.getvalue(),
        "stderr": stderr_capture.getvalue(),
    }
    if error:
        result["error"] = error

    return result


def handle_get_var(name):
    """Retrieve a variable from the namespace."""
    if name in _namespace:
        val = _namespace[name]
        try:
            # Try JSON serialization first for structured data
            text = json.dumps(val) if not isinstance(val, str) else val
        except (TypeError, ValueError):
            text = str(val)
        return {"ok": True, "value": text}
    else:
        return {"ok": False, "error": f"Variable '{name}' not found"}


# ── Main loop ──

def main():
    while True:
        try:
            cmd = _recv()
        except (json.JSONDecodeError, EOFError):
            break

        cmd_type = cmd.get("cmd")

        if cmd_type == "init":
            result = handle_init(cmd["context"])
        elif cmd_type == "exec":
            result = handle_exec(cmd["code"])
        elif cmd_type == "get_var":
            result = handle_get_var(cmd["name"])
        elif cmd_type == "shutdown":
            _send({"ok": True})
            break
        else:
            result = {"ok": False, "error": f"Unknown command: {cmd_type}"}

        _send(result)


if __name__ == "__main__":
    main()
