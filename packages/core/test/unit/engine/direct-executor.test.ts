import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectExecutor } from '../../../src/engine/direct-executor.js';
import type { RLMConfig, LLMAdapter, LLMResponse } from '../../../src/types.js';
import { LLMRouter } from '../../../src/llm/router.js';

function createMockAdapter(responses: Partial<LLMResponse>[] = []): LLMAdapter {
  let callIndex = 0;
  const defaultResponse: LLMResponse = {
    content: 'Analysis result',
    inputTokens: 1000,
    outputTokens: 500,
    cost: 0.01,
  };

  return {
    complete: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] ?? defaultResponse;
      callIndex++;
      return { ...defaultResponse, ...response };
    }),
  };
}

describe('DirectExecutor', () => {
  let router: LLMRouter;
  let config: RLMConfig;

  beforeEach(() => {
    router = new LLMRouter('test');
    config = { provider: 'test', model: 'test-model' };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should send full context in a single LLM call', async () => {
    const adapter = createMockAdapter([
      { content: 'Scholarly analysis of the paper...', inputTokens: 5000, outputTokens: 2000, cost: 0.05 },
    ]);
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    const result = await executor.execute({
      task: 'Summarize this paper',
      context: 'Full paper text here...',
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Scholarly analysis of the paper...');
    expect(result.trace.answerSource).toBe('final_direct');
    expect(result.trace.iterations).toHaveLength(1);

    // Verify the full context was sent
    const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.userPrompt).toContain('Full paper text here...');
    expect(call.userPrompt).toContain('Summarize this paper');
  });

  it('should return single-iteration trace', async () => {
    const adapter = createMockAdapter([
      { content: 'Result', inputTokens: 100, outputTokens: 50, cost: 0.001 },
    ]);
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    const result = await executor.execute({
      task: 'Analyze',
      context: 'Content',
    });

    expect(result.trace.iterations).toHaveLength(1);
    expect(result.trace.iterations[0].index).toBe(0);
    expect(result.trace.iterations[0].codeExecutions).toHaveLength(0);
    expect(result.usage.iterations).toBe(1);
    expect(result.usage.subcalls).toBe(0);
  });

  it('should use custom systemPrompt when provided', async () => {
    const adapter = createMockAdapter();
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    await executor.execute({
      task: 'Task',
      context: 'Context',
      systemPrompt: 'You are a custom analyst.',
    });

    const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.systemPrompt).toBe('You are a custom analyst.');
  });

  it('should use default systemPrompt when none provided', async () => {
    const adapter = createMockAdapter();
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    await executor.execute({
      task: 'Task',
      context: 'Context',
    });

    const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.systemPrompt).toContain('research analyst');
  });

  it('should track usage correctly', async () => {
    const adapter = createMockAdapter([
      { content: 'Result', inputTokens: 5000, outputTokens: 2000, cost: 0.05 },
    ]);
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    const result = await executor.execute({
      task: 'Task',
      context: 'Context',
    });

    expect(result.usage.inputTokens).toBe(5000);
    expect(result.usage.outputTokens).toBe(2000);
    expect(result.usage.tokens).toBe(7000);
    expect(result.usage.cost).toBe(0.05);
    expect(result.usage.duration).toBeGreaterThanOrEqual(0);
  });

  it('should pass inference options to router', async () => {
    const adapter = createMockAdapter();
    router.register('test', adapter);

    const configWithInference: RLMConfig = {
      ...config,
      inference: { temperature: 0.3 },
    };

    const executor = new DirectExecutor(configWithInference, router);
    await executor.execute({
      task: 'Task',
      context: 'Context',
    });

    const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.inference).toEqual({ temperature: 0.3 });
  });

  it('should return error result on LLM failure', async () => {
    const adapter: LLMAdapter = {
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    };
    router.register('test', adapter);

    const executor = new DirectExecutor(config, router);
    const result = await executor.execute({
      task: 'Task',
      context: 'Context',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('API error');
    expect(result.trace.answerSource).toBe('error');
  });
});
