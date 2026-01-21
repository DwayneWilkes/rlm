/**
 * YAML formatter for human-readable structured CLI output.
 *
 * @module output/yaml
 */

import { stringify } from 'yaml';
import type { RLMResult } from '@rlm/core';
import type { Formatter } from './formatter.js';

/**
 * Options for YamlFormatter.
 */
export interface YamlFormatterOptions {
  /** Indentation spaces (default: 2) */
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
 * Prepare an object for YAML serialization.
 *
 * Converts Error objects and handles special types.
 */
function prepareForYaml(value: unknown): unknown {
  if (value instanceof Error) {
    return serializeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(prepareForYaml);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = prepareForYaml(val);
    }
    return result;
  }

  return value;
}

/**
 * YAML formatter for human-readable structured output.
 *
 * Produces valid YAML output suitable for configuration files
 * and easy human reading while remaining machine-parseable.
 */
export class YamlFormatter implements Formatter {
  private readonly indent: number;

  constructor(options: YamlFormatterOptions = {}) {
    this.indent = options.indent ?? 2;
  }

  /**
   * Format an RLM execution result as YAML.
   */
  format(result: RLMResult): string {
    const prepared = prepareForYaml(result);
    return stringify(prepared, { indent: this.indent });
  }

  /**
   * Format an error as YAML.
   */
  formatError(error: Error): string {
    const errorObj = {
      error: serializeError(error),
    };
    return stringify(errorObj, { indent: this.indent });
  }

  /**
   * Format a progress message as YAML.
   */
  formatProgress(message: string): string {
    return stringify({ progress: message }, { indent: this.indent });
  }
}
