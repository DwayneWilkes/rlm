import { loadPyodide, type PyodideInterface } from 'pyodide';
import type { REPLConfig, CodeExecution } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';

/**
 * Python setup code injected into every sandbox.
 * Provides bridge functions and utilities.
 */
const PYTHON_SETUP = `
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

def search_context(pattern: str, window: int = 200) -> list:
    """
    Search context for regex pattern, return matches with surrounding text.

    Args:
        pattern: Regex pattern to search for
        window: Number of characters of context to include around each match

    Returns:
        List of dicts with 'match', 'start', and 'context' keys
    """
    results = []
    for match in re.finditer(pattern, context, re.IGNORECASE):
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
 * Pyodide-based Python execution sandbox.
 *
 * Implements the Sandbox interface using Pyodide WASM runtime.
 */
export class PyodideSandbox implements Sandbox {
  private pyodide: PyodideInterface | null = null;
  private config: REPLConfig;
  private bridges: SandboxBridges;
  private context: string = '';
  private initialized: boolean = false;

  constructor(config: REPLConfig, bridges: SandboxBridges) {
    this.config = config;
    this.bridges = bridges;
  }

  async initialize(context: string): Promise<void> {
    this.context = context;

    this.pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
    });

    // Inject context as a Python variable
    this.pyodide.globals.set('context', context);

    // Inject bridge functions
    // These allow Python to call back into TypeScript
    this.pyodide.globals.set('__llm_query_bridge__', this.bridges.onLLMQuery);
    this.pyodide.globals.set('__rlm_query_bridge__', this.bridges.onRLMQuery);
    this.pyodide.globals.set('__context_ref__', context);

    // Set up Python helpers
    await this.pyodide.runPythonAsync(PYTHON_SETUP);

    this.initialized = true;
  }

  async execute(code: string): Promise<CodeExecution> {
    if (!this.pyodide || !this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    const startTime = Date.now();

    try {
      // Capture stdout/stderr
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO
__stdout__ = StringIO()
__stderr__ = StringIO()
__old_stdout__ = sys.stdout
__old_stderr__ = sys.stderr
sys.stdout = __stdout__
sys.stderr = __stderr__
`);

      // Execute with timeout
      await Promise.race([
        this.pyodide.runPythonAsync(code),
        this.timeout(this.config.timeout),
      ]);

      // Get captured output
      const stdout = (await this.pyodide.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
__stdout__.getvalue()
`)) as string;

      const stderr = (await this.pyodide.runPythonAsync(
        `__stderr__.getvalue()`
      )) as string;

      // Truncate if needed
      const truncatedStdout = this.truncate(stdout);

      return {
        code,
        stdout: truncatedStdout,
        stderr,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      // Restore stdout/stderr on error
      try {
        await this.pyodide!.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
`);
      } catch {
        /* ignore restoration errors */
      }

      return {
        code,
        stdout: '',
        stderr: '',
        error: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
      };
    }
  }

  async getVariable(name: string): Promise<unknown> {
    if (!this.pyodide || !this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    try {
      const value = this.pyodide.globals.get(name);
      if (value === undefined) {
        return undefined;
      }
      // Convert Python objects to JS
      // toJs() is a method on Pyodide proxy objects
      if (typeof value?.toJs === 'function') {
        return value.toJs();
      }
      return value;
    } catch {
      return undefined;
    }
  }

  async destroy(): Promise<void> {
    if (this.pyodide) {
      // Note: Pyodide doesn't have a formal destroy method
      // Setting to null releases the reference for GC
      this.pyodide = null;
    }
    this.initialized = false;
  }

  /**
   * Create a timeout promise that rejects after the specified duration.
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout (${ms}ms)`)), ms);
    });
  }

  /**
   * Truncate output if it exceeds maxOutputLength.
   */
  private truncate(output: string): string {
    if (output.length <= this.config.maxOutputLength) {
      return output;
    }
    const omittedCount = output.length - this.config.maxOutputLength;
    return (
      output.slice(0, this.config.maxOutputLength) +
      `\n... [truncated, ${omittedCount} chars omitted]`
    );
  }
}
