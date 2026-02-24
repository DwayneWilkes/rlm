### Requirement: Python Subprocess Sandbox
The sandbox SHALL spawn a `python3` subprocess and communicate via stdin/stdout pipes using a JSON protocol.

#### Scenario: Sandbox initialization
- **WHEN** a sandbox is created with an initial context string
- **THEN** a `python3` process is spawned and the `context` variable is set to the provided string

#### Scenario: Code execution
- **WHEN** code is submitted for execution
- **THEN** the sandbox sends the code to the subprocess, executes it, and returns captured stdout and stderr

#### Scenario: Variable retrieval
- **WHEN** `get_var(name)` is called
- **THEN** the sandbox retrieves the current value of the named variable from the subprocess environment

#### Scenario: Sandbox destruction
- **WHEN** the sandbox is destroyed
- **THEN** the subprocess is terminated and all resources are released

### Requirement: Output Truncation
The sandbox SHALL truncate stdout/stderr output to a configurable maximum length to prevent context window overflow.

#### Scenario: Output within limit
- **WHEN** code execution produces output shorter than the truncation limit
- **THEN** the full output is returned

#### Scenario: Output exceeds limit
- **WHEN** code execution produces output longer than the truncation limit
- **THEN** the output is truncated and a `[truncated]` marker is appended

### Requirement: Execution Timeout
The sandbox SHALL enforce a per-execution timeout, killing the code execution if it exceeds the limit.

#### Scenario: Code completes within timeout
- **WHEN** code finishes before the timeout
- **THEN** the result is returned normally

#### Scenario: Code exceeds timeout
- **WHEN** code does not complete within the timeout period
- **THEN** the execution is terminated and a timeout error is returned

### Requirement: No Network Access
The sandbox SHALL NOT provide network access to executed code. The Python subprocess runs without importing network libraries by default.

#### Scenario: Network import blocked
- **WHEN** code attempts to use `urllib`, `requests`, or `socket`
- **THEN** the operation fails or is unavailable (enforced via restricted environment)

### Requirement: Helper Functions
The sandbox SHALL pre-load utility functions into the Python environment, including `parse_academic_paper()` for structured section extraction.

#### Scenario: parse_academic_paper available
- **WHEN** code calls `parse_academic_paper(context)`
- **THEN** the function returns a dict with detected sections (title, abstract, numbered/markdown/CAPS headers)

### Requirement: Sub-Call Registration
The sandbox SHALL support registering `llm_query()` and `rlm_query()` as callable functions that delegate to the engine's LLM client.

#### Scenario: llm_query invocation
- **WHEN** sandbox code calls `llm_query(prompt)`
- **THEN** the call is intercepted and routed to the engine's LLM client, with the result returned to the sandbox

#### Scenario: rlm_query invocation
- **WHEN** sandbox code calls `rlm_query(prompt)`
- **THEN** the call is intercepted and routed to a recursive RLM execution, with the result returned to the sandbox
