import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HuggingFaceAdapter, HUGGINGFACE_PRICING } from '../../../../src/llm/adapters/huggingface.js';
import type { LLMRequest } from '../../../../src/types.js';

// Create mock function before hoisting
const mockChatCompletion = vi.hoisted(() => vi.fn());

// Mock the HuggingFace SDK
vi.mock('@huggingface/inference', () => {
  return {
    HfInference: vi.fn().mockImplementation(() => ({
      chatCompletion: mockChatCompletion,
    })),
  };
});

import { HfInference } from '@huggingface/inference';

describe('HuggingFaceAdapter', () => {
  beforeEach(() => {
    mockChatCompletion.mockReset();
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize HfInference with apiKey', () => {
      new HuggingFaceAdapter({ apiKey: 'test-hf-key' });
      expect(HfInference).toHaveBeenCalledWith('test-hf-key');
    });
  });

  describe('complete', () => {
    it('should call chatCompletion with correct parameters', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Hello from HuggingFace!' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'meta-llama/Llama-3.1-70B-Instruct',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system', content: 'You are helpful' }),
            expect.objectContaining({ role: 'user', content: 'Say hello' }),
          ]),
        })
      );
    });

    it('should return content from response', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'The answer is 42' } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should return token counts from usage', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for known models', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 1000 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('HUGGINGFACE_PRICING', () => {
    it('should have pricing for known models', () => {
      expect(HUGGINGFACE_PRICING['meta-llama/Llama-3.1-70B-Instruct']).toBeDefined();
    });
  });

  describe('inference options', () => {
    it('should pass temperature to API call', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { temperature: 0.7 },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('should pass top_p and top_k to API call', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { top_p: 0.9, top_k: 40 },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          top_p: 0.9,
          top_k: 40,
        })
      );
    });

    it('should pass repetition_penalty to API call', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { repetition_penalty: 1.2 },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          repetition_penalty: 1.2,
        })
      );
    });

    it('should pass seed for reproducibility', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'meta-llama/Llama-3.1-70B-Instruct',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { seed: 42 },
      });

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          seed: 42,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should wrap API errors with model context', async () => {
      const apiError = new Error('Rate limit exceeded');
      mockChatCompletion.mockRejectedValue(apiError);

      const adapter = new HuggingFaceAdapter({ apiKey: 'test-key' });

      await expect(
        adapter.complete({
          model: 'meta-llama/Llama-3.1-70B-Instruct',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('meta-llama/Llama-3.1-70B-Instruct');
    });
  });
});
