/**
 * @fileoverview Tests for the RLM class - the primary public interface.
 */

import { describe, it, expect, vi } from 'vitest';
import { RLM } from './rlm.js';
import type { LLMAdapter } from './types.js';

describe('RLM', () => {
  describe('constructor', () => {
    it('should instantiate with minimal Ollama config', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      expect(rlm).toBeInstanceOf(RLM);
    });

    it('should instantiate with full config', () => {
      const rlm = new RLM({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        providerOptions: {
          apiKey: 'test-api-key',
        },
        subcallModel: 'claude-haiku-3-20240307',
        defaultBudget: {
          maxCost: 1.0,
          maxDepth: 2,
        },
        repl: {
          timeout: 10_000,
        },
      });

      expect(rlm).toBeInstanceOf(RLM);
    });

    it('should instantiate with OpenAI config', () => {
      const rlm = new RLM({
        provider: 'openai',
        model: 'gpt-4o',
        providerOptions: {
          apiKey: 'test-openai-key',
        },
      });

      expect(rlm).toBeInstanceOf(RLM);
    });

    it('should instantiate with custom Ollama baseUrl', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
        providerOptions: {
          baseUrl: 'http://custom-host:11434',
        },
      });

      expect(rlm).toBeInstanceOf(RLM);
    });
  });

  describe('provider auto-registration', () => {
    it('should always register Ollama adapter', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      // Access router for verification (internal API)
      const router = (rlm as unknown as { router: { getAdapter: (p: string) => unknown } }).router;
      expect(router.getAdapter('ollama')).toBeDefined();
    });

    it('should register Anthropic adapter when apiKey provided for anthropic provider', () => {
      const rlm = new RLM({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        providerOptions: {
          apiKey: 'test-key',
        },
      });

      const router = (rlm as unknown as { router: { getAdapter: (p: string) => unknown } }).router;
      expect(router.getAdapter('anthropic')).toBeDefined();
      expect(router.getAdapter('ollama')).toBeDefined(); // Always registered
    });

    it('should register OpenAI adapter when apiKey provided for openai provider', () => {
      const rlm = new RLM({
        provider: 'openai',
        model: 'gpt-4o',
        providerOptions: {
          apiKey: 'test-key',
        },
      });

      const router = (rlm as unknown as { router: { getAdapter: (p: string) => unknown } }).router;
      expect(router.getAdapter('openai')).toBeDefined();
      expect(router.getAdapter('ollama')).toBeDefined(); // Always registered
    });

    it('should not register cloud provider without apiKey', () => {
      const rlm = new RLM({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        // No apiKey provided
      });

      const router = (rlm as unknown as { router: { getAdapter: (p: string) => unknown } }).router;
      expect(router.getAdapter('anthropic')).toBeUndefined();
      expect(router.getAdapter('ollama')).toBeDefined();
    });
  });

  describe('execute method', () => {
    it('should have an execute method', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      expect(typeof rlm.execute).toBe('function');
    });

    it('should accept ExecuteOptions and return Promise', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      // Verify the method signature - it should return a Promise
      const result = rlm.execute({
        task: 'Test task',
        context: 'Test context',
      });

      expect(result).toBeInstanceOf(Promise);
      // Note: We're not awaiting this since Executor may not exist yet
      // The actual execution test would be in integration tests
    });

    it('should accept all execute options', () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      const onIteration = vi.fn();
      const onSubcall = vi.fn();
      const onBudgetWarning = vi.fn();

      // This verifies TypeScript accepts all options
      const result = rlm.execute({
        task: 'Analyze this document',
        context: 'Document content here',
        budget: {
          maxCost: 0.5,
          maxIterations: 5,
          maxDepth: 1,
        },
        hooks: {
          onIteration,
          onSubcall,
          onBudgetWarning,
        },
      });

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('custom adapter registration', () => {
    it('should allow registering custom adapters via router', () => {
      const rlm = new RLM({
        provider: 'custom',
        model: 'my-model',
      });

      // Create a mock adapter
      const mockAdapter: LLMAdapter = {
        complete: vi.fn().mockResolvedValue({
          content: 'Mock response',
          inputTokens: 10,
          outputTokens: 20,
          cost: 0,
        }),
      };

      // Access router to register custom adapter
      const router = (rlm as unknown as { router: { register: (p: string, a: LLMAdapter) => void } }).router;
      router.register('custom', mockAdapter);

      expect(router.getAdapter('custom')).toBe(mockAdapter);
    });
  });

  describe('execute with stub result', () => {
    it('should return RLMResult structure when Executor is not available', async () => {
      const rlm = new RLM({
        provider: 'ollama',
        model: 'llama3.2',
      });

      const result = await rlm.execute({
        task: 'Test task',
        context: 'Test context',
      });

      // Verify the result has the correct structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('trace');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('warnings');

      // Verify trace structure
      expect(result.trace).toHaveProperty('id');
      expect(result.trace).toHaveProperty('depth');
      expect(result.trace).toHaveProperty('task', 'Test task');
      expect(result.trace).toHaveProperty('iterations');
      expect(result.trace).toHaveProperty('subcalls');
      expect(result.trace).toHaveProperty('finalAnswer');
      expect(result.trace).toHaveProperty('answerSource');

      // Verify usage structure
      expect(result.usage).toHaveProperty('cost');
      expect(result.usage).toHaveProperty('tokens');
      expect(result.usage).toHaveProperty('inputTokens');
      expect(result.usage).toHaveProperty('outputTokens');
      expect(result.usage).toHaveProperty('duration');
      expect(result.usage).toHaveProperty('iterations');
      expect(result.usage).toHaveProperty('subcalls');
      expect(result.usage).toHaveProperty('maxDepthReached');
    });
  });
});
