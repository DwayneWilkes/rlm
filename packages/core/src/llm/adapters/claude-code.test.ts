import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeAdapter } from './claude-code.js';
import type { LLMRequest } from '../../types.js';

// Mock the Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    __mockQuery: mockQuery,
  };
});

// Get the mock function for assertions
import { query } from '@anthropic-ai/claude-agent-sdk';
const mockQuery = (query as any).__mockQuery ?? query;

describe('ClaudeCodeAdapter', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('constructor', () => {
    it('should create adapter with default config', () => {
      const adapter = new ClaudeCodeAdapter();
      expect(adapter).toBeDefined();
    });

    it('should accept custom config options', () => {
      const adapter = new ClaudeCodeAdapter({
        maxTurns: 5,
        allowedTools: ['Read', 'Glob'],
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('complete', () => {
    it('should call query with combined system and user prompts', async () => {
      // Create an async iterator that yields the result
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Test response' };
          yield { usage: { inputTokens: 100, outputTokens: 50 } };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const request: LLMRequest = {
        model: 'claude-code',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
      };

      await adapter.complete(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'You are helpful\n\nSay hello',
        })
      );
    });

    it('should use only user prompt when no system prompt', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const request: LLMRequest = {
        model: 'claude-code',
        systemPrompt: '',
        userPrompt: 'Just user prompt',
      };

      await adapter.complete(request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Just user prompt',
        })
      );
    });

    it('should return content from result message', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'The answer is 42' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const response = await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 42');
    });

    it('should accumulate token counts from usage messages', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { usage: { inputTokens: 100, outputTokens: 50 } };
          yield { usage: { inputTokens: 50, outputTokens: 25 } };
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const response = await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(150);
      expect(response.outputTokens).toBe(75);
    });

    it('should return cost as 0 (subscription-based)', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
          yield { usage: { inputTokens: 1000, outputTokens: 1000 } };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const response = await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      // Cost is 0 because Claude Code uses subscription billing
      expect(response.cost).toBe(0);
    });

    it('should handle empty result gracefully', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { usage: { inputTokens: 10, outputTokens: 5 } };
          // No result message
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      const response = await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('');
    });
  });

  describe('config options', () => {
    it('should pass maxTurns to query options', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter({ maxTurns: 5 });
      await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            maxTurns: 5,
          }),
        })
      );
    });

    it('should default maxTurns to 1', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            maxTurns: 1,
          }),
        })
      );
    });

    it('should pass allowedTools to query options', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter({
        allowedTools: ['Read', 'Glob', 'Grep'],
      });
      await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            allowedTools: ['Read', 'Glob', 'Grep'],
          }),
        })
      );
    });

    it('should default allowedTools to empty array', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          yield { result: 'Response' };
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();
      await adapter.complete({
        model: 'claude-code',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            allowedTools: [],
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should propagate errors from query', async () => {
      const mockIterator = {
        async *[Symbol.asyncIterator]() {
          throw new Error('SDK error');
        },
      };
      mockQuery.mockReturnValue(mockIterator);

      const adapter = new ClaudeCodeAdapter();

      await expect(
        adapter.complete({
          model: 'claude-code',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('SDK error');
    });
  });
});
