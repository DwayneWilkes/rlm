// ============================================
// CONFIGURATION
// ============================================

/**
 * RLM instance configuration.
 */
export interface RLMConfig {
  /** LLM provider: 'ollama' | 'anthropic' | 'openai' */
  provider: string;
  /** Model identifier (e.g., 'llama3.2', 'claude-sonnet-4-20250514') */
  model: string;
  /** Provider-specific options */
  providerOptions?: {
    baseUrl?: string;
    apiKey?: string;
  };
  /** Model for recursive subcalls (defaults to same as model) */
  subcallModel?: string;
  /** Default budget if not specified per-execution */
  defaultBudget?: Partial<Budget>;
  /** REPL configuration */
  repl?: Partial<REPLConfig>;
}

/**
 * Budget limits for execution.
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
 * REPL sandbox configuration.
 */
export interface REPLConfig {
  /** Execution timeout per code block (ms) */
  timeout: number;
  /** Max output length before truncation */
  maxOutputLength: number;
}

// ============================================
// EXECUTION
// ============================================

/**
 * Options for executing an RLM task.
 */
export interface ExecuteOptions {
  /** The task/question to answer */
  task: string;
  /** Context string (will be loaded as 'context' variable in REPL) */
  context: string;
  /** Budget overrides */
  budget?: Partial<Budget>;
  /** Callbacks for execution events */
  hooks?: ExecutionHooks;
}

/**
 * Callbacks for execution events.
 */
export interface ExecutionHooks {
  onIteration?: (iteration: Iteration) => void;
  onSubcall?: (info: { depth: number; task: string }) => void;
  onBudgetWarning?: (warning: string) => void;
}

// ============================================
// RESULTS
// ============================================

/**
 * Result of an RLM execution.
 */
export interface RLMResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** The final output string */
  output: string;
  /** Execution trace for debugging */
  trace: ExecutionTrace;
  /** Resource usage statistics */
  usage: Usage;
  /** Any warnings generated */
  warnings: string[];
  /** Error if success is false */
  error?: Error;
}

/**
 * Resource usage statistics.
 */
export interface Usage {
  /** Total cost in dollars */
  cost: number;
  /** Total tokens used */
  tokens: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Wall-clock duration in ms */
  duration: number;
  /** Number of REPL iterations */
  iterations: number;
  /** Number of recursive subcalls */
  subcalls: number;
  /** Maximum depth reached */
  maxDepthReached: number;
}

/**
 * Full execution trace for debugging.
 */
export interface ExecutionTrace {
  /** Unique execution ID */
  id: string;
  /** Parent execution ID (for subcalls) */
  parentId?: string;
  /** Recursion depth (0 for root) */
  depth: number;
  /** The task that was executed */
  task: string;
  /** Each REPL iteration */
  iterations: Iteration[];
  /** Traces from recursive subcalls */
  subcalls: ExecutionTrace[];
  /** The final answer */
  finalAnswer: string;
  /** How the answer was produced */
  answerSource: 'final_direct' | 'final_var' | 'forced' | 'error';
}

/**
 * A single iteration in the REPL loop.
 */
export interface Iteration {
  /** Iteration index (0-based) */
  index: number;
  /** What was sent to the LLM */
  prompt: { content: string; tokens: number };
  /** What the LLM responded */
  response: { content: string; tokens: number; cost: number };
  /** Code blocks that were executed */
  codeExecutions: CodeExecution[];
}

/**
 * Result of executing a code block.
 */
export interface CodeExecution {
  /** The Python code */
  code: string;
  /** Stdout output */
  stdout: string;
  /** Stderr output */
  stderr: string;
  /** Error message if execution failed */
  error?: string;
  /** Execution duration in ms */
  duration: number;
}

// ============================================
// LLM ABSTRACTION
// ============================================

/**
 * Adapter interface for LLM providers.
 */
export interface LLMAdapter {
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/**
 * Request to an LLM.
 */
export interface LLMRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

/**
 * Response from an LLM.
 */
export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// ============================================
// DEFAULTS
// ============================================

export const DEFAULT_BUDGET: Budget = {
  maxCost: 5.0,
  maxTokens: 500_000,
  maxTime: 300_000, // 5 minutes
  maxDepth: 2,
  maxIterations: 30,
};

export const DEFAULT_REPL_CONFIG: REPLConfig = {
  timeout: 30_000, // 30 seconds per code block
  maxOutputLength: 50_000,
};
