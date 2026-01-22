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
 * Source: https://platform.claude.com/docs/en/about-claude/models/overview
 */
export const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  // Claude 4.5 (latest)
  'claude-opus-4-5-20251101': { input: 0.005, output: 0.025 },
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.001, output: 0.005 },
  // Claude 4.x (legacy)
  'claude-opus-4-1-20250805': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  // Claude 3.x (legacy)
  'claude-3-7-sonnet-20250219': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
};

/** Default pricing for unknown models (uses Sonnet 4.5 pricing) */
const DEFAULT_PRICING: ModelPricing = { input: 0.003, output: 0.015 };

/**
 * Model capabilities for output token limits.
 * Used to prevent exceeding model-specific limits.
 */
export const MODEL_CAPABILITIES: Record<string, { maxOutput: number }> = {
  // Claude 4.5
  'claude-opus-4-5-20251101': { maxOutput: 64000 },
  'claude-sonnet-4-5-20250929': { maxOutput: 64000 },
  'claude-haiku-4-5-20251001': { maxOutput: 64000 },
  // Claude 4.x
  'claude-opus-4-1-20250805': { maxOutput: 32000 },
  'claude-sonnet-4-20250514': { maxOutput: 64000 },
  'claude-opus-4-20250514': { maxOutput: 32000 },
  // Claude 3.x
  'claude-3-7-sonnet-20250219': { maxOutput: 64000 },
  'claude-3-haiku-20240307': { maxOutput: 4096 },
};

/** Default max output tokens for unknown models */
const DEFAULT_MAX_OUTPUT = 8192;

/**
 * Get effective max_tokens value, respecting model limits.
 *
 * @param model - Model identifier
 * @param requested - Requested max_tokens (optional)
 * @returns Effective max_tokens clamped to model limit
 */
export function getEffectiveMaxTokens(model: string, requested?: number): number {
  const modelMax = MODEL_CAPABILITIES[model]?.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const desired = requested ?? DEFAULT_MAX_OUTPUT;
  return Math.min(desired, modelMax);
}

/**
 * Error thrown when the Anthropic API call fails.
 * Includes model context for easier debugging.
 */
export class AnthropicAPIError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly cause: Error
  ) {
    super(`Anthropic API error (model=${model}): ${message}`);
    this.name = 'AnthropicAPIError';
  }
}

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
   * @throws {AnthropicAPIError} When the API call fails
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const maxTokens = getEffectiveMaxTokens(request.model, request.maxTokens);

    let response;
    try {
      response = await this.client.messages.create({
        model: request.model,
        max_tokens: maxTokens,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      });
    } catch (error) {
      throw new AnthropicAPIError(
        error instanceof Error ? error.message : String(error),
        request.model,
        error instanceof Error ? error : new Error(String(error))
      );
    }

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
