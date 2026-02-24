### Requirement: CLI Dispatcher
The binary SHALL use clap to provide subcommands: `serve` (default, starts MCP server), `run` (execute a task), `config show` (display configuration), and `templates` (list templates).

#### Scenario: Default command starts MCP server
- **WHEN** `rlm` is run with no subcommand
- **THEN** the MCP server starts on stdin/stdout

#### Scenario: Run subcommand
- **WHEN** `rlm run "Summarize this paper" --context paper.txt` is run
- **THEN** the task is executed with the file contents as context and the result is printed to stdout

### Requirement: Run Command Options
The `run` subcommand SHALL accept: positional task string, `--context <file>` (input file), `--mode <direct|iterative|auto>`, `--template <name>`, `--profile <name>`, `--format <json|text|yaml>`, `--synthesize`, and budget override flags (`--max-iterations`, `--max-time`, `--max-cost`, `--max-tokens`, `--max-depth`).

#### Scenario: All options provided
- **WHEN** all flags are specified
- **THEN** they override profile/config values in the expected precedence order

#### Scenario: Context from stdin
- **WHEN** `--context -` is specified
- **THEN** the context is read from stdin

### Requirement: Output Formats
The CLI SHALL support three output formats: `text` (default, just the answer), `json` (full result with trace), and `yaml` (full result with trace in YAML).

#### Scenario: Text output
- **WHEN** `--format text` or no format flag is specified
- **THEN** only the final answer is printed to stdout

#### Scenario: JSON output
- **WHEN** `--format json` is specified
- **THEN** the full `RlmResult` including answer, trace, and usage is printed as JSON

### Requirement: MCP Server
The MCP server SHALL expose two tools: `rlm_execute` (run a task with full options) and `rlm_templates` (list available templates).

#### Scenario: rlm_execute tool
- **WHEN** an MCP client calls `rlm_execute` with task, context, and optional mode/template/budget parameters
- **THEN** the engine executes the task and returns the result as JSON

#### Scenario: rlm_templates tool
- **WHEN** an MCP client calls `rlm_templates`
- **THEN** a list of available templates with names and descriptions is returned

### Requirement: MCP Protocol Compliance
The MCP server SHALL implement JSON-RPC 2.0 over stdin/stdout following the canonical `protocol.rs` + `server.rs` pattern used by all Liberation_Labs MCP servers.

#### Scenario: Initialize handshake
- **WHEN** the client sends an `initialize` request
- **THEN** the server responds with capabilities including tools list

#### Scenario: Tool invocation
- **WHEN** the client sends a `tools/call` request
- **THEN** the server dispatches to the appropriate handler and returns the result

### Requirement: Error Reporting
The CLI and MCP server SHALL report errors clearly with context: config errors, provider errors, sandbox errors, budget exhaustion, and template not found.

#### Scenario: Provider authentication error
- **WHEN** an API key is missing or invalid
- **THEN** a clear error message indicates which provider failed and what credential is needed

#### Scenario: Sandbox timeout
- **WHEN** Python code execution times out
- **THEN** the error includes the timeout duration and suggests increasing the limit
