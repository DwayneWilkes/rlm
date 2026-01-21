# repl-sandbox Specification

## Purpose
Provide a Pyodide-based Python REPL sandbox with LLM bridges (llm_query, rlm_query) and utility functions for context analysis.
## Requirements
### Requirement: Sandbox Lifecycle

The system SHALL manage sandbox initialization and cleanup.

#### Scenario: Initialize with context
- **WHEN** calling sandbox.initialize(context)
- **THEN** context SHALL be available as the `context` variable in Python

#### Scenario: Cleanup on destroy
- **WHEN** calling sandbox.destroy()
- **THEN** all Pyodide resources SHALL be released

### Requirement: Code Execution

The system SHALL execute Python code blocks safely.

#### Scenario: Execute returns result
- **WHEN** calling sandbox.execute(code)
- **THEN** it SHALL return CodeExecution with stdout, stderr, error, and duration

#### Scenario: Stdout capture
- **WHEN** Python code prints output
- **THEN** stdout SHALL contain the printed text

#### Scenario: Stderr capture
- **WHEN** Python code writes to stderr
- **THEN** stderr SHALL contain the error text

#### Scenario: Error capture
- **WHEN** Python code raises an exception
- **THEN** error field SHALL contain the exception message

### Requirement: Timeout Handling

The system SHALL enforce execution timeouts.

#### Scenario: Timeout exceeded
- **WHEN** code execution exceeds config.timeout
- **THEN** execution SHALL be terminated with timeout error

#### Scenario: Timeout configurable
- **WHEN** REPLConfig.timeout is set
- **THEN** that value SHALL be used as the timeout in milliseconds

#### Scenario: True interrupt with worker
- **WHEN** timeout is exceeded with worker-based sandbox
- **THEN** Atomics.store() SHALL write interrupt signal to SharedArrayBuffer
- **AND** Pyodide setInterruptBuffer() SHALL trigger KeyboardInterrupt

### Requirement: Output Truncation

The system SHALL truncate large outputs.

#### Scenario: Output within limit
- **WHEN** stdout length <= maxOutputLength
- **THEN** full output SHALL be returned

#### Scenario: Output exceeds limit
- **WHEN** stdout length > maxOutputLength
- **THEN** output SHALL be truncated with omission notice

### Requirement: LLM Bridge Functions

The system SHALL provide Python functions for LLM interaction.

#### Scenario: llm_query function
- **WHEN** Python calls llm_query(prompt)
- **THEN** the bridge SHALL invoke onLLMQuery callback and return the response

#### Scenario: rlm_query function
- **WHEN** Python calls rlm_query(task, ctx?)
- **THEN** the bridge SHALL invoke onRLMQuery callback and return the response

#### Scenario: rlm_query default context
- **WHEN** rlm_query is called without ctx argument
- **THEN** it SHALL use the current context

### Requirement: Utility Functions

The system SHALL provide Python utility functions.

#### Scenario: chunk_text function
- **WHEN** Python calls chunk_text(text, size, overlap)
- **THEN** it SHALL return a list of overlapping text chunks

#### Scenario: search_context function
- **WHEN** Python calls search_context(pattern, window)
- **THEN** it SHALL return matches with surrounding context

### Requirement: Variable Access

The system SHALL allow reading Python variables.

#### Scenario: Get existing variable
- **WHEN** calling sandbox.getVariable(name) for an existing variable
- **THEN** it SHALL return the variable's value converted to JavaScript

#### Scenario: Get missing variable
- **WHEN** calling sandbox.getVariable(name) for a non-existent variable
- **THEN** it SHALL return undefined

### Requirement: Worker Isolation

The system SHALL support worker-based isolation for true execution interruption and memory cleanup.

#### Scenario: Worker-based execution
- **WHEN** worker support is available (SharedArrayBuffer exists)
- **AND** useWorker config is not false
- **THEN** Pyodide SHALL run in a Worker thread with interrupt buffer

#### Scenario: Fallback to direct mode
- **WHEN** worker support is unavailable
- **OR** useWorker config is false
- **THEN** Pyodide SHALL run in the main thread (DirectPyodideSandbox)

#### Scenario: Worker termination cleanup
- **WHEN** calling sandbox.destroy() on worker-based sandbox
- **THEN** worker.terminate() SHALL be called to fully release WASM memory

### Requirement: Execution Cancellation

The system SHALL support explicit cancellation of running code.

#### Scenario: Cancel with worker isolation
- **WHEN** calling sandbox.cancel() with worker-based sandbox
- **THEN** it SHALL write SIGINT (2) to SharedArrayBuffer to trigger KeyboardInterrupt

#### Scenario: Cancel without worker
- **WHEN** calling sandbox.cancel() with direct sandbox
- **THEN** it SHALL be a no-op (timeout will eventually terminate)

### Requirement: Configurable CDN

The system SHALL support configurable Pyodide CDN URLs.

#### Scenario: Custom indexURL string
- **WHEN** REPLConfig.indexURL is a string
- **THEN** that URL SHALL be used to load Pyodide

#### Scenario: IndexURL with fallbacks
- **WHEN** REPLConfig.indexURL is an array of strings
- **THEN** the first URL SHALL be used for loading

#### Scenario: Default CDN
- **WHEN** REPLConfig.indexURL is not set
- **THEN** jsDelivr CDN SHALL be used as default

### Requirement: Stdout/Stderr Callbacks

The system SHALL support streaming output callbacks.

#### Scenario: Stdout callback
- **WHEN** REPLConfig.onStdout is set
- **AND** Python code prints to stdout
- **THEN** onStdout SHALL be called with each line

#### Scenario: Stderr callback
- **WHEN** REPLConfig.onStderr is set
- **AND** Python code writes to stderr
- **THEN** onStderr SHALL be called with each line

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

