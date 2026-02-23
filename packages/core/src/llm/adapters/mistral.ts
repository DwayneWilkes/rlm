/**
 * @fileoverview Mistral AI adapter for LLM inference.
 *
 * Uses the official @mistralai/mistralai SDK to communicate with Mistral API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/mistral
 */

import { Mistral } from '@mistralai/mistralai';
import type { LLMAdapter, LLMRequest, LLMResponse, MistralInferenceOptions } from '../../types.js';

/**
 * Configuration for the Mistral adapter.
 */
export interface MistralConfig {
  /** Mistral API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for Mistral models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for Mistral models (per 1K tokens).
 * Based on Mistral AI pricing as of 2024.
 */
export const MISTRAL_PRICING: Record<string, ModelPricing> = {
  'mistral-large-latest': { input: 0.002, output: 0.006 },
  'mistral-small-latest': { input: 0.0002, output: 0.0006 },
  'mistral-nemo': { input: 0.00015, output: 0.00015 },
  'codestral-latest': { input: 0.0002, output: 0.0006 },
  'open-mistral-7b': { input: 0.00025, output: 0.00025 },
  'open-mixtral-8x7b': { input: 0.0007, output: 0.0007 },
  'open-mixtral-8x22b': { input: 0.002, output: 0.006 },
};

/** Default pricing for unknown models (uses mistral-large pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.002, output: 0.006 };

/**
 * Adapter for Mistral AI models.
 *
 * @example
 * ```typescript
 * const adapter = new MistralAdapter({ apiKey: process.env.MISTRAL_API_KEY });
 * const response = await adapter.complete({
 *   model: 'mistral-large-latest',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class MistralAdapter implements LLMAdapter {
  private client: Mistral;

  /**
   * Create a new Mistral adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: MistralConfig) {
    this.client = new Mistral({ apiKey: config.apiKey });
  }

  /**
   * Complete a chat request using the Mistral API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const inference = (request.inference ?? {}) as MistralInferenceOptions;

    // Build API request params
    const params: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    };

    // Max tokens
    const maxTokens = inference.max_tokens ?? request.maxTokens;
    if (maxTokens !== undefined) params.maxTokens = maxTokens;

    // Common inference options
    if (inference.temperature !== undefined) params.temperature = inference.temperature;
    if (inference.top_p !== undefined) params.topP = inference.top_p;
    if (inference.stop !== undefined) params.stop = inference.stop;

    // Mistral-specific options
    if (inference.safe_prompt !== undefined) params.safePrompt = inference.safe_prompt;
    if (inference.random_seed !== undefined) params.randomSeed = inference.random_seed;

    try {
      const response = await this.client.chat.complete(params as Parameters<typeof this.client.chat.complete>[0]);

      // Extract content from response
      const content = response.choices?.[0]?.message?.content ?? '';

      // Get token counts
      const inputTokens = response.usage?.promptTokens ?? 0;
      const outputTokens = response.usage?.completionTokens ?? 0;

      // Calculate cost
      const pricing = MISTRAL_PRICING[request.model] ?? DEFAULT_PRICING;
      const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

      return {
        content: typeof content === 'string' ? content : '',
        inputTokens,
        outputTokens,
        cost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(`Mistral API error (${request.model}): ${message}`);
      wrappedError.name = 'MistralAPIError';
      if (error instanceof Error) {
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }
}
