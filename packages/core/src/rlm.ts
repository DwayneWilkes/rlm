/**
 * @fileoverview Main RLM class - the primary public interface for @rlm/core.
 *
 * The RLM class provides a simple interface for executing recursive language
 * model tasks with automatic provider management and budget control.
 *
 * @module @rlm/core/rlm
 */

import type { RLMConfig, ExecuteOptions, RLMResult } from './types.js';
import { MODEL_CONTEXT_LIMITS } from './types.js';
import { LLMRouter } from './llm/router.js';
import { OllamaAdapter } from './llm/adapters/ollama.js';
import { AnthropicAdapter } from './llm/adapters/anthropic.js';
import { OpenAIAdapter } from './llm/adapters/openai.js';
import { ClaudeCodeAdapter } from './llm/adapters/claude-code.js';

const DEFAULT_SYNTHESIS_PROMPT = `You are a research analyst producing a final scholarly summary.

Transform the extracted information below into a cohesive, well-structured analysis:
- Argumentative engagement: what the paper argues, not just what it contains
- Literature positioning: name the tradition, identify the contribution
- Methodological critique: choices, implications, unacknowledged limitations
- Downstream implications and connections
- Use ### sub-headers adapted to the paper's structure
- Proportional length (more content = longer summary)
- Direct quotes sparingly for sharpest claims
- Note conspicuous absences`;

/**
 * Main RLM (Recursive Language Model) class.
 *
 * Supports three execution modes:
 * - 'iterative': Full REPL loop with Python sandbox
 * - 'direct': Single LLM pass (no sandbox)
 * - 'auto': Selects based on context size vs model context limit
 */
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
   *
   * Routes to direct or iterative executor based on mode.
   * Optionally runs a synthesis pass on the output.
   */
  async execute(options: ExecuteOptions): Promise<RLMResult> {
    const mode = this.resolveMode(options);

    let result: RLMResult;

    if (mode === 'direct') {
      const { DirectExecutor } = await import('./engine/direct-executor.js');
      result = await new DirectExecutor(this.config, this.router).execute(options);
    } else {
      try {
        const { Executor } = await import('./engine/executor.js');
        result = await new Executor(this.config, this.router).execute(options);
      } catch (error) {
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
              cost: 0, tokens: 0, inputTokens: 0, outputTokens: 0,
              duration: 0, iterations: 0, subcalls: 0, maxDepthReached: 0,
            },
            warnings: [],
            error: new Error('Executor module not yet implemented'),
          };
        }
        throw error;
      }
    }

    // Synthesis pass (Phase 6)
    if (options.synthesize && result.success && result.output) {
      const synthesisPrompt = options.synthesizePrompt ?? DEFAULT_SYNTHESIS_PROMPT;

      try {
        const synthesis = await this.router.complete(this.config.provider, {
          model: this.config.model,
          systemPrompt: synthesisPrompt,
          userPrompt: `## Extracted Information\n\n${result.output}`,
          maxTokens: 16384,
          inference: this.config.inference,
        });

        // Merge synthesis into result
        result.output = synthesis.content;
        result.usage.cost += synthesis.cost;
        result.usage.tokens += synthesis.inputTokens + synthesis.outputTokens;
        result.usage.inputTokens += synthesis.inputTokens;
        result.usage.outputTokens += synthesis.outputTokens;
        result.trace.finalAnswer = synthesis.content;
      } catch (error) {
        result.warnings.push(
          `Synthesis pass failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  /**
   * Resolve the execution mode from options and context size.
   */
  resolveMode(options: ExecuteOptions): 'iterative' | 'direct' {
    if (options.mode === 'iterative') return 'iterative';
    if (options.mode === 'direct') return 'direct';

    // Auto: estimate tokens, use direct if < 70% of model context limit
    const estimate = Math.ceil(options.context.length / 4);
    const limit = MODEL_CONTEXT_LIMITS[this.config.model] ?? 200_000;
    return estimate < limit * 0.7 ? 'direct' : 'iterative';
  }

  private setupProviders(): void {
    this.router.register(
      'ollama',
      new OllamaAdapter({
        baseUrl: this.config.providerOptions?.baseUrl ?? 'http://localhost:11434',
      })
    );

    if (this.config.providerOptions?.apiKey) {
      if (this.config.provider === 'anthropic') {
        this.router.register(
          'anthropic',
          new AnthropicAdapter({ apiKey: this.config.providerOptions.apiKey })
        );
      } else if (this.config.provider === 'openai') {
        this.router.register(
          'openai',
          new OpenAIAdapter({ apiKey: this.config.providerOptions.apiKey })
        );
      }
    }

    if (this.config.provider === 'claude-code') {
      this.router.register(
        'claude-code',
        new ClaudeCodeAdapter(this.config.providerOptions?.claudeCode)
      );
    }
  }
}
