/**
 * @fileoverview OpenAI adapter for GPT models.
 *
 * Uses the official openai SDK to communicate with the OpenAI API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/openai
 */

import OpenAI from 'openai';
import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types.js';

/**
 * Configuration for the OpenAI adapter.
 */
export interface OpenAIConfig {
  /** OpenAI API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for OpenAI models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for OpenAI GPT models (per 1K tokens).
 *
 * Update this object when pricing changes or new models are released.
 */
export const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

/** Default pricing for unknown models (uses GPT-4o pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.005, output: 0.015 };

/**
 * Adapter for OpenAI GPT models.
 *
 * @example
 * ```typescript
 * const adapter = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY });
 * const response = await adapter.complete({
 *   model: 'gpt-4o',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;

  /**
   * Create a new OpenAI adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  /**
   * Complete a chat request using the OpenAI API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });

    // Extract content from response
    const content = response.choices[0]?.message?.content ?? '';

    // Get token counts (may be undefined)
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    // Calculate cost based on model pricing
    const pricing = OPENAI_PRICING[request.model] ?? DEFAULT_PRICING;
    const cost =
      (promptTokens * pricing.input + completionTokens * pricing.output) / 1000;

    return {
      content,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cost,
    };
  }
}
