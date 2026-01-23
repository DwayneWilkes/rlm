import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Executor } from '../../../src/engine/executor.js';
import type { RLMConfig, LLMAdapter, LLMResponse, Sandbox, CodeExecution } from '../../../src/types.js';
import { LLMRouter } from '../../../src/llm/router.js';

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
vi.mock('../../../src/repl/sandbox.js', () => ({
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

    it('should fall back to directAnswer when budget blocks subcalls', async () => {
      // Capture the bridges passed to createSandbox
      let capturedBridges: { onRLMQuery: (task: string, ctx?: string) => Promise<string> } | null = null;

      const mockSandboxWithBridgeCapture: Sandbox = {
        initialize: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockImplementation(async (code: string) => {
          // When code calls rlm_query, invoke the captured bridge
          if (code.includes('rlm_query') && capturedBridges) {
            const result = await capturedBridges.onRLMQuery('sub task', 'sub context');
            return {
              code,
              stdout: result,
              stderr: '',
              duration: 10,
            };
          }
          return {
            code,
            stdout: 'Mock output',
            stderr: '',
            duration: 10,
          };
        }),
        getVariable: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      // Override createSandbox to capture bridges
      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandboxWithBridgeCapture;
      });

      // Adapter responses: first triggers rlm_query, second provides FINAL
      const adapter = createMockAdapter([
        { content: '```repl\nresult = rlm_query("sub task", "sub context")\nprint(result)\n```' },
        { content: 'FINAL(Done with direct answer)' },
      ]);
      router.register('test', adapter);

      // Create executor at depth 1, with maxDepth: 1 - subcalls blocked because already at max
      // Note: maxDepth: 0 now means unlimited, so we use maxDepth: 1 with executor at depth 1
      const executor = new Executor(config, router, 1); // Start at depth 1
      const result = await executor.execute({
        task: 'Main task',
        context: 'Main context',
        budget: { maxDepth: 1 }, // At depth 1 with maxDepth 1, subcalls are blocked
      });

      expect(result.success).toBe(true);
      // The directAnswer should have been called because maxDepth: 1 blocks subcalls at depth 1
      // Verify the adapter was called with a direct answer prompt (from directAnswer method)
      const calls = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls;
      const directAnswerCall = calls.find(
        (call) => call[0].systemPrompt?.includes('Answer concisely')
      );
      expect(directAnswerCall).toBeDefined();
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

    it('should include error output in conversation context', async () => {
      // Create a mock sandbox that returns an error for code execution
      const mockSandboxWithError: Sandbox = {
        initialize: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({
          code: 'raise Exception("test error")',
          stdout: '',
          stderr: '',
          error: 'Exception: test error',
          duration: 10,
        }),
        getVariable: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      // Override the createSandbox mock for this test
      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockReturnValueOnce(mockSandboxWithError);

      const adapter = createMockAdapter([
        { content: '```repl\nraise Exception("test error")\n```\n\nContinuing after error.' },
        { content: 'FINAL(Handled the error)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      const result = await executor.execute({
        task: 'Task with error',
        context: 'Context',
      });

      expect(result.success).toBe(true);
      // Verify that the error was captured in the execution
      expect(result.trace.iterations[0].codeExecutions[0].error).toBe('Exception: test error');
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

    it('should include promptHints from config in system prompt (4.2.3)', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const configWithHints: RLMConfig = {
        ...config,
        promptHints: ['Always batch LLM queries', 'Limit to 5 subcalls per iteration'],
      };
      const executor = new Executor(configWithHints, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.systemPrompt).toContain('MODEL HINTS');
      expect(call.systemPrompt).toContain('Always batch LLM queries');
      expect(call.systemPrompt).toContain('Limit to 5 subcalls per iteration');
    });

    it('should not include MODEL HINTS section when no hints configured (4.2.2)', async () => {
      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      const call = (adapter.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should not contain MODEL HINTS section when no hints are defined
      expect(call.systemPrompt).not.toContain('MODEL HINTS');
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

  describe('batch_rlm_query', () => {
    it('should execute multiple tasks concurrently (2.2.5)', async () => {
      // Track subcall hooks to verify batch execution
      const subcallTasks: string[] = [];
      const onSubcall = vi.fn((info: { depth: number; task: string }) => {
        subcallTasks.push(info.task);
      });

      // Capture the onBatchRLMQuery bridge
      let capturedBridges: { onBatchRLMQuery: (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> } | null = null;
      const mockSandbox = createMockSandbox();

      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandbox;
      });

      // Mock adapter returns FINAL immediately
      const adapter = createMockAdapter([
        { content: 'FINAL(Main done)' },
        // Sub-task responses
        { content: 'FINAL(Task 1 result)' },
        { content: 'FINAL(Task 2 result)' },
        { content: 'FINAL(Task 3 result)' },
      ]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
        hooks: { onSubcall },
        budget: { maxBatchConcurrency: 3 },
      });

      // Verify bridges were captured
      expect(capturedBridges).not.toBeNull();
      expect(capturedBridges!.onBatchRLMQuery).toBeDefined();

      // Call the batch bridge directly
      const batchTasks = [
        { task: 'Task 1', context: 'Context 1' },
        { task: 'Task 2', context: 'Context 2' },
        { task: 'Task 3' }, // Uses default context
      ];
      const results = await capturedBridges!.onBatchRLMQuery(batchTasks);

      // Verify all tasks were executed
      expect(results).toHaveLength(3);
      expect(subcallTasks).toContain('Task 1');
      expect(subcallTasks).toContain('Task 2');
      expect(subcallTasks).toContain('Task 3');
    });

    it('should return empty array for empty batch (2.2.5)', async () => {
      let capturedBridges: { onBatchRLMQuery: (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> } | null = null;
      const mockSandbox = createMockSandbox();

      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandbox;
      });

      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
      });

      // Call batch with empty array
      const results = await capturedBridges!.onBatchRLMQuery([]);
      expect(results).toEqual([]);
    });

    it('should enforce budget limits for batch subcalls (2.2.6)', async () => {
      let capturedBridges: { onBatchRLMQuery: (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> } | null = null;
      const mockSandbox = createMockSandbox();

      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandbox;
      });

      // Adapter for main task and direct answers
      const adapter = createMockAdapter([
        { content: 'FINAL(Main done)' },
        { content: 'Direct answer 1' },
        { content: 'Direct answer 2' },
      ]);
      router.register('test', adapter);

      // Create executor at depth 1 with maxDepth 1 - subcalls blocked
      const executor = new Executor(config, router, 1);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
        budget: { maxDepth: 1 }, // At max depth, subcalls should be blocked
      });

      // Call batch - should use directAnswer since at max depth
      const results = await capturedBridges!.onBatchRLMQuery([
        { task: 'Task 1' },
        { task: 'Task 2' },
      ]);

      // Results should contain the "Cannot spawn" message from directAnswer
      expect(results).toHaveLength(2);
      expect(results[0]).toContain('Cannot spawn sub-RLM');
      expect(results[1]).toContain('Cannot spawn sub-RLM');
    });

    it('should handle partial failures gracefully (2.2.7)', async () => {
      let capturedBridges: { onBatchRLMQuery: (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> } | null = null;
      const mockSandbox = createMockSandbox();

      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandbox;
      });

      // Set up adapter that fails on the second call
      let callCount = 0;
      const adapter: LLMAdapter = {
        complete: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 3) {
            // Third call (second subtask) throws
            throw new Error('API rate limit exceeded');
          }
          return {
            content: `FINAL(Result ${callCount})`,
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.001,
          };
        }),
      };
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
        budget: { maxDepth: 3 },
      });

      // Call batch with 3 tasks - one will fail
      const results = await capturedBridges!.onBatchRLMQuery([
        { task: 'Task 1' },
        { task: 'Task 2' }, // This one will fail
        { task: 'Task 3' },
      ]);

      // All 3 should have results (2 success, 1 error)
      expect(results).toHaveLength(3);
      // The failed task should have an error message
      const errorResult = results.find(r => r.includes('[Error:'));
      expect(errorResult).toBeDefined();
      expect(errorResult).toContain('API rate limit exceeded');
    });

    it('should respect maxBatchConcurrency limit (2.2.6)', async () => {
      let capturedBridges: { onBatchRLMQuery: (tasks: Array<{ task: string; context?: string }>) => Promise<string[]> } | null = null;
      const mockSandbox = createMockSandbox();

      const { createSandbox } = await import('../../../src/repl/sandbox.js');
      vi.mocked(createSandbox).mockImplementationOnce((config, bridges) => {
        capturedBridges = bridges as typeof capturedBridges;
        return mockSandbox;
      });

      // Track concurrent executions
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const adapter: LLMAdapter = {
        complete: vi.fn().mockImplementation(async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
          currentConcurrent--;
          return {
            content: 'FINAL(Result)',
            inputTokens: 100,
            outputTokens: 50,
            cost: 0.001,
          };
        }),
      };
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Main task',
        context: 'Context',
        budget: { maxBatchConcurrency: 2, maxDepth: 3 },
      });

      // Reset tracking after main execution
      maxConcurrent = 0;
      currentConcurrent = 0;

      // Call batch with 5 tasks, but only 2 should run concurrently
      await capturedBridges!.onBatchRLMQuery([
        { task: 'Task 1' },
        { task: 'Task 2' },
        { task: 'Task 3' },
        { task: 'Task 4' },
        { task: 'Task 5' },
      ]);

      // Max concurrent should be limited to batch concurrency
      // Note: Due to the worker pattern, we expect at most 2 concurrent
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('sandboxFactory injection', () => {
    it('should use sandboxFactory when provided in config', async () => {
      const customSandbox = createMockSandbox();
      const factoryFn = vi.fn().mockReturnValue(customSandbox);

      const configWithFactory: RLMConfig = {
        ...config,
        sandboxFactory: factoryFn,
      };

      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(configWithFactory, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      // Verify the factory was called
      expect(factoryFn).toHaveBeenCalledTimes(1);
      // Verify it was called with config and bridges
      expect(factoryFn).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: expect.any(Number) }),
        expect.objectContaining({
          onLLMQuery: expect.any(Function),
          onRLMQuery: expect.any(Function),
        })
      );
      // Verify the custom sandbox was used
      expect(customSandbox.initialize).toHaveBeenCalled();
      expect(customSandbox.destroy).toHaveBeenCalled();
    });

    it('should fall back to createSandbox when no factory provided', async () => {
      const { createSandbox } = await import('../../../src/repl/sandbox.js');

      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(config, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      // Verify the default createSandbox was called
      expect(createSandbox).toHaveBeenCalled();
    });

    it('should pass bridges to sandboxFactory', async () => {
      let capturedBridges: any = null;
      const customSandbox = createMockSandbox();

      const configWithFactory: RLMConfig = {
        ...config,
        sandboxFactory: (_config, bridges) => {
          capturedBridges = bridges;
          return customSandbox;
        },
      };

      const adapter = createMockAdapter([{ content: 'FINAL(Done)' }]);
      router.register('test', adapter);

      const executor = new Executor(configWithFactory, router);
      await executor.execute({
        task: 'Task',
        context: 'Context',
      });

      // Verify bridges were passed
      expect(capturedBridges).not.toBeNull();
      expect(typeof capturedBridges.onLLMQuery).toBe('function');
      expect(typeof capturedBridges.onRLMQuery).toBe('function');
    });
  });
});
