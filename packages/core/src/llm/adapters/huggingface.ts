/**
 * @fileoverview HuggingFace Inference adapter for LLM inference.
 *
 * Uses the official @huggingface/inference SDK for serverless inference.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/huggingface
 */

import { HfInference } from '@huggingface/inference';
import type { LLMAdapter, LLMRequest, LLMResponse, HuggingFaceInferenceOptions } from '../../types.js';

/**
 * Configuration for the HuggingFace adapter.
 */
export interface HuggingFaceConfig {
  /** HuggingFace API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for HuggingFace models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for HuggingFace serverless inference models (per 1K tokens).
 * Based on HuggingFace pricing as of 2024.
 * Note: Pricing varies by model and can change.
 */
export const HUGGINGFACE_PRICING: Record<string, ModelPricing> = {
  'meta-llama/Llama-3.1-70B-Instruct': { input: 0.0009, output: 0.0009 },
  'meta-llama/Llama-3.1-8B-Instruct': { input: 0.0001, output: 0.0001 },
  'mistralai/Mixtral-8x7B-Instruct-v0.1': { input: 0.0006, output: 0.0006 },
  'mistralai/Mistral-7B-Instruct-v0.2': { input: 0.0002, output: 0.0002 },
  'Qwen/Qwen2.5-72B-Instruct': { input: 0.0009, output: 0.0009 },
};

/** Default pricing for unknown models */
const DEFAULT_PRICING: ModelPricing = { input: 0.0005, output: 0.0005 };

/**
 * Adapter for HuggingFace Inference API.
 *
 * @example
 * ```typescript
 * const adapter = new HuggingFaceAdapter({ apiKey: process.env.HF_TOKEN });
 * const response = await adapter.complete({
 *   model: 'meta-llama/Llama-3.1-70B-Instruct',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class HuggingFaceAdapter implements LLMAdapter {
  private client: HfInference;

  /**
   * Create a new HuggingFace adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: HuggingFaceConfig) {
    this.client = new HfInference(config.apiKey);
  }

  /**
   * Complete a chat request using the HuggingFace Inference API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const inference = (request.inference ?? {}) as HuggingFaceInferenceOptions;

    // Build API request params
    const params: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    };

    // Max tokens
    const maxTokens = inference.max_new_tokens ?? request.maxTokens;
    if (maxTokens !== undefined) params.max_tokens = maxTokens;

    // Common inference options
    if (inference.temperature !== undefined) params.temperature = inference.temperature;
    if (inference.top_p !== undefined) params.top_p = inference.top_p;
    if (inference.top_k !== undefined) params.top_k = inference.top_k;
    if (inference.stop !== undefined) params.stop = inference.stop;

    // HuggingFace-specific options
    if (inference.repetition_penalty !== undefined) params.repetition_penalty = inference.repetition_penalty;
    if (inference.seed !== undefined) params.seed = inference.seed;
    if (inference.do_sample !== undefined) params.do_sample = inference.do_sample;

    try {
      const response = await this.client.chatCompletion(params as Parameters<typeof this.client.chatCompletion>[0]);

      // Extract content from response
      const content = response.choices?.[0]?.message?.content ?? '';

      // Get token counts
      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;

      // Calculate cost
      const pricing = HUGGINGFACE_PRICING[request.model] ?? DEFAULT_PRICING;
      const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

      return {
        content,
        inputTokens,
        outputTokens,
        cost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(`HuggingFace API error (${request.model}): ${message}`);
      wrappedError.name = 'HuggingFaceAPIError';
      if (error instanceof Error) {
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }
}
