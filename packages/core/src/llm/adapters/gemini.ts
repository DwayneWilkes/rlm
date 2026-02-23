/**
 * @fileoverview Google Gemini adapter for LLM inference.
 *
 * Uses the official @google/generative-ai SDK to communicate with Gemini API.
 * Supports cost calculation based on model-specific pricing.
 *
 * @module @rlm/core/llm/adapters/gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LLMAdapter, LLMRequest, LLMResponse, GeminiInferenceOptions } from '../../types.js';

/**
 * Configuration for the Gemini adapter.
 */
export interface GeminiConfig {
  /** Google AI API key (required) */
  apiKey: string;
}

/**
 * Pricing structure for Gemini models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Pricing for Gemini models (per 1K tokens).
 * Based on Google AI pricing as of 2024.
 */
export const GEMINI_PRICING: Record<string, ModelPricing> = {
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-flash-8b': { input: 0.0000375, output: 0.00015 },
  'gemini-2.0-flash-exp': { input: 0.0001, output: 0.0004 },
  'gemini-exp-1206': { input: 0.00125, output: 0.005 },
};

/** Default pricing for unknown models (uses Gemini 1.5 Pro pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.00125, output: 0.005 };

/**
 * Adapter for Google Gemini models.
 *
 * @example
 * ```typescript
 * const adapter = new GeminiAdapter({ apiKey: process.env.GOOGLE_API_KEY });
 * const response = await adapter.complete({
 *   model: 'gemini-1.5-pro',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'What is the capital of France?',
 * });
 * console.log(response.cost); // Calculated based on token usage
 * ```
 */
export class GeminiAdapter implements LLMAdapter {
  private client: GoogleGenerativeAI;

  /**
   * Create a new Gemini adapter.
   *
   * @param config - Configuration with required API key
   */
  constructor(config: GeminiConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * Complete a chat request using the Gemini API.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and calculated cost
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const inference = (request.inference ?? {}) as GeminiInferenceOptions;

    // Build generation config
    const generationConfig: Record<string, unknown> = {};

    // Max tokens
    const maxTokens = inference.maxOutputTokens ?? request.maxTokens;
    if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;

    // Common inference options (map to Gemini naming)
    if (inference.temperature !== undefined) generationConfig.temperature = inference.temperature;
    if (inference.top_p !== undefined) generationConfig.topP = inference.top_p;
    if (inference.top_k !== undefined) generationConfig.topK = inference.top_k;
    if (inference.stop !== undefined) generationConfig.stopSequences = inference.stop;

    // Gemini-specific options
    if (inference.responseMimeType !== undefined) generationConfig.responseMimeType = inference.responseMimeType;
    if (inference.responseSchema !== undefined) generationConfig.responseSchema = inference.responseSchema;

    try {
      // Get the model with configuration
      const model = this.client.getGenerativeModel({
        model: request.model,
        systemInstruction: request.systemPrompt,
        generationConfig,
      });

      // Generate content
      const result = await model.generateContent(request.userPrompt);
      const response = result.response;

      // Extract content
      const content = response.text();

      // Get token counts
      const usage = response.usageMetadata;
      const inputTokens = usage?.promptTokenCount ?? 0;
      const outputTokens = usage?.candidatesTokenCount ?? 0;

      // Calculate cost
      const pricing = GEMINI_PRICING[request.model] ?? DEFAULT_PRICING;
      const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

      return {
        content,
        inputTokens,
        outputTokens,
        cost,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrappedError = new Error(`Gemini API error (${request.model}): ${message}`);
      wrappedError.name = 'GeminiAPIError';
      if (error instanceof Error) {
        wrappedError.cause = error;
      }
      throw wrappedError;
    }
  }
}
