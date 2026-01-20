/**
 * @fileoverview Core type definitions for @rlm/core package.
 *
 * This module exports all TypeScript types, interfaces, and default values
 * used throughout the RLM (Recursive Language Model) system.
 *
 * @module @rlm/core/types
 */

// ============================================
// CONFIGURATION
// ============================================

/**
 * Configuration for initializing an RLM instance.
 *
 * @example
 * ```typescript
 * const config: RLMConfig = {
 *   provider: 'ollama',
 *   model: 'llama3.2',
 *   defaultBudget: { maxCost: 1.0 },
 * };
 * ```
 */
/**
 * Configuration for the Claude Code adapter.
 */
export interface ClaudeCodeConfig {
  /**
   * Maximum number of agent turns before stopping.
   * Defaults to 1 to prevent recursive agent loops within the adapter.
   */
  maxTurns?: number;
  /**
   * List of tools the agent is allowed to use.
   * Defaults to empty array (no tools) for simple completion requests.
   */
  allowedTools?: string[];
}

export interface RLMConfig {
  /** LLM provider identifier (e.g., 'ollama', 'anthropic', 'openai', 'claude-code') */
  provider: string;
  /** Model identifier (e.g., 'llama3.2', 'claude-sonnet-4-20250514') */
  model: string;
  /** Provider-specific options */
  providerOptions?: {
    /** Base URL for the provider API (for Ollama: default 'http://localhost:11434') */
    baseUrl?: string;
    /** API key for cloud providers */
    apiKey?: string;
    /** Configuration for Claude Code adapter */
    claudeCode?: ClaudeCodeConfig;
  };
  /** Model for recursive subcalls (defaults to same as model) */
  subcallModel?: string;
  /** Default budget if not specified per-execution */
  defaultBudget?: Partial<Budget>;
  /** REPL configuration */
  repl?: Partial<REPLConfig>;
}

/**
 * Budget constraints for RLM execution.
 *
 * All limits are hard caps - execution stops when any limit is reached.
 *
 * @example
 * ```typescript
 * const budget: Budget = {
 *   maxCost: 2.0,      // $2.00 max
 *   maxTokens: 100000, // 100k tokens
 *   maxTime: 60000,    // 1 minute
 *   maxDepth: 2,       // 2 levels of recursion
 *   maxIterations: 10, // 10 REPL iterations
 * };
 * ```
 */
export interface Budget {
  /** Maximum cost in dollars (for cloud providers) */
  maxCost: number;
  /** Maximum total tokens (input + output) */
  maxTokens: number;
  /** Maximum wall-clock time in milliseconds */
  maxTime: number;
  /** Maximum recursion depth for rlm_query calls */
  maxDepth: number;
  /** Maximum REPL iterations before forcing answer */
  maxIterations: number;
}

/**
 * Configuration for the Python REPL sandbox.
 */
export interface REPLConfig {
  /** Execution timeout per code block in milliseconds */
  timeout: number;
  /** Maximum output length before truncation (characters) */
  maxOutputLength: number;
  /**
   * Pyodide CDN URL or array of fallback URLs.
   * Defaults to jsDelivr CDN.
   */
  indexURL?: string | string[];
  /** Whether to load the full Python standard library (default: false) */
  fullStdLib?: boolean;
  /** Python packages to preload during initialization */
  preloadPackages?: string[];
  /**
   * Enable worker isolation for true interruption and memory cleanup.
   * When true (default), Pyodide runs in a Worker thread with SharedArrayBuffer
   * for interrupt support and complete memory cleanup on destroy().
   * Set to false to run in main thread (no true interrupt, memory may leak).
   */
  useWorker?: boolean;
  /** Callback for stdout lines during execution */
  onStdout?: (line: string) => void;
  /** Callback for stderr lines during execution */
  onStderr?: (line: string) => void;
}

// ============================================
// EXECUTION
// ============================================

/**
 * Options for executing an RLM task.
 *
 * @example
 * ```typescript
 * const options: ExecuteOptions = {
 *   task: 'Summarize the main points',
 *   context: documentText,
 *   budget: { maxCost: 0.50 },
 *   hooks: {
 *     onIteration: (iter) => console.log(`Iteration ${iter.index}`),
 *   },
 * };
 * ```
 */
export interface ExecuteOptions {
  /** The task/question to answer */
  task: string;
  /** Context string (will be loaded as 'context' variable in REPL) */
  context: string;
  /** Budget overrides (merged with default budget) */
  budget?: Partial<Budget>;
  /** Callbacks for execution events */
  hooks?: ExecutionHooks;
}

/**
 * Callbacks for subscribing to execution events.
 *
 * All callbacks are optional. They are called synchronously during execution.
 */
export interface ExecutionHooks {
  /** Called after each REPL iteration completes */
  onIteration?: (iteration: Iteration) => void;
  /** Called when a recursive subcall is about to start */
  onSubcall?: (info: { depth: number; task: string }) => void;
  /** Called when budget usage exceeds 80% threshold */
  onBudgetWarning?: (warning: string) => void;
}

