"""
RLM Sandbox - JSON-RPC based Python sandbox for RLM.

Provides a Python execution environment with:
- JSON-RPC 2.0 protocol over stdio
- stdout/stderr capture
- Bridge callbacks for llm_query() and rlm_query()
- Context injection
"""

import json
import logging
import sys
import time
import traceback
from io import StringIO
from typing import Any, Dict, Optional

# =============================================================================
# Logging Configuration
# =============================================================================

logging.basicConfig(
    level=logging.DEBUG,
    format='[rlm_sandbox] %(levelname)s: %(message)s',
    stream=sys.stderr  # Use stderr to not interfere with JSON-RPC on stdout
)
logger = logging.getLogger(__name__)


# =============================================================================
# JSON-RPC Error Codes (per specification)
# =============================================================================

PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603


# =============================================================================
# JSON-RPC Error Exception
# =============================================================================

class JsonRpcError(Exception):
    """JSON-RPC error with code and message."""

    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


# =============================================================================
# JSON-RPC Parsing and Formatting
# =============================================================================

def parse_jsonrpc_request(request_str: str) -> Dict[str, Any]:
    """
    Parse a JSON-RPC 2.0 request string.

    Args:
        request_str: JSON string containing the request

    Returns:
        Parsed request dictionary

    Raises:
        JsonRpcError: If parsing fails or request is invalid
    """
    try:
        request = json.loads(request_str)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {str(e)}")
        raise JsonRpcError(PARSE_ERROR, f"Parse error: {str(e)}")

    # Validate required fields
    if not isinstance(request, dict):
        logger.error("Invalid request: expected object")
        raise JsonRpcError(INVALID_REQUEST, "Invalid Request: expected object")

    if "method" not in request:
        logger.error("Invalid request: missing method field")
        raise JsonRpcError(INVALID_REQUEST, "Invalid Request: missing method")

    method = request.get("method")
    request_id = request.get("id")
    logger.debug(f"Incoming request: method={method}, id={request_id}")

    return request


def format_jsonrpc_response(
    id: Optional[str],
    result: Any = None,
    error: Optional[Dict[str, Any]] = None
) -> str:
    """
    Format a JSON-RPC 2.0 response.

    Args:
        id: Request ID (can be None for notifications or parse errors)
        result: Success result (mutually exclusive with error)
        error: Error object with code and message

    Returns:
        JSON string of the response
    """
    response: Dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": id
    }

    if error is not None:
        response["error"] = error
        logger.debug(f"Formatting error response: id={id}, error_code={error.get('code')}")
    else:
        response["result"] = result
        logger.debug(f"Formatting success response: id={id}")

    return json.dumps(response)


# =============================================================================
# RLM Sandbox Class
# =============================================================================

