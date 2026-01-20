/**
 * @fileoverview Pyodide-based Python execution sandbox implementations.
 *
 * This module provides two sandbox implementations:
 * - WorkerPyodideSandbox: Runs in a Worker thread with true interrupt support
 * - DirectPyodideSandbox: Runs in main thread (fallback when workers unavailable)
 *
 * @module @rlm/core/repl/pyodide
 */

import { loadPyodide, type PyodideInterface } from 'pyodide';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { REPLConfig, CodeExecution } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';
import type { WorkerMessage, WorkerResponse } from './pyodide-worker.js';

const DEFAULT_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';

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
 * Get the Pyodide index URL from config.
 */
function getIndexURL(config: REPLConfig): string {
  if (!config.indexURL) {
    return DEFAULT_INDEX_URL;
  }
  if (typeof config.indexURL === 'string') {
    return config.indexURL;
  }
  // Return first URL from array (fallbacks would be handled at a higher level)
  return config.indexURL[0] ?? DEFAULT_INDEX_URL;
}

/**
 * Worker-based Pyodide sandbox with true interrupt support.
 *
 * This implementation runs Pyodide in a Worker thread, enabling:
 * - True execution interruption via SharedArrayBuffer + setInterruptBuffer()
 * - Complete memory cleanup via worker.terminate()
 * - Non-blocking execution (doesn't freeze main thread)
 */
export class WorkerPyodideSandbox implements Sandbox {
  private worker: Worker | null = null;
  private interruptBuffer: Int32Array | null = null;
  private sharedBuffer: SharedArrayBuffer | null = null;
  private config: REPLConfig;
  private bridges: SandboxBridges;
  private initialized: boolean = false;
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(config: REPLConfig, bridges: SandboxBridges) {
    this.config = config;
    this.bridges = bridges;
  }

  async initialize(context: string): Promise<void> {
    // Create shared interrupt buffer (4 bytes for Int32)
    this.sharedBuffer = new SharedArrayBuffer(4);
    this.interruptBuffer = new Int32Array(this.sharedBuffer);

    // Get path to worker script
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const workerPath = join(__dirname, 'pyodide-worker.js');

    // Spawn worker
    this.worker = new Worker(workerPath);

    // Setup message handlers
    this.worker.on('message', (msg: WorkerResponse) => {
      this.handleWorkerMessage(msg);
    });

    this.worker.on('error', (err) => {
      // Reject all pending requests
      for (const pending of this.pendingRequests.values()) {
        pending.reject(err);
      }
      this.pendingRequests.clear();
    });

    // Wait for ready signal
    await new Promise<void>((resolve, reject) => {
      const readyHandler = (msg: WorkerResponse) => {
        if (msg.type === 'ready') {
          this.initialized = true;
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
      };

      // Add temporary handler for init
      const originalHandler = this.handleWorkerMessage.bind(this);
      this.handleWorkerMessage = (msg: WorkerResponse) => {
        readyHandler(msg);
        originalHandler(msg);
      };

      // Send init message
      this.worker!.postMessage({
        type: 'init',
        indexURL: getIndexURL(this.config),
        context,
        interruptBuffer: this.sharedBuffer!,
      } satisfies WorkerMessage);
    });
  }

  private handleWorkerMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case 'stdout':
        this.config.onStdout?.(msg.line);
        break;

      case 'stderr':
        this.config.onStderr?.(msg.line);
        break;

      case 'result': {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if (msg.success) {
            pending.resolve({
              stdout: this.truncate(msg.stdout),
              stderr: msg.stderr,
              duration: msg.duration,
            });
          } else {
            pending.resolve({
              stdout: '',
              stderr: '',
              error: msg.error,
              duration: msg.duration,
            });
          }
        }
        break;
      }

