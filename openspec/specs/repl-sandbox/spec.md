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