class RlmSandbox:
    """
    Python sandbox with JSON-RPC interface for RLM execution.

    Provides:
    - Code execution with stdout/stderr capture
    - Persistent state between executions
    - Bridge callbacks: llm_query() and rlm_query()
    - Context injection via initialize()
    """

    def __init__(self):
        """Initialize the sandbox with empty globals."""
        self._globals: Dict[str, Any] = {}
        self._bridge_counter = 0
        self._stdin = sys.stdin
        self._stdout = sys.stdout

        # Inject bridge functions into globals
        self._globals["llm_query"] = self._make_llm_query()
        self._globals["rlm_query"] = self._make_rlm_query()

    def _make_llm_query(self):
        """Create the llm_query function for the sandbox."""
        def llm_query(prompt: str) -> str:
            """
            Query an LLM with the given prompt.

            Args:
                prompt: The prompt to send to the LLM

            Returns:
                The LLM's response text
            """
            logger.debug(f"llm_query: prompt_len={len(prompt)}")
            response = self._bridge_call("bridge:llm", {"prompt": prompt})
            logger.debug(f"llm_query: response_len={len(response)}")
            return response
        return llm_query

    def _make_rlm_query(self):
        """Create the rlm_query function for the sandbox."""
        def rlm_query(task: str, ctx: str) -> str:
            """
            Execute a recursive RLM sub-task.

            Args:
                task: The task description
                ctx: The context for the task

            Returns:
                The result of the sub-task
            """
            ctx_present = "yes" if ctx else "no"
            logger.debug(f"rlm_query: task_len={len(task)}, context_present={ctx_present}")
            response = self._bridge_call("bridge:rlm", {"task": task, "ctx": ctx})
            logger.debug(f"rlm_query: response_len={len(response)}")
            return response
        return rlm_query

    def _bridge_call(self, method: str, params: Dict[str, Any]) -> str:
        """
        Make a bridge callback to the host via JSON-RPC.

        Args:
            method: The bridge method name
            params: Parameters for the bridge call

        Returns:
            The result from the host
        """
        self._bridge_counter += 1
        request_id = f"bridge:{self._bridge_counter}"

        logger.debug(f"Bridge call: method={method}, id={request_id}")

        # Send JSON-RPC request to host
        request = json.dumps({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        })

        # Write to stdout (host reads this)
        self._stdout.write(request + "\n")
        self._stdout.flush()

        # Read response from stdin (host writes this)
        response_line = self._stdin.readline()
        response = json.loads(response_line)

        if "error" in response:
            logger.error(f"Bridge error response: {response['error']}")
            raise RuntimeError(f"Bridge error: {response['error']}")

        result = response.get("result", "")
        logger.debug(f"Bridge response received: id={request_id}, result_len={len(str(result))}")
        return result

    def initialize(self, context: str = "") -> None:
        """
        Initialize the sandbox with a context string.

        Args:
            context: The context string to make available as `context` variable
        """
        context_len = len(context)
        logger.debug(f"Initializing sandbox with context length: {context_len} chars")
        self._globals["context"] = context

    def execute(self, code: str) -> Dict[str, Any]:
        """
        Execute Python code and capture output.

        Args:
            code: Python code to execute

        Returns:
            Dictionary with stdout, stderr, and duration (in milliseconds)
        """
        # Log code snippet (first 50 chars)
        code_snippet = code[:50].replace('\n', ' ')
        logger.debug(f"Executing code: {code_snippet}...")

        # Capture stdout and stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        captured_stdout = StringIO()
        captured_stderr = StringIO()

        sys.stdout = captured_stdout
        sys.stderr = captured_stderr

        start_time = time.perf_counter()

        try:
            # Execute the code with persistent globals
            exec(code, self._globals)
        except Exception:
            # Capture exception traceback to stderr
            traceback.print_exc(file=captured_stderr)
        finally:
            # Restore stdout/stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        end_time = time.perf_counter()
        duration_ms = (end_time - start_time) * 1000

        stdout_out = captured_stdout.getvalue()
        stderr_out = captured_stderr.getvalue()

        logger.debug(f"Execution completed: duration={duration_ms:.2f}ms, stdout_len={len(stdout_out)}, stderr_len={len(stderr_out)}")

        return {
            "stdout": stdout_out,
            "stderr": stderr_out,
            "duration": duration_ms
        }

    def destroy(self) -> None:
        """Clean up the sandbox."""
        self._globals.clear()


# =============================================================================
# Request Handler
# =============================================================================

def handle_request(sandbox: RlmSandbox, request_str: str) -> str:
    """
    Handle a JSON-RPC request and return the response.

    Args:
        sandbox: The RlmSandbox instance
        request_str: JSON-RPC request string

    Returns:
        JSON-RPC response string
    """
    request_id = None

    try:
        request = parse_jsonrpc_request(request_str)
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params", {})

        logger.debug(f"Dispatching method: {method}")

        if method == "execute":
            code = params.get("code", "")
            result = sandbox.execute(code)
            return format_jsonrpc_response(request_id, result=result)

        elif method == "initialize":
            context = params.get("context", "")
            sandbox.initialize(context)
            logger.debug("Initialize method completed")
            return format_jsonrpc_response(request_id, result={"status": "ok"})

        elif method == "destroy":
            sandbox.destroy()
            logger.debug("Destroy method completed")
            return format_jsonrpc_response(request_id, result={"status": "ok"})

        else:
            logger.warning(f"Method not found: {method}")
            return format_jsonrpc_response(
                request_id,
                error={"code": METHOD_NOT_FOUND, "message": f"Method not found: {method}"}
            )

    except JsonRpcError as e:
        logger.error(f"JsonRpcError: code={e.code}, message={e.message}")
        return format_jsonrpc_response(
            request_id,
            error={"code": e.code, "message": e.message}
        )
    except Exception as e:
        logger.error(f"Internal error: {str(e)}")
        return format_jsonrpc_response(
            request_id,
            error={"code": INTERNAL_ERROR, "message": str(e)}
        )


# =============================================================================
# Main Server Loop
# =============================================================================

def run_server():
    """
    Run the JSON-RPC server over stdio.

    Reads JSON-RPC requests from stdin, processes them, and writes
    responses to stdout.
    """
    logger.info("RLM Sandbox server started")
    sandbox = RlmSandbox()

    request_count = 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_count += 1
        logger.debug(f"Request #{request_count} received")

        response = handle_request(sandbox, line)
        print(response, flush=True)

        logger.debug(f"Response #{request_count} sent")


if __name__ == "__main__":
    run_server()
