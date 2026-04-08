/**
 * @fileoverview OpenAI adapter for GPT models.
 *
 * Uses the official openai SDK to communicate with the OpenAI API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/openai
 */

import OpenAI from 'openai';
import type { LLMAdapter, LLMRequest, LLMResponse, OpenAIInferenceOptions } from '../../types.js';
import { type ModelPricing, calculateCost } from '../shared.js';

// Re-export ModelPricing for backwards compatibility
export type { ModelPricing };

/**
 * Configuration for the OpenAI adapter.
 */
export interface OpenAIConfig {
  /** OpenAI API key (required) */
  apiKey: string;
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
    const inference = (request.inference ?? {}) as OpenAIInferenceOptions;

    // Build API request params
    const params: Record<string, unknown> = {
      model: request.model,
      max_tokens: inference.max_tokens ?? request.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    };

    // Add inference options if defined
    if (inference.temperature !== undefined) params.temperature = inference.temperature;
    if (inference.top_p !== undefined) params.top_p = inference.top_p;
    if (inference.frequency_penalty !== undefined) params.frequency_penalty = inference.frequency_penalty;
    if (inference.presence_penalty !== undefined) params.presence_penalty = inference.presence_penalty;
    if (inference.seed !== undefined) params.seed = inference.seed;
    if (inference.stop !== undefined) params.stop = inference.stop;

    const response = await this.client.chat.completions.create(
      params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming
    );

    // Extract content from response
    const content = response.choices[0]?.message?.content ?? '';

    // Get token counts (may be undefined)
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    // Calculate cost based on model pricing
    const pricing = OPENAI_PRICING[request.model] ?? DEFAULT_PRICING;
    const cost = calculateCost(pricing, promptTokens, completionTokens);

    return {
      content,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cost,
    };
  }
}
