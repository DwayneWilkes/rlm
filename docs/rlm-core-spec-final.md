# @rlm/core Package Specification

A TypeScript library implementing Recursive Language Models (Zhang et al., 2025).

---

## What This Package Does

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({ provider: 'ollama', model: 'llama3.2' });

const result = await rlm.execute({
  task: 'Analyze this codebase and identify the main modules',
  context: sourceCode,
  budget: { maxCost: 1.0, maxDepth: 2 },
});

console.log(result.output);
console.log(result.usage); // { cost, tokens, duration, iterations, subcalls }
```

The key innovation: context is loaded as a variable in a Python REPL, and the LLM can recursively spawn sub-RLMs to handle complex sub-tasks.

---

## Package Structure

```
@rlm/core/
├── src/
│   ├── index.ts              # Public API
│   ├── types.ts              # All type definitions
│   ├── rlm.ts                # Main RLM class
│   ├── context/
│   │   └── loader.ts         # Context loading
│   ├── repl/
│   │   ├── sandbox.ts        # Abstract sandbox
│   │   └── pyodide.ts        # Pyodide implementation
│   ├── llm/
│   │   ├── router.ts         # Provider routing
│   │   └── adapters/
│   │       ├── ollama.ts     # Ollama (default)
│   │       ├── anthropic.ts  # Claude
│   │       └── openai.ts     # GPT
│   ├── budget/
│   │   └── controller.ts     # Budget enforcement
│   └── engine/
│       ├── executor.ts       # Main execution loop
│       └── parser.ts         # Response parsing
├── package.json
└── tsconfig.json
```

---

## Effort Estimation

Using Quanta (Q) = Scope × Complexity × Uncertainty

| Task | Q | Parallel Group |
|------|---|----------------|
| Types & interfaces | 2 | A |
| Context loader | 3 | A |
| REPL sandbox | 6 | B |
| LLM router + adapters | 4 | B |
| Budget controller | 3 | C |
| Execution engine | 8 | C (after A, B) |
| Tracing | 2 | C |

**Total: 28Q**

**Wave 1** (parallel): Types, Context, REPL, LLM Router
**Wave 2** (parallel): Budget, Engine, Tracing

---

## Task 1: Types & Interfaces (2Q)

```typescript
// src/types.ts

// ============================================
// CONFIGURATION
// ============================================

export interface RLMConfig {
  /** LLM provider: 'ollama' | 'anthropic' | 'openai' */
  provider: string;
  /** Model identifier (e.g., 'llama3.2', 'claude-sonnet-4-20250514') */
  model: string;
  /** Provider-specific options */
  providerOptions?: {
    baseUrl?: string;      // For Ollama: default 'http://localhost:11434'
    apiKey?: string;       // For cloud providers
  };
  /** Model for recursive subcalls (defaults to same as model) */
  subcallModel?: string;
  /** Default budget if not specified per-execution */
  defaultBudget?: Partial<Budget>;
  /** REPL configuration */
  repl?: Partial<REPLConfig>;
}

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

export interface REPLConfig {
  /** Execution timeout per code block (ms) */
  timeout: number;
  /** Max output length before truncation */
  maxOutputLength: number;
}

// ============================================
// EXECUTION
// ============================================

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

export interface ExecutionHooks {
  onIteration?: (iteration: Iteration) => void;
  onSubcall?: (info: { depth: number; task: string }) => void;
  onBudgetWarning?: (warning: string) => void;
}

// ============================================
// RESULTS
// ============================================

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

export interface LLMAdapter {
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

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
  maxTime: 300_000,      // 5 minutes
  maxDepth: 2,
  maxIterations: 30,
};

export const DEFAULT_REPL_CONFIG: REPLConfig = {
  timeout: 30_000,       // 30 seconds per code block
  maxOutputLength: 50_000,
};
```

**Acceptance Criteria:**
- [ ] All types exported from `src/types.ts`
- [ ] Compiles with strict TypeScript
- [ ] JSDoc comments on all public interfaces

---

## Task 2: Context Loader (3Q)

Simple utility to prepare context for REPL injection.

```typescript
// src/context/loader.ts

export interface LoadedContext {
  /** The raw content string */
  content: string;
  /** Character length */
  length: number;
  /** Approximate token count */
  tokenEstimate: number;
  /** Detected content type */
  contentType: 'markdown' | 'code' | 'json' | 'plain';
}

