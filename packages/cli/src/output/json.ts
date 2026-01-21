/**
 * JSON formatter for machine-readable CLI output.
 *
 * @module output/json
 */

import type { RLMResult } from '@rlm/core';
import type { Formatter } from './formatter.js';

/**
 * Options for JsonFormatter.
 */
export interface JsonFormatterOptions {
  /** Indentation spaces for pretty-printing (default: 2, 0 for compact) */
  indent?: number;
}

/**
 * Convert Error object to a serializable format.
 */
function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Safely stringify a value, handling circular references.
 *
 * @param value - Value to stringify
 * @param indent - Indentation spaces
 * @returns JSON string
 */
function safeStringify(value: unknown, indent: number | undefined): string {
  const seen = new WeakSet();

  return JSON.stringify(
    value,
    (key, val) => {
      // Handle Error objects
      if (val instanceof Error) {
        return serializeError(val);
      }

      // Handle circular references
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }

      return val;
    },
    indent
  );
}

/**
 * JSON formatter for machine-readable output.
 *
 * Produces valid JSON output suitable for parsing by other tools.
 */
export class JsonFormatter implements Formatter {
  private readonly indent: number | undefined;

  constructor(options: JsonFormatterOptions = {}) {
    this.indent = options.indent ?? 2;
    // If indent is 0, use undefined for compact output
    if (this.indent === 0) {
      this.indent = undefined;
    }
  }

  /**
   * Format an RLM execution result as JSON.
   */
  format(result: RLMResult): string {
    return safeStringify(result, this.indent);
  }

  /**
   * Format an error as JSON.
   */
  formatError(error: Error): string {
    const errorObj = {
      error: serializeError(error),
    };
    return JSON.stringify(errorObj, null, this.indent);
  }

  /**
   * Format a progress message as JSON.
   */
  formatProgress(message: string): string {
    return JSON.stringify({ progress: message }, null, this.indent);
  }
}
