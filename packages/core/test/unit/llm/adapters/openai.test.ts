import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIAdapter, OPENAI_PRICING } from '../../../../src/llm/adapters/openai.js';
import type { LLMRequest } from '../../../../src/types.js';

// Create mock function before hoisting
const mockCreate = vi.hoisted(() => vi.fn());

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

import OpenAI from 'openai';

describe('OpenAIAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize OpenAI client with apiKey', () => {
      new OpenAIAdapter({ apiKey: 'sk-test123' });
      expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test123' });
    });
  });

  describe('complete', () => {
    it('should call chat.completions.create with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'gpt-4o',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        max_tokens: 2048,
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Say hello' },
        ],
      });
    });

    it('should use default maxTokens of 4096', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096,
        })
      );
    });

    it('should return content from response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'The answer is 42' } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should handle missing message content gracefully', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('');
    });

    it('should handle empty choices array', async () => {
      mockCreate.mockResolvedValue({
        choices: [],
        usage: { prompt_tokens: 50, completion_tokens: 0 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('');
    });

    it('should return token counts from usage', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });

    it('should handle missing usage gracefully', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        // No usage object
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(0);
      expect(response.outputTokens).toBe(0);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for gpt-4o correctly', async () => {
      // Pricing: $0.005/1K input, $0.015/1K output
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 1000 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (1000 * 0.005 + 1000 * 0.015) / 1000 = 0.02
      expect(response.cost).toBeCloseTo(0.02, 6);
    });

    it('should calculate cost for gpt-4o-mini correctly', async () => {
      // Pricing: $0.00015/1K input, $0.0006/1K output
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 500 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o-mini',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (2000 * 0.00015 + 500 * 0.0006) / 1000 = 0.0006
      expect(response.cost).toBeCloseTo(0.0006, 6);
    });

    it('should use default pricing for unknown models', async () => {
      // Default: gpt-4o pricing
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 1000 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-5-turbo-future',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // Uses default gpt-4o pricing: (1000 * 0.005 + 1000 * 0.015) / 1000 = 0.02
      expect(response.cost).toBeCloseTo(0.02, 6);
    });

    it('should calculate cost accurately for small token counts', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hi' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (10 * 0.005 + 2 * 0.015) / 1000 = 0.00008
      expect(response.cost).toBeCloseTo(0.00008, 8);
    });

    it('should return zero cost when usage is missing', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
        // No usage
      });

      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBe(0);
    });
  });

  describe('OPENAI_PRICING', () => {
    it('should have pricing for gpt-4o', () => {
      expect(OPENAI_PRICING['gpt-4o']).toEqual({
        input: 0.005,
        output: 0.015,
      });
    });

    it('should have pricing for gpt-4o-mini', () => {
      expect(OPENAI_PRICING['gpt-4o-mini']).toEqual({
        input: 0.00015,
        output: 0.0006,
      });
    });
  });
});
