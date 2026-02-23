/**
 * Paid API tests for Anthropic adapter.
 *
 * These tests hit the real Anthropic API and cost money.
 * They are excluded from `pnpm test` by default.
 *
 * Run explicitly with:
 *   pnpm test:paid
 *   # or for just this file:
 *   pnpm --filter @rlm/core test:paid anthropic.paid.test.ts
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { describe, it, expect } from 'vitest';
import { AnthropicAdapter } from '../../src/llm/adapters/anthropic.js';

const API_KEY = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!API_KEY)('AnthropicAdapter (paid API tests)', () => {
  it('should complete a simple prompt', async () => {
    const adapter = new AnthropicAdapter({ apiKey: API_KEY! });

    const response = await adapter.complete({
      model: 'claude-3-haiku-20240307', // Use cheapest model
      systemPrompt: 'You are a helpful assistant. Be very brief.',
      userPrompt: 'What is 2+2? Reply with just the number.',
      maxTokens: 10,
    });

    expect(response.content).toContain('4');
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
    expect(response.cost).toBeGreaterThan(0);
  }, 30000);

  it('should respect inference options', async () => {
    const adapter = new AnthropicAdapter({ apiKey: API_KEY! });

    const response = await adapter.complete({
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'You are helpful.',
      userPrompt: 'Say "hello"',
      maxTokens: 10,
      inference: {
        temperature: 0, // Deterministic
      },
    });

    expect(response.content.toLowerCase()).toContain('hello');
  }, 30000);
});
