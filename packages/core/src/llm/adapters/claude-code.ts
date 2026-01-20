/**
 * @fileoverview Claude Code adapter using the Claude Agent SDK.
 *
 * Uses the @anthropic-ai/claude-agent-sdk to invoke Claude Code as the LLM
 * provider for RLM's recursive queries. This allows using your Claude Code
 * subscription instead of direct API calls.
 *
 * @module @rlm/core/llm/adapters/claude-code
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  ClaudeCodeConfig,
  LLMAdapter,
  LLMRequest,
  LLMResponse,
} from '../../types.js';

// Re-export config type for convenience
export type { ClaudeCodeConfig } from '../../types.js';

/**
 * Adapter for Claude Code using the Claude Agent SDK.
 *
 * This adapter invokes Claude Code programmatically, allowing you to use
 * your Claude Code subscription for RLM's recursive queries instead of
 * direct Anthropic API calls.
 *
 * @example
 * ```typescript
 * const adapter = new ClaudeCodeAdapter({ maxTurns: 1 });
 * const response = await adapter.complete({
 *   model: 'claude-code',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.content); // The response text
 * console.log(response.cost);    // 0 (subscription-based)
 * ```
 */
export class ClaudeCodeAdapter implements LLMAdapter {
  private config: ClaudeCodeConfig;

  /**
   * Create a new Claude Code adapter.
   *
   * @param config - Configuration options for the adapter
   */
  constructor(config: ClaudeCodeConfig = {}) {
    this.config = config;
  }

  /**
   * Complete a chat request using Claude Code.
   *
   * Combines the system and user prompts and sends them to Claude Code
   * via the Agent SDK. Token usage is accumulated from usage messages.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and cost (always 0)
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Build prompt combining system + user
    const fullPrompt = request.systemPrompt
      ? `${request.systemPrompt}\n\n${request.userPrompt}`
      : request.userPrompt;

    let result = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const message of query({
      prompt: fullPrompt,
      options: {
        maxTurns: this.config.maxTurns ?? 1,
        allowedTools: this.config.allowedTools ?? [],
      },
    })) {
      if ('result' in message) {
        result = message.result as string;
      }
      if ('usage' in message) {
        const usage = message.usage as {
          inputTokens?: number;
          outputTokens?: number;
        };
        inputTokens += usage.inputTokens ?? 0;
        outputTokens += usage.outputTokens ?? 0;
      }
    }

    return {
      content: result,
      inputTokens,
      outputTokens,
      cost: 0, // Subscription-based, no per-call cost
    };
  }
}
