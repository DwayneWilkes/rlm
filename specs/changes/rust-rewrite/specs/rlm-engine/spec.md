## ADDED Requirements

### Requirement: Iterative Execution Loop
The iterative executor SHALL implement the Zhang et al. (2025) RLM algorithm: initialize a Python REPL with the `context` variable, send system prompt + conversation to the LLM, extract code blocks from the response, execute them in the sandbox, append truncated output to the conversation, and repeat until a FINAL marker is detected or budget is exhausted.

#### Scenario: Basic iterative execution
- **WHEN** an iterative execution is started with a task and context string
- **THEN** the engine initializes a sandbox with `context` set to the input, sends the system prompt and task to the LLM, and enters the REPL loop

#### Scenario: Code block extraction and execution
- **WHEN** the LLM response contains a fenced code block tagged `repl`
- **THEN** the engine extracts the code, executes it in the sandbox, and appends the truncated stdout/stderr to the conversation as the next user message

#### Scenario: FINAL marker terminates loop
- **WHEN** the LLM response contains `FINAL(answer)` or `FINAL_VAR(var_name)`
- **THEN** the engine extracts the answer (literal string or variable value from sandbox) and returns it as the result

#### Scenario: Budget exhaustion terminates loop
- **WHEN** the budget controller signals any limit exceeded during iteration
- **THEN** the engine stops iterating and returns the best available result with a budget-exhausted flag

### Requirement: Direct Execution Mode
The direct executor SHALL send the full context and task to the LLM in a single call without a REPL loop, for inputs small enough to fit in the model's context window.

#### Scenario: Direct mode with small context
- **WHEN** direct mode is selected and the context fits within model limits
- **THEN** the engine sends a single LLM request with the context in the system/user prompt and returns the response directly

#### Scenario: Custom system prompt in direct mode
- **WHEN** direct mode is invoked with a template that specifies a systemPrompt
- **THEN** that system prompt is used instead of the default

### Requirement: Auto Mode Selection
The engine SHALL automatically select between direct and iterative mode based on context size relative to the model's context window limit.

#### Scenario: Small context selects direct mode
- **WHEN** mode is `auto` and the estimated token count of the context is less than 70% of the model's context limit
- **THEN** direct mode is selected

#### Scenario: Large context selects iterative mode
- **WHEN** mode is `auto` and the estimated token count of the context is 70% or more of the model's context limit
- **THEN** iterative mode is selected

#### Scenario: Explicit mode overrides auto
- **WHEN** mode is explicitly set to `direct` or `iterative`
- **THEN** that mode is used regardless of context size

### Requirement: Response Parser
The parser SHALL extract code blocks (` ```repl ``` `), FINAL markers (`FINAL(...)` and `FINAL_VAR(...)`), and reasoning text from LLM responses.

#### Scenario: Extract repl code block
- **WHEN** the LLM response contains ` ```repl\ncode\n``` `
- **THEN** the parser extracts `code` as an executable code block

#### Scenario: Extract FINAL with literal answer
- **WHEN** the LLM response contains `FINAL(some answer text)`
- **THEN** the parser extracts `some answer text` as the final answer

#### Scenario: Extract FINAL_VAR with variable name
- **WHEN** the LLM response contains `FINAL_VAR(result_data)`
- **THEN** the parser extracts `result_data` as the variable name to retrieve from the sandbox

#### Scenario: Nested parentheses in FINAL
- **WHEN** the LLM response contains `FINAL(func(x, y))`
- **THEN** the parser correctly extracts `func(x, y)` by matching balanced parentheses

#### Scenario: No markers found
- **WHEN** the LLM response contains neither code blocks nor FINAL markers
- **THEN** the parser returns the response as reasoning text only

### Requirement: Execution Trace
Every execution SHALL produce a structured trace recording each iteration's LLM request/response, code executions, sub-calls, and token/cost usage.

#### Scenario: Trace records iterations
- **WHEN** an iterative execution completes with 3 iterations
- **THEN** the trace contains 3 iteration entries, each with the LLM response, any code executed, and execution output

#### Scenario: Trace records usage
- **WHEN** any execution completes
- **THEN** the trace includes total input tokens, output tokens, and estimated cost

### Requirement: Synthesis Pass
The engine SHALL optionally perform a two-pass execution: iterative extraction followed by a synthesis LLM call that consolidates the extracted data.

#### Scenario: Synthesis after iterative extraction
- **WHEN** synthesis is enabled and iterative execution completes
- **THEN** the engine makes an additional LLM call with the extraction result and a synthesis prompt, returning the synthesized output as the final result

#### Scenario: Synthesis disabled
- **WHEN** synthesis is not enabled
- **THEN** the engine returns the iterative result directly without a second pass

### Requirement: Parallel Sub-Calls
When multiple `llm_query()` or `rlm_query()` calls are batched within a single code execution, the engine SHALL execute them in parallel using threads.

#### Scenario: Batched llm_query calls
- **WHEN** sandbox code calls `llm_query()` multiple times in a batch
- **THEN** the engine executes LLM requests concurrently up to `max_batch_concurrency` and returns all results

#### Scenario: Concurrency limit respected
- **WHEN** a batch contains more calls than `max_batch_concurrency`
- **THEN** excess calls wait until a slot is available
