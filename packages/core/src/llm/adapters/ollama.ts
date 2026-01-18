/**
 * @fileoverview Ollama adapter for local LLM inference.
 *
 * Ollama runs LLMs locally, so all completions have zero cost.
 * This adapter communicates with Ollama's HTTP API.
 *
 * @module @rlm/core/llm/adapters/ollama
 */

import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types.js';

/**
 * Configuration for the Ollama adapter.
 */
export interface OllamaConfig {
  /** Base URL for the Ollama API (default: 'http://localhost:11434') */
  baseUrl?: string;
}

/**
 * Ollama API chat response structure.
 */
interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Adapter for Ollama local LLM inference.
 *
 * @example
 * ```typescript
 * const adapter = new OllamaAdapter();
 * const response = await adapter.complete({
 *   model: 'llama3.2',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'Say hello',
 * });
 * console.log(response.cost); // Always 0 for local models
 * ```
 */
export class OllamaAdapter implements LLMAdapter {
  private baseUrl: string;

  /**
   * Create a new Ollama adapter.
   *
   * @param config - Optional configuration (uses defaults if not provided)
   */
  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
  }

  /**
   * Complete a chat request using Ollama.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and cost (always 0)
   * @throws Error if the Ollama API returns an error
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        stream: false,
        options: {
          num_predict: request.maxTokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data: OllamaChatResponse = await response.json();

    return {
      content: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      cost: 0, // Local models are free
    };
  }
}
