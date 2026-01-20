/**
 * @fileoverview Public API for @rlm/core package.
 *
 * This module exports the main RLM class along with all public types,
 * default configurations, and utilities needed to build recursive
 * language model applications.
 *
 * @module @rlm/core
 *
 * @example
 * ```typescript
 * import { RLM, DEFAULT_BUDGET } from '@rlm/core';
 *
 * const rlm = new RLM({
 *   provider: 'ollama',
 *   model: 'llama3.2',
 *   defaultBudget: { ...DEFAULT_BUDGET, maxDepth: 3 },
 * });
 *
 * const result = await rlm.execute({
 *   task: 'Analyze this codebase',
 *   context: sourceCode,
 * });
 * ```
 */

// ============================================
// MAIN CLASS
// ============================================

/**
 * Main RLM class - the primary interface for recursive language model tasks.
 *
 * @example
 * ```typescript
 * const rlm = new RLM({ provider: 'ollama', model: 'llama3.2' });
 * const result = await rlm.execute({ task: 'Summarize', context: text });
 * ```
 */
export { RLM } from './rlm.js';

// ============================================
// TYPES
// ============================================

/**
 * All public type exports for TypeScript consumers.
 */
export type {
  // Configuration types
  RLMConfig,
  Budget,
  REPLConfig,
  ClaudeCodeConfig,

  // Execution types
  ExecuteOptions,
  ExecutionHooks,

  // Result types
  RLMResult,
  ExecutionTrace,
  Iteration,
  CodeExecution,
  Usage,

  // LLM abstraction types
  LLMAdapter,
  LLMRequest,
  LLMResponse,
} from './types.js';

// ============================================
// DEFAULTS
// ============================================

/**
 * Default budget configuration.
 *
 * @example
 * ```typescript
 * import { DEFAULT_BUDGET } from '@rlm/core';
 * console.log(DEFAULT_BUDGET.maxCost); // 5.0
 * ```
 */
export { DEFAULT_BUDGET, DEFAULT_REPL_CONFIG } from './types.js';

// ============================================
// UTILITIES
// ============================================

/**
 * Context loading utility.
 *
 * @example
 * ```typescript
 * import { loadContext } from '@rlm/core';
 * const ctx = loadContext(myText);
 * console.log(ctx.tokenEstimate);
 * ```
 */
export { loadContext } from './context/loader.js';

/**
 * Additional context utilities exported for advanced use cases.
 */
export { escapeForPython, estimateTokens, detectContentType } from './context/loader.js';
export type { LoadedContext } from './context/loader.js';

// ============================================
// ENGINE UTILITIES
// ============================================

/**
 * Response parsing utility for extracting code blocks and final answers.
 *
 * @example
 * ```typescript
 * import { parseResponse } from '@rlm/core';
 * const parsed = parseResponse(llmResponse);
 * console.log(parsed.codeBlocks); // ['print("hello")']
 * console.log(parsed.finalAnswer); // { type: 'direct', value: 'answer' }
 * ```
 */
export { parseResponse } from './engine/parser.js';
export type { ParsedResponse } from './engine/parser.js';

/**
 * Budget controller for manual budget management.
 *
 * @example
 * ```typescript
 * import { BudgetController, DEFAULT_BUDGET } from '@rlm/core';
 * const budget = new BudgetController({ ...DEFAULT_BUDGET, maxCost: 1.0 });
 * while (budget.canProceed('iteration')) {
 *   // ... do work
 *   budget.record({ iteration: true, cost: 0.01 });
 * }
 * ```
 */
export { BudgetController } from './budget/controller.js';
export type { BudgetWarningHandler } from './budget/controller.js';

// ============================================
// ADAPTERS
// ============================================

/**
 * LLM Router for provider management.
 *
 * @example
 * ```typescript
 * import { LLMRouter, OllamaAdapter } from '@rlm/core';
 * const router = new LLMRouter('ollama');
 * router.register('ollama', new OllamaAdapter());
 * ```
 */
export { LLMRouter } from './llm/router.js';

/**
 * Ollama adapter for local LLM inference.
 */
export { OllamaAdapter } from './llm/adapters/ollama.js';
export type { OllamaConfig } from './llm/adapters/ollama.js';

/**
 * Anthropic adapter for Claude models.
 */
export { AnthropicAdapter, ANTHROPIC_PRICING } from './llm/adapters/anthropic.js';
export type { AnthropicConfig, ModelPricing as AnthropicModelPricing } from './llm/adapters/anthropic.js';

/**
 * OpenAI adapter for GPT models.
 */
export { OpenAIAdapter, OPENAI_PRICING } from './llm/adapters/openai.js';
export type { OpenAIConfig, ModelPricing as OpenAIModelPricing } from './llm/adapters/openai.js';

/**
 * Claude Code adapter using the Claude Agent SDK.
 *
 * Uses your Claude Code subscription for RLM queries instead of direct API calls.
 *
 * @example
 * ```typescript
 * const rlm = new RLM({
 *   provider: 'claude-code',
 *   model: 'claude-code',
 *   providerOptions: {
 *     claudeCode: { maxTurns: 1, allowedTools: [] }
 *   }
 * });
 * ```
 */
export { ClaudeCodeAdapter } from './llm/adapters/claude-code.js';

// ============================================
// SANDBOX (for advanced use cases)
// ============================================

/**
 * Sandbox types and factory for direct REPL access.
 *
 * @example
 * ```typescript
 * import { createSandbox, DEFAULT_REPL_CONFIG } from '@rlm/core';
 * const sandbox = createSandbox(DEFAULT_REPL_CONFIG, {
 *   onLLMQuery: async (prompt) => 'response',
 *   onRLMQuery: async (task) => 'result',
 * });
 * await sandbox.initialize('my context');
 * const result = await sandbox.execute('print(len(context))');
 * ```
 */
export { createSandbox } from './repl/sandbox.js';
export type { Sandbox, SandboxBridges } from './repl/sandbox.js';
