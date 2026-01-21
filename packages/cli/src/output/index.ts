/**
 * Output formatters for RLM CLI.
 *
 * Provides formatters for different output formats (text, json, yaml)
 * and a factory function to create the appropriate formatter.
 *
 * @module output
 */

export type { OutputFormat, Formatter } from './formatter.js';
export { TextFormatter, type TextFormatterOptions } from './text.js';
export { JsonFormatter, type JsonFormatterOptions } from './json.js';
export { YamlFormatter, type YamlFormatterOptions } from './yaml.js';

import type { OutputFormat, Formatter } from './formatter.js';
import { TextFormatter } from './text.js';
import { JsonFormatter } from './json.js';
import { YamlFormatter } from './yaml.js';

/**
 * Create a formatter for the specified output format.
 *
 * @param format - The output format ('text', 'json', or 'yaml')
 * @returns A Formatter instance for the specified format
 * @throws Error if the format is not recognized
 *
 * @example
 * ```typescript
 * const formatter = createFormatter('json');
 * const output = formatter.format(result);
 * console.log(output);
 * ```
 */
export function createFormatter(format: OutputFormat): Formatter {
  switch (format) {
    case 'text':
      return new TextFormatter();
    case 'json':
      return new JsonFormatter();
    case 'yaml':
      return new YamlFormatter();
    default:
      throw new Error(`Unknown output format: ${format}`);
  }
}
