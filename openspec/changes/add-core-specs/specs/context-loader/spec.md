# Capability: context-loader

Context loading and preparation utilities for REPL injection.

## ADDED Requirements

### Requirement: Context Loading

The system SHALL load and prepare context strings for REPL injection.

#### Scenario: Load context returns structure
- **WHEN** calling loadContext(content)
- **THEN** it SHALL return LoadedContext with content, length, tokenEstimate, and contentType fields

#### Scenario: Character length calculation
- **WHEN** loading context
- **THEN** length SHALL equal content.length

### Requirement: Token Estimation

The system SHALL estimate token counts for budget planning.

#### Scenario: Token estimation accuracy
- **WHEN** estimating tokens for English text
- **THEN** estimate SHALL be within 2x of actual token count

#### Scenario: Token estimation formula
- **WHEN** estimating tokens
- **THEN** the system SHALL use approximately 4 characters per token

### Requirement: Content Type Detection

The system SHALL detect content type for system prompt hints.

#### Scenario: JSON detection
- **WHEN** content starts with { or [ and is valid JSON
- **THEN** contentType SHALL be 'json'

#### Scenario: Code detection
- **WHEN** content contains import/from/const/function/class/def/package patterns
- **THEN** contentType SHALL be 'code'

#### Scenario: Markdown detection
- **WHEN** content contains markdown headers or bullet points
- **THEN** contentType SHALL be 'markdown'

#### Scenario: Plain text fallback
- **WHEN** content matches no specific patterns
- **THEN** contentType SHALL be 'plain'

### Requirement: Python Escaping

The system SHALL escape content for safe Python string injection.

#### Scenario: Backslash escaping
- **WHEN** content contains backslashes
- **THEN** escapeForPython SHALL double them

#### Scenario: Triple quote escaping
- **WHEN** content contains triple quotes
- **THEN** escapeForPython SHALL escape them

#### Scenario: Line ending normalization
- **WHEN** content contains CRLF line endings
- **THEN** escapeForPython SHALL convert to LF
