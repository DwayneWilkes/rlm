"""
Tests for rlm_sandbox.py - JSON-RPC based Python sandbox for RLM.

TDD: These tests are written FIRST, before implementation.
"""

import json
import pytest
from io import StringIO
from unittest.mock import patch, MagicMock


# =============================================================================
# 1B.1: JSON-RPC Server Tests
# =============================================================================

class TestJsonRpcParsing:
    """Test JSON-RPC request parsing."""

    def test_parse_valid_execute_request(self):
        """Parse a valid JSON-RPC execute request."""
        from rlm_sandbox import parse_jsonrpc_request

        request = '{"jsonrpc":"2.0","id":"1","method":"execute","params":{"code":"print(2+2)"}}'
        parsed = parse_jsonrpc_request(request)

        assert parsed["jsonrpc"] == "2.0"
        assert parsed["id"] == "1"
        assert parsed["method"] == "execute"
        assert parsed["params"]["code"] == "print(2+2)"

    def test_parse_valid_initialize_request(self):
        """Parse a valid JSON-RPC initialize request."""
        from rlm_sandbox import parse_jsonrpc_request

        request = '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"context":"test context"}}'
        parsed = parse_jsonrpc_request(request)

        assert parsed["method"] == "initialize"
        assert parsed["params"]["context"] == "test context"

    def test_parse_valid_destroy_request(self):
        """Parse a valid JSON-RPC destroy request."""
        from rlm_sandbox import parse_jsonrpc_request

        request = '{"jsonrpc":"2.0","id":"destroy","method":"destroy","params":{}}'
        parsed = parse_jsonrpc_request(request)

        assert parsed["method"] == "destroy"

    def test_parse_invalid_json_raises_error(self):
        """Invalid JSON should raise a parse error."""
        from rlm_sandbox import parse_jsonrpc_request, JsonRpcError

        with pytest.raises(JsonRpcError) as exc_info:
            parse_jsonrpc_request("not valid json")

        assert exc_info.value.code == -32700  # Parse error

    def test_parse_missing_method_raises_error(self):
        """Missing method should raise invalid request error."""
        from rlm_sandbox import parse_jsonrpc_request, JsonRpcError

        request = '{"jsonrpc":"2.0","id":"1","params":{}}'

        with pytest.raises(JsonRpcError) as exc_info:
            parse_jsonrpc_request(request)

        assert exc_info.value.code == -32600  # Invalid request


class TestJsonRpcResponseFormatting:
    """Test JSON-RPC response formatting."""

    def test_format_success_response(self):
        """Format a successful JSON-RPC response."""
        from rlm_sandbox import format_jsonrpc_response

        response = format_jsonrpc_response(
            id="1",
            result={"stdout": "4\n", "stderr": "", "duration": 15}
        )

        parsed = json.loads(response)
        assert parsed["jsonrpc"] == "2.0"
        assert parsed["id"] == "1"
        assert parsed["result"]["stdout"] == "4\n"
        assert parsed["result"]["duration"] == 15
        assert "error" not in parsed

    def test_format_error_response(self):
        """Format an error JSON-RPC response."""
        from rlm_sandbox import format_jsonrpc_response

        response = format_jsonrpc_response(
            id="1",
            error={"code": -32600, "message": "Invalid Request"}
        )

        parsed = json.loads(response)
        assert parsed["jsonrpc"] == "2.0"
        assert parsed["id"] == "1"
        assert parsed["error"]["code"] == -32600
        assert parsed["error"]["message"] == "Invalid Request"
        assert "result" not in parsed

    def test_format_response_with_null_id(self):
        """Format a response with null id (for notifications or parse errors)."""
        from rlm_sandbox import format_jsonrpc_response

        response = format_jsonrpc_response(
            id=None,
            error={"code": -32700, "message": "Parse error"}
        )

        parsed = json.loads(response)
        assert parsed["id"] is None


# =============================================================================
# 1B.2: Code Execution with Capture Tests
# =============================================================================

class TestCodeExecution:
    """Test code execution with stdout/stderr capture."""

    def test_execute_captures_stdout(self):
        """Execute code and capture stdout from print statements."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        result = sandbox.execute("print(2 + 2)")

        assert result["stdout"] == "4\n"
        assert result["stderr"] == ""

    def test_execute_captures_stderr(self):
        """Execute code and capture stderr."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        result = sandbox.execute("import sys; sys.stderr.write('error message')")

        assert "error message" in result["stderr"]

    def test_execute_returns_duration_in_milliseconds(self):
        """Execute code and return duration in milliseconds."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        result = sandbox.execute("x = 1 + 1")

        assert "duration" in result
        assert isinstance(result["duration"], (int, float))
        assert result["duration"] >= 0

    def test_execute_captures_exception(self):
        """Execute code that raises an exception and capture it."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        result = sandbox.execute("raise ValueError('test error')")

        assert "ValueError" in result["stderr"]
        assert "test error" in result["stderr"]

    def test_execute_preserves_state_between_calls(self):
        """Variables should persist between execute calls."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        sandbox.execute("x = 42")
        result = sandbox.execute("print(x)")

        assert result["stdout"] == "42\n"

    def test_execute_multiple_print_statements(self):
        """Capture output from multiple print statements."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        result = sandbox.execute("print('line1')\nprint('line2')")

        assert result["stdout"] == "line1\nline2\n"


# =============================================================================
# 1B.3: Bridge Callbacks Tests
# =============================================================================

