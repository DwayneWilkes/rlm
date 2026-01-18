/**
 * @fileoverview Anthropic adapter for Claude models.
 *
 * Uses the official @anthropic-ai/sdk to communicate with the Anthropic API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types.js';

/**
 * Configuration for the Anthropic adapter.
 */
export interface AnthropicConfig {
  /** Anthropic API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for Anthropic models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for Anthropic Claude models (per 1K tokens).
 *
 * Update this object when pricing changes or new models are released.
 */
export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-haiku-3-20240307': { input: 0.00025, output: 0.00125 },
};

/** Default pricing for unknown models (uses Sonnet pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.003, output: 0.015 };

/**
 * Adapter for Anthropic Claude models.
 *
 * @example
 * ```typescript
 * const adapter = new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const response = await adapter.complete({
 *   model: 'claude-sonnet-4-20250514',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class AnthropicAdapter implements LLMAdapter {
  private client: Anthropic;

  /**
   * Create a new Anthropic adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  /**
   * Complete a chat request using the Anthropic API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 8192,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    // Extract text content from response
    const content =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Calculate cost based on model pricing
    const pricing = ANTHROPIC_PRICING[request.model] ?? DEFAULT_PRICING;
    const cost =
      (response.usage.input_tokens * pricing.input +
        response.usage.output_tokens * pricing.output) /
      1000;

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
    };
  }
}
