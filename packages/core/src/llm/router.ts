/**
 * @fileoverview LLM Router for managing multiple provider adapters.
 *
 * The router maintains a registry of LLM adapters and routes completion
 * requests to the appropriate adapter based on the provider ID.
 *
 * @module @rlm/core/llm/router
 */

import type { LLMAdapter, LLMRequest, LLMResponse } from '../types.js';
import { RateLimiter, type RateLimitConfig } from './rate-limiter.js';

/**
 * Routes LLM requests to registered provider adapters.
 *
 * Supports optional rate limiting per provider to prevent overwhelming APIs.
 *
 * @example
 * ```typescript
 * const router = new LLMRouter('ollama');
 * router.register('ollama', new OllamaAdapter());
 * router.register('anthropic', new AnthropicAdapter({ apiKey: 'key' }));
 *
 * // Optional: configure rate limits
 * router.setRateLimit('anthropic', { requestsPerMinute: 60 });
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
  private rateLimiter: RateLimiter = new RateLimiter();

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
   * Configure rate limiting for a provider.
   *
   * Rate limiting uses a token bucket algorithm to prevent overwhelming APIs.
   * By default, no rate limiting is applied.
   *
   * @param provider - Provider ID to configure
   * @param config - Rate limit configuration
   *
   * @example
   * ```typescript
   * // Limit to 60 requests per minute
   * router.setRateLimit('anthropic', { requestsPerMinute: 60 });
   *
   * // Allow burst of 10, then 30/min sustained
   * router.setRateLimit('openai', { requestsPerMinute: 30, burstSize: 10 });
   * ```
   */
  setRateLimit(provider: string, config: RateLimitConfig): void {
    this.rateLimiter.configure(provider, config);
  }

  /**
   * Check if a provider is currently rate limited.
   *
   * @param provider - Provider ID to check
   * @returns True if rate limited, false if requests can proceed
   */
  isRateLimited(provider: string): boolean {
    return this.rateLimiter.isRateLimited(provider);
  }

  /**
   * Complete a request using the specified provider.
   *
   * If rate limiting is configured for the provider, this method will
   * wait until a token is available before making the request.
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

    // Wait for rate limit if configured
    await this.rateLimiter.acquire(provider);

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