class TestBridgeCallbacks:
    """Test llm_query and rlm_query bridge callbacks."""

    def test_llm_query_sends_jsonrpc_request(self):
        """llm_query sends a JSON-RPC request to host."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()

        # Mock stdin/stdout for bridge communication by patching sandbox's internal references
        mock_response = '{"jsonrpc":"2.0","id":"bridge:1","result":"LLM response text"}\n'
        mock_stdout = StringIO()
        sandbox._stdin = StringIO(mock_response)
        sandbox._stdout = mock_stdout

        # Execute code that calls llm_query
        sandbox.execute("result = llm_query('What is 2+2?')")

        # Check that a JSON-RPC request was sent
        output = mock_stdout.getvalue()
        # The output should contain the bridge request
        lines = [l for l in output.strip().split('\n') if l.startswith('{')]
        assert len(lines) >= 1
        request = json.loads(lines[0])
        assert request["method"] == "bridge:llm"
        assert request["params"]["prompt"] == "What is 2+2?"

    def test_llm_query_returns_response(self):
        """llm_query returns the response from host."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()

        # Mock the bridge communication
        mock_response = '{"jsonrpc":"2.0","id":"bridge:1","result":"The answer is 4"}\n'

        with patch.object(sandbox, '_bridge_call', return_value="The answer is 4"):
            sandbox.execute("result = llm_query('What is 2+2?')")
            sandbox.execute("print(result)")
            # The result should be available
            assert "result" in sandbox._globals

    def test_rlm_query_sends_jsonrpc_request(self):
        """rlm_query sends a JSON-RPC request to host with task and context."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()

        # Mock stdin/stdout for bridge communication by patching sandbox's internal references
        mock_response = '{"jsonrpc":"2.0","id":"bridge:1","result":"Sub-task result"}\n'
        mock_stdout = StringIO()
        sandbox._stdin = StringIO(mock_response)
        sandbox._stdout = mock_stdout

        sandbox.execute("result = rlm_query('analyze data', 'some context')")

        output = mock_stdout.getvalue()
        lines = [l for l in output.strip().split('\n') if l.startswith('{')]
        assert len(lines) >= 1
        request = json.loads(lines[0])
        assert request["method"] == "bridge:rlm"
        assert request["params"]["task"] == "analyze data"
        assert request["params"]["ctx"] == "some context"

    def test_rlm_query_returns_response(self):
        """rlm_query returns the response from host."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()

        with patch.object(sandbox, '_bridge_call', return_value="Sub-task completed"):
            sandbox.execute("result = rlm_query('analyze', 'ctx')")
            assert "result" in sandbox._globals


# =============================================================================
# 1B.4: Context Injection Tests
# =============================================================================

class TestContextInjection:
    """Test context injection via initialize method."""

    def test_context_available_after_initialize(self):
        """Context variable should be available after initialize."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        sandbox.initialize(context="This is the task context")

        result = sandbox.execute("print(context)")

        assert result["stdout"] == "This is the task context\n"

    def test_context_is_string_type(self):
        """Context should be a string."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        sandbox.initialize(context="test context")

        result = sandbox.execute("print(type(context).__name__)")

        assert result["stdout"] == "str\n"

    def test_context_empty_string_by_default(self):
        """Context should be empty string if not provided."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        sandbox.initialize(context="")

        result = sandbox.execute("print(repr(context))")

        assert result["stdout"] == "''\n"

    def test_context_with_special_characters(self):
        """Context with special characters should be handled correctly."""
        from rlm_sandbox import RlmSandbox

        sandbox = RlmSandbox()
        sandbox.initialize(context="Line1\nLine2\tTabbed")

        result = sandbox.execute("print(context)")

        assert "Line1" in result["stdout"]
        assert "Line2" in result["stdout"]


# =============================================================================
# Integration: JSON-RPC Server Loop Tests
# =============================================================================

class TestJsonRpcServerIntegration:
    """Test the full JSON-RPC server integration."""

    def test_handle_execute_request(self):
        """Handle a complete execute request/response cycle."""
        from rlm_sandbox import RlmSandbox, handle_request

        sandbox = RlmSandbox()
        request = '{"jsonrpc":"2.0","id":"1","method":"execute","params":{"code":"print(2+2)"}}'

        response = handle_request(sandbox, request)
        parsed = json.loads(response)

        assert parsed["id"] == "1"
        assert parsed["result"]["stdout"] == "4\n"

    def test_handle_initialize_request(self):
        """Handle a complete initialize request/response cycle."""
        from rlm_sandbox import RlmSandbox, handle_request

        sandbox = RlmSandbox()
        request = '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"context":"my context"}}'

        response = handle_request(sandbox, request)
        parsed = json.loads(response)

        assert parsed["id"] == "init"
        assert parsed["result"]["status"] == "ok"

        # Verify context was set
        result = sandbox.execute("print(context)")
        assert result["stdout"] == "my context\n"

    def test_handle_destroy_request(self):
        """Handle a destroy request."""
        from rlm_sandbox import RlmSandbox, handle_request

        sandbox = RlmSandbox()
        request = '{"jsonrpc":"2.0","id":"destroy","method":"destroy","params":{}}'

        response = handle_request(sandbox, request)
        parsed = json.loads(response)

        assert parsed["id"] == "destroy"
        assert parsed["result"]["status"] == "ok"

    def test_handle_invalid_method(self):
        """Handle an unknown method."""
        from rlm_sandbox import RlmSandbox, handle_request

        sandbox = RlmSandbox()
        request = '{"jsonrpc":"2.0","id":"1","method":"unknown","params":{}}'

        response = handle_request(sandbox, request)
        parsed = json.loads(response)

        assert parsed["error"]["code"] == -32601  # Method not found
