/**
 * @fileoverview Direct execution engine for RLM tasks.
 *
 * Bypasses the iterative REPL loop for tasks where the full context
 * fits within the model's context window. Sends a single LLM call
 * with the complete context and task.
 *
 * @module @rlm/core/engine/direct-executor
 */

import type {
  RLMConfig,
  ExecuteOptions,
  RLMResult,
  ExecutionTrace,
} from '../types.js';
import { LLMRouter } from '../llm/router.js';

/**
 * Executes RLM tasks with a single LLM pass (no sandbox, no Python).
 *
 * Use this when the full context fits in the model's context window
 * and the task doesn't require iterative code execution.
 */
export class DirectExecutor {
  constructor(
    private config: RLMConfig,
    private router: LLMRouter
  ) {}

  async execute(options: ExecuteOptions): Promise<RLMResult> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    const systemPrompt =
      options.systemPrompt ??
      'You are a research analyst. Read the provided context carefully and respond to the task with detailed, well-structured analysis.';

    const userPrompt = `${options.task}\n\n---\n\n${options.context}`;

    try {
      const response = await this.router.complete(this.config.provider, {
        model: this.config.model,
        systemPrompt,
        userPrompt,
        maxTokens: 16384,
        inference: this.config.inference,
      });

      const duration = Date.now() - startTime;

      const trace: ExecutionTrace = {
        id: executionId,
        depth: 0,
        task: options.task,
        iterations: [
          {
            index: 0,
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
          },
        ],
        subcalls: [],
        finalAnswer: response.content,
        answerSource: 'final_direct',
      };

      return {
        success: true,
        output: response.content,
        trace,
        usage: {
          cost: response.cost,
          tokens: response.inputTokens + response.outputTokens,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          duration,
          iterations: 1,
          subcalls: 0,
          maxDepthReached: 0,
        },
        warnings: [],
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        trace: {
          id: executionId,
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
          duration: Date.now() - startTime,
          iterations: 0,
          subcalls: 0,
          maxDepthReached: 0,
        },
        warnings: [],
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}
