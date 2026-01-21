# execution-engine Specification Delta

## MODIFIED Requirements

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

### Requirement: System Prompt

The system SHALL provide informative system prompts with budget context.

#### Scenario: Environment description
- **WHEN** building system prompt
- **THEN** it SHALL describe available functions (llm_query, rlm_query, chunk_text, search_context)

#### Scenario: Budget visibility
- **WHEN** building system prompt
- **THEN** it SHALL show remaining budget (cost, iterations, depth)

#### Scenario: Termination instructions
- **WHEN** building system prompt
- **THEN** it SHALL explain FINAL() and FINAL_VAR() markers

#### Scenario: Query choice guidance
- **WHEN** building system prompt
- **THEN** it SHALL explain when to use llm_query vs rlm_query
- **AND** include approximate cost and time for each

## ADDED Requirements

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
