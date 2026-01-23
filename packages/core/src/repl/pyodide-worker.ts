/**
 * @fileoverview Worker script for Pyodide execution with interrupt support.
 *
 * This module runs inside a Worker thread (Node.js worker_threads or Web Worker)
 * and provides true execution interruption via SharedArrayBuffer and complete
 * memory cleanup via worker termination.
 *
 * @module @rlm/core/repl/pyodide-worker
 */

import { loadPyodide, type PyodideInterface } from 'pyodide';
import { parentPort, workerData } from 'node:worker_threads';
import { PYTHON_SETUP_WORKER } from './python-setup.js';

/**
 * Message types for worker communication.
 */
export type WorkerMessage =
  | { type: 'init'; indexURL: string; context: string; interruptBuffer: SharedArrayBuffer }
  | { type: 'execute'; id: string; code: string }
  | { type: 'getVariable'; id: string; name: string }
  | { type: 'destroy' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'stdout'; line: string }
  | { type: 'stderr'; line: string }
  | { type: 'result'; id: string; success: boolean; stdout: string; stderr: string; error?: string; duration: number }
  | { type: 'variable'; id: string; value: unknown }
  | { type: 'bridge:llm'; id: string; prompt: string }
  | { type: 'bridge:rlm'; id: string; task: string; context: string }
  | { type: 'bridge:batch_llm'; id: string; prompts: string[] }
  | { type: 'bridge:batch_rlm'; id: string; tasks: Array<{ task: string; context?: string }> }
  | { type: 'error'; message: string };

