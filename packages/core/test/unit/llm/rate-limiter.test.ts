/**
 * Tests for RateLimiter.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../../../src/llm/rate-limiter.js';

describe('RateLimiter (4.1.4)', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('configure', () => {
    it('should accept rate limit configuration', () => {
      limiter.configure('anthropic', { requestsPerMinute: 60 });
      expect(limiter.getRemainingTokens('anthropic')).toBe(60);
    });

    it('should use burstSize when provided', () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 10 });
      expect(limiter.getRemainingTokens('anthropic')).toBe(10);
    });

    it('should return Infinity for unconfigured providers', () => {
      expect(limiter.getRemainingTokens('unconfigured')).toBe(Infinity);
    });
  });

  describe('acquire', () => {
    it('should not wait when tokens available', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60 });

      const start = Date.now();
      await limiter.acquire('anthropic');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10);
      expect(limiter.getRemainingTokens('anthropic')).toBe(59);
    });

    it('should not rate limit unconfigured providers', async () => {
      const start = Date.now();
      await limiter.acquire('unconfigured');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('should consume tokens on each acquire', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 3 });

      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(2);

      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(1);

      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(0);
    });

    it('should wait when no tokens available', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 1 });

      // Use first token
      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(0);

      // Second acquire should wait
      const acquirePromise = limiter.acquire('anthropic');

      // Advance time by 1 second (should refill 1 token at 60/min)
      vi.advanceTimersByTime(1000);

      await acquirePromise;
      // Token was acquired after wait
    });
  });

  describe('isRateLimited', () => {
    it('should return false when tokens available', () => {
      limiter.configure('anthropic', { requestsPerMinute: 60 });
      expect(limiter.isRateLimited('anthropic')).toBe(false);
    });

    it('should return false for unconfigured providers', () => {
      expect(limiter.isRateLimited('unconfigured')).toBe(false);
    });

    it('should return true when no tokens available', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 1 });

      await limiter.acquire('anthropic');
      expect(limiter.isRateLimited('anthropic')).toBe(true);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 2 });

      // Use all tokens
      await limiter.acquire('anthropic');
      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(0);

      // Advance 1 second (should refill 1 token at 60/min)
      vi.advanceTimersByTime(1000);
      expect(limiter.getRemainingTokens('anthropic')).toBe(1);

      // Advance another second
      vi.advanceTimersByTime(1000);
      expect(limiter.getRemainingTokens('anthropic')).toBe(2); // Capped at burstSize
    });

    it('should not exceed burstSize on refill', () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 5 });

      // Advance a lot of time
      vi.advanceTimersByTime(60000); // 1 minute

      expect(limiter.getRemainingTokens('anthropic')).toBe(5); // Still capped at burstSize
    });
  });

  describe('multiple providers', () => {
    it('should track rate limits independently per provider', async () => {
      limiter.configure('anthropic', { requestsPerMinute: 60, burstSize: 2 });
      limiter.configure('openai', { requestsPerMinute: 30, burstSize: 3 });

      await limiter.acquire('anthropic');
      expect(limiter.getRemainingTokens('anthropic')).toBe(1);
      expect(limiter.getRemainingTokens('openai')).toBe(3);

      await limiter.acquire('openai');
      expect(limiter.getRemainingTokens('anthropic')).toBe(1);
      expect(limiter.getRemainingTokens('openai')).toBe(2);
    });
  });
});
