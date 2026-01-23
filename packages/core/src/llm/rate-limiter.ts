/**
 * @fileoverview Rate limiter for LLM API calls.
 *
 * Implements a token bucket algorithm to prevent overwhelming provider APIs.
 * Each provider can have its own rate limit configuration.
 *
 * @module @rlm/core/llm/rate-limiter
 */

/**
 * Rate limit configuration for a provider.
 */
export interface RateLimitConfig {
  /** Maximum requests per minute (default: unlimited) */
  requestsPerMinute?: number;
  /** Maximum burst size before rate limiting kicks in (default: same as requestsPerMinute) */
  burstSize?: number;
}

/**
 * Token bucket state for a single provider.
 */
interface BucketState {
  tokens: number;
  lastRefill: number;
  config: Required<RateLimitConfig>;
}

/**
 * Simple token bucket rate limiter for API calls.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 * limiter.configure('anthropic', { requestsPerMinute: 60 });
 *
 * await limiter.acquire('anthropic'); // Waits if rate limited
 * ```
 */
export class RateLimiter {
  private buckets: Map<string, BucketState> = new Map();

  /**
   * Configure rate limits for a provider.
   *
   * @param provider - Provider ID (e.g., 'anthropic', 'openai')
   * @param config - Rate limit configuration
   */
  configure(provider: string, config: RateLimitConfig): void {
    const requestsPerMinute = config.requestsPerMinute ?? Infinity;
    const burstSize = config.burstSize ?? requestsPerMinute;

    this.buckets.set(provider, {
      tokens: burstSize,
      lastRefill: Date.now(),
      config: { requestsPerMinute, burstSize },
    });
  }

  /**
   * Acquire a token for making a request.
   * Waits if no tokens are available.
   *
   * @param provider - Provider ID to acquire token for
   * @returns Promise that resolves when a token is available
   */
  async acquire(provider: string): Promise<void> {
    const bucket = this.buckets.get(provider);

    // No rate limit configured for this provider
    if (!bucket || bucket.config.requestsPerMinute === Infinity) {
      return;
    }

    this.refillBucket(bucket);

    // If tokens available, take one and proceed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Calculate wait time until next token
    const tokensPerMs = bucket.config.requestsPerMinute / 60000;
    const waitTimeMs = Math.ceil((1 - bucket.tokens) / tokensPerMs);

    await this.sleep(waitTimeMs);

    // Refill after wait and take token
    this.refillBucket(bucket);
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  }

  /**
   * Check if a provider is rate limited without acquiring.
   *
   * @param provider - Provider ID to check
   * @returns True if rate limited, false if a request can proceed
   */
  isRateLimited(provider: string): boolean {
    const bucket = this.buckets.get(provider);
    if (!bucket || bucket.config.requestsPerMinute === Infinity) {
      return false;
    }
    this.refillBucket(bucket);
    return bucket.tokens < 1;
  }

  /**
   * Get remaining tokens for a provider.
   *
   * @param provider - Provider ID
   * @returns Number of remaining tokens, or Infinity if no limit
   */
  getRemainingTokens(provider: string): number {
    const bucket = this.buckets.get(provider);
    if (!bucket || bucket.config.requestsPerMinute === Infinity) {
      return Infinity;
    }
    this.refillBucket(bucket);
    return Math.floor(bucket.tokens);
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refillBucket(bucket: BucketState): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const tokensPerMs = bucket.config.requestsPerMinute / 60000;
    const newTokens = elapsed * tokensPerMs;

    bucket.tokens = Math.min(bucket.config.burstSize, bucket.tokens + newTokens);
    bucket.lastRefill = now;
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