// Only run worker code if we're actually in a worker context
if (parentPort) {
  let pyodide: PyodideInterface | null = null;
  let interruptBuffer: Int32Array | null = null;
  const pendingBridges = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  /**
   * Generate unique ID for bridge calls
   */
  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Create async bridge function that communicates with main thread
   */
  function createLLMBridge(): (prompt: string) => Promise<string> {
    return async (prompt: string): Promise<string> => {
      const id = generateId();
      return new Promise((resolve, reject) => {
        pendingBridges.set(id, { resolve: resolve as (value: unknown) => void, reject });
        parentPort!.postMessage({ type: 'bridge:llm', id, prompt } satisfies WorkerResponse);
      });
    };
  }

  function createRLMBridge(): (task: string, context: string) => Promise<string> {
    return async (task: string, context: string): Promise<string> => {
      const id = generateId();
      return new Promise((resolve, reject) => {
        pendingBridges.set(id, { resolve: resolve as (value: unknown) => void, reject });
        parentPort!.postMessage({ type: 'bridge:rlm', id, task, context } satisfies WorkerResponse);
      });
    };
  }

  function createBatchLLMBridge(): (prompts: string[]) => Promise<string[]> {
    return async (prompts: string[]): Promise<string[]> => {
      const id = generateId();
      return new Promise((resolve, reject) => {
        pendingBridges.set(id, { resolve: resolve as (value: unknown) => void, reject });
        parentPort!.postMessage({ type: 'bridge:batch_llm', id, prompts } satisfies WorkerResponse);
      });
    };
  }

  function createBatchRLMBridge(): (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> {
    return async (tasks: Array<{ task: string; context?: string }>): Promise<string[]> => {
      const id = generateId();
      return new Promise((resolve, reject) => {
        pendingBridges.set(id, { resolve: resolve as (value: unknown) => void, reject });
        parentPort!.postMessage({ type: 'bridge:batch_rlm', id, tasks } satisfies WorkerResponse);
      });
    };
  }

  parentPort.on('message', async (msg: WorkerMessage | { type: 'bridge:response'; id: string; result?: unknown; error?: string }) => {
    try {
      // Handle bridge responses from main thread
      if (msg.type === 'bridge:response') {
        const pending = pendingBridges.get(msg.id);
        if (pending) {
          pendingBridges.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        return;
      }

      switch (msg.type) {
        case 'init': {
          // Setup interrupt buffer for cancellation
          interruptBuffer = new Int32Array(msg.interruptBuffer);

          // Load Pyodide with native stdout/stderr handling
          pyodide = await loadPyodide({
            indexURL: msg.indexURL,
            stdout: (line: string) => parentPort!.postMessage({ type: 'stdout', line } satisfies WorkerResponse),
            stderr: (line: string) => parentPort!.postMessage({ type: 'stderr', line } satisfies WorkerResponse),
          });

          // Set interrupt buffer for KeyboardInterrupt support
          pyodide.setInterruptBuffer(interruptBuffer);

          // Inject context and bridges
          pyodide.globals.set('context', msg.context);
          pyodide.globals.set('__context_ref__', msg.context);
          pyodide.globals.set('__llm_query_bridge__', createLLMBridge());
          pyodide.globals.set('__rlm_query_bridge__', createRLMBridge());
          pyodide.globals.set('__batch_llm_query_bridge__', createBatchLLMBridge());
          pyodide.globals.set('__batch_rlm_query_bridge__', createBatchRLMBridge());

          // Run setup code
          await pyodide.runPythonAsync(PYTHON_SETUP_WORKER);

          parentPort!.postMessage({ type: 'ready' } satisfies WorkerResponse);
          break;
        }

        case 'execute': {
          if (!pyodide) {
            parentPort!.postMessage({
              type: 'result',
              id: msg.id,
              success: false,
              stdout: '',
              stderr: '',
              error: 'Sandbox not initialized',
              duration: 0,
            } satisfies WorkerResponse);
            break;
          }

          const startTime = Date.now();
          let stdout = '';
          let stderr = '';

          try {
            // Capture stdout/stderr for this execution
            await pyodide.runPythonAsync(`
import sys
from io import StringIO
__stdout__ = StringIO()
__stderr__ = StringIO()
__old_stdout__ = sys.stdout
__old_stderr__ = sys.stderr
sys.stdout = __stdout__
sys.stderr = __stderr__
`);

            // Execute the code
            await pyodide.runPythonAsync(msg.code);

            // Get captured output
            stdout = (await pyodide.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
__stdout__.getvalue()
`)) as string;

            stderr = (await pyodide.runPythonAsync(`__stderr__.getvalue()`)) as string;

            parentPort!.postMessage({
              type: 'result',
              id: msg.id,
              success: true,
              stdout,
              stderr,
              duration: Date.now() - startTime,
            } satisfies WorkerResponse);
          } catch (err) {
            // Restore stdout/stderr on error
            try {
              await pyodide.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
`);
            } catch {
              /* ignore restoration errors */
            }

            parentPort!.postMessage({
              type: 'result',
              id: msg.id,
              success: false,
              stdout: '',
              stderr: '',
              error: err instanceof Error ? err.message : String(err),
              duration: Date.now() - startTime,
            } satisfies WorkerResponse);
          }
          break;
        }

        case 'getVariable': {
          if (!pyodide) {
            parentPort!.postMessage({
              type: 'variable',
              id: msg.id,
              value: undefined,
            } satisfies WorkerResponse);
            break;
          }

          try {
            const value = pyodide.globals.get(msg.name);
            let jsValue: unknown = undefined;

            if (value !== undefined) {
              // Convert Python objects to JS
              if (typeof value?.toJs === 'function') {
                jsValue = value.toJs();
              } else {
                jsValue = value;
              }
            }

            parentPort!.postMessage({
              type: 'variable',
              id: msg.id,
              value: jsValue,
            } satisfies WorkerResponse);
          } catch {
            parentPort!.postMessage({
              type: 'variable',
              id: msg.id,
              value: undefined,
            } satisfies WorkerResponse);
          }
          break;
        }

        case 'destroy': {
          // Worker will be terminated by main thread
          // This is just for graceful cleanup if needed
          pyodide = null;
          break;
        }
      }
    } catch (err) {
      parentPort!.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } satisfies WorkerResponse);
    }
  });
}
