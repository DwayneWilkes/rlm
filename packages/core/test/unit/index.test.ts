/**
 * @fileoverview Tests for package exports - verifies public API is available.
 */

import { describe, it, expect } from 'vitest';
import * as rlmCore from '../../src/index.js';

describe('@rlm/core exports', () => {
  describe('main class', () => {
    it('should export RLM class', () => {
      expect(rlmCore.RLM).toBeDefined();
      expect(typeof rlmCore.RLM).toBe('function');
    });

    it('should allow instantiation of RLM', () => {
      const rlm = new rlmCore.RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });
      expect(rlm).toBeInstanceOf(rlmCore.RLM);
    });
  });

  describe('defaults', () => {
    it('should export DEFAULT_BUDGET', () => {
      expect(rlmCore.DEFAULT_BUDGET).toBeDefined();
      expect(rlmCore.DEFAULT_BUDGET.maxCost).toBe(5.0);
      expect(rlmCore.DEFAULT_BUDGET.maxTokens).toBe(500_000);
      expect(rlmCore.DEFAULT_BUDGET.maxTime).toBe(300_000);
      expect(rlmCore.DEFAULT_BUDGET.maxDepth).toBe(2);
      expect(rlmCore.DEFAULT_BUDGET.maxIterations).toBe(30);
    });

    it('should export DEFAULT_REPL_CONFIG', () => {
      expect(rlmCore.DEFAULT_REPL_CONFIG).toBeDefined();
      expect(rlmCore.DEFAULT_REPL_CONFIG.timeout).toBe(30_000);
      expect(rlmCore.DEFAULT_REPL_CONFIG.maxOutputLength).toBe(50_000);
    });
  });

  describe('utilities', () => {
    it('should export loadContext', () => {
      expect(rlmCore.loadContext).toBeDefined();
      expect(typeof rlmCore.loadContext).toBe('function');
    });

    it('should export escapeForPython', () => {
      expect(rlmCore.escapeForPython).toBeDefined();
      expect(typeof rlmCore.escapeForPython).toBe('function');
    });

    it('should export estimateTokens', () => {
      expect(rlmCore.estimateTokens).toBeDefined();
      expect(typeof rlmCore.estimateTokens).toBe('function');
    });

    it('should export detectContentType', () => {
      expect(rlmCore.detectContentType).toBeDefined();
      expect(typeof rlmCore.detectContentType).toBe('function');
    });

    it('should export parseResponse', () => {
      expect(rlmCore.parseResponse).toBeDefined();
      expect(typeof rlmCore.parseResponse).toBe('function');
    });

    it('should export BudgetController', () => {
      expect(rlmCore.BudgetController).toBeDefined();
      expect(typeof rlmCore.BudgetController).toBe('function');
    });
  });

  describe('LLM adapters', () => {
    it('should export LLMRouter', () => {
      expect(rlmCore.LLMRouter).toBeDefined();
      expect(typeof rlmCore.LLMRouter).toBe('function');
    });

    it('should export OllamaAdapter', () => {
      expect(rlmCore.OllamaAdapter).toBeDefined();
      expect(typeof rlmCore.OllamaAdapter).toBe('function');
    });

    it('should export AnthropicAdapter', () => {
      expect(rlmCore.AnthropicAdapter).toBeDefined();
      expect(typeof rlmCore.AnthropicAdapter).toBe('function');
    });

    it('should export OpenAIAdapter', () => {
      expect(rlmCore.OpenAIAdapter).toBeDefined();
      expect(typeof rlmCore.OpenAIAdapter).toBe('function');
    });

    it('should export pricing constants', () => {
      expect(rlmCore.ANTHROPIC_PRICING).toBeDefined();
      expect(rlmCore.OPENAI_PRICING).toBeDefined();
    });
  });

  describe('sandbox', () => {
    it('should export createSandbox', () => {
      expect(rlmCore.createSandbox).toBeDefined();
      expect(typeof rlmCore.createSandbox).toBe('function');
    });
  });

  describe('usage patterns', () => {
    it('should support basic Ollama usage pattern', () => {
      const rlm = new rlmCore.RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      // Verify the pattern compiles and instance is valid
      expect(rlm).toBeDefined();
      expect(typeof rlm.execute).toBe('function');
    });

    it('should support Anthropic usage pattern with budget', () => {
      const rlm = new rlmCore.RLM({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        providerOptions: {
          apiKey: 'test-key',
        },
        defaultBudget: {
          ...rlmCore.DEFAULT_BUDGET,
          maxCost: 1.0,
        },
      });

      expect(rlm).toBeDefined();
    });

    it('should support router pattern for custom adapters', () => {
      const router = new rlmCore.LLMRouter('custom');
      router.register('ollama', new rlmCore.OllamaAdapter());

      expect(router.getAdapter('ollama')).toBeDefined();
    });

    it('should support context loading pattern', () => {
      const ctx = rlmCore.loadContext('# Hello World\n\nThis is a test.');

      expect(ctx.content).toBe('# Hello World\n\nThis is a test.');
      expect(ctx.length).toBe(30);
      expect(ctx.tokenEstimate).toBeGreaterThan(0);
      expect(ctx.contentType).toBe('markdown');
    });

    it('should support parseResponse pattern', () => {
      const response = `Let me analyze this.

\`\`\`repl
print(len(context))
\`\`\`

FINAL(The answer is 42)`;

      const parsed = rlmCore.parseResponse(response);

      expect(parsed.codeBlocks).toHaveLength(1);
      expect(parsed.codeBlocks[0]).toBe('print(len(context))');
      expect(parsed.finalAnswer).toEqual({
        type: 'direct',
        value: 'The answer is 42',
      });
      expect(parsed.thinking).toContain('Let me analyze this');
    });

    it('should support BudgetController pattern', () => {
      const warnings: string[] = [];
      const budget = new rlmCore.BudgetController(
        { maxIterations: 5, maxCost: 1.0 },
        (warning) => warnings.push(warning)
      );

      // Verify initial state
      expect(budget.canProceed('iteration')).toBe(true);
      expect(budget.getUsage().iterations).toBe(0);

      // Record some usage
      budget.record({ iteration: true, cost: 0.1, inputTokens: 100 });
      expect(budget.getUsage().iterations).toBe(1);
      expect(budget.getUsage().cost).toBe(0.1);
      expect(budget.getUsage().inputTokens).toBe(100);

      // Check remaining budget
      const remaining = budget.getRemaining();
      expect(remaining.iterations).toBe(4);
      expect(remaining.cost).toBeCloseTo(0.9, 2);
    });
  });
});
