import { describe, it, expect } from 'vitest';
import { JsonFormatter } from './json.js';
import type { RLMResult, ExecutionTrace, Usage } from '@rlm/core';

/**
 * Create a mock RLMResult for testing.
 */
function createMockResult(overrides: Partial<RLMResult> = {}): RLMResult {
  const defaultTrace: ExecutionTrace = {
    id: 'test-execution-123',
    depth: 0,
    task: 'Test task',
    iterations: [
      {
        index: 0,
        prompt: { content: 'Test prompt', tokens: 100 },
        response: { content: 'Test response', tokens: 50, cost: 0.001 },
        codeExecutions: [
          {
            code: 'print("hello")',
            stdout: 'hello\n',
            stderr: '',
            duration: 10,
          },
        ],
      },
    ],
    subcalls: [],
    finalAnswer: 'Test answer',
    answerSource: 'final_direct',
  };

  const defaultUsage: Usage = {
    cost: 0.001,
    tokens: 150,
    inputTokens: 100,
    outputTokens: 50,
    duration: 1500,
    iterations: 1,
    subcalls: 0,
    maxDepthReached: 0,
  };

  return {
    success: true,
    output: 'Test output',
    trace: defaultTrace,
    usage: defaultUsage,
    warnings: [],
    ...overrides,
  };
}

describe('JsonFormatter', () => {
  describe('format', () => {
    it('outputs valid JSON', () => {
      const formatter = new JsonFormatter();
      const result = createMockResult();

      const output = formatter.format(result);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('preserves all result properties', () => {
      const formatter = new JsonFormatter();
      const result = createMockResult({
        success: true,
        output: 'Test output value',
      });

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.output).toBe('Test output value');
      expect(parsed.trace).toBeDefined();
      expect(parsed.usage).toBeDefined();
    });

    it('includes usage statistics', () => {
      const formatter = new JsonFormatter();
      const result = createMockResult({
        usage: {
          cost: 0.05,
          tokens: 5000,
          inputTokens: 3000,
          outputTokens: 2000,
          duration: 30000,
          iterations: 5,
          subcalls: 2,
          maxDepthReached: 1,
        },
      });

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.usage.tokens).toBe(5000);
      expect(parsed.usage.cost).toBe(0.05);
      expect(parsed.usage.duration).toBe(30000);
      expect(parsed.usage.iterations).toBe(5);
    });

    it('pretty-prints with indent option', () => {
      const formatter = new JsonFormatter({ indent: 2 });
      const result = createMockResult();

      const output = formatter.format(result);

      // Pretty-printed JSON has newlines
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('outputs compact JSON without indent option', () => {
      const formatter = new JsonFormatter({ indent: 0 });
      const result = createMockResult();

      const output = formatter.format(result);

      // Compact JSON is a single line
      expect(output.split('\n').length).toBe(1);
    });

    it('handles error results', () => {
      const formatter = new JsonFormatter();
      const error = new Error('Test error');
      const result = createMockResult({
        success: false,
        output: 'Test error',
        error,
      });

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Test error');
    });

    it('handles circular references safely', () => {
      const formatter = new JsonFormatter();
      const result = createMockResult();

      // Create a circular reference in the trace
      const circularObj: Record<string, unknown> = { self: null };
      circularObj.self = circularObj;
      (result as Record<string, unknown>).circularRef = circularObj;

      // Should not throw, should handle gracefully
      expect(() => formatter.format(result)).not.toThrow();
    });

    it('handles undefined values', () => {
      const formatter = new JsonFormatter();
      const result = createMockResult();
      // Remove error to test undefined handling
      delete result.error;

      const output = formatter.format(result);
      const parsed = JSON.parse(output);

      expect(parsed.error).toBeUndefined();
    });
  });

  describe('formatError', () => {
    it('outputs valid JSON error', () => {
      const formatter = new JsonFormatter();
      const error = new Error('Something went wrong');

      const output = formatter.formatError(error);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes error message', () => {
      const formatter = new JsonFormatter();
      const error = new Error('Something went wrong');

      const output = formatter.formatError(error);
      const parsed = JSON.parse(output);

      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Something went wrong');
    });

    it('includes error name', () => {
      const formatter = new JsonFormatter();
      const error = new TypeError('Type mismatch');

      const output = formatter.formatError(error);
      const parsed = JSON.parse(output);

      expect(parsed.error.name).toBe('TypeError');
    });

    it('respects indent option', () => {
      const formatter = new JsonFormatter({ indent: 2 });
      const error = new Error('Test error');

      const output = formatter.formatError(error);

      expect(output).toContain('\n');
    });
  });

  describe('formatProgress', () => {
    it('outputs valid JSON progress', () => {
      const formatter = new JsonFormatter();

      const output = formatter.formatProgress?.('Loading...');

      expect(output).toBeDefined();
      expect(() => JSON.parse(output!)).not.toThrow();
    });

    it('includes progress message', () => {
      const formatter = new JsonFormatter();

      const output = formatter.formatProgress?.('Processing data');
      const parsed = JSON.parse(output!);

      expect(parsed.progress).toBe('Processing data');
    });
  });
});
