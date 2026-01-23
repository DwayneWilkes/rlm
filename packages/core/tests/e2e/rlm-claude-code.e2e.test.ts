/**
 * E2E tests for RLM with native sandbox.
 *
 * These tests verify the full execution pipeline works end-to-end using:
 * - Mock LLM adapter (to avoid needing actual API calls)
 * - Native Python sandbox (real Python subprocess execution)
 *
 * This validates that helper functions, code execution, and the iteration
 * loop all work correctly together.
 */

import { describe, it, expect } from 'vitest';
import { NativePythonSandbox, LLMRouter, type LLMAdapter, type RLMConfig } from '../../src/index.js';
import { Executor } from '../../src/engine/executor.js';

// Helper to create a mock adapter with specified response
function createMockAdapter(response: string): LLMAdapter {
  return {
    complete: async () => ({
      content: response,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0,
    }),
  };
}

describe('RLM E2E with Native Sandbox', () => {
  it('should execute Python code in native sandbox', async () => {
    const mockAdapter = createMockAdapter(`I'll check the Python version.

\`\`\`repl
import sys
print(f"Python {sys.version_info.major}.{sys.version_info.minor}")
\`\`\`

FINAL(Python 3)`);

    const router = new LLMRouter('mock');
    router.register('mock', mockAdapter);

    const config: RLMConfig = {
      provider: 'mock',
      model: 'mock-model',
      sandboxFactory: (cfg, bridges) => new NativePythonSandbox(cfg, bridges),
    };

    const executor = new Executor(config, router);
    const result = await executor.execute({
      task: 'Check Python version.',
      context: 'Test context.',
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatch(/Python 3/);
    expect(result.trace.iterations.length).toBeGreaterThan(0);
    expect(result.trace.iterations[0].codeExecutions.length).toBeGreaterThan(0);
    expect(result.trace.iterations[0].codeExecutions[0].stdout).toContain('Python 3');
  }, 30000);

  it('should execute find_line helper in native sandbox', async () => {
    const mockAdapter = createMockAdapter(`I'll use find_line to find lines with "error".

\`\`\`repl
matches = find_line("error")
for line_num, line in matches:
    print(f"Line {line_num}: {line}")
\`\`\`

FINAL(Found error lines)`);

    const router = new LLMRouter('mock');
    router.register('mock', mockAdapter);

    const config: RLMConfig = {
      provider: 'mock',
      model: 'mock-model',
      sandboxFactory: (cfg, bridges) => new NativePythonSandbox(cfg, bridges),
    };

    const executor = new Executor(config, router);
    const result = await executor.execute({
      task: 'Find error lines.',
      context: `Line 1: normal
Line 2: has error here
Line 3: normal
Line 4: another error`,
    });

    expect(result.success).toBe(true);
    const stdout = result.trace.iterations[0].codeExecutions[0].stdout;
    expect(stdout).toContain('Line 2');
    expect(stdout).toContain('Line 4');
  }, 30000);

  it('should execute chunk_by_headers helper in native sandbox', async () => {
    const mockAdapter = createMockAdapter(`I'll use chunk_by_headers to split the document.

\`\`\`repl
chunks = chunk_by_headers(level=2)
print(f"Found {len(chunks)} sections")
for chunk in chunks:
    print(f"- {chunk['header']}")
\`\`\`

FINAL(Chunked successfully)`);

    const router = new LLMRouter('mock');
    router.register('mock', mockAdapter);

    const config: RLMConfig = {
      provider: 'mock',
      model: 'mock-model',
      sandboxFactory: (cfg, bridges) => new NativePythonSandbox(cfg, bridges),
    };

    const executor = new Executor(config, router);
    const result = await executor.execute({
      task: 'Chunk the document.',
      context: `# Main Title

Intro text.

## Section 1
Content for section 1.

## Section 2
Content for section 2.

## Section 3
Content for section 3.`,
    });

    expect(result.success).toBe(true);
    const stdout = result.trace.iterations[0].codeExecutions[0].stdout;
    expect(stdout).toContain('Found 3 sections');
    expect(stdout).toContain('## Section 1');
    expect(stdout).toContain('## Section 2');
    expect(stdout).toContain('## Section 3');
  }, 30000);

  it('should execute count_matches helper in native sandbox', async () => {
    const mockAdapter = createMockAdapter(`\`\`\`repl
count = count_matches("apple")
print(f"Found {count} matches")
\`\`\`

FINAL(Done)`);

    const router = new LLMRouter('mock');
    router.register('mock', mockAdapter);

    const config: RLMConfig = {
      provider: 'mock',
      model: 'mock-model',
      sandboxFactory: (cfg, bridges) => new NativePythonSandbox(cfg, bridges),
    };

    const executor = new Executor(config, router);
    const result = await executor.execute({
      task: 'Count apple occurrences.',
      context: 'apple banana apple cherry apple',
    });

    expect(result.success).toBe(true);
    const stdout = result.trace.iterations[0].codeExecutions[0].stdout;
    expect(stdout).toContain('Found 3 matches');
  }, 30000);

  it('should execute extract_json helper in native sandbox', async () => {
    const mockAdapter = createMockAdapter(`\`\`\`repl
data = extract_json(context)
print(f"Name: {data['name']}, Age: {data['age']}")
\`\`\`

FINAL(Done)`);

    const router = new LLMRouter('mock');
    router.register('mock', mockAdapter);

    const config: RLMConfig = {
      provider: 'mock',
      model: 'mock-model',
      sandboxFactory: (cfg, bridges) => new NativePythonSandbox(cfg, bridges),
    };

    const executor = new Executor(config, router);
    const result = await executor.execute({
      task: 'Extract JSON.',
      context: 'Here is data: {"name": "Claude", "age": 2}',
    });

    expect(result.success).toBe(true);
    const stdout = result.trace.iterations[0].codeExecutions[0].stdout;
    expect(stdout).toContain('Name: Claude');
    expect(stdout).toContain('Age: 2');
  }, 30000);
});
