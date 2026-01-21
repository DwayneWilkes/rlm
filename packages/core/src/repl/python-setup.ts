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

print(f"RLM sandbox ready. Context: {len(context):,} chars")
`;
