import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from './ollama.js';
import type { LLMRequest } from '../../types.js';

// Mock fetch globally using hoisted pattern
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

describe('OllamaAdapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default baseUrl when not provided', () => {
      const adapter = new OllamaAdapter();
      // We can verify this by checking the fetch URL in complete()
      expect(adapter).toBeDefined();
    });

    it('should use provided baseUrl', () => {
      const adapter = new OllamaAdapter({ baseUrl: 'http://custom:8080' });
      expect(adapter).toBeDefined();
    });
  });

  describe('complete', () => {
    it('should POST to /api/chat endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'Hello' },
            prompt_eval_count: 50,
            eval_count: 25,
          }),
      });

      const adapter = new OllamaAdapter();
      await adapter.complete({
        model: 'llama3.2',
        systemPrompt: 'You are helpful',
        userPrompt: 'Say hello',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should use custom baseUrl in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'Response' },
            prompt_eval_count: 10,
            eval_count: 20,
          }),
      });

      const adapter = new OllamaAdapter({ baseUrl: 'http://ollama.local:11434' });
      await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://ollama.local:11434/api/chat',
        expect.any(Object)
      );
    });

    it('should send model and messages in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'OK' },
            prompt_eval_count: 10,
            eval_count: 5,
          }),
      });

      const adapter = new OllamaAdapter();
      const request: LLMRequest = {
        model: 'llama3.2:8b',
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'What is 2+2?',
        maxTokens: 1024,
      };

      await adapter.complete(request);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);

      expect(body.model).toBe('llama3.2:8b');
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'What is 2+2?' },
      ]);
      expect(body.stream).toBe(false);
      expect(body.options.num_predict).toBe(1024);
    });

    it('should use default maxTokens of 4096', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'OK' },
            prompt_eval_count: 10,
            eval_count: 5,
          }),
      });

      const adapter = new OllamaAdapter();
      await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.options.num_predict).toBe(4096);
    });

    it('should return content from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'The answer is 4' },
            prompt_eval_count: 100,
            eval_count: 50,
          }),
      });

      const adapter = new OllamaAdapter();
      const response = await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('The answer is 4');
    });

    it('should extract token counts from response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'Response' },
            prompt_eval_count: 150,
            eval_count: 75,
          }),
      });

      const adapter = new OllamaAdapter();
      const response = await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(150);
      expect(response.outputTokens).toBe(75);
    });

    it('should always return cost of 0 (local models are free)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'Response' },
            prompt_eval_count: 1000,
            eval_count: 500,
          }),
      });

      const adapter = new OllamaAdapter();
      const response = await adapter.complete({
        model: 'llama3.2:70b',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.cost).toBe(0);
    });

    it('should handle missing token counts gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            message: { content: 'Response' },
            // No prompt_eval_count or eval_count
          }),
      });

      const adapter = new OllamaAdapter();
      const response = await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.inputTokens).toBe(0);
      expect(response.outputTokens).toBe(0);
    });

    it('should handle missing message content gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            // No message.content
            prompt_eval_count: 10,
            eval_count: 5,
          }),
      });

      const adapter = new OllamaAdapter();
      const response = await adapter.complete({
        model: 'test',
        systemPrompt: 'sys',
        userPrompt: 'user',
      });

      expect(response.content).toBe('');
    });

    it('should throw error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const adapter = new OllamaAdapter();

      await expect(
        adapter.complete({
          model: 'test',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('Ollama error: 500 Internal Server Error');
    });

    it('should throw error on 404 model not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const adapter = new OllamaAdapter();

      await expect(
        adapter.complete({
          model: 'nonexistent-model',
          systemPrompt: 'sys',
          userPrompt: 'user',
        })
      ).rejects.toThrow('Ollama error: 404 Not Found');
    });
  });
});
