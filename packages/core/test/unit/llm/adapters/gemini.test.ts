import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter, GEMINI_PRICING } from '../../../../src/llm/adapters/gemini.js';
import type { LLMRequest } from '../../../../src/types.js';

// Create mock functions before hoisting
const mockGenerateContent = vi.hoisted(() => vi.fn());
const mockGetGenerativeModel = vi.hoisted(() => vi.fn());

// Mock the Google Generative AI SDK
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

import { GoogleGenerativeAI } from '@google/generative-ai';

describe('GeminiAdapter', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset();
    mockGetGenerativeModel.mockReturnValue({
      generateContent: mockGenerateContent,
    });
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize GoogleGenerativeAI client with apiKey', () => {
      new GeminiAdapter({ apiKey: 'test-gemini-key' });
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    });
  });

  describe('complete', () => {
    it('should call generateContent with correct parameters', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Hello from Gemini!',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
          },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'gemini-1.5-pro',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-1.5-pro',
        })
      );
    });

    it('should return content from response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'The answer is 42',
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 10,
          },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should return token counts from usage', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: {
            promptTokenCount: 200,
            candidatesTokenCount: 100,
          },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for gemini-1.5-pro correctly', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 1000,
          },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // Check cost is calculated (actual value depends on pricing)
      expect(response.cost).toBeGreaterThan(0);
    });

    it('should use default pricing for unknown models', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 1000,
          },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gemini-unknown-model',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBeGreaterThan(0);
    });
  });

  describe('GEMINI_PRICING', () => {
    it('should have pricing for gemini-1.5-pro', () => {
      expect(GEMINI_PRICING['gemini-1.5-pro']).toBeDefined();
      expect(GEMINI_PRICING['gemini-1.5-pro'].input).toBeGreaterThan(0);
      expect(GEMINI_PRICING['gemini-1.5-pro'].output).toBeGreaterThan(0);
    });

    it('should have pricing for gemini-1.5-flash', () => {
      expect(GEMINI_PRICING['gemini-1.5-flash']).toBeDefined();
    });
  });

  describe('inference options', () => {
    it('should pass temperature to generationConfig', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { temperature: 0.7 },
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            temperature: 0.7,
          }),
        })
      );
    });

    it('should pass topP and topK to generationConfig', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { top_p: 0.9, top_k: 40 },
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            topP: 0.9,
            topK: 40,
          }),
        })
      );
    });

    it('should pass stop sequences to generationConfig', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { stop: ['END', '###'] },
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            stopSequences: ['END', '###'],
          }),
        })
      );
    });

    it('should pass maxOutputTokens to generationConfig', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'Response',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
        maxTokens: 2048,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            maxOutputTokens: 2048,
          }),
        })
      );
    });

    it('should pass responseMimeType for JSON mode', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => '{"key": "value"}',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      });

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gemini-1.5-pro',
        systemPrompt: 'sys',
        userPrompt: 'user',
        inference: { responseMimeType: 'application/json' },
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should wrap API errors with model context', async () => {
      const apiError = new Error('Rate limit exceeded');
      mockGenerateContent.mockRejectedValue(apiError);

      const adapter = new GeminiAdapter({ apiKey: 'test-key' });

      await expect(
        adapter.complete({
          model: 'gemini-1.5-pro',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('gemini-1.5-pro');
    });
  });
});
