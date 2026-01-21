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

print(f"RLM sandbox ready. Context: {len(context):,} chars")
`;
