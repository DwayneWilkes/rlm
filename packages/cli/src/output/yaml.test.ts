import { describe, it, expect } from 'vitest';
import { YamlFormatter } from './yaml.js';
import { parse as parseYaml } from 'yaml';
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

describe('YamlFormatter', () => {
  describe('format', () => {
    it('outputs valid YAML', () => {
      const formatter = new YamlFormatter();
      const result = createMockResult();

      const output = formatter.format(result);

      expect(() => parseYaml(output)).not.toThrow();
    });

    it('preserves all result properties', () => {
      const formatter = new YamlFormatter();
      const result = createMockResult({
        success: true,
        output: 'Test output value',
      });

      const output = formatter.format(result);
      const parsed = parseYaml(output);

      expect(parsed.success).toBe(true);
      expect(parsed.output).toBe('Test output value');
      expect(parsed.trace).toBeDefined();
      expect(parsed.usage).toBeDefined();
    });

    it('includes usage statistics', () => {
      const formatter = new YamlFormatter();
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
      const parsed = parseYaml(output);

      expect(parsed.usage.tokens).toBe(5000);
      expect(parsed.usage.cost).toBe(0.05);
      expect(parsed.usage.duration).toBe(30000);
      expect(parsed.usage.iterations).toBe(5);
    });

    it('handles complex nested structures', () => {
      const formatter = new YamlFormatter();
      const result = createMockResult({
        trace: {
          id: 'test-123',
          depth: 0,
          task: 'Complex task',
          iterations: [
            {
              index: 0,
              prompt: { content: 'Prompt 1', tokens: 100 },
              response: { content: 'Response 1', tokens: 50, cost: 0.001 },
              codeExecutions: [],
            },
            {
              index: 1,
              prompt: { content: 'Prompt 2', tokens: 150 },
              response: { content: 'Response 2', tokens: 75, cost: 0.002 },
              codeExecutions: [
                { code: 'x = 1', stdout: '', stderr: '', duration: 5 },
                { code: 'y = 2', stdout: '', stderr: '', duration: 5 },
              ],
            },
          ],
          subcalls: [
            {
              id: 'subcall-1',
              parentId: 'test-123',
              depth: 1,
              task: 'Subtask',
              iterations: [],
              subcalls: [],
              finalAnswer: 'Sub answer',
              answerSource: 'final_direct',
            },
          ],
          finalAnswer: 'Final answer',
          answerSource: 'final_direct',
        },
      });

      const output = formatter.format(result);
      const parsed = parseYaml(output);

      expect(parsed.trace.iterations).toHaveLength(2);
      expect(parsed.trace.subcalls).toHaveLength(1);
      expect(parsed.trace.subcalls[0].task).toBe('Subtask');
    });

    it('handles error results', () => {
      const formatter = new YamlFormatter();
      const error = new Error('Test error');
      const result = createMockResult({
        success: false,
        output: 'Test error',
        error,
      });

      const output = formatter.format(result);
      const parsed = parseYaml(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Test error');
    });

    it('handles multiline strings properly', () => {
      const formatter = new YamlFormatter();
      const result = createMockResult({
        output: 'Line 1\nLine 2\nLine 3',
      });

      const output = formatter.format(result);
      const parsed = parseYaml(output);

      expect(parsed.output).toBe('Line 1\nLine 2\nLine 3');
    });

    it('handles special characters', () => {
      const formatter = new YamlFormatter();
      const result = createMockResult({
        output: 'Special chars: @#$%^&*(){}[]|\\:";\'<>,.?/',
      });

      const output = formatter.format(result);
      const parsed = parseYaml(output);

      expect(parsed.output).toContain('@#$%');
    });
  });

  describe('formatError', () => {
    it('outputs valid YAML error', () => {
      const formatter = new YamlFormatter();
      const error = new Error('Something went wrong');

      const output = formatter.formatError(error);

      expect(() => parseYaml(output)).not.toThrow();
    });

    it('includes error message', () => {
      const formatter = new YamlFormatter();
      const error = new Error('Something went wrong');

      const output = formatter.formatError(error);
      const parsed = parseYaml(output);

      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toBe('Something went wrong');
    });

    it('includes error name', () => {
      const formatter = new YamlFormatter();
      const error = new TypeError('Type mismatch');

      const output = formatter.formatError(error);
      const parsed = parseYaml(output);

      expect(parsed.error.name).toBe('TypeError');
    });
  });

  describe('formatProgress', () => {
    it('outputs valid YAML progress', () => {
      const formatter = new YamlFormatter();

      const output = formatter.formatProgress?.('Loading...');

      expect(output).toBeDefined();
      expect(() => parseYaml(output!)).not.toThrow();
    });

    it('includes progress message', () => {
      const formatter = new YamlFormatter();

      const output = formatter.formatProgress?.('Processing data');
      const parsed = parseYaml(output!);

      expect(parsed.progress).toBe('Processing data');
    });
  });
});