      case 'variable': {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          pending.resolve(msg.value);
        }
        break;
      }

      case 'bridge:llm': {
        // Handle LLM bridge call from worker
        this.bridges
          .onLLMQuery(msg.prompt)
          .then((result) => {
            this.worker?.postMessage({
              type: 'bridge:response',
              id: msg.id,
              result,
            });
          })
          .catch((error: Error) => {
            this.worker?.postMessage({
              type: 'bridge:response',
              id: msg.id,
              error: error.message,
            });
          });
        break;
      }

      case 'bridge:rlm': {
        // Handle RLM bridge call from worker
        this.bridges
          .onRLMQuery(msg.task, msg.context)
          .then((result) => {
            this.worker?.postMessage({
              type: 'bridge:response',
              id: msg.id,
              result,
            });
          })
          .catch((error: Error) => {
            this.worker?.postMessage({
              type: 'bridge:response',
              id: msg.id,
              error: error.message,
            });
          });
        break;
      }

      case 'error':
        console.error('Worker error:', msg.message);
        break;

      case 'ready':
        // Handled during initialization
        break;
    }
  }

  async execute(code: string): Promise<CodeExecution> {
    if (!this.worker || !this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    const id = this.generateId();
    const startTime = Date.now();

    // Setup timeout that writes interrupt signal
    const timeoutId = setTimeout(() => {
      if (this.interruptBuffer) {
        // Write SIGINT (2) to interrupt buffer
        Atomics.store(this.interruptBuffer, 0, 2);
      }
    }, this.config.timeout);

    try {
      const result = await new Promise<{ stdout: string; stderr: string; error?: string; duration: number }>(
        (resolve, reject) => {
          this.pendingRequests.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
          });

          this.worker!.postMessage({
            type: 'execute',
            id,
            code,
          } satisfies WorkerMessage);
        }
      );

      return {
        code,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        duration: result.duration,
      };
    } finally {
      clearTimeout(timeoutId);
      // Reset interrupt buffer
      if (this.interruptBuffer) {
        Atomics.store(this.interruptBuffer, 0, 0);
      }
    }
  }

  async getVariable(name: string): Promise<unknown> {
    if (!this.worker || !this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    const id = this.generateId();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.worker!.postMessage({
        type: 'getVariable',
        id,
        name,
      } satisfies WorkerMessage);
    });
  }

  async cancel(): Promise<void> {
    if (this.interruptBuffer) {
      // Write SIGINT (2) to interrupt buffer to trigger KeyboardInterrupt
      Atomics.store(this.interruptBuffer, 0, 2);
    }
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      // Terminate worker completely (frees WASM memory)
      await this.worker.terminate();
      this.worker = null;
    }
    this.interruptBuffer = null;
    this.sharedBuffer = null;
    this.initialized = false;
    this.pendingRequests.clear();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

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

/**
 * Direct Pyodide sandbox running in main thread.
 *
 * Fallback implementation when Worker support is unavailable.
 * Limitations:
 * - Timeout uses Promise.race (doesn't actually stop execution)
 * - Memory may not be fully released on destroy()
 * - Long execution blocks main thread
 */
export class DirectPyodideSandbox implements Sandbox {
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
      indexURL: getIndexURL(this.config),
    });

    // Inject context as a Python variable
    this.pyodide.globals.set('context', context);

    // Inject bridge functions
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
      if (typeof value?.toJs === 'function') {
        return value.toJs();
      }
      return value;
    } catch {
      return undefined;
    }
  }

  async cancel(): Promise<void> {
    // No-op in direct mode - timeout will eventually kill execution
    // True cancellation requires worker isolation
  }

  async destroy(): Promise<void> {
    if (this.pyodide) {
      // Note: Pyodide doesn't have a formal destroy method
      // Setting to null releases the reference for GC
      this.pyodide = null;
    }
    this.initialized = false;
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout (${ms}ms)`)), ms);
    });
  }

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

/**
 * Detect if worker support with SharedArrayBuffer is available.
 */
export function detectWorkerSupport(): boolean {
  // Check for SharedArrayBuffer (required for interrupt)
  if (typeof SharedArrayBuffer === 'undefined') {
    return false;
  }

  // Check for Worker support (Node.js worker_threads)
  try {
    // In Node.js, we use worker_threads
    // The import at the top will fail if not available
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy export for backwards compatibility.
 * Uses DirectPyodideSandbox (same as original implementation).
 */
export const PyodideSandbox = DirectPyodideSandbox;
