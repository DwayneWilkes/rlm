/**
 * @fileoverview Shared Python setup code for all sandbox implementations.
 *
 * Contains the Python helper functions injected into every sandbox,
 * including bridge wrappers, utility functions, and context helpers.
 *
 * @module @rlm/core/repl/python-setup
 */

/**
 * Python setup code injected into every sandbox.
 *
 * Provides:
 * - llm_query(): Synchronous wrapper for LLM queries
 * - rlm_query(): Synchronous wrapper for recursive RLM queries
 * - chunk_text(): Utility for splitting text into overlapping chunks
 * - search_context(): Regex search with context window (security-hardened)
 */
export const PYTHON_SETUP = `
import re
import json
import sys
from io import StringIO

# Synchronous wrappers for the async bridges
def llm_query(prompt: str) -> str:
    """
    Query an LLM with the given prompt.
    Use for simple, single-shot questions.

    Args:
        prompt: The prompt to send to the LLM

    Returns:
        The LLM response as a string
    """
    import asyncio
    loop = asyncio.get_event_loop()
    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, __llm_query_bridge__(prompt))
            return future.result()
    return asyncio.run(__llm_query_bridge__(prompt))

def rlm_query(task: str, ctx: str = None) -> str:
    """
    Spawn a recursive RLM to handle a complex sub-task.

    This creates a new RLM instance with its own REPL environment.
    Preferred over llm_query for tasks requiring multi-step reasoning.

    Args:
        task: The task/question for the sub-RLM
        ctx: Optional context override (defaults to current context)

    Returns:
        The sub-RLM response as a string
    """
    import asyncio
    context_to_use = ctx if ctx is not None else __context_ref__
    loop = asyncio.get_event_loop()
    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, __rlm_query_bridge__(task, context_to_use))
            return future.result()
    return asyncio.run(__rlm_query_bridge__(task, context_to_use))

# Utility functions
def chunk_text(text: str, size: int = 10000, overlap: int = 500) -> list:
    """
    Split text into overlapping chunks.

    Args:
        text: The text to split
        size: Maximum size of each chunk (default: 10000)
        overlap: Number of characters to overlap between chunks (default: 500)

    Returns:
        List of text chunks
    """
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks

def search_context(pattern: str, window: int = 200, max_results: int = 100) -> list:
    """
    Search context for regex pattern, return matches with surrounding text.

    Args:
        pattern: Regex pattern to search for
        window: Number of characters of context to include around each match
        max_results: Maximum number of results to return (default: 100)

    Returns:
        List of dicts with 'match', 'start', and 'context' keys

    Raises:
        ValueError: If pattern is too long or invalid
    """
    # Security: Limit pattern length to prevent ReDoS attacks
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    # Validate and compile pattern
    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    results = []
    for match in compiled.finditer(context):
        if len(results) >= max_results:
            break
        start = max(0, match.start() - window)
        end = min(len(context), match.end() + window)
        results.append({
            'match': match.group(),
            'start': match.start(),
            'context': context[start:end]
        })
    return results

def count_matches(pattern: str) -> int:
    """
    Count regex matches in context without building full results list.

    More memory-efficient than search_context when you only need the count.

    Args:
        pattern: Regex pattern to search for

    Returns:
        Number of matches found

    Raises:
        ValueError: If pattern is too long or invalid
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    return len(compiled.findall(context))

def extract_json(text: str):
    """
    Safely extract JSON object or array from text.

    Finds the first valid JSON structure in the text and parses it.

    Args:
        text: Text that may contain JSON

    Returns:
        Parsed JSON as dict or list, or None if no valid JSON found
    """
    # Try to find JSON object
    obj_match = re.search(r'\\{[\\s\\S]*\\}', text)
    arr_match = re.search(r'\\[[\\s\\S]*\\]', text)

    candidates = []
    if obj_match:
        candidates.append(obj_match.group())
    if arr_match:
        candidates.append(arr_match.group())

    # Try each candidate, longest first (more likely to be complete)
    candidates.sort(key=len, reverse=True)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None

def extract_sections(header_pattern: str) -> list:
    """
    Extract sections from context based on header pattern.

    Splits the context into sections where each section starts with
    a line matching the header pattern.

    Args:
        header_pattern: Regex pattern for section headers (use MULTILINE anchors)

    Returns:
        List of dicts with 'header', 'content', and 'start' keys
    """
    MAX_PATTERN_LENGTH = 500
    if len(header_pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(header_pattern, re.MULTILINE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    matches = list(compiled.finditer(context))
    sections = []

    for i, match in enumerate(matches):
        header = match.group()
        start = match.start()
        # Content ends at next header or end of context
        end = matches[i + 1].start() if i + 1 < len(matches) else len(context)
        content = context[match.end():end].strip()

        sections.append({
            'header': header,
            'content': content,
            'start': start
        })

    return sections

def find_line(pattern: str) -> list:
    """
    Find lines in context matching a regex pattern.

    Use this to verify line numbers before citing them in your analysis.
    Returns 1-indexed line numbers to match how humans reference code.

    Args:
        pattern: Regex pattern to search for

    Returns:
        List of tuples: [(line_number, line_content), ...]

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> find_line("def complete")
        [(87, "  async def complete(request: LLMRequest):")]
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    lines = context.split('\\n')
    return [(i + 1, line) for i, line in enumerate(lines) if compiled.search(line)]

def count_lines(pattern: str = None) -> int:
    """
    Count lines in context, optionally filtering by pattern.

    Use this to get accurate line counts instead of estimating.

    Args:
        pattern: Optional regex pattern to filter lines

    Returns:
        Total line count, or count of matching lines if pattern given

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> count_lines()  # Total lines
        113
        >>> count_lines("import")  # Lines containing 'import'
        5
    """
    lines = context.split('\\n')
    if pattern is None:
        return len(lines)

    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    return len([line for line in lines if compiled.search(line)])

def get_line(n: int) -> str:
    """
    Get the content of a specific line (1-indexed).

    Use this to verify what a specific line contains.

    Args:
        n: Line number (1-indexed, like editors show)

    Returns:
        Line content, or empty string if line doesn't exist

    Example:
        >>> get_line(90)
        "      max_tokens: request.maxTokens ?? 8192,"
    """
    lines = context.split('\\n')
    if n < 1 or n > len(lines):
        return ""
    return lines[n - 1]

def quote_match(pattern: str, max_length: int = 100) -> str:
    """
    Return the first match of a pattern in context.

    Use this to quote actual text as evidence for claims.

    Args:
        pattern: Regex pattern to search for
        max_length: Maximum length of returned match (default: 100)

    Returns:
        The matched text, or None if no match found

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> quote_match("max_tokens.*?[,;]")
        "max_tokens: request.maxTokens ?? 8192,"
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    match = compiled.search(context)
    if match:
        result = match.group()
        if len(result) > max_length:
            return result[:max_length] + "..."
        return result
    return None

print(f"RLM sandbox ready. Context: {len(context):,} chars")
`;

