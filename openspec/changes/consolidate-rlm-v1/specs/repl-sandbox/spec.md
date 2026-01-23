# Spec Delta: repl-sandbox

## ADDED Requirements

### Requirement: Count Matches Helper

The sandbox SHALL provide a `count_matches(pattern)` function that returns the count of regex matches in context.

```python
def count_matches(pattern: str) -> int:
    """Count all regex matches of pattern in context."""
```

#### Scenario: Count regex matches
- **WHEN** context contains "error error warning error"
- **AND** `count_matches("error")` is called
- **THEN** the function SHALL return `3`

#### Scenario: No matches
- **WHEN** context contains no matches for the pattern
- **THEN** the function SHALL return `0`

### Requirement: Extract JSON Helper

The sandbox SHALL provide an `extract_json(text)` function that extracts JSON from mixed text.

```python
def extract_json(text: str) -> dict | list | None:
    """Extract first valid JSON object or array from text."""
```

#### Scenario: Extract JSON from markdown
- **WHEN** text contains "```json\n{\"key\": \"value\"}\n```"
- **THEN** `extract_json(text)` SHALL return `{"key": "value"}`

#### Scenario: No valid JSON
- **WHEN** text contains no valid JSON
- **THEN** the function SHALL return `None`

### Requirement: Extract Sections Helper

The sandbox SHALL provide an `extract_sections(pattern)` function that parses documents by header pattern.

```python
def extract_sections(header_pattern: str) -> list[dict]:
    """
    Extract sections from context by header pattern.
    Returns: [{"header": str, "content": str, "start_line": int}, ...]
    """
```

#### Scenario: Extract markdown sections
- **WHEN** context contains "## Section 1\nContent 1\n## Section 2\nContent 2"
- **AND** `extract_sections(r"^## ")` is called
- **THEN** the function SHALL return sections with headers and content

### Requirement: Batch RLM Query Helper

The sandbox SHALL provide a `batch_rlm_query(tasks)` function for concurrent sub-RLM execution.

```python
def batch_rlm_query(tasks: list[dict]) -> list[str]:
    """
    Execute multiple sub-RLMs concurrently.
    tasks: [{"task": str, "context": str (optional)}, ...]
    Returns: List of results in same order as input tasks
    """
```

#### Scenario: Batch execution
- **WHEN** `batch_rlm_query([{"task": "Q1"}, {"task": "Q2"}])` is called
- **THEN** both sub-RLMs SHALL execute
- **AND** results SHALL be returned in input order

#### Scenario: Budget enforcement
- **WHEN** batch cost would exceed remaining budget
- **THEN** the function SHALL raise an error before execution

### Requirement: Sandbox Parity

All helper functions SHALL be available in both Pyodide and native Python sandbox backends.

#### Scenario: Native sandbox has all helpers
- **WHEN** using native Python sandbox backend
- **THEN** all helper functions (find_line, count_lines, get_line, quote_match, count_matches, extract_json, extract_sections, batch_rlm_query) SHALL be available