// ============================================
// RESULTS
// ============================================

/**
 * Result of an RLM execution.
 *
 * Contains the output, execution trace for debugging, and usage statistics.
 */
export interface RLMResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** The final output string (answer or error message) */
  output: string;
  /** Execution trace for debugging and analysis */
  trace: ExecutionTrace;
  /** Resource usage statistics */
  usage: Usage;
  /** Any warnings generated during execution */
  warnings: string[];
  /** Error object if success is false */
  error?: Error;
}

/**
 * Resource usage statistics for an execution.
 */
export interface Usage {
  /** Total cost in dollars */
  cost: number;
  /** Total tokens used (input + output) */
  tokens: number;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens used */
  outputTokens: number;
  /** Wall-clock duration in milliseconds */
  duration: number;
  /** Number of REPL iterations */
  iterations: number;
  /** Number of recursive subcalls */
  subcalls: number;
  /** Maximum recursion depth reached */
  maxDepthReached: number;
}

/**
 * Complete trace of an execution for debugging and analysis.
 *
 * Traces form a tree structure where subcalls are nested ExecutionTrace objects.
 */
export interface ExecutionTrace {
  /** Unique execution ID */
  id: string;
  /** Parent execution ID (for subcalls, undefined for root) */
  parentId?: string;
  /** Recursion depth (0 for root execution) */
  depth: number;
  /** The task that was executed */
  task: string;
  /** Each REPL iteration in order */
  iterations: Iteration[];
  /** Traces from recursive subcalls */
  subcalls: ExecutionTrace[];
  /** The final answer produced */
  finalAnswer: string;
  /** How the answer was produced */
  answerSource: 'final_direct' | 'final_var' | 'forced' | 'error';
}

/**
 * Record of a single REPL iteration.
 *
 * Each iteration consists of a prompt to the LLM, its response,
 * and any code blocks that were executed.
 */
export interface Iteration {
  /** Iteration index (0-based) */
  index: number;
  /** What was sent to the LLM */
  prompt: {
    /** The prompt content */
    content: string;
    /** Token count of the prompt */
    tokens: number;
  };
  /** What the LLM responded */
  response: {
    /** The response content */
    content: string;
    /** Token count of the response */
    tokens: number;
    /** Cost of this response in dollars */
    cost: number;
  };
  /** Code blocks that were executed in this iteration */
  codeExecutions: CodeExecution[];
}

/**
 * Record of a single code execution in the REPL.
 */
export interface CodeExecution {
  /** The Python code that was executed */
  code: string;
  /** Standard output captured during execution */
  stdout: string;
  /** Standard error captured during execution */
  stderr: string;
  /** Error message if execution failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
}

// ============================================
// LLM ABSTRACTION
// ============================================

/**
 * Adapter interface for LLM providers.
 *
 * Implement this interface to add support for a new LLM provider.
 *
 * @example
 * ```typescript
 * class CustomAdapter implements LLMAdapter {
 *   async complete(request: LLMRequest): Promise<LLMResponse> {
 *     // Call your LLM provider here
 *     return {
 *       content: 'Response text',
 *       inputTokens: 100,
 *       outputTokens: 50,
 *       cost: 0.001,
 *     };
 *   }
 * }
 * ```
 */
export interface LLMAdapter {
  /** Complete a chat request and return the response */
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/**
 * Request structure for LLM completion.
 */
export interface LLMRequest {
  /** Model identifier to use */
  model: string;
  /** System prompt setting the assistant's behavior */
  systemPrompt: string;
  /** User prompt with the actual request */
  userPrompt: string;
  /** Maximum tokens to generate (optional, provider-specific default) */
  maxTokens?: number;
}

/**
 * Response structure from LLM completion.
 */
export interface LLMResponse {
  /** The generated text content */
  content: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Cost of this request in dollars (0 for local models) */
  cost: number;
}

// ============================================
// DEFAULTS
// ============================================

/**
 * Default budget values when not specified.
 *
 * - maxCost: $5.00 - reasonable for cloud providers
 * - maxTokens: 500,000 - allows substantial context
 * - maxTime: 300,000ms (5 minutes) - prevents runaway execution
 * - maxDepth: 2 - allows parent -> child -> grandchild
 * - maxIterations: 30 - enough for complex tasks
 */
export const DEFAULT_BUDGET: Budget = {
  maxCost: 5.0,
  maxTokens: 500_000,
  maxTime: 300_000, // 5 minutes
  maxDepth: 2,
  maxIterations: 30,
};

/**
 * Default REPL configuration values when not specified.
 *
 * - timeout: 30,000ms (30 seconds) - per code block execution
 * - maxOutputLength: 50,000 chars - prevents memory issues
 */
export const DEFAULT_REPL_CONFIG: REPLConfig = {
  timeout: 30_000, // 30 seconds per code block
  maxOutputLength: 50_000,
};
