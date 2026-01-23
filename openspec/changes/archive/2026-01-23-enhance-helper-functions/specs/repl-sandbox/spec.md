# repl-sandbox Spec Delta

## MODIFIED Requirements

### Requirement: Utility Functions

The system SHALL provide Python utility functions.

#### Scenario: chunk_text function
- **WHEN** Python calls chunk_text(text, size, overlap)
- **THEN** it SHALL return a list of overlapping text chunks

#### Scenario: search_context function
- **WHEN** Python calls search_context(pattern, window)
- **THEN** it SHALL return matches with surrounding context

## ADDED Requirements

### Requirement: Extended Utility Functions

The system SHALL provide additional utility functions for common analysis patterns.

#### Scenario: count_matches function
- **WHEN** Python calls count_matches(pattern)
- **THEN** it SHALL return the count of regex matches in context
- **AND** it SHALL NOT build a full results list (memory efficient)

#### Scenario: count_matches pattern validation
- **WHEN** count_matches receives a pattern longer than 500 characters
- **THEN** it SHALL raise ValueError

#### Scenario: extract_json function
- **WHEN** Python calls extract_json(text)
- **AND** text contains valid JSON object or array
- **THEN** it SHALL return the parsed JSON as dict or list

#### Scenario: extract_json no match
- **WHEN** Python calls extract_json(text)
- **AND** text contains no valid JSON
- **THEN** it SHALL return None

#### Scenario: extract_json security
- **WHEN** extract_json parses JSON
- **THEN** it SHALL use json.loads (not eval)
- **AND** it SHALL NOT execute any code

#### Scenario: extract_sections function
- **WHEN** Python calls extract_sections(header_pattern)
- **THEN** it SHALL return a list of sections with header, content, and start position

#### Scenario: extract_sections multiline
- **WHEN** extract_sections searches for headers
- **THEN** it SHALL use MULTILINE flag for line-anchored patterns (^, $)

### Requirement: Batch RLM Query

The system SHALL support parallel sub-RLM execution.

#### Scenario: batch_rlm_query function
- **WHEN** Python calls batch_rlm_query(tasks)
- **WHERE** tasks is a list of (task, context) tuples
- **THEN** it SHALL execute multiple sub-RLMs
- **AND** it SHALL return results in the same order as input tasks

#### Scenario: batch_rlm_query budget enforcement
- **WHEN** batch_rlm_query is called
- **AND** budget would not allow all sub-calls
- **THEN** it SHALL limit the number of parallel sub-RLMs to available budget
- **AND** it SHALL return error message for tasks that could not be executed

#### Scenario: batch_rlm_query max parallel
- **WHEN** batch_rlm_query is called with more than 5 tasks
- **THEN** it SHALL process at most 5 tasks in parallel
- **AND** it SHALL process remaining tasks sequentially after first batch completes
