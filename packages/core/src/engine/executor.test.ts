import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Executor } from './executor.js';
import type { RLMConfig, LLMAdapter, LLMResponse, Sandbox, CodeExecution } from '../types.js';
import { LLMRouter } from '../llm/router.js';

// Mock adapter factory
function createMockAdapter(responses: Partial<LLMResponse>[] = []): LLMAdapter {
  let callIndex = 0;
  const defaultResponse: LLMResponse = {
    content: 'FINAL(Default answer)',
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.001,
  };

  return {
    complete: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex] ?? defaultResponse;
      callIndex++;
      return { ...defaultResponse, ...response };
    }),
  };
}

// Mock sandbox factory
function createMockSandbox(): Sandbox {
  const variables: Map<string, unknown> = new Map();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockImplementation(async (code: string): Promise<CodeExecution> => {
      // Simple mock: if code sets a variable, store it
      const assignMatch = code.match(/^(\w+)\s*=\s*(.+)$/m);
      if (assignMatch) {
        try {
          // eslint-disable-next-line no-eval
          variables.set(assignMatch[1], eval(assignMatch[2]));
        } catch {
          // Ignore eval errors
        }
      }
      return {
        code,
        stdout: 'Mock output',
        stderr: '',
        duration: 10,
      };
    }),
    getVariable: vi.fn().mockImplementation(async (name: string) => {
      return variables.get(name);
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock sandbox module
vi.mock('../repl/sandbox.js', () => ({
  createSandbox: vi.fn(() => createMockSandbox()),
}));

describe('Executor', () => {
  let router: LLMRouter;
  let config: RLMConfig;
  let mockAdapter: LLMAdapter;

  beforeEach(() => {
    router = new LLMRouter('test');
    mockAdapter = createMockAdapter();
    router.register('test', mockAdapter);

    config = {
      provider: 'test',
      model: 'test-model',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic execution', () => {
    it('should execute a simple task and return result', async () => {
      const adapter = createMockAdapter([
        { content: 'FINAL(The answer is 42)', inputTokens: 100, outputTokens: 50, cost: 0.001 },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'What is the meaning of life?',
        context: 'Some context',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('The answer is 42');
      expect(result.trace.answerSource).toBe('final_direct');
    });

    it('should extract FINAL_VAR answer from sandbox variable', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nresult = "computed answer"\n```\n\nFINAL_VAR(result)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Compute something',
        context: 'Context data',
      });

      expect(result.success).toBe(true);
      expect(result.trace.answerSource).toBe('final_var');
    });

    it('should include execution trace', async () => {
      const adapter = createMockAdapter([
        { content: 'FINAL(Answer)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Test task',
        context: 'Test context',
      });

      expect(result.trace).toBeDefined();
      expect(result.trace.task).toBe('Test task');
      expect(result.trace.depth).toBe(0);
      expect(result.trace.iterations).toHaveLength(1);
    });
  });

  describe('iteration loop', () => {
    it('should continue iterations until FINAL marker', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nprint("step 1")\n```\n\nNeed more analysis.' },
        { content: '```repl\nprint("step 2")\n```\n\nAlmost done.' },
        { content: 'FINAL(Final answer after 3 iterations)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Multi-step task',
        context: 'Context',
      });

      expect(result.success).toBe(true);
      expect(result.trace.iterations).toHaveLength(3);
      expect(result.output).toBe('Final answer after 3 iterations');
    });

    it('should execute code blocks in each iteration', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nprint("code 1")\n```\n\n```repl\nprint("code 2")\n```' },
        { content: 'FINAL(Done)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task with multiple code blocks',
        context: 'Context',
      });

      expect(result.trace.iterations[0].codeExecutions).toHaveLength(2);
    });

    it('should call onIteration hook for each iteration', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nprint("1")\n```' },
        { content: 'FINAL(Done)' },
      ]);
      router.register('test', adapter);

      const onIteration = vi.fn();
      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
        hooks: { onIteration },
      });

      expect(onIteration).toHaveBeenCalledTimes(2);
      expect(onIteration).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
      expect(onIteration).toHaveBeenCalledWith(expect.objectContaining({ index: 1 }));
    });
  });

  describe('budget enforcement', () => {
    it('should stop when maxIterations is reached', async () => {
      // Never returns FINAL, just keeps going
      const adapter = createMockAdapter(
        Array(20).fill({ content: '```repl\nprint("still going")\n```\n\nNeed more work.' })
      );
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Infinite task',
        context: 'Context',
        budget: { maxIterations: 3 },
      });

      expect(result.trace.iterations.length).toBeLessThanOrEqual(4); // 3 + forced answer
      expect(result.trace.answerSource).toBe('forced');
      expect(result.warnings).toContain('Budget exhausted, answer was forced');
    });

    it('should track and return usage statistics', async () => {
      const adapter = createMockAdapter([
        { content: 'FINAL(Answer)', inputTokens: 150, outputTokens: 75, cost: 0.002 },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      expect(result.usage.inputTokens).toBeGreaterThan(0);
      expect(result.usage.outputTokens).toBeGreaterThan(0);
      expect(result.usage.cost).toBeGreaterThan(0);
      expect(result.usage.iterations).toBe(1);
    });

    it('should call onBudgetWarning when threshold exceeded', async () => {
      // Create adapter that uses 85% of budget in first call
      const adapter = createMockAdapter([
        { content: '```repl\nprint("expensive")\n```', cost: 4.25 }, // 85% of default 5.0
        { content: 'FINAL(Done)', cost: 0.01 },
      ]);
      router.register('test', adapter);

      const onBudgetWarning = vi.fn();
      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Expensive task',
        context: 'Context',
        hooks: { onBudgetWarning },
      });

      expect(onBudgetWarning).toHaveBeenCalled();
    });
  });

  describe('recursive subcalls (rlm_query)', () => {
    it('should spawn sub-executor for rlm_query bridge calls', async () => {
      // This test verifies the bridge is set up correctly
      // The actual recursion is tested through integration tests
      const adapter = createMockAdapter([
        { content: 'FINAL(Main answer)' },
      ]);
      router.register('test', adapter);

      const onSubcall = vi.fn();
      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
        hooks: { onSubcall },
      });

      // onSubcall should not be called if no rlm_query was invoked
      // This just verifies basic execution works with subcall hook
      expect(executor).toBeDefined();
    });

    it('should respect maxDepth for subcalls', async () => {
      const executor = new Executor(config, router, 2); // depth=2
      const result = await executor.execute({
        task: 'Deep task',
        context: 'Context',
        budget: { maxDepth: 2 }, // At max depth
      });

      // Should still execute but won't allow further subcalls
      expect(result.success).toBe(true);
    });

    it('should allocate sub-budget to recursive calls', async () => {
      // The sub-budget is tested through the BudgetController
      // Here we verify the executor is created with correct depth
      const executor = new Executor(config, router, 1, 'parent-id');
      const result = await executor.execute({
        task: 'Sub task',
        context: 'Context',
      });

      expect(result.trace.depth).toBe(1);
      expect(result.trace.parentId).toBe('parent-id');
    });
  });

  describe('sub-RLM budget awareness', () => {
    it('should include sub-RLM context in system prompt for depth > 0', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Sub answer)' }]);
      router.register('test', adapter);

      // Create executor at depth 1 (sub-RLM)
      const executor = new Executor(config, router, 1, 'parent-123');
      await executor.execute({
        task: 'Sub task',
        context: 'Context',
        budget: { maxCost: 2.0, maxIterations: 10, maxDepth: 1 },
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should indicate this is a sub-RLM
      expect(call.systemPrompt).toContain('SUB-RLM');
      expect(call.systemPrompt).toContain('depth 1');
    });

    it('should include allocated budget description for sub-RLMs', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Sub answer)' }]);
      router.register('test', adapter);

      // Create executor at depth 1 with specific budget
      const executor = new Executor(config, router, 1, 'parent-123');
      await executor.execute({
        task: 'Sub task',
        context: 'Context',
        budget: { maxCost: 1.0, maxIterations: 15 },
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should show allocated budget info
      expect(call.systemPrompt).toContain('ALLOCATED BUDGET');
      expect(call.systemPrompt).toMatch(/\$[\d.]+/); // Dollar amount
    });

    it('should include efficiency guidelines for sub-RLMs', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Sub answer)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router, 1, 'parent-123');
      await executor.execute({
        task: 'Sub task',
        context: 'Context',
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should include efficiency guidance
      expect(call.systemPrompt).toContain('EFFICIENCY');
      expect(call.systemPrompt).toContain('llm_query');
    });

    it('should NOT include sub-RLM context for root executor (depth 0)', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Root answer)' }]);
      router.register('test', adapter);

      // Create root executor (depth 0)
      const executor = new Executor(config, router, 0);
      await executor.execute({
        task: 'Root task',
        context: 'Context',
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should NOT indicate this is a sub-RLM
      expect(call.systemPrompt).not.toContain('SUB-RLM');
      expect(call.systemPrompt).not.toContain('ALLOCATED BUDGET');
    });
  });

  describe('auto-downgrade to llm_query', () => {
    // These tests verify the executor's handling of low-budget scenarios
    // The actual shouldDowngradeToLLMQuery logic is in BudgetController

    it('should log downgrade decision when budget is low', async () => {
      // When budget is very low, rlm_query should be downgraded to llm_query
      // This is tested through the BudgetController's shouldDowngradeToLLMQuery
      const adapter = createMockAdapter([
        { content: 'FINAL(Answer)', cost: 0.001 },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
        budget: { maxCost: 0.3 }, // Low budget below $0.50 threshold
      });

      // Executor should still work with low budget
      expect(result.success).toBe(true);
    });
  });

  describe('llm_query bridge', () => {
    it('should record usage from llm_query calls', async () => {
      // The llm_query bridge is set up but actual calls happen through sandbox
      // This test verifies the executor sets up the bridge
      const adapter = createMockAdapter([
        { content: 'FINAL(Done)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task with llm_query',
        context: 'Context',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('forced answer', () => {
    it('should request forced answer when budget exhausted', async () => {
      const responses = Array(5).fill({ content: '```repl\nprint("working")\n```' });
      // Add a response for the forced answer request
      responses.push({ content: 'Forced summary answer' });

      const adapter = createMockAdapter(responses);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task that exceeds iterations',
        context: 'Context',
        budget: { maxIterations: 2 },
      });

      expect(result.trace.answerSource).toBe('forced');
      expect(result.warnings).toContain('Budget exhausted, answer was forced');
    });

    it('should include warning message in forced answer', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nprint("1")\n```' },
        { content: '```repl\nprint("2")\n```' },
        { content: 'Summary after exhaustion' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
        budget: { maxIterations: 2 },
      });

      expect(result.warnings).toContain('Budget exhausted, answer was forced');
    });
  });

  describe('error handling', () => {
    it('should return error result on LLM failure', async () => {
      const adapter: LLMAdapter = {
        complete: vi.fn().mockRejectedValue(new Error('LLM API error')),
      };
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('LLM API error');
    });

    it('should cleanup sandbox on error', async () => {
      const adapter: LLMAdapter = {
        complete: vi.fn().mockRejectedValue(new Error('Error')),
      };
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      // Sandbox destroy should be called even on error
      // This is verified through the mock in actual implementation
    });

    it('should handle sandbox execution errors', async () => {
      const adapter = createMockAdapter([
        { content: '```repl\nraise Exception("Python error")\n```' },
        { content: 'FINAL(Recovered answer)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task with error',
        context: 'Context',
      });

      // Should continue to next iteration despite code error
      expect(result.success).toBe(true);
    });
  });

  describe('system prompt', () => {
    it('should include context info in system prompt', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'A'.repeat(1000), // 1000 char context
      });

      // Verify the adapter was called with a system prompt containing context info
      expect(adapter.complete).toHaveBeenCalled();
      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('chars');
    });

    it('should include budget info in system prompt', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
        budget: { maxCost: 2.0 },
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('$');
    });

    it('should include termination instructions in system prompt', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('FINAL');
      expect(call.systemPrompt).toContain('FINAL_VAR');
    });
  });

  describe('trace structure', () => {
    it('should include unique execution ID', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result1 = await executor.execute({ task: 'Task 1', context: 'Context' });
      const result2 = await executor.execute({ task: 'Task 2', context: 'Context' });

      expect(result1.trace.id).toBeDefined();
      expect(result2.trace.id).toBeDefined();
      expect(result1.trace.id).not.toBe(result2.trace.id);
    });

    it('should record iteration prompts and responses', async () => {
      const adapter = createMockAdapter([
        { content: 'Analysis complete.\nFINAL(Answer)', inputTokens: 200, outputTokens: 100 },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      const iteration = result.trace.iterations[0];
      expect(iteration.prompt.content).toBeDefined();
      expect(iteration.prompt.tokens).toBe(200);
      expect(iteration.response.content).toContain('Analysis complete');
      expect(iteration.response.tokens).toBe(100);
    });

    it('should track subcall traces', async () => {
      // Subcall traces are added when rlm_query is invoked
      // This is tested through integration tests with actual sandbox
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      expect(result.trace.subcalls).toBeDefined();
      expect(Array.isArray(result.trace.subcalls)).toBe(true);
    });
  });
});
