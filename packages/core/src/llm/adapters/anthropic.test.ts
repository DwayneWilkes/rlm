import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter, ANTHROPIC_PRICING } from './anthropic.js';
import type { LLMRequest } from '../../types.js';

// Create mock function before hoisting
const mockCreate = vi.hoisted(() => vi.fn());

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';

describe('AnthropicAdapter', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('constructor', () => {
    it('should require apiKey in config', () => {
      // TypeScript enforces this, but we can verify the adapter is created
      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      expect(adapter).toBeDefined();
    });

    it('should initialize Anthropic client with apiKey', () => {
      new AnthropicAdapter({ apiKey: 'sk-ant-test123' });
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test123' });
    });
  });

  describe('complete', () => {
    it('should call messages.create with correct parameters', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const request: LLMRequest = {
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
        maxTokens: 2048,
      };

      await adapter.complete(request);

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: 'You are helpful',
        messages: [{ role: 'user', content: 'Say hello' }],
      });
    });

    it('should use default maxTokens of 8192', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 8192,
        })
      );
    });

    it('should return content from response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'The answer is 42' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should return empty string for non-text content', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'tool-1' }],
        usage: { input_tokens: 50, output_tokens: 10 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('');
    });

    it('should return token counts from usage', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(200);
      expect(response.outputTokens).toBe(100);
    });
  });

  describe('cost calculation', () => {
    it('should calculate cost for claude-sonnet-4-20250514 correctly', async () => {
      // Pricing: $0.003/1K input, $0.015/1K output
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 1000, output_tokens: 1000 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (1000 * 0.003 + 1000 * 0.015) / 1000 = 0.018
      expect(response.cost).toBeCloseTo(0.018, 6);
    });

    it('should calculate cost for claude-haiku-3-20240307 correctly', async () => {
      // Pricing: $0.00025/1K input, $0.00125/1K output
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 2000, output_tokens: 500 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-haiku-3-20240307',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (2000 * 0.00025 + 500 * 0.00125) / 1000 = 0.001125
      expect(response.cost).toBeCloseTo(0.001125, 6);
    });

    it('should use default pricing for unknown models', async () => {
      // Default: claude-sonnet-4-20250514 pricing
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 1000, output_tokens: 1000 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-unknown-future-model',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // Uses default sonnet pricing: (1000 * 0.003 + 1000 * 0.015) / 1000 = 0.018
      expect(response.cost).toBeCloseTo(0.018, 6);
    });

    it('should calculate cost accurately for small token counts', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hi' }],
        usage: { input_tokens: 10, output_tokens: 2 },
      });

      const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
      const response = await adapter.complete({
        model: 'claude-sonnet-4-20250514',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // (10 * 0.003 + 2 * 0.015) / 1000 = 0.00006
      expect(response.cost).toBeCloseTo(0.00006, 8);
    });
  });

  describe('ANTHROPIC_PRICING', () => {
    it('should have pricing for claude-sonnet-4-20250514', () => {
      expect(ANTHROPIC_PRICING['claude-sonnet-4-20250514']).toEqual({
        input: 0.003,
        output: 0.015,
      });
    });

    it('should have pricing for claude-haiku-3-20240307', () => {
      expect(ANTHROPIC_PRICING['claude-haiku-3-20240307']).toEqual({
        input: 0.00025,
        output: 0.00125,
      });
    });
  });
});
