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
        self._globals["batch_llm_query"] = self._make_batch_llm_query()

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
        def rlm_query(task: str, ctx: Optional[str] = None) -> str:
            """
            Execute a recursive RLM sub-task.

            Args:
                task: The task description
                ctx: Optional context for the task (uses current context if None)

            Returns:
                The result of the sub-task
            """
            ctx_present = "yes" if ctx is not None else "no"
            logger.debug(f"rlm_query: task_len={len(task)}, context_present={ctx_present}")
            # Pass context to bridge, or None if not provided
            params = {"task": task}
            if ctx is not None:
                params["context"] = ctx
            response = self._bridge_call("bridge:rlm", params)
            logger.debug(f"rlm_query: response_len={len(response)}")
            return response
        return rlm_query

    def _make_batch_llm_query(self):
        """Create the batch_llm_query function for the sandbox."""
        from typing import List

        def batch_llm_query(prompts: List[str]) -> List[str]:
            """
            Query an LLM with multiple prompts in parallel.

            This is more efficient than calling llm_query() multiple times
            as all prompts are sent to the host at once and processed in parallel.

            Args:
                prompts: List of prompts to send to the LLM

            Returns:
                List of LLM responses in the same order as prompts
            """
            if not prompts:
                return []

            logger.debug(f"batch_llm_query: num_prompts={len(prompts)}")
            response = self._bridge_call("bridge:batch_llm", {"prompts": prompts})
            # Response is a list of strings
            if isinstance(response, list):
                logger.debug(f"batch_llm_query: num_responses={len(response)}")
                return response
            else:
                # Handle unexpected response format
                logger.error(f"batch_llm_query: unexpected response type {type(response)}")
                return [str(response)] * len(prompts)
        return batch_llm_query

    def _bridge_call(self, method: str, params: Dict[str, Any]) -> Any:
        """
        Make a bridge callback to the host via JSON-RPC.

        Args:
            method: The bridge method name
            params: Parameters for the bridge call

        Returns:
            The result from the host (string or list depending on method)
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

        # Add utility functions
        self._globals["chunk_text"] = self._make_chunk_text()
        self._globals["search_context"] = self._make_search_context()
        self._globals["count_matches"] = self._make_count_matches()
        self._globals["extract_json"] = self._make_extract_json()
        self._globals["extract_sections"] = self._make_extract_sections()
        self._globals["find_line"] = self._make_find_line()
        self._globals["count_lines"] = self._make_count_lines()
        self._globals["get_line"] = self._make_get_line()
        self._globals["quote_match"] = self._make_quote_match()

    def _make_chunk_text(self):
        """Create the chunk_text utility function."""
        def chunk_text(text: str, chunk_size: int, overlap: int = 0) -> list:
            """
            Split text into chunks of specified size with optional overlap.

            Args:
                text: The text to split
                chunk_size: Size of each chunk
                overlap: Number of characters to overlap between chunks

            Returns:
                List of text chunks
            """
            if chunk_size <= 0:
                return [text]

            chunks = []
            start = 0
            while start < len(text):
                end = start + chunk_size
                chunks.append(text[start:end])
                start = end - overlap if overlap > 0 else end
            return chunks
        return chunk_text

    def _make_search_context(self):
        """Create the search_context utility function."""
        import re

        def search_context(pattern: str, window: int = 50, max_results: int = 100) -> list:
            """
            Search for pattern in context and return matches with surrounding text.

            Args:
                pattern: Regular expression pattern to search for
                window: Number of characters to include before and after match
                max_results: Maximum number of results to return (default: 100)

            Returns:
                List of dictionaries with 'match' and 'context' keys

            Raises:
                ValueError: If pattern is too long or invalid
            """
            # Security: Limit pattern length to prevent ReDoS attacks
            MAX_PATTERN_LENGTH = 500
            if len(pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            # Validate and compile pattern
            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            context = self._globals.get("context", "")
            results = []

            for match in compiled.finditer(context):
                if len(results) >= max_results:
                    break
                start = max(0, match.start() - window)
                end = min(len(context), match.end() + window)
                results.append({
                    "match": match.group(),
                    "context": context[start:end],
                    "start": match.start(),
                    "end": match.end()
                })

            return results
        return search_context

    def _make_count_matches(self):
        """Create the count_matches utility function."""
        import re

        def count_matches(pattern: str) -> int:
            """
            Count regex matches in context without building full results list.

            More memory-efficient than search_context when you only need the count.

            Args:
                pattern: Regex pattern to search for

            Returns:
                Number of matches found

            Raises:
                ValueError: If pattern is too long or invalid
            """
            MAX_PATTERN_LENGTH = 500
            if len(pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            context = self._globals.get("context", "")
            return len(compiled.findall(context))
        return count_matches

    def _make_extract_json(self):
        """Create the extract_json utility function."""
        import re
        import json as json_module

        def extract_json(text: str):
            """
            Safely extract JSON object or array from text.

            Finds the first valid JSON structure in the text and parses it.

            Args:
                text: Text that may contain JSON

            Returns:
                Parsed JSON as dict or list, or None if no valid JSON found
            """
            # Try to find JSON object
            obj_match = re.search(r'\{[\s\S]*\}', text)
            arr_match = re.search(r'\[[\s\S]*\]', text)

            candidates = []
            if obj_match:
                candidates.append(obj_match.group())
            if arr_match:
                candidates.append(arr_match.group())

            # Try each candidate, longest first (more likely to be complete)
            candidates.sort(key=len, reverse=True)

            for candidate in candidates:
                try:
                    return json_module.loads(candidate)
                except json_module.JSONDecodeError:
                    continue

            return None
        return extract_json

    def _make_extract_sections(self):
        """Create the extract_sections utility function."""
        import re

        def extract_sections(header_pattern: str) -> list:
            """
            Extract sections from context based on header pattern.

            Splits the context into sections where each section starts with
            a line matching the header pattern.

            Args:
                header_pattern: Regex pattern for section headers (use MULTILINE anchors)

            Returns:
                List of dicts with 'header', 'content', and 'start' keys
            """
            MAX_PATTERN_LENGTH = 500
            if len(header_pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            try:
                compiled = re.compile(header_pattern, re.MULTILINE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            context = self._globals.get("context", "")
            matches = list(compiled.finditer(context))
            sections = []

            for i, match in enumerate(matches):
                header = match.group()
                start = match.start()
                # Content ends at next header or end of context
                end = matches[i + 1].start() if i + 1 < len(matches) else len(context)
                content = context[match.end():end].strip()

                sections.append({
                    'header': header,
                    'content': content,
                    'start': start
                })

            return sections
        return extract_sections

    def _make_find_line(self):
        """Create the find_line utility function."""
        import re

        def find_line(pattern: str) -> list:
            """
            Find lines in context matching a regex pattern.

            Use this to verify line numbers before citing them in your analysis.
            Returns 1-indexed line numbers to match how humans reference code.

            Args:
                pattern: Regex pattern to search for

            Returns:
                List of tuples: [(line_number, line_content), ...]

            Raises:
                ValueError: If pattern is too long or invalid

            Example:
                >>> find_line("def complete")
                [(87, "  async def complete(request: LLMRequest):")]
            """
            MAX_PATTERN_LENGTH = 500
            if len(pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            context = self._globals.get("context", "")
            lines = context.split('\n')
            return [(i + 1, line) for i, line in enumerate(lines) if compiled.search(line)]
        return find_line

    def _make_count_lines(self):
        """Create the count_lines utility function."""
        import re

        def count_lines(pattern: str = None) -> int:
            """
            Count lines in context, optionally filtering by pattern.

            Use this to get accurate line counts instead of estimating.

            Args:
                pattern: Optional regex pattern to filter lines

            Returns:
                Total line count, or count of matching lines if pattern given

            Raises:
                ValueError: If pattern is too long or invalid

            Example:
                >>> count_lines()  # Total lines
                113
                >>> count_lines("import")  # Lines containing 'import'
                5
            """
            context = self._globals.get("context", "")
            lines = context.split('\n')
            if pattern is None:
                return len(lines)

            MAX_PATTERN_LENGTH = 500
            if len(pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            return len([line for line in lines if compiled.search(line)])
        return count_lines

    def _make_get_line(self):
        """Create the get_line utility function."""

        def get_line(n: int) -> str:
            """
            Get the content of a specific line (1-indexed).

            Use this to verify what a specific line contains.

            Args:
                n: Line number (1-indexed, like editors show)

            Returns:
                Line content, or empty string if line doesn't exist

            Example:
                >>> get_line(90)
                "      max_tokens: request.maxTokens ?? 8192,"
            """
            context = self._globals.get("context", "")
            lines = context.split('\n')
            if n < 1 or n > len(lines):
                return ""
            return lines[n - 1]
        return get_line

    def _make_quote_match(self):
        """Create the quote_match utility function."""
        import re

        def quote_match(pattern: str, max_length: int = 100) -> str:
            """
            Return the first match of a pattern in context.

            Use this to quote actual text as evidence for claims.

            Args:
                pattern: Regex pattern to search for
                max_length: Maximum length of returned match (default: 100)

            Returns:
                The matched text, or None if no match found

            Raises:
                ValueError: If pattern is too long or invalid

            Example:
                >>> quote_match("max_tokens.*?[,;]")
                "max_tokens: request.maxTokens ?? 8192,"
            """
            MAX_PATTERN_LENGTH = 500
            if len(pattern) > MAX_PATTERN_LENGTH:
                raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

            try:
                compiled = re.compile(pattern, re.IGNORECASE)
            except re.error as e:
                raise ValueError(f"Invalid regex pattern: {e}")

            context = self._globals.get("context", "")
            match = compiled.search(context)
            if match:
                result = match.group()
                if len(result) > max_length:
                    return result[:max_length] + "..."
                return result
            return None
        return quote_match

    def get_variable(self, name: str) -> Dict[str, Any]:
        """
        Get a variable's value from the sandbox globals.

        Args:
            name: Variable name to retrieve

        Returns:
            Dictionary with 'value' and 'found' keys
        """
        logger.debug(f"Getting variable: {name}")

        if name in self._globals:
            value = self._globals[name]
            # Convert to JSON-serializable value
            try:
                json.dumps(value)  # Test if serializable
                return {"value": value, "found": True}
            except (TypeError, ValueError):
                # Not JSON serializable, convert to string
                return {"value": str(value), "found": True}
        else:
            return {"value": None, "found": False}

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
            # If there was an error in stderr, include it in the error field
            if result.get("stderr"):
                result["error"] = result["stderr"]
            return format_jsonrpc_response(request_id, result=result)

        elif method == "initialize":
            context = params.get("context", "")
            sandbox.initialize(context)
            logger.debug("Initialize method completed")
            return format_jsonrpc_response(request_id, result={"status": "ok"})

        elif method == "get_variable":
            name = params.get("name", "")
            result = sandbox.get_variable(name)
            logger.debug(f"Get variable '{name}' completed: found={result.get('found')}")
            return format_jsonrpc_response(request_id, result=result)

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
