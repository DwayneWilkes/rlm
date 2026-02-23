/**
 * @fileoverview Core type definitions for @rlm/core package.
 *
 * This module exports all TypeScript types, interfaces, and default values
 * used throughout the RLM (Recursive Language Model) system.
 *
 * @module @rlm/core/types
 */

// ============================================
// SANDBOX FACTORY (for dependency injection)
// ============================================

// Forward declarations for sandbox types (defined in repl/sandbox.ts)
// These avoid circular imports while enabling type-safe factory injection.

/**
 * Abstract interface for a Python execution sandbox.
 * Re-exported here to enable SandboxFactory type without circular imports.
 */
export interface SandboxInterface {
  initialize(context: string): Promise<void>;
  execute(code: string): Promise<CodeExecution>;
  getVariable(name: string): Promise<unknown>;
  cancel(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Bridge callbacks for LLM interactions from within Python code.
 * Re-exported here to enable SandboxFactory type without circular imports.
 */
export interface SandboxBridgesInterface {
  onLLMQuery: (prompt: string) => Promise<string>;
  onRLMQuery: (task: string, context?: string) => Promise<string>;
}

/**
 * Factory function for creating sandbox instances.
 *
 * Used to inject custom sandbox implementations (native, daemon, etc.)
 * into the RLM executor. This enables the CLI to provide different
 * backend implementations without modifying core.
 *
 * @example
 * ```typescript
 * const factory: SandboxFactory = (config, bridges) =>
 *   new NativePythonSandbox(config, bridges);
 *
 * const rlm = new RLM({
 *   provider: 'ollama',
 *   model: 'llama3.2',
 *   sandboxFactory: factory,
 * });
 * ```
 *
 * Design: sandboxFactory is optional with a Pyodide fallback in core.
 * CLI injects native/daemon backends via this factory.
 */
export type SandboxFactory = (
  config: REPLConfig,
  bridges: SandboxBridgesInterface
) => SandboxInterface;

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
  /** Provider for recursive subcalls (defaults to same as provider) */
  subcallProvider?: string;
  /** Model for recursive subcalls (defaults to same as model) */
  subcallModel?: string;
  /** Default budget if not specified per-execution */
  defaultBudget?: Partial<Budget>;
  /** REPL configuration */
  repl?: Partial<REPLConfig>;
  /**
   * Custom sandbox factory for dependency injection.
   * When provided, the executor uses this factory to create sandboxes
   * instead of the default Pyodide-based createSandbox().
   * This enables CLI to inject native Python or daemon-based sandboxes.
   */
  sandboxFactory?: SandboxFactory;
  /**
   * Model-specific prompt hints to include in the system prompt.
   * These hints help guide the LLM for optimal RLM execution.
   * Overrides any hints defined in MODEL_CAPABILITIES for this model.
   *
   * Paper evidence: "Qwen3-Coder needed extra warning about sub-call usage"
   *
   * @example
   * ```typescript
   * promptHints: [
   *   "Prefer batch_rlm_query() over sequential rlm_query() calls",
   *   "Limit sub-calls to 5 per iteration"
   * ]
   * ```
   */
  promptHints?: string[];
  /**
   * Provider-specific inference options (temperature, top_p, etc.).
   * These options control the randomness and sampling behavior of the LLM.
   *
   * @example
   * ```typescript
   * inference: {
   *   temperature: 0.7,
   *   top_p: 0.9,
   *   seed: 42,  // For reproducibility
   * }
   * ```
   */
  inference?: InferenceOptions;
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
  /** Maximum concurrent sub-RLMs in batch_rlm_query (default: 5) */
  maxBatchConcurrency?: number;
  /** Maximum tasks in a single batch_rlm_query call (default: 10) */
  maxBatchSize?: number;
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
// INFERENCE OPTIONS
// ============================================

/**
 * Common inference options shared across all LLM providers.
 * These options control the randomness and focus of text generation.
 */
export interface CommonInferenceOptions {
  /** Sampling temperature (0.0-2.0, default varies by model) */
  temperature?: number;
  /** Nucleus sampling threshold (0.0-1.0) */
  top_p?: number;
  /** Top-k sampling (positive integer) */
  top_k?: number;
  /** Stop sequences to halt generation */
  stop?: string[];
}

/**
 * Ollama-specific inference options.
 * Extends common options with local model controls.
 */
export interface OllamaInferenceOptions extends CommonInferenceOptions {
  /** Override context window size (tokens) */
  num_ctx?: number;
  /** Max tokens to generate */
  num_predict?: number;
  /** Penalize repeated tokens (0.0-2.0, default 1.1) */
  repeat_penalty?: number;
  /** Last N tokens for repeat penalty (default 64) */
  repeat_last_n?: number;
  /** Random seed for reproducibility (-1 = random) */
  seed?: number;
  /** How long to keep model loaded ("5m", "1h", "-1" = forever) */
  keep_alive?: string;
  /** Mirostat sampling mode (0, 1, or 2) */
  mirostat?: number;
  /** Enable thinking mode for supported models */
  think?: boolean;
}

/**
 * Anthropic-specific inference options.
 */
export interface AnthropicInferenceOptions extends CommonInferenceOptions {
  /** Maximum output tokens (default: model-specific) */
  max_tokens?: number;
}

/**
 * OpenAI-specific inference options.
 */
export interface OpenAIInferenceOptions extends CommonInferenceOptions {
  /** Penalize tokens by frequency (-2.0 to 2.0) */
  frequency_penalty?: number;
  /** Penalize tokens by presence (-2.0 to 2.0) */
  presence_penalty?: number;
  /** Maximum output tokens */
  max_tokens?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Gemini-specific inference options.
 */
export interface GeminiInferenceOptions extends CommonInferenceOptions {
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Number of response candidates to generate */
  candidateCount?: number;
  /** Response MIME type ("text/plain", "application/json") */
  responseMimeType?: string;
  /** JSON schema for structured output */
  responseSchema?: object;
  /** Thinking level for reasoning ("low", "medium", "high") */
  thinkingLevel?: 'low' | 'medium' | 'high';
  /** Safety settings threshold */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

/**
 * Mistral-specific inference options.
 */
export interface MistralInferenceOptions extends CommonInferenceOptions {
  /** Maximum tokens in completion */
  max_tokens?: number;
  /** Penalize repeated words by frequency (default 0) */
  frequency_penalty?: number;
  /** Penalize word/phrase repetition (default 0) */
  presence_penalty?: number;
  /** Random seed for deterministic output */
  random_seed?: number;
  /** Inject safety guidance before conversation (default false) */
  safe_prompt?: boolean;
  /** Number of completions per request */
  n?: number;
}

/**
 * Cohere-specific inference options.
 * Uses p/k naming instead of top_p/top_k.
 */
export interface CohereInferenceOptions {
  /** Sampling temperature (default 0.3) */
  temperature?: number;
  /** Nucleus sampling threshold (default 0.75, range 0.01-0.99) */
  p?: number;
  /** Top-k sampling (default 0, range 0-500, 0 = disabled) */
  k?: number;
  /** Maximum output tokens */
  max_tokens?: number;
  /** Reduce repetition by frequency (0.0-1.0) */
  frequency_penalty?: number;
  /** Reduce repetition by presence (0.0-1.0) */
  presence_penalty?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Stop sequences (up to 5) */
  stop_sequences?: string[];
  /** Include log probabilities */
  logprobs?: boolean;
  /** Thinking/reasoning mode */
  thinking?: {
    type: 'enabled' | 'disabled';
    /** Max tokens for thinking */
    token_budget?: number;
  };
  /** Request priority (lower = higher priority) */
  priority?: number;
}

/**
 * Hugging Face-specific inference options.
 */
export interface HuggingFaceInferenceOptions extends CommonInferenceOptions {
  /** Maximum new tokens to generate */
  max_new_tokens?: number;
  /** Repetition penalty (1.0 = no penalty) */
  repetition_penalty?: number;
  /** Frequency penalty (1.0 = no penalty) */
  frequency_penalty?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Enable sampling (vs greedy decoding) */
  do_sample?: boolean;
  /** Typical decoding mass */
  typical_p?: number;
  /** Generate N sequences, return best */
  best_of?: number;
  /** Add watermark to output */
  watermark?: boolean;
  /** Grammar constraint (JSON schema or regex) */
  grammar?: {
    type: 'json' | 'regex' | 'json_schema';
    value: object | string;
  };
  /** Truncate input to N tokens */
  truncate?: number;
  /** LoRA adapter ID */
  adapter_id?: string;
}

/**
 * Union type of all provider-specific inference options.
 * Used in RLMConfig to specify inference parameters.
 */
export type InferenceOptions =
  | OllamaInferenceOptions
  | AnthropicInferenceOptions
  | OpenAIInferenceOptions
  | GeminiInferenceOptions
  | MistralInferenceOptions
  | CohereInferenceOptions
  | HuggingFaceInferenceOptions;

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
  /** Provider-specific inference options */
  inference?: InferenceOptions;
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
