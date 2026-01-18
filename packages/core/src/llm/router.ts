/**
 * @fileoverview LLM Router for managing multiple provider adapters.
 *
 * The router maintains a registry of LLM adapters and routes completion
 * requests to the appropriate adapter based on the provider ID.
 *
 * @module @rlm/core/llm/router
 */

import type { LLMAdapter, LLMRequest, LLMResponse } from '../types.js';

/**
 * Routes LLM requests to registered provider adapters.
 *
 * @example
 * ```typescript
 * const router = new LLMRouter('ollama');
 * router.register('ollama', new OllamaAdapter());
 * router.register('anthropic', new AnthropicAdapter({ apiKey: 'key' }));
 *
 * const response = await router.complete('ollama', {
 *   model: 'llama3.2',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'Hello',
 * });
 * ```
 */
export class LLMRouter {
  private adapters: Map<string, LLMAdapter> = new Map();
  private defaultProvider: string;

  /**
   * Create a new LLM router.
   *
   * @param defaultProvider - The default provider ID to use when not specified
   */
  constructor(defaultProvider: string) {
    this.defaultProvider = defaultProvider;
  }

  /**
   * Register an adapter for a provider.
   *
   * If an adapter is already registered for the provider, it will be replaced.
   *
   * @param providerId - Unique identifier for the provider (e.g., 'ollama', 'anthropic')
   * @param adapter - The adapter instance to use for this provider
   */
  register(providerId: string, adapter: LLMAdapter): void {
    this.adapters.set(providerId, adapter);
  }

  /**
   * Complete a request using the specified provider.
   *
   * @param provider - The provider ID to route the request to
   * @param request - The LLM request to complete
   * @returns The LLM response from the provider
   * @throws Error if the provider is not registered
   */
  async complete(provider: string, request: LLMRequest): Promise<LLMResponse> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return adapter.complete(request);
  }

  /**
   * Get the adapter for a provider.
   *
   * @param provider - The provider ID to look up
   * @returns The adapter if registered, undefined otherwise
   */
  getAdapter(provider: string): LLMAdapter | undefined {
    return this.adapters.get(provider);
  }
}
