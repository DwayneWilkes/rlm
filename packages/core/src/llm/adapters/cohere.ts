/**
 * @fileoverview Cohere adapter for LLM inference.
 *
 * Uses the official cohere-ai SDK to communicate with Cohere API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/cohere
 */

import { CohereClient } from 'cohere-ai';
import type { LLMAdapter, LLMRequest, LLMResponse, CohereInferenceOptions } from '../../types.js';

/**
 * Configuration for the Cohere adapter.
 */
export interface CohereConfig {
  /** Cohere API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for Cohere models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for Cohere models (per 1K tokens).
 * Based on Cohere pricing as of 2024.
 */
export const COHERE_PRICING: Record<string, ModelPricing> = {
  'command-r-plus': { input: 0.0025, output: 0.01 },
  'command-r': { input: 0.00015, output: 0.0006 },
  'command': { input: 0.001, output: 0.002 },
  'command-light': { input: 0.0003, output: 0.0006 },
  'command-nightly': { input: 0.001, output: 0.002 },
};

/** Default pricing for unknown models (uses command-r-plus pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.0025, output: 0.01 };

/**
 * Adapter for Cohere models.
 *
 * @example
 * ```typescript
 * const adapter = new CohereAdapter({ apiKey: process.env.COHERE_API_KEY });
 * const response = await adapter.complete({
 *   model: 'command-r-plus',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class CohereAdapter implements LLMAdapter {
  private client: CohereClient;

  /**
   * Create a new Cohere adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: CohereConfig) {
    this.client = new CohereClient({ token: config.apiKey });
  }

  /**
   * Complete a chat request using the Cohere API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const inference = (request.inference ?? {}) as CohereInferenceOptions;

    // Build API request params
    const params: Record<string, unknown> = {
      model: request.model,
      message: request.userPrompt,
      preamble: request.systemPrompt,
    };

    // Max tokens
    const maxTokens = inference.max_tokens ?? request.maxTokens;
    if (maxTokens !== undefined) params.maxTokens = maxTokens;

    // Cohere uses p and k instead of top_p and top_k
    if (inference.temperature !== undefined) params.temperature = inference.temperature;
    if (inference.p !== undefined) params.p = inference.p;
    if (inference.k !== undefined) params.k = inference.k;
    if (inference.stop_sequences !== undefined) params.stopSequences = inference.stop_sequences;

    // Cohere-specific options
    if (inference.seed !== undefined) params.seed = inference.seed;
    if (inference.frequency_penalty !== undefined) params.frequencyPenalty = inference.frequency_penalty;
    if (inference.presence_penalty !== undefined) params.presencePenalty = inference.presence_penalty;

    try {
      const response = await this.client.chat(params as unknown as Parameters<typeof this.client.chat>[0]);

      // Extract content from response
      const content = response.text ?? '';

      // Get token counts
      const inputTokens = response.meta?.tokens?.inputTokens ?? 0;
      const outputTokens = response.meta?.tokens?.outputTokens ?? 0;

      // Calculate cost
      const pricing = COHERE_PRICING[request.model] ?? DEFAULT_PRICING;
      const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

      return {
        content,
        inputTokens,
        outputTokens,
        cost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(`Cohere API error (${request.model}): ${message}`);
      wrappedError.name = 'CohereAPIError';
      if (error instanceof Error) {
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }
}
