/**
 * @fileoverview Shared types and utilities for LLM adapters.
 *
 * Consolidates the ModelPricing interface, cost calculation formula,
 * and error wrapping pattern that were previously duplicated across
 * all 6 cloud adapters.
 *
 * @module @rlm/core/llm/shared
 */

/**
 * Pricing structure for LLM models.
 * Prices are per 1K tokens in dollars.
 */
export interface ModelPricing {
  /** Cost per 1K input tokens */
  input: number;
  /** Cost per 1K output tokens */
  output: number;
}

/**
 * Calculate the cost of an LLM request based on token usage and pricing.
 *
 * @param pricing - The model pricing (per 1K tokens)
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens generated
 * @returns Cost in dollars
 */
export function calculateCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number
): number {
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
}

/**
 * Error thrown when an LLM provider API call fails.
 *
 * Includes the provider name and model for easier debugging.
 * Wraps the original error as `cause` for stack trace preservation.
 */
export class LLMAPIError extends Error {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    originalError: unknown
  ) {
    const message = originalError instanceof Error
      ? originalError.message
      : String(originalError);
    super(`${provider} API error (${model}): ${message}`);
    this.name = `${provider}APIError`;
    if (originalError instanceof Error) {
      this.cause = originalError;
    }
  }
}
