# execution-engine Specification

## Purpose
Orchestrate the RLM execution loop: parse LLM responses, execute code blocks, handle recursive subcalls, and build execution traces.
## Requirements
### Requirement: Response Parsing

The system SHALL parse LLM responses to extract actionable content.

#### Scenario: Extract code blocks
- **WHEN** response contains ```repl or ```python blocks
- **THEN** parser SHALL extract code content into codeBlocks array

#### Scenario: Extract FINAL direct answer
- **WHEN** response contains FINAL(answer)
- **THEN** parser SHALL return finalAnswer with type='direct' and the value

#### Scenario: Extract FINAL_VAR reference
- **WHEN** response contains FINAL_VAR(varname)
- **THEN** parser SHALL return finalAnswer with type='variable' and the variable name

#### Scenario: Extract thinking
- **WHEN** response has content outside code blocks and FINAL markers
- **THEN** parser SHALL capture it in the thinking field

### Requirement: Execution Loop

The system SHALL run an iterative execution loop.

#### Scenario: Loop continues while budget allows
- **WHEN** canProceed('iteration') returns true and no FINAL marker
- **THEN** execution SHALL continue to next iteration

#### Scenario: Loop stops on FINAL
- **WHEN** response contains FINAL or FINAL_VAR marker
- **THEN** execution loop SHALL terminate

#### Scenario: Loop stops on budget exhaustion
- **WHEN** canProceed('iteration') returns false
- **THEN** execution loop SHALL terminate and force an answer

### Requirement: Code Block Execution

The system SHALL execute parsed code blocks.

#### Scenario: Execute all code blocks
- **WHEN** response contains multiple code blocks
- **THEN** all blocks SHALL be executed in order

#### Scenario: Capture execution results
- **WHEN** code blocks are executed
- **THEN** results SHALL be recorded in iteration.codeExecutions

#### Scenario: Build execution context
- **WHEN** iteration completes
- **THEN** output SHALL be included in next iteration's context

### Requirement: Bridge Handling

The system SHALL handle Python bridge calls with intelligent depth selection.

#### Scenario: llm_query bridge
- **WHEN** Python code calls llm_query(prompt)
- **THEN** executor SHALL route to LLM and record usage

#### Scenario: rlm_query bridge with budget
- **WHEN** Python code calls rlm_query(task) and budget allows
- **THEN** executor SHALL spawn sub-executor with allocated sub-budget

#### Scenario: rlm_query bridge without budget
- **WHEN** Python code calls rlm_query(task) but budget exceeded
- **THEN** executor SHALL fall back to direct answer

#### Scenario: rlm_query auto-downgrade
- **WHEN** Python code calls rlm_query(task)
- **AND** remaining budget is below downgrade threshold
- **THEN** executor SHALL automatically use llm_query instead

### Requirement: Execution Trace

The system SHALL build complete execution traces.

#### Scenario: Trace structure
- **WHEN** execution starts
- **THEN** trace SHALL include id, depth, task, and empty iterations/subcalls arrays

#### Scenario: Record iterations
- **WHEN** each iteration completes
- **THEN** iteration SHALL be appended to trace.iterations

#### Scenario: Record subcalls
- **WHEN** rlm_query completes
- **THEN** sub-trace SHALL be appended to trace.subcalls

#### Scenario: Final answer source
- **WHEN** execution completes
- **THEN** trace.answerSource SHALL indicate 'final_direct', 'final_var', 'forced', or 'error'

### Requirement: Forced Answer

The system SHALL produce answers when budget exhausted.

#### Scenario: Force answer on exhaustion
- **WHEN** budget is exhausted without FINAL marker
- **THEN** executor SHALL request a summary answer from LLM

#### Scenario: Warning on forced answer
- **WHEN** answer is forced
- **THEN** warnings SHALL include 'Budget exhausted, answer was forced'

### Requirement: System Prompt

The system SHALL provide informative system prompts with budget context.

#### Scenario: Environment description
- **WHEN** building system prompt
- **THEN** it SHALL describe available functions:
  - llm_query, rlm_query, batch_rlm_query
  - chunk_text, search_context, count_matches
  - extract_json, extract_sections

#### Scenario: Budget visibility
- **WHEN** building system prompt
- **THEN** it SHALL show remaining budget (cost, iterations, depth)

#### Scenario: Termination instructions
- **WHEN** building system prompt
- **THEN** it SHALL explain FINAL() and FINAL_VAR() markers

#### Scenario: Query choice guidance
- **WHEN** building system prompt
- **THEN** it SHALL explain when to use llm_query vs rlm_query vs batch_rlm_query
- **AND** include approximate cost and time for each

### Requirement: Sub-RLM Budget Awareness

The system SHALL provide budget context to sub-RLMs.

#### Scenario: Sub-RLM system prompt
- **WHEN** spawning a sub-RLM via rlm_query
- **THEN** system prompt SHALL include:
  - Current depth and max depth
  - Allocated budget from parent
  - Efficiency guidelines

#### Scenario: Sub-RLM efficiency guidance
- **WHEN** building sub-RLM system prompt
- **THEN** it SHALL instruct the sub-RLM to:
  - Prefer llm_query over rlm_query
  - Complete in 2-5 iterations
  - Return FINAL() promptly

#### Scenario: Budget allocation visibility
- **WHEN** building sub-RLM system prompt
- **THEN** it SHALL show both allocated budget and parent's remaining budget

### Requirement: Code Block Batching Guidance

The system prompt SHALL guide efficient code block usage.

#### Scenario: Batching explanation
- **WHEN** building system prompt
- **THEN** it SHALL explain that multiple code blocks in one response execute sequentially
- **AND** it SHALL note this is more efficient than multiple iterations

#### Scenario: Batching example
- **WHEN** building system prompt
- **THEN** it SHALL include an example of batched code blocks

### Requirement: Batch RLM Bridge

The system SHALL handle batch sub-RLM requests.

#### Scenario: batch_rlm_query bridge
- **WHEN** Python code calls batch_rlm_query(tasks)
- **THEN** executor SHALL spawn multiple sub-executors concurrently
- **AND** executor SHALL record combined usage

#### Scenario: batch_rlm_query budget check
- **WHEN** Python code calls batch_rlm_query(tasks)
- **THEN** executor SHALL check budget allows subcalls before spawning
- **AND** executor SHALL limit parallel execution to budget constraints

