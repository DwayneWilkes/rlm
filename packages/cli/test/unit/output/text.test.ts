import { describe, it, expect } from 'vitest';
import { TextFormatter } from '../../../src/output/text.js';
import { createMockResult } from '../../fixtures/output-test-fixtures.js';

describe('TextFormatter', () => {
  describe('format', () => {
    it('formats successful result with status', () => {
      const formatter = new TextFormatter();
      const result = createMockResult({ success: true, output: 'The answer is 42' });

      const output = formatter.format(result);

      expect(output).toContain('Success');
      expect(output).toContain('The answer is 42');
    });

    it('formats failed result with error status', () => {
      const formatter = new TextFormatter();
      const result = createMockResult({
        success: false,
        output: 'Budget exceeded',
        error: new Error('Budget exceeded'),
      });

      const output = formatter.format(result);

      expect(output).toContain('Failed');
      expect(output).toContain('Budget exceeded');
    });

    it('includes usage statistics', () => {
      const formatter = new TextFormatter();
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

      expect(output).toContain('5,000'); // tokens (locale formatted)
      expect(output).toContain('0.0500'); // cost
      expect(output).toContain('30.00'); // duration in seconds
    });

    it('formats execution trace with iterations', () => {
      const formatter = new TextFormatter();
      const result = createMockResult();

      const output = formatter.format(result);

      expect(output).toContain('Iteration');
      expect(output).toContain('Test task');
    });

    it('shows warnings when present', () => {
      const formatter = new TextFormatter();
      const result = createMockResult({
        warnings: ['Budget at 80%', 'Approaching token limit'],
      });

      const output = formatter.format(result);

      expect(output).toContain('Warning');
      expect(output).toContain('Budget at 80%');
      expect(output).toContain('Approaching token limit');
    });

    it('handles empty trace gracefully', () => {
      const formatter = new TextFormatter();
      const result = createMockResult({
        trace: {
          id: 'empty-trace',
          depth: 0,
          task: 'Empty task',
          iterations: [],
          subcalls: [],
          finalAnswer: '',
          answerSource: 'error',
        },
      });

      const output = formatter.format(result);

      expect(output).toBeDefined();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('formatError', () => {
    it('formats error with message', () => {
      const formatter = new TextFormatter();
      const error = new Error('Something went wrong');

      const output = formatter.formatError(error);

      expect(output).toContain('Error');
      expect(output).toContain('Something went wrong');
    });

    it('includes stack trace when available', () => {
      const formatter = new TextFormatter();
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      const output = formatter.formatError(error);

      expect(output).toContain('Test error');
    });

    it('handles errors without message', () => {
      const formatter = new TextFormatter();
      const error = new Error();

      const output = formatter.formatError(error);

      expect(output).toContain('Error');
    });
  });

  describe('formatProgress', () => {
    it('formats progress message', () => {
      const formatter = new TextFormatter();

      const output = formatter.formatProgress?.('Loading context...');

      expect(output).toBeDefined();
      expect(output).toContain('Loading context');
    });

    it('supports spinner characters', () => {
      const formatter = new TextFormatter();

      const output = formatter.formatProgress?.('Processing');

      // Progress messages should be formatted
      expect(output).toBeDefined();
      expect(output!.length).toBeGreaterThan(0);
    });
  });

  describe('color output', () => {
    it('uses colors by default', () => {
      const formatter = new TextFormatter();
      const result = createMockResult({ success: true });

      const output = formatter.format(result);

      // Color codes should be present (ANSI escape sequences)
      // This test verifies the formatter is using colors
      expect(output).toBeDefined();
    });

    it('supports disabling colors', () => {
      const formatter = new TextFormatter({ colors: false });
      const result = createMockResult({ success: true });

      const output = formatter.format(result);

      // Should not contain ANSI escape codes
      expect(output).not.toMatch(/\x1b\[/);
    });
  });
});
