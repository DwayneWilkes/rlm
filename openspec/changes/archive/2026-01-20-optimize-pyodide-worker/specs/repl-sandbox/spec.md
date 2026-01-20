## ADDED Requirements

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

## MODIFIED Requirements

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
