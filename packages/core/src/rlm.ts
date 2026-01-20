/**
 * @fileoverview Main RLM class - the primary public interface for @rlm/core.
 *
 * The RLM class provides a simple interface for executing recursive language
 * model tasks with automatic provider management and budget control.
 *
 * @module @rlm/core/rlm
 *
 * @example
 * ```typescript
 * import { RLM } from '@rlm/core';
 *
 * // Basic usage with Ollama (local)
 * const rlm = new RLM({
 *   provider: 'ollama',
 *   model: 'llama3.2',
 * });
 *
 * const result = await rlm.execute({
 *   task: 'Summarize the main points',
 *   context: documentText,
 * });
 *
 * console.log(result.output);
 * ```
 */

import type { RLMConfig, ExecuteOptions, RLMResult } from './types.js';
import { LLMRouter } from './llm/router.js';
import { OllamaAdapter } from './llm/adapters/ollama.js';
import { AnthropicAdapter } from './llm/adapters/anthropic.js';
import { OpenAIAdapter } from './llm/adapters/openai.js';
import { ClaudeCodeAdapter } from './llm/adapters/claude-code.js';
// Note: Executor will be created by parallel agent
// import { Executor } from './engine/executor.js';

/**
 * Main RLM (Recursive Language Model) class.
 *
 * This is the primary interface for executing RLM tasks. It handles:
 * - Provider management (automatic adapter registration)
 * - Execution orchestration (delegated to Executor)
 * - Configuration merging
 *
 * @example
 * ```typescript
 * // With Anthropic (cloud)
 * const rlm = new RLM({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-20250514',
 *   providerOptions: {
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *   },
 *   subcallModel: 'claude-haiku-3-20240307', // Cheaper for subcalls
 * });
 *
 * const result = await rlm.execute({
 *   task: 'Analyze this codebase and identify potential bugs',
 *   context: sourceCode,
 *   budget: { maxCost: 2.0, maxDepth: 2 },
 *   hooks: {
 *     onIteration: (iter) => console.log(`Iteration ${iter.index}`),
 *     onBudgetWarning: (warning) => console.warn(warning),
 *   },
 * });
 * ```
 */
export class RLM {
  private config: RLMConfig;
  private router: LLMRouter;

  /**
   * Create a new RLM instance.
   *
   * Provider adapters are automatically registered based on the configuration:
   * - Ollama is always registered (for local inference fallback)
   * - Anthropic is registered if provider='anthropic' and apiKey is provided
   * - OpenAI is registered if provider='openai' and apiKey is provided
   *
   * @param config - Configuration for the RLM instance
   */
  constructor(config: RLMConfig) {
    this.config = config;
    this.router = new LLMRouter(config.provider);
    this.setupProviders();
  }

  /**
   * Execute an RLM task.
   *
   * This method runs the full RLM execution loop:
   * 1. Initialize Python REPL sandbox with context
   * 2. Run iterations: prompt LLM -> parse response -> execute code
   * 3. Continue until FINAL marker or budget exhausted
   * 4. Return result with output, trace, and usage statistics
   *
   * @param options - Execution options including task, context, and budget
   * @returns Promise resolving to RLMResult with output, trace, and usage
   *
   * @example
   * ```typescript
   * const result = await rlm.execute({
   *   task: 'Find the most important functions',
   *   context: codeContent,
   *   budget: { maxIterations: 10 },
   * });
   *
   * if (result.success) {
   *   console.log(result.output);
   * } else {
   *   console.error(result.error);
   * }
   * ```
   */
  async execute(options: ExecuteOptions): Promise<RLMResult> {
    // Dynamic import to handle case where Executor doesn't exist yet
    // This allows the package to compile even if engine module is not yet implemented
    try {
      const { Executor } = await import('./engine/executor.js');
      const executor = new Executor(this.config, this.router);
      return executor.execute(options);
    } catch (error) {
      // If Executor module doesn't exist yet, return a stub result
      // This allows tests to verify the class structure
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        return {
          success: false,
          output: '',
          trace: {
            id: crypto.randomUUID(),
            depth: 0,
            task: options.task,
            iterations: [],
            subcalls: [],
            finalAnswer: '',
            answerSource: 'error',
          },
          usage: {
            cost: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            duration: 0,
            iterations: 0,
            subcalls: 0,
            maxDepthReached: 0,
          },
          warnings: [],
          error: new Error('Executor module not yet implemented'),
        };
      }
      throw error;
    }
  }

  /**
   * Set up provider adapters based on configuration.
   *
   * This method is called during construction to register the appropriate
   * LLM adapters with the router.
   */
  private setupProviders(): void {
    // Always register Ollama (default, local - no API key needed)
    this.router.register(
      'ollama',
      new OllamaAdapter({
        baseUrl: this.config.providerOptions?.baseUrl ?? 'http://localhost:11434',
      })
    );

    // Register cloud providers if API key is provided
    if (this.config.providerOptions?.apiKey) {
      if (this.config.provider === 'anthropic') {
        this.router.register(
          'anthropic',
          new AnthropicAdapter({
            apiKey: this.config.providerOptions.apiKey,
          })
        );
      } else if (this.config.provider === 'openai') {
        this.router.register(
          'openai',
          new OpenAIAdapter({
            apiKey: this.config.providerOptions.apiKey,
          })
        );
      }
    }

    // Register Claude Code adapter (uses subscription auth, no API key needed)
    if (this.config.provider === 'claude-code') {
      this.router.register(
        'claude-code',
        new ClaudeCodeAdapter(this.config.providerOptions?.claudeCode)
      );
    }
  }
}