/**
 * Python setup code for Worker-based sandboxes (Pyodide in Worker thread).
 *
 * Uses pyodide.ffi.run_sync for synchronous bridge calls instead of asyncio.
 * This is required when running in a Worker context where run_sync is available.
 */
export const PYTHON_SETUP_WORKER = `
import re
import json
import sys
from io import StringIO

# Synchronous bridge wrappers using pyodide.ffi.run_sync
def llm_query(prompt: str) -> str:
    """
    Query an LLM with the given prompt.
    Use for simple, single-shot questions.

    Args:
        prompt: The prompt to send to the LLM

    Returns:
        The LLM response as a string
    """
    from pyodide.ffi import run_sync
    return run_sync(__llm_query_bridge__(prompt))

def rlm_query(task: str, ctx: str = None) -> str:
    """
    Spawn a recursive RLM to handle a complex sub-task.

    This creates a new RLM instance with its own REPL environment.
    Preferred over llm_query for tasks requiring multi-step reasoning.

    Args:
        task: The task/question for the sub-RLM
        ctx: Optional context override (defaults to current context)

    Returns:
        The sub-RLM response as a string
    """
    from pyodide.ffi import run_sync
    context_to_use = ctx if ctx is not None else __context_ref__
    return run_sync(__rlm_query_bridge__(task, context_to_use))

# Utility functions
def chunk_text(text: str, size: int = 10000, overlap: int = 500) -> list:
    """
    Split text into overlapping chunks.

    Args:
        text: The text to split
        size: Maximum size of each chunk (default: 10000)
        overlap: Number of characters to overlap between chunks (default: 500)

    Returns:
        List of text chunks
    """
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks

def search_context(pattern: str, window: int = 200, max_results: int = 100) -> list:
    """
    Search context for regex pattern, return matches with surrounding text.

    Args:
        pattern: Regex pattern to search for
        window: Number of characters of context to include around each match
        max_results: Maximum number of results to return (default: 100)

    Returns:
        List of dicts with 'match', 'start', and 'context' keys

    Raises:
        ValueError: If pattern is too long or invalid
    """
    # Security: Limit pattern length to prevent ReDoS attacks
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    # Validate and compile pattern
    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    results = []
    for match in compiled.finditer(context):
        if len(results) >= max_results:
            break
        start = max(0, match.start() - window)
        end = min(len(context), match.end() + window)
        results.append({
            'match': match.group(),
            'start': match.start(),
            'context': context[start:end]
        })
    return results

def count_matches(pattern: str) -> int:
    """
    Count regex matches in context without building full results list.

    More memory-efficient than search_context when you only need the count.

    Args:
        pattern: Regex pattern to search for

    Returns:
        Number of matches found

    Raises:
        ValueError: If pattern is too long or invalid
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    return len(compiled.findall(context))

def extract_json(text: str):
    """
    Safely extract JSON object or array from text.

    Finds the first valid JSON structure in the text and parses it.

    Args:
        text: Text that may contain JSON

    Returns:
        Parsed JSON as dict or list, or None if no valid JSON found
    """
    # Try to find JSON object
    obj_match = re.search(r'\\{[\\s\\S]*\\}', text)
    arr_match = re.search(r'\\[[\\s\\S]*\\]', text)

    candidates = []
    if obj_match:
        candidates.append(obj_match.group())
    if arr_match:
        candidates.append(arr_match.group())

    # Try each candidate, longest first (more likely to be complete)
    candidates.sort(key=len, reverse=True)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue

    return None

def extract_sections(header_pattern: str) -> list:
    """
    Extract sections from context based on header pattern.

    Splits the context into sections where each section starts with
    a line matching the header pattern.

    Args:
        header_pattern: Regex pattern for section headers (use MULTILINE anchors)

    Returns:
        List of dicts with 'header', 'content', and 'start' keys
    """
    MAX_PATTERN_LENGTH = 500
    if len(header_pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(header_pattern, re.MULTILINE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    matches = list(compiled.finditer(context))
    sections = []

    for i, match in enumerate(matches):
        header = match.group()
        start = match.start()
        # Content ends at next header or end of context
        end = matches[i + 1].start() if i + 1 < len(matches) else len(context)
        content = context[match.end():end].strip()

        sections.append({
            'header': header,
            'content': content,
            'start': start
        })

    return sections

def find_line(pattern: str) -> list:
    """
    Find lines in context matching a regex pattern.

    Use this to verify line numbers before citing them in your analysis.
    Returns 1-indexed line numbers to match how humans reference code.

    Args:
        pattern: Regex pattern to search for

    Returns:
        List of tuples: [(line_number, line_content), ...]

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> find_line("def complete")
        [(87, "  async def complete(request: LLMRequest):")]
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    lines = context.split('\\n')
    return [(i + 1, line) for i, line in enumerate(lines) if compiled.search(line)]

def count_lines(pattern: str = None) -> int:
    """
    Count lines in context, optionally filtering by pattern.

    Use this to get accurate line counts instead of estimating.

    Args:
        pattern: Optional regex pattern to filter lines

    Returns:
        Total line count, or count of matching lines if pattern given

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> count_lines()  # Total lines
        113
        >>> count_lines("import")  # Lines containing 'import'
        5
    """
    lines = context.split('\\n')
    if pattern is None:
        return len(lines)

    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    return len([line for line in lines if compiled.search(line)])

def get_line(n: int) -> str:
    """
    Get the content of a specific line (1-indexed).

    Use this to verify what a specific line contains.

    Args:
        n: Line number (1-indexed, like editors show)

    Returns:
        Line content, or empty string if line doesn't exist

    Example:
        >>> get_line(90)
        "      max_tokens: request.maxTokens ?? 8192,"
    """
    lines = context.split('\\n')
    if n < 1 or n > len(lines):
        return ""
    return lines[n - 1]

def quote_match(pattern: str, max_length: int = 100) -> str:
    """
    Return the first match of a pattern in context.

    Use this to quote actual text as evidence for claims.

    Args:
        pattern: Regex pattern to search for
        max_length: Maximum length of returned match (default: 100)

    Returns:
        The matched text, or None if no match found

    Raises:
        ValueError: If pattern is too long or invalid

    Example:
        >>> quote_match("max_tokens.*?[,;]")
        "max_tokens: request.maxTokens ?? 8192,"
    """
    MAX_PATTERN_LENGTH = 500
    if len(pattern) > MAX_PATTERN_LENGTH:
        raise ValueError(f"Pattern too long (max {MAX_PATTERN_LENGTH} chars)")

    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")

    match = compiled.search(context)
    if match:
        result = match.group()
        if len(result) > max_length:
            return result[:max_length] + "..."
        return result
    return None

print(f"RLM sandbox ready. Context: {len(context):,} chars")
`;