/**
 * Load and prepare context for REPL injection.
 * 
 * This is intentionally simple - consumers handle file loading,
 * directory traversal, etc. We just take a string.
 */
export function loadContext(content: string): LoadedContext {
  return {
    content,
    length: content.length,
    tokenEstimate: estimateTokens(content),
    contentType: detectContentType(content),
  };
}

/**
 * Rough token estimation (~4 chars per token for English).
 * Good enough for budget estimation.
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Detect content type for system prompt hints.
 */
function detectContentType(content: string): LoadedContext['contentType'] {
  const trimmed = content.trim();
  
  // JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }
  
  // Code indicators
  const codePatterns = [
    /^import\s+/m,
    /^from\s+\w+\s+import/m,
    /^const\s+/m,
    /^function\s+/m,
    /^class\s+/m,
    /^def\s+/m,
    /^package\s+/m,
  ];
  if (codePatterns.some(p => p.test(content))) {
    return 'code';
  }
  
  // Markdown indicators
  if (/^#{1,6}\s+/m.test(content) || /^\s*[-*]\s+/m.test(content)) {
    return 'markdown';
  }
  
  return 'plain';
}

/**
 * Escape content for safe Python string injection.
 */
export function escapeForPython(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\r\n/g, '\n');
}
```

**Acceptance Criteria:**
- [ ] `loadContext()` returns correct structure
- [ ] Token estimation within 2x of actual
- [ ] Content type detection works for common cases
- [ ] Python escaping handles edge cases (quotes, backslashes)

---

## Task 3: REPL Sandbox (6Q)

Pyodide-based Python execution with LLM bridges.

```typescript
// src/repl/sandbox.ts

import type { REPLConfig, CodeExecution } from '../types';

export interface SandboxBridges {
  /** Called when Python code invokes llm_query() */
  onLLMQuery: (prompt: string) => Promise<string>;
  /** Called when Python code invokes rlm_query() */
  onRLMQuery: (task: string, context?: string) => Promise<string>;
}

export interface Sandbox {
  /** Initialize sandbox with context */
  initialize(context: string): Promise<void>;
  /** Execute Python code */
  execute(code: string): Promise<CodeExecution>;
  /** Get a variable's value from the environment */
  getVariable(name: string): Promise<unknown>;
  /** Clean up resources */
  destroy(): Promise<void>;
}

export function createSandbox(
  config: REPLConfig,
  bridges: SandboxBridges
): Sandbox {
  return new PyodideSandbox(config, bridges);
}
```

```typescript
// src/repl/pyodide.ts

import { loadPyodide, PyodideInterface } from 'pyodide';
import type { REPLConfig, CodeExecution } from '../types';
import type { Sandbox, SandboxBridges } from './sandbox';

