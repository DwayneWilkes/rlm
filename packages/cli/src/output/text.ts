/**
 * Text formatter for human-readable CLI output.
 *
 * @module output/text
 */

import pc from 'picocolors';
import type { RLMResult, ExecutionTrace, Iteration } from '@rlm/core';
import type { Formatter } from './formatter.js';

/**
 * Options for TextFormatter.
 */
export interface TextFormatterOptions {
  /** Enable colored output (default: true) */
  colors?: boolean;
}

/**
 * Text formatter for human-readable output.
 *
 * Produces formatted, colored output suitable for terminal display.
 */
export class TextFormatter implements Formatter {
  private readonly colors: boolean;

  constructor(options: TextFormatterOptions = {}) {
    this.colors = options.colors ?? true;
  }

  /**
   * Apply color function if colors are enabled.
   */
  private color<T extends string>(fn: (s: string) => T, text: string): string {
    return this.colors ? fn(text) : text;
  }

  /**
   * Format a horizontal line separator.
   */
  private separator(char = '-', length = 50): string {
    return this.color(pc.dim, char.repeat(length));
  }

  /**
   * Format the status header based on success/failure.
   */
  private formatStatus(success: boolean): string {
    const status = success
      ? this.color(pc.green, 'Success')
      : this.color(pc.red, 'Failed');
    return `${this.color(pc.bold, 'Status:')} ${status}`;
  }

  /**
   * Format usage statistics.
   */
  private formatUsage(result: RLMResult): string {
    const { usage } = result;
    const lines: string[] = [];

    lines.push(this.color(pc.bold, '\nUsage Statistics:'));
    lines.push(this.separator());

    const durationSec = (usage.duration / 1000).toFixed(2);
    lines.push(`  Tokens:     ${usage.tokens.toLocaleString()} (${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out)`);
    lines.push(`  Cost:       $${usage.cost.toFixed(4)}`);
    lines.push(`  Duration:   ${durationSec}s`);
    lines.push(`  Iterations: ${usage.iterations}`);

    if (usage.subcalls > 0) {
      lines.push(`  Subcalls:   ${usage.subcalls} (max depth: ${usage.maxDepthReached})`);
    }

    return lines.join('\n');
  }

  /**
   * Format warnings.
   */
  private formatWarnings(warnings: string[]): string {
    if (warnings.length === 0) return '';

    const lines: string[] = [];
    lines.push(this.color(pc.bold, this.color(pc.yellow, '\nWarnings:')));

    for (const warning of warnings) {
      lines.push(`  ${this.color(pc.yellow, 'Warning:')} ${warning}`);
    }

    return lines.join('\n');
  }

  /**
   * Format a single iteration.
   */
  private formatIteration(iteration: Iteration): string {
    const lines: string[] = [];
    const header = `Iteration ${iteration.index + 1}`;
    lines.push(this.color(pc.cyan, header));

    if (iteration.codeExecutions.length > 0) {
      for (const exec of iteration.codeExecutions) {
        if (exec.code) {
          lines.push(this.color(pc.dim, '  Code:'));
          const codeLines = exec.code.split('\n').slice(0, 5);
          for (const line of codeLines) {
            lines.push(`    ${line}`);
          }
          if (exec.code.split('\n').length > 5) {
            lines.push(this.color(pc.dim, '    ...'));
          }
        }
        if (exec.stdout) {
          lines.push(this.color(pc.dim, '  Output:'));
          lines.push(`    ${exec.stdout.trim().split('\n').join('\n    ')}`);
        }
        if (exec.error) {
          lines.push(this.color(pc.red, `  Error: ${exec.error}`));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format execution trace.
   */
  private formatTrace(trace: ExecutionTrace): string {
    const lines: string[] = [];

    lines.push(this.color(pc.bold, '\nExecution Trace:'));
    lines.push(this.separator());
    lines.push(`Task: ${trace.task}`);

    if (trace.iterations.length > 0) {
      lines.push('');
      for (const iteration of trace.iterations) {
        lines.push(this.formatIteration(iteration));
      }
    }

    return lines.join('\n');
  }

  /**
   * Format an RLM execution result.
   */
  format(result: RLMResult): string {
    const lines: string[] = [];

    // Header
    lines.push(this.separator('='));
    lines.push(this.color(pc.bold, 'RLM Execution Result'));
    lines.push(this.separator('='));

    // Status
    lines.push(this.formatStatus(result.success));

    // Output
    lines.push(this.color(pc.bold, '\nOutput:'));
    lines.push(this.separator());
    lines.push(result.output);

    // Warnings
    if (result.warnings.length > 0) {
      lines.push(this.formatWarnings(result.warnings));
    }

    // Usage
    lines.push(this.formatUsage(result));

    // Trace
    lines.push(this.formatTrace(result.trace));

    lines.push(this.separator('='));

    return lines.join('\n');
  }

  /**
   * Format an error for output.
   */
  formatError(error: Error): string {
    const lines: string[] = [];

    lines.push(this.color(pc.red, this.color(pc.bold, 'Error:')));
    lines.push(this.color(pc.red, error.message || 'Unknown error'));

    return lines.join('\n');
  }

  /**
   * Format a progress message.
   */
  formatProgress(message: string): string {
    return `${this.color(pc.cyan, '...')} ${message}`;
  }
}
