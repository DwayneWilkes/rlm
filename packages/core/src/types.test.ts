/**
 * @fileoverview Tests for @rlm/core type definitions and default values.
 *
 * These tests verify:
 * 1. All types are exported and usable
 * 2. Default values have correct structure and values
 * 3. Type relationships are correct
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  // Configuration types
  type RLMConfig,
  type Budget,
  type REPLConfig,
  type SandboxFactory,
  type SandboxInterface,
  type SandboxBridgesInterface,
  // Execution types
  type ExecuteOptions,
  type ExecutionHooks,
  // Result types
  type RLMResult,
  type Usage,
  type ExecutionTrace,
  type Iteration,
  type CodeExecution,
  // LLM types
  type LLMAdapter,
  type LLMRequest,
  type LLMResponse,
  // Default values
  DEFAULT_BUDGET,
  DEFAULT_REPL_CONFIG,
} from './types.js';

describe('types', () => {
  describe('Configuration Types', () => {
    describe('RLMConfig', () => {
      it('should have required provider and model fields', () => {
        const config: RLMConfig = {
          provider: 'ollama',
          model: 'llama3.2',
        };

        expect(config.provider).toBe('ollama');
        expect(config.model).toBe('llama3.2');
      });

      it('should accept optional providerOptions', () => {
        const config: RLMConfig = {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          providerOptions: {
            baseUrl: 'http://localhost:11434',
            apiKey: 'test-key',
          },
        };

        expect(config.providerOptions?.baseUrl).toBe('http://localhost:11434');
        expect(config.providerOptions?.apiKey).toBe('test-key');
      });

      it('should accept optional subcallModel', () => {
        const config: RLMConfig = {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          subcallModel: 'claude-haiku-3-20240307',
        };

        expect(config.subcallModel).toBe('claude-haiku-3-20240307');
      });

      it('should accept optional defaultBudget as Partial<Budget>', () => {
        const config: RLMConfig = {
          provider: 'ollama',
          model: 'llama3.2',
          defaultBudget: { maxCost: 10.0 },
        };

        expect(config.defaultBudget?.maxCost).toBe(10.0);
      });

      it('should accept optional repl as Partial<REPLConfig>', () => {
        const config: RLMConfig = {
          provider: 'ollama',
          model: 'llama3.2',
          repl: { timeout: 60000 },
        };

        expect(config.repl?.timeout).toBe(60000);
      });

      it('should accept optional sandboxFactory', () => {
        const mockSandbox: SandboxInterface = {
          initialize: async () => {},
          execute: async () => ({ code: '', stdout: '', stderr: '', duration: 0 }),
          getVariable: async () => undefined,
          cancel: async () => {},
          destroy: async () => {},
        };

        const factory: SandboxFactory = () => mockSandbox;

        const config: RLMConfig = {
          provider: 'ollama',
          model: 'llama3.2',
          sandboxFactory: factory,
        };

        expect(config.sandboxFactory).toBeDefined();
        expect(typeof config.sandboxFactory).toBe('function');
      });
    });

    describe('SandboxFactory', () => {
      it('should be a function that takes REPLConfig and SandboxBridgesInterface', () => {
        const mockSandbox: SandboxInterface = {
          initialize: async () => {},
          execute: async () => ({ code: '', stdout: '', stderr: '', duration: 0 }),
          getVariable: async () => undefined,
          cancel: async () => {},
          destroy: async () => {},
        };

        const factory: SandboxFactory = (config: REPLConfig, bridges: SandboxBridgesInterface) => {
          expect(config.timeout).toBeDefined();
          expect(bridges.onLLMQuery).toBeDefined();
          return mockSandbox;
        };

        const result = factory(
          { timeout: 30000, maxOutputLength: 50000 },
          {
            onLLMQuery: async () => 'response',
            onRLMQuery: async () => 'result',
          }
        );

        expect(result).toBe(mockSandbox);
      });

      it('should return a SandboxInterface instance', () => {
        const mockSandbox: SandboxInterface = {
          initialize: async () => {},
          execute: async () => ({ code: '', stdout: '', stderr: '', duration: 0 }),
          getVariable: async () => undefined,
          cancel: async () => {},
          destroy: async () => {},
        };

        const factory: SandboxFactory = () => mockSandbox;
        const sandbox = factory(
          DEFAULT_REPL_CONFIG,
          { onLLMQuery: async () => '', onRLMQuery: async () => '' }
        );

        expect(sandbox.initialize).toBeDefined();
        expect(sandbox.execute).toBeDefined();
        expect(sandbox.destroy).toBeDefined();
      });
    });

    describe('Budget', () => {
      it('should have all required fields', () => {
        const budget: Budget = {
          maxCost: 5.0,
          maxTokens: 500000,
          maxTime: 300000,
          maxDepth: 2,
          maxIterations: 30,
        };

        expect(budget.maxCost).toBe(5.0);
        expect(budget.maxTokens).toBe(500000);
        expect(budget.maxTime).toBe(300000);
        expect(budget.maxDepth).toBe(2);
        expect(budget.maxIterations).toBe(30);
      });
    });

    describe('REPLConfig', () => {
      it('should have timeout and maxOutputLength fields', () => {
        const replConfig: REPLConfig = {
          timeout: 30000,
          maxOutputLength: 50000,
        };

        expect(replConfig.timeout).toBe(30000);
        expect(replConfig.maxOutputLength).toBe(50000);
      });
    });
  });

  describe('Execution Types', () => {
    describe('ExecuteOptions', () => {
      it('should have required task and context fields', () => {
        const options: ExecuteOptions = {
          task: 'Analyze this code',
          context: 'const x = 1;',
        };

        expect(options.task).toBe('Analyze this code');
        expect(options.context).toBe('const x = 1;');
      });

      it('should accept optional budget override', () => {
        const options: ExecuteOptions = {
          task: 'Test',
          context: 'Test context',
          budget: { maxCost: 1.0 },
        };

        expect(options.budget?.maxCost).toBe(1.0);
      });

      it('should accept optional hooks', () => {
        const iterations: number[] = [];
        const options: ExecuteOptions = {
          task: 'Test',
          context: 'Test context',
          hooks: {
            onIteration: (iter) => iterations.push(iter.index),
          },
        };

        expect(options.hooks?.onIteration).toBeDefined();
      });
    });

    describe('ExecutionHooks', () => {
      it('should have optional callback functions', () => {
        const hooks: ExecutionHooks = {
          onIteration: (iteration) => {
            console.log(iteration.index);
          },
          onSubcall: (info) => {
            console.log(info.depth, info.task);
          },
          onBudgetWarning: (warning) => {
            console.warn(warning);
          },
        };

        expect(hooks.onIteration).toBeDefined();
        expect(hooks.onSubcall).toBeDefined();
        expect(hooks.onBudgetWarning).toBeDefined();
      });

      it('should allow partial hooks', () => {
        const hooks: ExecutionHooks = {
          onIteration: () => {},
        };

        expect(hooks.onIteration).toBeDefined();
        expect(hooks.onSubcall).toBeUndefined();
      });
    });
  });

  describe('Result Types', () => {
    describe('RLMResult', () => {
      it('should have all required fields for success case', () => {
        const result: RLMResult = {
          success: true,
          output: 'The answer is 42',
          trace: {
            id: 'test-id',
            depth: 0,
            task: 'Test task',
            iterations: [],
            subcalls: [],
            finalAnswer: 'The answer is 42',
            answerSource: 'final_direct',
          },
          usage: {
            cost: 0.01,
            tokens: 1000,
            inputTokens: 500,
            outputTokens: 500,
            duration: 5000,
            iterations: 3,
            subcalls: 0,
            maxDepthReached: 0,
          },
          warnings: [],
        };

        expect(result.success).toBe(true);
        expect(result.output).toBe('The answer is 42');
        expect(result.error).toBeUndefined();
      });

      it('should have optional error field for failure case', () => {
        const result: RLMResult = {
          success: false,
          output: '',
          trace: {
            id: 'test-id',
            depth: 0,
            task: 'Test task',
            iterations: [],
            subcalls: [],
            finalAnswer: '',
            answerSource: 'error',
          },
          usage: {
            cost: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            duration: 100,
            iterations: 0,
            subcalls: 0,
            maxDepthReached: 0,
          },
          warnings: [],
          error: new Error('Test error'),
        };

        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error?.message).toBe('Test error');
      });
    });

    describe('Usage', () => {
      it('should have all tracking fields', () => {
        const usage: Usage = {
          cost: 0.05,
          tokens: 10000,
          inputTokens: 6000,
          outputTokens: 4000,
          duration: 30000,
          iterations: 5,
          subcalls: 2,
          maxDepthReached: 1,
        };

        expect(usage.cost).toBe(0.05);
        expect(usage.tokens).toBe(10000);
        expect(usage.inputTokens).toBe(6000);
        expect(usage.outputTokens).toBe(4000);
        expect(usage.duration).toBe(30000);
        expect(usage.iterations).toBe(5);
        expect(usage.subcalls).toBe(2);
        expect(usage.maxDepthReached).toBe(1);
      });
    });

    describe('ExecutionTrace', () => {
      it('should have all required fields', () => {
        const trace: ExecutionTrace = {
          id: 'exec-123',
          depth: 0,
          task: 'Analyze data',
          iterations: [],
          subcalls: [],
          finalAnswer: 'Analysis complete',
          answerSource: 'final_direct',
        };

        expect(trace.id).toBe('exec-123');
        expect(trace.parentId).toBeUndefined();
        expect(trace.depth).toBe(0);
      });

      it('should have optional parentId for subcalls', () => {
        const trace: ExecutionTrace = {
          id: 'exec-456',
          parentId: 'exec-123',
          depth: 1,
          task: 'Sub-task',
          iterations: [],
          subcalls: [],
          finalAnswer: 'Sub-result',
          answerSource: 'final_var',
        };

        expect(trace.parentId).toBe('exec-123');
        expect(trace.depth).toBe(1);
      });

      it('should support all answerSource values', () => {
        const sources: ExecutionTrace['answerSource'][] = [
          'final_direct',
          'final_var',
          'forced',
          'error',
        ];

        sources.forEach((source) => {
          const trace: ExecutionTrace = {
            id: 'test',
            depth: 0,
            task: 'test',
            iterations: [],
            subcalls: [],
            finalAnswer: '',
            answerSource: source,
          };
          expect(trace.answerSource).toBe(source);
        });
      });
    });

    describe('Iteration', () => {
      it('should have all required fields', () => {
        const iteration: Iteration = {
          index: 0,
          prompt: { content: 'Test prompt', tokens: 100 },
          response: { content: 'Test response', tokens: 50, cost: 0.001 },
          codeExecutions: [],
        };

        expect(iteration.index).toBe(0);
        expect(iteration.prompt.content).toBe('Test prompt');
        expect(iteration.prompt.tokens).toBe(100);
        expect(iteration.response.content).toBe('Test response');
        expect(iteration.response.tokens).toBe(50);
        expect(iteration.response.cost).toBe(0.001);
      });
    });

    describe('CodeExecution', () => {
      it('should have required fields', () => {
        const execution: CodeExecution = {
          code: 'print("hello")',
          stdout: 'hello\n',
          stderr: '',
          duration: 50,
        };

        expect(execution.code).toBe('print("hello")');
        expect(execution.stdout).toBe('hello\n');
        expect(execution.stderr).toBe('');
        expect(execution.error).toBeUndefined();
        expect(execution.duration).toBe(50);
      });

      it('should have optional error field', () => {
        const execution: CodeExecution = {
          code: 'raise Exception("test")',
          stdout: '',
          stderr: '',
          error: 'Exception: test',
          duration: 10,
        };

        expect(execution.error).toBe('Exception: test');
      });
    });
  });

  describe('LLM Abstraction Types', () => {
    describe('LLMAdapter', () => {
      it('should require complete method', async () => {
        const mockAdapter: LLMAdapter = {
          complete: async (request: LLMRequest): Promise<LLMResponse> => ({
            content: 'Test response',
            inputTokens: 10,
            outputTokens: 5,
            cost: 0.0001,
          }),
        };

        const response = await mockAdapter.complete({
          model: 'test-model',
          systemPrompt: 'System',
          userPrompt: 'User',
        });

        expect(response.content).toBe('Test response');
      });
    });

    describe('LLMRequest', () => {
      it('should have required fields', () => {
        const request: LLMRequest = {
          model: 'llama3.2',
          systemPrompt: 'You are a helpful assistant.',
          userPrompt: 'What is 2+2?',
        };

        expect(request.model).toBe('llama3.2');
        expect(request.systemPrompt).toBe('You are a helpful assistant.');
        expect(request.userPrompt).toBe('What is 2+2?');
        expect(request.maxTokens).toBeUndefined();
      });

      it('should accept optional maxTokens', () => {
        const request: LLMRequest = {
          model: 'llama3.2',
          systemPrompt: 'System',
          userPrompt: 'User',
          maxTokens: 4096,
        };

        expect(request.maxTokens).toBe(4096);
      });
    });

    describe('LLMResponse', () => {
      it('should have all required fields', () => {
        const response: LLMResponse = {
          content: 'The answer is 4.',
          inputTokens: 20,
          outputTokens: 10,
          cost: 0.0005,
        };

        expect(response.content).toBe('The answer is 4.');
        expect(response.inputTokens).toBe(20);
        expect(response.outputTokens).toBe(10);
        expect(response.cost).toBe(0.0005);
      });
    });
  });

  describe('Default Values', () => {
    describe('DEFAULT_BUDGET', () => {
      it('should have correct default values per spec', () => {
        expect(DEFAULT_BUDGET.maxCost).toBe(5.0);
        expect(DEFAULT_BUDGET.maxTokens).toBe(500_000);
        expect(DEFAULT_BUDGET.maxTime).toBe(300_000);
        expect(DEFAULT_BUDGET.maxDepth).toBe(2);
        expect(DEFAULT_BUDGET.maxIterations).toBe(30);
      });

      it('should satisfy Budget interface', () => {
        const budget: Budget = DEFAULT_BUDGET;
        expect(budget).toBeDefined();
      });

      it('should be a complete Budget object', () => {
        // Verify all Budget fields are present
        expect('maxCost' in DEFAULT_BUDGET).toBe(true);
        expect('maxTokens' in DEFAULT_BUDGET).toBe(true);
        expect('maxTime' in DEFAULT_BUDGET).toBe(true);
        expect('maxDepth' in DEFAULT_BUDGET).toBe(true);
        expect('maxIterations' in DEFAULT_BUDGET).toBe(true);
      });
    });

    describe('DEFAULT_REPL_CONFIG', () => {
      it('should have correct default values per spec', () => {
        expect(DEFAULT_REPL_CONFIG.timeout).toBe(30_000);
        expect(DEFAULT_REPL_CONFIG.maxOutputLength).toBe(50_000);
      });

      it('should satisfy REPLConfig interface', () => {
        const config: REPLConfig = DEFAULT_REPL_CONFIG;
        expect(config).toBeDefined();
      });

      it('should be a complete REPLConfig object', () => {
        // Verify all REPLConfig fields are present
        expect('timeout' in DEFAULT_REPL_CONFIG).toBe(true);
        expect('maxOutputLength' in DEFAULT_REPL_CONFIG).toBe(true);
      });
    });
  });

  describe('Type Relationships', () => {
    it('should allow ExecutionTrace subcalls to be ExecutionTrace[]', () => {
      const parentTrace: ExecutionTrace = {
        id: 'parent',
        depth: 0,
        task: 'Parent task',
        iterations: [],
        subcalls: [
          {
            id: 'child',
            parentId: 'parent',
            depth: 1,
            task: 'Child task',
            iterations: [],
            subcalls: [],
            finalAnswer: 'Child result',
            answerSource: 'final_direct',
          },
        ],
        finalAnswer: 'Parent result',
        answerSource: 'final_direct',
      };

      expect(parentTrace.subcalls).toHaveLength(1);
      expect(parentTrace.subcalls[0].parentId).toBe('parent');
    });

    it('should allow Iteration codeExecutions to be CodeExecution[]', () => {
      const iteration: Iteration = {
        index: 0,
        prompt: { content: 'test', tokens: 10 },
        response: { content: 'response', tokens: 20, cost: 0.001 },
        codeExecutions: [
          { code: 'print(1)', stdout: '1\n', stderr: '', duration: 10 },
          { code: 'print(2)', stdout: '2\n', stderr: '', duration: 10 },
        ],
      };

      expect(iteration.codeExecutions).toHaveLength(2);
    });
  });
});
