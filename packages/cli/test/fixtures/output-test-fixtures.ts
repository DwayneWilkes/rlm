/**
 * Shared test fixtures for output formatter tests.
 */
import type { RLMResult, ExecutionTrace, Usage } from '@rlm/core';

/**
 * Default execution trace for mock results.
 */
export const DEFAULT_TRACE: ExecutionTrace = {
  id: 'test-execution-123',
  depth: 0,
  task: 'Test task',
  iterations: [
    {
      index: 0,
      prompt: { content: 'Test prompt', tokens: 100 },
      response: { content: 'Test response', tokens: 50, cost: 0.001 },
      codeExecutions: [
        {
          code: 'print("hello")',
          stdout: 'hello\n',
          stderr: '',
          duration: 10,
        },
      ],
    },
  ],
  subcalls: [],
  finalAnswer: 'Test answer',
  answerSource: 'final_direct',
};

/**
 * Default usage statistics for mock results.
 */
export const DEFAULT_USAGE: Usage = {
  cost: 0.001,
  tokens: 150,
  inputTokens: 100,
  outputTokens: 50,
  duration: 1500,
  iterations: 1,
  subcalls: 0,
  maxDepthReached: 0,
};

/**
 * Create a mock RLMResult for testing.
 */
export function createMockResult(overrides: Partial<RLMResult> = {}): RLMResult {
  return {
    success: true,
    output: 'Test output',
    trace: { ...DEFAULT_TRACE },
    usage: { ...DEFAULT_USAGE },
    warnings: [],
    ...overrides,
  };
}
