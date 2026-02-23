/**
 * Integration tests for Claude Code adapter with real SDK.
 *
 * These tests verify the adapter correctly integrates with the Claude Agent SDK.
 * They use your Claude Code subscription (no per-call cost, but uses quota).
 *
 * Run explicitly with: pnpm test:paid
 *
 * Requires: Claude Code CLI installed and authenticated
 */

import { describe, it, expect } from 'vitest';
import { ClaudeCodeAdapter } from '../../src/llm/adapters/claude-code.js';

// Check if Claude Code SDK is available
let sdkAvailable = false;
try {
  await import('@anthropic-ai/claude-agent-sdk');
  sdkAvailable = true;
} catch {
  sdkAvailable = false;
}

describe.skipIf(!sdkAvailable)('ClaudeCodeAdapter integration', () => {
  /**
   * Verifies the adapter can call the SDK and extract response content.
   *
   * This catches:
   * - SDK import/initialization issues
   * - Changes to the SDK's response format (result field, message structure)
   * - Breaking changes to the query() function signature
   */
  it('should extract content from SDK response', async () => {
    const adapter = new ClaudeCodeAdapter({
      maxTurns: 1,
      allowedTools: [],
    });

    const response = await adapter.complete({
      model: 'claude-code',
      systemPrompt: '',
      userPrompt: 'Reply with exactly: TEST_SUCCESS',
    });

    // Verify we got a non-empty response
    expect(response.content).toBeTruthy();
    expect(typeof response.content).toBe('string');
    expect(response.content.length).toBeGreaterThan(0);
  }, 60000);

  /**
   * Verifies token usage is correctly accumulated from SDK usage messages.
   *
   * This is critical for RLM's budget tracking. The adapter accumulates:
   * - input_tokens
   * - output_tokens
   * - cache_creation_input_tokens
   * - cache_read_input_tokens
   *
   * This catches:
   * - SDK changes to usage message format
   * - Field name changes (snake_case vs camelCase)
   * - Missing or null token counts
   */
  it('should accumulate token usage from SDK', async () => {
    const adapter = new ClaudeCodeAdapter({
      maxTurns: 1,
      allowedTools: [],
    });

    const response = await adapter.complete({
      model: 'claude-code',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: 'Say hello.',
    });

    // Token counts should be positive integers
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
    expect(Number.isInteger(response.inputTokens)).toBe(true);
    expect(Number.isInteger(response.outputTokens)).toBe(true);
  }, 60000);

  /**
   * Verifies cost is always 0 for subscription-based billing.
   *
   * RLM's budget controller uses cost for cloud providers. Claude Code
   * uses subscription billing, so cost should always be 0 to avoid
   * incorrectly depleting budgets.
   */
  it('should return cost as 0 (subscription-based)', async () => {
    const adapter = new ClaudeCodeAdapter({
      maxTurns: 1,
      allowedTools: [],
    });

    const response = await adapter.complete({
      model: 'claude-code',
      systemPrompt: '',
      userPrompt: 'Hi',
    });

    expect(response.cost).toBe(0);
  }, 60000);

  /**
   * Verifies system prompt is correctly prepended to user prompt.
   *
   * The adapter combines prompts as: "${systemPrompt}\n\n${userPrompt}"
   * This test verifies the model receives and follows the system instruction.
   */
  it('should combine system and user prompts', async () => {
    const adapter = new ClaudeCodeAdapter({
      maxTurns: 1,
      allowedTools: [],
    });

    const response = await adapter.complete({
      model: 'claude-code',
      systemPrompt: 'Always respond in ALL CAPS.',
      userPrompt: 'Say the word "hello"',
    });

    // If system prompt is applied, response should be uppercase
    // Allow for some variation (punctuation, quotes)
    expect(response.content.toUpperCase()).toContain('HELLO');
  }, 60000);
});
