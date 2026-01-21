/**
 * Output formatter interface and types for RLM CLI.
 *
 * @module output/formatter
 */

import type { RLMResult } from '@rlm/core';

/**
 * Supported output formats.
 */
export type OutputFormat = 'text' | 'json' | 'yaml';

/**
 * Formatter interface for converting RLM results to output strings.
 *
 * Implementations provide format-specific output for results, errors,
 * and progress messages.
 */
export interface Formatter {
  /**
   * Format an RLM execution result.
   *
   * @param result - The execution result to format
   * @returns Formatted string representation
   */
  format(result: RLMResult): string;

  /**
   * Format an error for output.
   *
   * @param error - The error to format
   * @returns Formatted error string
   */
  formatError(error: Error): string;

  /**
   * Format a progress message (optional).
   *
   * @param message - Progress message text
   * @returns Formatted progress string
   */
  formatProgress?(message: string): string;
}
