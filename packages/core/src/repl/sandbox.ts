import type { REPLConfig, CodeExecution } from '../types/index.js';
import { PyodideSandbox } from './pyodide.js';

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
   * Clean up sandbox resources.
   * All Pyodide resources should be released after this call.
   */
  destroy(): Promise<void>;
}

/**
 * Create a new Python sandbox instance.
 *
 * @param config - REPL configuration (timeout, maxOutputLength)
 * @param bridges - Callbacks for LLM interactions
 * @returns A new Sandbox instance
 */
export function createSandbox(
  config: REPLConfig,
  bridges: SandboxBridges
): Sandbox {
  return new PyodideSandbox(config, bridges);
}
