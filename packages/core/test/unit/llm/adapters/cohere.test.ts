import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CohereAdapter, COHERE_PRICING } from '../../../../src/llm/adapters/cohere.js';
import type { LLMRequest } from '../../../../src/types.js';

// Create mock function before hoisting
const mockChat = vi.hoisted(() => vi.fn());

// Mock the Cohere SDK
vi.mock('cohere-ai', () => {
  return {
    CohereClient: vi.fn().mockImplementation(() => ({
      chat: mockChat,
    })),
  };
});

import { CohereClient } from 'cohere-ai';

describe('CohereAdapter', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize CohereClient with apiKey', () => {
      new CohereAdapter({ apiKey: 'test-cohere-key' });
      expect(CohereClient).toHaveBeenCalledWith({ token: 'test-cohere-key' });
    });
  });

  describe('complete', () => {
    it('should call chat with correct parameters', async () => {
      mockChat.mockResolvedValue({
        text: 'Hello from Cohere!',
        meta: {
          tokens: {
            inputTokens: 100,
            outputTokens: 50,
          },
        },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'command-r-plus',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'command-r-plus',
          message: 'Say hello',
          preamble: 'You are helpful',
        })
      );
    });

    it('should return content from response', async () => {
      mockChat.mockResolvedValue({
        text: 'The answer is 42',
        meta: {
          tokens: { inputTokens: 50, outputTokens: 10 },
        },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should return token counts from usage', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: {
          tokens: { inputTokens: 200, outputTokens: 100 },
        },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for command-r-plus correctly', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: {
          tokens: { inputTokens: 1000, outputTokens: 1000 },
        },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBeGreaterThan(0);
    });
  });

  describe('COHERE_PRICING', () => {
    it('should have pricing for command-r-plus', () => {
      expect(COHERE_PRICING['command-r-plus']).toBeDefined();
    });

    it('should have pricing for command-r', () => {
      expect(COHERE_PRICING['command-r']).toBeDefined();
    });
  });

  describe('inference options', () => {
    it('should pass temperature to API call', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: { tokens: { inputTokens: 10, outputTokens: 5 } },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'command-r-plus',
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

    it('should pass p and k to API call', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: { tokens: { inputTokens: 10, outputTokens: 5 } },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { p: 0.9, k: 40 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          p: 0.9,
          k: 40,
        })
      );
    });

    it('should pass stop_sequences to API call', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: { tokens: { inputTokens: 10, outputTokens: 5 } },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { stop_sequences: ['END', '###'] },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          stopSequences: ['END', '###'],
        })
      );
    });

    it('should pass seed for reproducibility', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: { tokens: { inputTokens: 10, outputTokens: 5 } },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { seed: 42 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          seed: 42,
        })
      );
    });

    it('should pass frequency_penalty and presence_penalty', async () => {
      mockChat.mockResolvedValue({
        text: 'Response',
        meta: { tokens: { inputTokens: 10, outputTokens: 5 } },
      });

      const adapter = new CohereAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'command-r-plus',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { frequency_penalty: 0.5, presence_penalty: 0.3 },
      });

      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          frequencyPenalty: 0.5,
          presencePenalty: 0.3,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should wrap API errors with model context', async () => {
      const apiError = new Error('Rate limit exceeded');
      mockChat.mockRejectedValue(apiError);

      const adapter = new CohereAdapter({ apiKey: 'test-key' });

      await expect(
        adapter.complete({
          model: 'command-r-plus',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('command-r-plus');
    });
  });
});