export class PyodideSandbox implements Sandbox {
  private pyodide: PyodideInterface | null = null;
  private config: REPLConfig;
  private bridges: SandboxBridges;
  private context: string = '';

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
  }

  async execute(code: string): Promise<CodeExecution> {
    if (!this.pyodide) {
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
      const stdout = await this.pyodide.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
__stdout__.getvalue()
`) as string;

      const stderr = await this.pyodide.runPythonAsync(
        `__stderr__.getvalue()`
      ) as string;

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
      } catch { /* ignore */ }

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
    if (!this.pyodide) {
      throw new Error('Sandbox not initialized');
    }

    try {
      const value = this.pyodide.globals.get(name);
      // Convert Python objects to JS
      return value?.toJs?.() ?? value;
    } catch {
      return undefined;
    }
  }

  async destroy(): Promise<void> {
    this.pyodide = null;
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
    return output.slice(0, this.config.maxOutputLength) + 
      `\n... [truncated, ${output.length - this.config.maxOutputLength} chars omitted]`;
  }
}

const PYTHON_SETUP = `
import re
import json
import asyncio

# Synchronous wrappers for the async bridges
def llm_query(prompt: str) -> str:
    """
    Query an LLM with the given prompt.
    Use for simple, single-shot questions.
    """
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
    """
    loop = asyncio.get_event_loop()
    context_to_use = ctx if ctx is not None else __context_ref__
    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, __rlm_query_bridge__(task, context_to_use))
            return future.result()
    return asyncio.run(__rlm_query_bridge__(task, context_to_use))

# Utility functions
def chunk_text(text: str, size: int = 10000, overlap: int = 500) -> list:
    """Split text into overlapping chunks."""
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
    """Search context for regex pattern, return matches with surrounding text."""
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
```

**Acceptance Criteria:**
- [ ] Sandbox initializes with Pyodide
- [ ] Context available as `context` variable in Python
- [ ] `llm_query()` calls through to TypeScript bridge
- [ ] `rlm_query()` calls through to TypeScript bridge
- [ ] Code execution respects timeout
- [ ] Output truncation works
- [ ] `getVariable()` retrieves Python variables
- [ ] Cleanup releases resources

---

## Task 4: LLM Router + Adapters (4Q)

```typescript
// src/llm/router.ts

import type { LLMAdapter, LLMRequest, LLMResponse } from '../types';

export class LLMRouter {
  private adapters: Map<string, LLMAdapter> = new Map();
  private defaultProvider: string;

  constructor(defaultProvider: string) {
    this.defaultProvider = defaultProvider;
  }

  register(providerId: string, adapter: LLMAdapter): void {
    this.adapters.set(providerId, adapter);
  }

  async complete(
    provider: string,
    request: LLMRequest
  ): Promise<LLMResponse> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return adapter.complete(request);
  }

  getAdapter(provider: string): LLMAdapter | undefined {
    return this.adapters.get(provider);
  }
}
```

```typescript
// src/llm/adapters/ollama.ts

import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types';

export interface OllamaConfig {
  baseUrl: string;
}

export class OllamaAdapter implements LLMAdapter {
  private baseUrl: string;

  constructor(config: OllamaConfig = { baseUrl: 'http://localhost:11434' }) {
    this.baseUrl = config.baseUrl;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        stream: false,
        options: {
          num_predict: request.maxTokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      cost: 0, // Local models are free
    };
  }
}
```

```typescript
// src/llm/adapters/anthropic.ts

import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types';

export interface AnthropicConfig {
  apiKey: string;
}

// Cost per 1K tokens (update as pricing changes)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-3-20240307': { input: 0.00025, output: 0.00125 },
};

export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    const content = response.content[0]?.type === 'text'
      ? response.content[0].text
      : '';

    const pricing = PRICING[request.model] ?? { input: 0.003, output: 0.015 };
    const cost = (
      (response.usage.input_tokens * pricing.input) +
      (response.usage.output_tokens * pricing.output)
    ) / 1000;

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
    };
  }
}
```

```typescript
// src/llm/adapters/openai.ts

import OpenAI from 'openai';
import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types';

export interface OpenAIConfig {
  apiKey: string;
}

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '';

    const pricing = PRICING[request.model] ?? { input: 0.005, output: 0.015 };
    const cost = (
      ((response.usage?.prompt_tokens ?? 0) * pricing.input) +
      ((response.usage?.completion_tokens ?? 0) * pricing.output)
    ) / 1000;

    return {
      content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cost,
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Router registers and retrieves adapters
- [ ] Ollama adapter works with local instance
- [ ] Anthropic adapter handles Claude models
- [ ] OpenAI adapter handles GPT models
- [ ] Cost calculation is accurate for cloud providers

---

## Task 5: Budget Controller (3Q)

```typescript
// src/budget/controller.ts

import type { Budget, Usage } from '../types';
import { DEFAULT_BUDGET } from '../types';

export type BudgetWarningHandler = (warning: string) => void;

export class BudgetController {
  private budget: Budget;
  private usage: Usage;
  private startTime: number;
  private warningHandler?: BudgetWarningHandler;
  private warningsSent: Set<string> = new Set();

  constructor(budget: Partial<Budget> = {}, onWarning?: BudgetWarningHandler) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.warningHandler = onWarning;
    this.startTime = Date.now();
    this.usage = {
      cost: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      duration: 0,
      iterations: 0,
      subcalls: 0,
      maxDepthReached: 0,
    };
  }

  /**
   * Check if an operation is allowed within budget.
   */
  canProceed(operation: 'iteration' | 'subcall', depth?: number): boolean {
    this.updateDuration();

    // Hard limits
    if (this.usage.cost >= this.budget.maxCost) {
      return false;
    }
    if (this.usage.tokens >= this.budget.maxTokens) {
      return false;
    }
    if (this.usage.duration >= this.budget.maxTime) {
      return false;
    }
    if (operation === 'iteration' && this.usage.iterations >= this.budget.maxIterations) {
      return false;
    }
    if (operation === 'subcall' && (depth ?? 0) >= this.budget.maxDepth) {
      return false;
    }

    // Warnings at 80% threshold
    this.checkWarnings();

    return true;
  }

  /**
   * Record usage from an operation.
   */
  record(update: {
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    iteration?: boolean;
    subcall?: boolean;
    depth?: number;
  }): void {
    if (update.cost) this.usage.cost += update.cost;
    if (update.inputTokens) {
      this.usage.inputTokens += update.inputTokens;
      this.usage.tokens += update.inputTokens;
    }
    if (update.outputTokens) {
      this.usage.outputTokens += update.outputTokens;
      this.usage.tokens += update.outputTokens;
    }
    if (update.iteration) this.usage.iterations++;
    if (update.subcall) this.usage.subcalls++;
    if (update.depth !== undefined) {
      this.usage.maxDepthReached = Math.max(this.usage.maxDepthReached, update.depth);
    }
    this.updateDuration();
  }

  /**
   * Get a sub-budget for a recursive call.
   */
  getSubBudget(depth: number): Partial<Budget> {
    const remaining = this.getRemaining();
    return {
      maxCost: remaining.cost * 0.5,
      maxTokens: remaining.tokens * 0.5,
      maxTime: remaining.time * 0.5,
      maxDepth: Math.max(0, this.budget.maxDepth - depth - 1),
      maxIterations: Math.ceil(this.budget.maxIterations * 0.5),
    };
  }

  /**
   * Get current usage statistics.
   */
  getUsage(): Usage {
    this.updateDuration();
    return { ...this.usage };
  }

  /**
   * Get remaining budget.
   */
  getRemaining(): { cost: number; tokens: number; time: number; depth: number; iterations: number } {
    this.updateDuration();
    return {
      cost: Math.max(0, this.budget.maxCost - this.usage.cost),
      tokens: Math.max(0, this.budget.maxTokens - this.usage.tokens),
      time: Math.max(0, this.budget.maxTime - this.usage.duration),
      depth: this.budget.maxDepth,
      iterations: Math.max(0, this.budget.maxIterations - this.usage.iterations),
    };
  }

  /**
   * Get the reason execution cannot proceed (if any).
   */
  getBlockReason(): string | null {
    if (this.usage.cost >= this.budget.maxCost) return 'Cost budget exhausted';
    if (this.usage.tokens >= this.budget.maxTokens) return 'Token budget exhausted';
    if (this.usage.duration >= this.budget.maxTime) return 'Time budget exhausted';
    if (this.usage.iterations >= this.budget.maxIterations) return 'Max iterations reached';
    return null;
  }

  private updateDuration(): void {
    this.usage.duration = Date.now() - this.startTime;
  }

  private checkWarnings(): void {
    const threshold = 0.8;
    
    const costPct = this.usage.cost / this.budget.maxCost;
    if (costPct >= threshold && !this.warningsSent.has('cost')) {
      this.warn(`Cost at ${(costPct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('cost');
    }

    const tokenPct = this.usage.tokens / this.budget.maxTokens;
    if (tokenPct >= threshold && !this.warningsSent.has('tokens')) {
      this.warn(`Tokens at ${(tokenPct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('tokens');
    }

    const timePct = this.usage.duration / this.budget.maxTime;
    if (timePct >= threshold && !this.warningsSent.has('time')) {
      this.warn(`Time at ${(timePct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('time');
    }
  }

  private warn(message: string): void {
    this.warningHandler?.(message);
  }
}
```

**Acceptance Criteria:**
- [ ] `canProceed()` returns false when limits hit
- [ ] `record()` accumulates usage correctly
- [ ] `getSubBudget()` allocates proportionally
- [ ] Warnings fire at 80% threshold (once each)
- [ ] `getBlockReason()` returns correct message

---

## Task 6: Execution Engine (8Q)

The core orchestrator that ties everything together.

```typescript
// src/engine/parser.ts

export interface ParsedResponse {
  /** Any thinking/reasoning text */
  thinking: string;
  /** Code blocks to execute */
  codeBlocks: string[];
  /** Final answer if present */
  finalAnswer: {
    type: 'direct' | 'variable';
    value: string;
  } | null;
}

/**
 * Parse LLM response to extract code blocks and final answer.
 */
export function parseResponse(response: string): ParsedResponse {
  const codeBlocks: string[] = [];
  
  // Extract code blocks (```repl or ```python)
  const codeBlockRegex = /```(?:repl|python)\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    codeBlocks.push(match[1].trim());
  }

  // Check for FINAL() - direct answer
  const finalDirectMatch = response.match(/FINAL\(([^)]+)\)/s);
  
  // Check for FINAL_VAR() - variable reference
  const finalVarMatch = response.match(/FINAL_VAR\((\w+)\)/);

  let finalAnswer: ParsedResponse['finalAnswer'] = null;
  if (finalDirectMatch) {
    finalAnswer = { type: 'direct', value: finalDirectMatch[1].trim() };
  } else if (finalVarMatch) {
    finalAnswer = { type: 'variable', value: finalVarMatch[1] };
  }

  // Everything else is "thinking"
  let thinking = response
    .replace(codeBlockRegex, '')
    .replace(/FINAL\([^)]+\)/s, '')
    .replace(/FINAL_VAR\(\w+\)/, '')
    .trim();

  return { thinking, codeBlocks, finalAnswer };
}
```

```typescript
// src/engine/executor.ts

import type {
  RLMConfig,
  ExecuteOptions,
  RLMResult,
  ExecutionTrace,
  Iteration,
  Budget,
  Usage,
} from '../types';
import { DEFAULT_BUDGET, DEFAULT_REPL_CONFIG } from '../types';
import { loadContext, escapeForPython } from '../context/loader';
import { createSandbox, Sandbox } from '../repl/sandbox';
import { LLMRouter } from '../llm/router';
import { BudgetController } from '../budget/controller';
import { parseResponse } from './parser';

export class Executor {
  private config: RLMConfig;
  private router: LLMRouter;
  private depth: number;
  private parentId?: string;

  constructor(
    config: RLMConfig,
    router: LLMRouter,
    depth = 0,
    parentId?: string
  ) {
    this.config = config;
    this.router = router;
    this.depth = depth;
    this.parentId = parentId;
  }

  async execute(options: ExecuteOptions): Promise<RLMResult> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();
    const warnings: string[] = [];

    // Initialize budget controller
    const budget = new BudgetController(
      { ...DEFAULT_BUDGET, ...this.config.defaultBudget, ...options.budget },
      (warning) => {
        warnings.push(warning);
        options.hooks?.onBudgetWarning?.(warning);
      }
    );

    // Initialize trace
    const trace: ExecutionTrace = {
      id: executionId,
      parentId: this.parentId,
      depth: this.depth,
      task: options.task,
      iterations: [],
      subcalls: [],
      finalAnswer: '',
      answerSource: 'forced',
    };

    // Load context
    const context = loadContext(options.context);

    // Create sandbox with bridges
    const replConfig = { ...DEFAULT_REPL_CONFIG, ...this.config.repl };
    const sandbox = createSandbox(replConfig, {
      onLLMQuery: async (prompt) => {
        const response = await this.router.complete(this.config.provider, {
          model: this.config.subcallModel ?? this.config.model,
          systemPrompt: 'You are a helpful assistant. Be concise.',
          userPrompt: prompt,
        });
        budget.record({
          cost: response.cost,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });
        return response.content;
      },
      onRLMQuery: async (task, ctx) => {
        if (!budget.canProceed('subcall', this.depth + 1)) {
          return `[Cannot spawn sub-RLM: ${budget.getBlockReason()}. Answering directly.]\n` +
            await this.directAnswer(task, ctx ?? options.context);
        }

        options.hooks?.onSubcall?.({ depth: this.depth + 1, task });
        budget.record({ subcall: true, depth: this.depth + 1 });

        const subExecutor = new Executor(
          {
            ...this.config,
            defaultBudget: budget.getSubBudget(this.depth),
          },
          this.router,
          this.depth + 1,
          executionId
        );

        const subResult = await subExecutor.execute({
          task,
          context: ctx ?? options.context,
          hooks: options.hooks,
        });

        trace.subcalls.push(subResult.trace);
        budget.record({
          cost: subResult.usage.cost,
          inputTokens: subResult.usage.inputTokens,
          outputTokens: subResult.usage.outputTokens,
        });

        return subResult.output;
      },
    });

    try {
      await sandbox.initialize(escapeForPython(options.context));

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context, budget);
      let conversationContext = '';

      // Main execution loop
      while (budget.canProceed('iteration')) {
        budget.record({ iteration: true });

        // Build user prompt
        const userPrompt = trace.iterations.length === 0
          ? this.buildInitialPrompt(options.task, context)
          : conversationContext;

        // Call LLM
        const response = await this.router.complete(this.config.provider, {
          model: this.config.model,
          systemPrompt,
          userPrompt,
          maxTokens: 8192,
        });

        budget.record({
          cost: response.cost,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
        });

        // Parse response
        const parsed = parseResponse(response.content);

        // Create iteration record
        const iteration: Iteration = {
          index: trace.iterations.length,
          prompt: {
            content: userPrompt,
            tokens: response.inputTokens,
          },
          response: {
            content: response.content,
            tokens: response.outputTokens,
            cost: response.cost,
          },
          codeExecutions: [],
        };

        // Execute code blocks
        let executionOutput = '';
        for (const code of parsed.codeBlocks) {
          const result = await sandbox.execute(code);
          iteration.codeExecutions.push(result);

          if (result.error) {
            executionOutput += `\n[Error]: ${result.error}`;
          } else if (result.stdout) {
            executionOutput += `\n[Output]:\n${result.stdout}`;
          }
        }

        trace.iterations.push(iteration);
        options.hooks?.onIteration?.(iteration);

        // Check for final answer
        if (parsed.finalAnswer) {
          if (parsed.finalAnswer.type === 'variable') {
            const value = await sandbox.getVariable(parsed.finalAnswer.value);
            trace.finalAnswer = String(value ?? '[Variable not found]');
            trace.answerSource = 'final_var';
          } else {
            trace.finalAnswer = parsed.finalAnswer.value;
            trace.answerSource = 'final_direct';
          }
          break;
        }

        // Build context for next iteration
        conversationContext = `Previous response:\n${response.content}\n\nExecution results:${executionOutput || '\n[No output]'}\n\nContinue your analysis or provide FINAL(answer) when ready.`;
      }

      // Force answer if we ran out of budget
      if (!trace.finalAnswer) {
        trace.finalAnswer = await this.forceAnswer(
          options.task,
          trace.iterations,
          sandbox
        );
        trace.answerSource = 'forced';
        warnings.push('Budget exhausted, answer was forced');
      }

      return {
        success: true,
        output: trace.finalAnswer,
        trace,
        usage: budget.getUsage(),
        warnings,
      };

    } catch (error) {
      return {
        success: false,
        output: '',
        trace,
        usage: budget.getUsage(),
        warnings,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      await sandbox.destroy();
    }
  }

  private buildSystemPrompt(
    context: ReturnType<typeof loadContext>,
    budget: BudgetController
  ): string {
    const remaining = budget.getRemaining();
    
    return `You are an RLM (Recursive Language Model). You solve complex tasks by examining context, executing Python code, and delegating sub-tasks.

ENVIRONMENT:
- \`context\`: String variable with your input (${context.length.toLocaleString()} chars, ${context.contentType})
- \`llm_query(prompt)\`: Query an LLM for simple tasks
- \`rlm_query(task, ctx?)\`: Spawn a sub-RLM for complex sub-tasks (PREFERRED for multi-step reasoning)
- \`chunk_text(text, size, overlap)\`: Split text into chunks
- \`search_context(pattern, window)\`: Regex search with context

BUDGET:
- Remaining: $${remaining.cost.toFixed(2)} | ${remaining.iterations} iterations | depth ${this.depth}/${budget.getRemaining().depth + this.depth}

EXECUTION:
Write Python in \`\`\`repl blocks:
\`\`\`repl
print(len(context))
results = search_context("important", window=100)
print(results[:3])
\`\`\`

STRATEGY:
1. First examine context structure (print samples, check length)
2. For complex sub-tasks, use rlm_query() - it has its own REPL
3. Build answers incrementally in variables
4. Be budget-conscious: batch operations

TERMINATION (use when ready):
- FINAL(your answer here) - Direct answer
- FINAL_VAR(variable_name) - Return variable contents`;
  }

  private buildInitialPrompt(
    task: string,
    context: ReturnType<typeof loadContext>
  ): string {
    const preview = context.content.slice(0, 2000);
    const truncated = context.content.length > 2000 ? '...[truncated]' : '';
    
    return `TASK: ${task}

CONTEXT PREVIEW (${context.length.toLocaleString()} chars total):
${preview}${truncated}

Begin by examining the context, then work toward answering the task.`;
  }

  private async directAnswer(task: string, context: string): Promise<string> {
    const preview = context.slice(0, 10000);
    const response = await this.router.complete(this.config.provider, {
      model: this.config.subcallModel ?? this.config.model,
      systemPrompt: 'Answer concisely based on the context provided.',
      userPrompt: `Context:\n${preview}\n\nTask: ${task}`,
    });
    return response.content;
  }

  private async forceAnswer(
    task: string,
    iterations: Iteration[],
    sandbox: Sandbox
  ): Promise<string> {
    // Try to extract any accumulated information
    const lastIteration = iterations[iterations.length - 1];
    const lastOutput = lastIteration?.codeExecutions
      .map(e => e.stdout || e.error)
      .filter(Boolean)
      .join('\n');

    const response = await this.router.complete(this.config.provider, {
      model: this.config.model,
      systemPrompt: 'Provide your best answer based on the work done so far.',
      userPrompt: `Original task: ${task}\n\nLast execution output:\n${lastOutput || '[none]'}\n\nProvide your best answer now.`,
      maxTokens: 2048,
    });

    return response.content;
  }
}
```

**Acceptance Criteria:**
- [ ] Initializes sandbox with context
- [ ] Runs iteration loop until FINAL or budget exhaustion
- [ ] Parses code blocks and executes them
- [ ] Handles `llm_query()` bridge calls
- [ ] Handles `rlm_query()` recursive calls
- [ ] Builds complete execution trace
- [ ] Respects all budget limits
- [ ] Forces answer when budget exhausted
- [ ] Cleans up sandbox on completion

---

## Task 7: Public API & Tracing (2Q)

```typescript
// src/rlm.ts

import type { RLMConfig, ExecuteOptions, RLMResult } from './types';
import { LLMRouter } from './llm/router';
import { OllamaAdapter } from './llm/adapters/ollama';
import { AnthropicAdapter } from './llm/adapters/anthropic';
import { OpenAIAdapter } from './llm/adapters/openai';
import { Executor } from './engine/executor';

export class RLM {
  private config: RLMConfig;
  private router: LLMRouter;

  constructor(config: RLMConfig) {
    this.config = config;
    this.router = new LLMRouter(config.provider);
    this.setupProviders();
  }

  /**
   * Execute an RLM task.
   */
  async execute(options: ExecuteOptions): Promise<RLMResult> {
    const executor = new Executor(this.config, this.router);
    return executor.execute(options);
  }

  private setupProviders(): void {
    // Always register Ollama (default, local)
    this.router.register('ollama', new OllamaAdapter({
      baseUrl: this.config.providerOptions?.baseUrl ?? 'http://localhost:11434',
    }));

    // Register cloud providers if API keys provided
    if (this.config.providerOptions?.apiKey) {
      if (this.config.provider === 'anthropic') {
        this.router.register('anthropic', new AnthropicAdapter({
          apiKey: this.config.providerOptions.apiKey,
        }));
      } else if (this.config.provider === 'openai') {
        this.router.register('openai', new OpenAIAdapter({
          apiKey: this.config.providerOptions.apiKey,
        }));
      }
    }
  }
}
```

```typescript
// src/index.ts

// Main class
export { RLM } from './rlm';

// Types
export type {
  RLMConfig,
  ExecuteOptions,
  RLMResult,
  ExecutionTrace,
  Iteration,
  CodeExecution,
  Usage,
  Budget,
  ExecutionHooks,
  LLMAdapter,
  LLMRequest,
  LLMResponse,
} from './types';

// Defaults
export { DEFAULT_BUDGET, DEFAULT_REPL_CONFIG } from './types';

// Utilities (for consumers who want lower-level access)
export { loadContext } from './context/loader';
export { parseResponse } from './engine/parser';
export { BudgetController } from './budget/controller';

// Adapters (for consumers who want to add custom providers)
export { LLMRouter } from './llm/router';
export { OllamaAdapter } from './llm/adapters/ollama';
export { AnthropicAdapter } from './llm/adapters/anthropic';
export { OpenAIAdapter } from './llm/adapters/openai';
```

**Acceptance Criteria:**
- [ ] `RLM` class is the primary public interface
- [ ] All necessary types exported
- [ ] Adapters exported for extensibility
- [ ] Works with `import { RLM } from '@rlm/core'`

---

## Package Configuration

```json
// package.json
{
  "name": "@rlm/core",
  "version": "0.1.0",
  "description": "Recursive Language Models - context as environment",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "pyodide": "^0.26.0"
  },
  "optionalDependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.70.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": ">=0.30.0",
    "openai": ">=4.0.0"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": { "optional": true },
    "openai": { "optional": true }
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["llm", "recursive", "language-model", "ai", "context", "repl"],
  "license": "MIT"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Usage Examples

### Basic Usage (Ollama)

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({
  provider: 'ollama',
  model: 'llama3.2',
});

const result = await rlm.execute({
  task: 'Summarize the main points',
  context: myDocument,
});

console.log(result.output);
```

### With Cloud Provider

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  providerOptions: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  subcallModel: 'claude-haiku-3-20240307', // Cheaper for subcalls
});

const result = await rlm.execute({
  task: 'Analyze this codebase and identify potential bugs',
  context: sourceCode,
  budget: { maxCost: 2.0, maxDepth: 2 },
});
```

### With Hooks

```typescript
const result = await rlm.execute({
  task: 'Research this topic',
  context: notes,
  hooks: {
    onIteration: (iter) => {
      console.log(`Iteration ${iter.index + 1}`);
    },
    onSubcall: ({ depth, task }) => {
      console.log(`  Subcall at depth ${depth}: ${task.slice(0, 50)}...`);
    },
    onBudgetWarning: (warning) => {
      console.warn(`⚠️ ${warning}`);
    },
  },
});
```

### Integration with Agentic-SDLC

```typescript
// In your agent orchestrator
import { RLM } from '@rlm/core';

class ResearchAgent {
  private rlm: RLM;

  constructor() {
    this.rlm = new RLM({
      provider: 'ollama',
      model: 'llama3.2:70b',
      subcallModel: 'llama3.2:8b',
    });
  }

  async analyze(documents: string[], question: string): Promise<string> {
    const context = documents.join('\n\n---\n\n');
    
    const result = await this.rlm.execute({
      task: question,
      context,
      budget: { maxCost: 0, maxDepth: 3, maxIterations: 20 }, // maxCost=0 for local
    });

    if (!result.success) {
      throw result.error;
    }

    return result.output;
  }
}
```

---

## Testing Strategy

```typescript
// src/__tests__/rlm.test.ts

import { describe, it, expect, vi } from 'vitest';
import { RLM } from '../rlm';
import { LLMRouter } from '../llm/router';

// Mock adapter for deterministic testing
const mockAdapter = {
  complete: vi.fn().mockResolvedValue({
    content: '```repl\nprint("hello")\n```\n\nFINAL(test answer)',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
  }),
};

describe('RLM', () => {
  it('executes a simple task', async () => {
    const rlm = new RLM({ provider: 'mock', model: 'test' });
    // Inject mock adapter
    (rlm as any).router.register('mock', mockAdapter);

    const result = await rlm.execute({
      task: 'Test task',
      context: 'Test context',
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('test answer');
  });

  it('respects budget limits', async () => {
    // Test that exceeding maxIterations stops execution
  });

  it('handles recursive subcalls', async () => {
    // Test rlm_query bridge
  });

  it('captures execution trace', async () => {
    // Test trace structure
  });
});
```

---

## Handoff Checklist

Each task produces:

- [ ] Source files in correct location
- [ ] Exports from `src/index.ts`
- [ ] Unit tests with >80% coverage
- [ ] JSDoc comments on public APIs
- [ ] No TypeScript errors with strict mode

---

*Specification Version: 3.0.0 (Focused)*
*Total Quanta: 28Q*
*Parallel Waves: 2*
