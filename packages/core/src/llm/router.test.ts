import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMRouter } from './router.js';
import type { LLMAdapter, LLMRequest, LLMResponse } from '../types.js';

// Mock adapter for testing
function createMockAdapter(response: Partial<LLMResponse> = {}): LLMAdapter {
  const defaultResponse: LLMResponse = {
    content: 'Mock response',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
    ...response,
  };
  return {
    complete: vi.fn().mockResolvedValue(defaultResponse),
  };
}

describe('LLMRouter', () => {
  let router: LLMRouter;

  beforeEach(() => {
    router = new LLMRouter('default');
  });

  describe('register', () => {
    it('should register an adapter for a provider', () => {
      const adapter = createMockAdapter();
      router.register('test-provider', adapter);

      const retrieved = router.getAdapter('test-provider');
      expect(retrieved).toBe(adapter);
    });

    it('should overwrite existing adapter for same provider', () => {
      const adapter1 = createMockAdapter({ content: 'First' });
      const adapter2 = createMockAdapter({ content: 'Second' });

      router.register('test', adapter1);
      router.register('test', adapter2);

      expect(router.getAdapter('test')).toBe(adapter2);
    });
  });

  describe('getAdapter', () => {
    it('should return undefined for unregistered provider', () => {
      const adapter = router.getAdapter('nonexistent');
      expect(adapter).toBeUndefined();
    });

    it('should return the registered adapter', () => {
      const adapter = createMockAdapter();
      router.register('my-provider', adapter);

      expect(router.getAdapter('my-provider')).toBe(adapter);
    });
  });

  describe('complete', () => {
    it('should route request to registered adapter', async () => {
      const adapter = createMockAdapter({ content: 'Hello world' });
      router.register('test', adapter);

      const request: LLMRequest = {
        model: 'test-model',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
      };

      const response = await router.complete('test', request);

      expect(adapter.complete).toHaveBeenCalledWith(request);
      expect(response.content).toBe('Hello world');
    });

    it('should throw error for unknown provider', async () => {
      const request: LLMRequest = {
        model: 'test-model',
        systemPrompt: 'System',
        userPrompt: 'User',
      };

      await expect(router.complete('unknown', request)).rejects.toThrow(
        'Unknown provider: unknown'
      );
    });

    it('should return complete LLMResponse structure', async () => {
      const adapter = createMockAdapter({
        content: 'Test content',
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.005,
      });
      router.register('provider', adapter);

      const response = await router.complete('provider', {
        model: 'model',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response).toEqual({
        content: 'Test content',
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.005,
      });
    });
  });

  describe('multiple providers', () => {
    it('should route to correct adapter based on provider', async () => {
      const ollamaAdapter = createMockAdapter({ content: 'Ollama response' });
      const anthropicAdapter = createMockAdapter({ content: 'Anthropic response' });
      const openaiAdapter = createMockAdapter({ content: 'OpenAI response' });

      router.register('ollama', ollamaAdapter);
      router.register('anthropic', anthropicAdapter);
      router.register('openai', openaiAdapter);

      const request: LLMRequest = {
        model: 'any',
        systemPrompt: 'sys',
        userPrompt: 'user',
      };

      const ollamaResponse = await router.complete('ollama', request);
      const anthropicResponse = await router.complete('anthropic', request);
      const openaiResponse = await router.complete('openai', request);

      expect(ollamaResponse.content).toBe('Ollama response');
      expect(anthropicResponse.content).toBe('Anthropic response');
      expect(openaiResponse.content).toBe('OpenAI response');
    });
  });

  describe('rate limiting (4.1.4)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow setRateLimit configuration', () => {
      const adapter = createMockAdapter();
      router.register('anthropic', adapter);
      router.setRateLimit('anthropic', { requestsPerMinute: 60 });

      // Should not throw
      expect(router.isRateLimited('anthropic')).toBe(false);
    });

    it('should not rate limit by default', async () => {
      const adapter = createMockAdapter();
      router.register('test', adapter);

      expect(router.isRateLimited('test')).toBe(false);

      // Make many requests quickly
      for (let i = 0; i < 100; i++) {
        await router.complete('test', {
          model: 'model',
          systemPrompt: 'sys',
          userPrompt: 'user',
        });
      }

      // All should complete without rate limiting
      expect(adapter.complete).toHaveBeenCalledTimes(100);
    });

    it('should track rate limit status', async () => {
      const adapter = createMockAdapter();
      router.register('anthropic', adapter);
      router.setRateLimit('anthropic', { requestsPerMinute: 60, burstSize: 2 });

      const request = { model: 'm', systemPrompt: 's', userPrompt: 'u' };

      // First two requests should not be rate limited
      expect(router.isRateLimited('anthropic')).toBe(false);
      await router.complete('anthropic', request);

      expect(router.isRateLimited('anthropic')).toBe(false);
      await router.complete('anthropic', request);

      // Now should be rate limited
      expect(router.isRateLimited('anthropic')).toBe(true);
    });

    it('should wait when rate limited', async () => {
      const adapter = createMockAdapter();
      router.register('anthropic', adapter);
      router.setRateLimit('anthropic', { requestsPerMinute: 60, burstSize: 1 });

      const request = { model: 'm', systemPrompt: 's', userPrompt: 'u' };

      // Use the single token
      await router.complete('anthropic', request);
      expect(adapter.complete).toHaveBeenCalledTimes(1);

      // Next request will wait
      const completionPromise = router.complete('anthropic', request);

      // Advance time
      vi.advanceTimersByTime(1000);

      await completionPromise;
      expect(adapter.complete).toHaveBeenCalledTimes(2);
    });
  });
});
