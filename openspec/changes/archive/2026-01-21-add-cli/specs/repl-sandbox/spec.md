# repl-sandbox Specification Delta

## ADDED Requirements

### Requirement: Backend Selection

The system SHALL support multiple sandbox backends with automatic selection.

#### Scenario: Backend type enumeration
- **WHEN** creating a sandbox
- **THEN** backend type SHALL be one of: `pyodide`, `native`, `daemon`

#### Scenario: Auto-select daemon when running
- **WHEN** backend is set to `auto` and daemon is running
- **THEN** DaemonClientSandbox SHALL be used

#### Scenario: Auto-select native when Python available
- **WHEN** backend is set to `auto` and daemon is not running
- **AND** Python is available on the system
- **THEN** NativePythonSandbox SHALL be used

#### Scenario: Fallback to Pyodide
- **WHEN** backend is set to `auto`
- **AND** daemon is not running
- **AND** Python is not available
- **THEN** PyodideSandbox SHALL be used

#### Scenario: Explicit backend selection
- **WHEN** backend is explicitly set to `native`, `daemon`, or `pyodide`
- **THEN** the specified backend SHALL be used

### Requirement: Native Python Sandbox

The system SHALL provide a native Python subprocess sandbox.

#### Scenario: JSON-RPC protocol
- **WHEN** NativePythonSandbox communicates with Python
- **THEN** it SHALL use JSON-RPC 2.0 over stdio

#### Scenario: Execute code
- **WHEN** calling execute(code) on NativePythonSandbox
- **THEN** code SHALL be sent to Python subprocess
- **AND** stdout, stderr, and duration SHALL be returned

#### Scenario: Bridge callback handling
- **WHEN** Python code calls llm_query or rlm_query
- **THEN** Python SHALL send a JSON-RPC request
- **AND** TypeScript SHALL handle the callback and return the response

#### Scenario: Context injection
- **WHEN** NativePythonSandbox is initialized with context
- **THEN** context SHALL be available as `context` variable in Python

#### Scenario: Python availability check
- **WHEN** checking if native backend is available
- **THEN** it SHALL verify Python 3.8+ is installed via `python --version`

### Requirement: Daemon Client Sandbox

The system SHALL provide a daemon client sandbox for benchmarking.

#### Scenario: IPC connection
- **WHEN** DaemonClientSandbox connects to daemon
- **THEN** it SHALL use Unix socket (Linux/macOS) or named pipe (Windows)

#### Scenario: Socket path
- **WHEN** connecting on Linux or macOS
- **THEN** socket path SHALL be `~/.rlm/daemon.sock`

#### Scenario: Named pipe path
- **WHEN** connecting on Windows
- **THEN** pipe name SHALL be `\\.\pipe\rlm-daemon`

#### Scenario: Execute via daemon
- **WHEN** calling execute(code) on DaemonClientSandbox
- **THEN** it SHALL send request to daemon via IPC
- **AND** daemon SHALL route to available worker

#### Scenario: Daemon availability check
- **WHEN** checking if daemon backend is available
- **THEN** it SHALL check if daemon socket/pipe exists and is responsive

### Requirement: Sandbox Factory

The system SHALL provide a factory function for creating sandboxes.

#### Scenario: Create with config
- **WHEN** calling createSandbox(config)
- **THEN** it SHALL return the appropriate sandbox implementation

#### Scenario: Config backend option
- **WHEN** config.backend is specified
- **THEN** factory SHALL use the specified backend

#### Scenario: Shared interface
- **WHEN** any sandbox is created
- **THEN** it SHALL implement the ISandbox interface with initialize, execute, destroy, cancel, getVariable
