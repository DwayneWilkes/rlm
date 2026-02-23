import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MistralAdapter, MISTRAL_PRICING } from '../../../../src/llm/adapters/mistral.js';
import type { LLMRequest } from '../../../../src/types.js';

// Create mock function before hoisting
const mockChat = vi.hoisted(() => vi.fn());

// Mock the Mistral SDK
vi.mock('@mistralai/mistralai', () => {
  return {
    Mistral: vi.fn().mockImplementation(() => ({
      chat: {
        complete: mockChat,
      },
    })),
  };
});

import { Mistral } from '@mistralai/mistralai';

describe('MistralAdapter', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize Mistral client with apiKey', () => {
      new MistralAdapter({ apiKey: 'test-mistral-key' });
      expect(Mistral).toHaveBeenCalledWith({ apiKey: 'test-mistral-key' });
    });
  });

  describe('complete', () => {
    it('should call chat.complete with correct parameters', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Hello from Mistral!' } }],
        usage: { promptTokens: 100, completionTokens: 50 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'mistral-large-latest',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mistral-large-latest',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: 'You are helpful' }),
            expect.objectContaining({ role: 'user', content: 'Say hello' }),
          ]),
        })
      );
    });

    it('should return content from response', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'The answer is 42' } }],
        usage: { promptTokens: 50, completionTokens: 10 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should return token counts from usage', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 200, completionTokens: 100 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for mistral-large-latest correctly', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 1000, completionTokens: 1000 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBeGreaterThan(0);
    });
  });

  describe('MISTRAL_PRICING', () => {
    it('should have pricing for mistral-large-latest', () => {
      expect(MISTRAL_PRICING['mistral-large-latest']).toBeDefined();
    });

    it('should have pricing for mistral-small-latest', () => {
      expect(MISTRAL_PRICING['mistral-small-latest']).toBeDefined();
    });
  });

  describe('inference options', () => {
    it('should pass temperature to API call', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { temperature: 0.7 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('should pass top_p to API call', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { top_p: 0.9 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          topP: 0.9,
        })
      );
    });

    it('should pass safe_prompt to API call', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { safe_prompt: true },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          safePrompt: true,
        })
      );
    });

    it('should pass random_seed to API call', async () => {
      mockChat.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { promptTokens: 10, completionTokens: 5 },
      });

      const adapter = new MistralAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'mistral-large-latest',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { random_seed: 42 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          randomSeed: 42,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should wrap API errors with model context', async () => {
      const apiError = new Error('Rate limit exceeded');
      mockChat.mockRejectedValue(apiError);

      const adapter = new MistralAdapter({ apiKey: 'test-key' });

      await expect(
        adapter.complete({
          model: 'mistral-large-latest',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('mistral-large-latest');
    });
  });
});
