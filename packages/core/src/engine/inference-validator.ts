/**
 * @fileoverview Validates inference options and warns about incompatible combinations.
 *
 * This module provides validation for LLM inference options to help users
 * avoid common pitfalls where certain option combinations have no effect
 * or produce unexpected results.
 *
 * @module @rlm/core/engine/inference-validator
 */

import type { InferenceOptions } from '../types.js';

/**
 * Validates inference options and returns warnings for incompatible combinations.
 *
 * Checks for common pitfalls:
 * - temperature=0 with top_p/top_k (sampling params ignored in greedy mode)
 * - seed with high temperature (reproducibility limited by high randomness)
 * - Cohere p/k mixed with standard top_p/top_k naming
 *
 * @param options - Inference options to validate (may be undefined)
 * @returns Array of warning messages (empty if no issues found)
 *
 * @example
 * ```typescript
 * const warnings = validateInferenceOptions({
 *   temperature: 0,
 *   top_p: 0.9,
 * });
 * // warnings = ["temperature=0 enables greedy decoding; top_p has no effect"]
 * ```
 */
export function validateInferenceOptions(
  options: InferenceOptions | undefined
): string[] {
  if (!options) {
    return [];
  }

  const warnings: string[] = [];
  const opts = options as Record<string, unknown>;

  // Check for temperature=0 with sampling params
  if (opts.temperature === 0) {
    const samplingParams: string[] = [];
    if (opts.top_p !== undefined) samplingParams.push('top_p');
    if (opts.top_k !== undefined) samplingParams.push('top_k');

    if (samplingParams.length > 0) {
      warnings.push(
        `temperature=0 enables greedy decoding; ${samplingParams.join(' and ')} will have no effect`
      );
    }
  }

  // Check for seed with high temperature
  if (opts.seed !== undefined && typeof opts.temperature === 'number' && opts.temperature > 1.0) {
    warnings.push(
      `seed is set but temperature=${opts.temperature} introduces significant randomness; reproducibility may be limited`
    );
  }

  // Check for Cohere p/k naming conflicts
  if (opts.p !== undefined && opts.top_p !== undefined) {
    warnings.push(
      `Both 'p' and 'top_p' are set; Cohere uses 'p' (not 'top_p'). Consider using only one.`
    );
  }

  if (opts.k !== undefined && opts.top_k !== undefined) {
    warnings.push(
      `Both 'k' and 'top_k' are set; Cohere uses 'k' (not 'top_k'). Consider using only one.`
    );
  }

  return warnings;
}
