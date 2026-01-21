# execution-engine Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
