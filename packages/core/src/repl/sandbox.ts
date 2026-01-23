import type { REPLConfig, CodeExecution } from '../types/index.js';
import {
  DirectPyodideSandbox,
  WorkerPyodideSandbox,
  detectWorkerSupport,
} from './pyodide.js';

/**
 * A task for batch RLM query execution.
 */
export interface BatchRLMTask {
  /** The task/question for the sub-RLM */
  task: string;
  /** Optional context override (defaults to current context) */
  context?: string;
}

/**
 * Bridge callbacks for LLM interactions from within Python code.
 */
export interface SandboxBridges {
  /**
   * Called when Python code invokes llm_query().
   * @param prompt - The prompt to send to the LLM
   * @returns The LLM response
   */
  onLLMQuery: (prompt: string) => Promise<string>;

  /**
   * Called when Python code invokes rlm_query().
   * @param task - The task for the sub-RLM
   * @param context - Optional context override (defaults to current context)
   * @returns The sub-RLM response
   */
  onRLMQuery: (task: string, context?: string) => Promise<string>;

  /**
   * Called when Python code invokes batch_rlm_query().
   * Executes multiple sub-RLMs concurrently.
   * @param tasks - Array of tasks to execute
   * @returns Array of results in the same order as input tasks
   */
  onBatchRLMQuery?: (tasks: BatchRLMTask[]) => Promise<string[]>;
}

/**
 * Abstract interface for a Python execution sandbox.
 *
 * The sandbox provides an isolated Python environment with:
 * - Access to a `context` variable containing the loaded context
 * - Bridge functions for LLM interaction (llm_query, rlm_query)
 * - Utility functions (chunk_text, search_context)
 */
export interface Sandbox {
  /**
   * Initialize the sandbox with context.
   * Context will be available as the `context` variable in Python.
   *
   * @param context - The context string to inject
   */
  initialize(context: string): Promise<void>;

  /**
   * Execute Python code in the sandbox.
   *
   * @param code - The Python code to execute
   * @returns CodeExecution result with stdout, stderr, error, and duration
   */
  execute(code: string): Promise<CodeExecution>;

  /**
   * Get a variable's value from the Python environment.
   *
   * @param name - The variable name to retrieve
   * @returns The variable's value converted to JavaScript, or undefined if not found
   */
  getVariable(name: string): Promise<unknown>;

  /**
   * Cancel any currently running execution.
   * When using worker isolation, this triggers a KeyboardInterrupt in Python.
   * In non-worker mode, this is a no-op (timeout will eventually kill execution).
   *
   * @returns Promise that resolves when cancellation is complete
   */
  cancel(): Promise<void>;

  /**
   * Clean up sandbox resources.
   * All Pyodide resources should be released after this call.
   */
  destroy(): Promise<void>;
}

/**
 * Create a new Python sandbox instance.
 *
 * By default, uses worker isolation when available (config.useWorker !== false
 * and SharedArrayBuffer is supported). Worker isolation provides:
 * - True execution interruption via SharedArrayBuffer
 * - Complete memory cleanup via worker termination
 * - Non-blocking execution
 *
 * Falls back to direct (non-worker) mode when workers are unavailable,
 * which has limitations around timeout behavior and memory cleanup.
 *
 * @param config - REPL configuration (timeout, maxOutputLength, useWorker, etc.)
 * @param bridges - Callbacks for LLM interactions
 * @returns A new Sandbox instance
 */
export function createSandbox(
  config: REPLConfig,
  bridges: SandboxBridges
): Sandbox {
  // Determine if we should use worker isolation
  const useWorker = config.useWorker ?? detectWorkerSupport();

  if (useWorker && detectWorkerSupport()) {
    return new WorkerPyodideSandbox(config, bridges);
  }

  // Fallback to direct (non-worker) implementation
  return new DirectPyodideSandbox(config, bridges);
}
