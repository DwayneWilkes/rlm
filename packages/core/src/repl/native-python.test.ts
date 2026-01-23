/**
 * Tests for NativePythonSandbox - native Python subprocess sandbox.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Sandbox, SandboxBridges } from './sandbox.js';

// Shared test fixtures
const DEFAULT_CONFIG = { timeout: 30000, maxOutputLength: 50000 };

// Module-level variables set in beforeAll
let NativePythonSandbox: typeof import('./native-python.js').NativePythonSandbox;

// Per-test state
let sandbox: Sandbox;
let bridges: SandboxBridges;

// Helper to create mock bridges
function createMockBridges(): SandboxBridges {
  return {
    onLLMQuery: vi.fn().mockResolvedValue('LLM response'),
    onRLMQuery: vi.fn().mockResolvedValue('RLM response'),
  };
}

// Helper to create and initialize sandbox with context
async function createSandbox(context: string, config = DEFAULT_CONFIG): Promise<Sandbox> {
  sandbox = new NativePythonSandbox(config, bridges);
  await sandbox.initialize(context);
  return sandbox;
}

describe('NativePythonSandbox', () => {
  beforeAll(async () => {
    // Dynamic import once at start
    const module = await import('./native-python.js');
    NativePythonSandbox = module.NativePythonSandbox;
  });

  beforeEach(() => {
    bridges = createMockBridges();
  });

  afterEach(async () => {
    if (sandbox) {
      await sandbox.destroy();
    }
  });

  describe('initialization', () => {
    it('should create a sandbox instance', async () => {
      sandbox = new NativePythonSandbox(DEFAULT_CONFIG, bridges);
      expect(sandbox).toBeDefined();
    });

    it('should initialize with context string', async () => {
      await createSandbox('Test context data');
      const result = await sandbox.execute('print(len(context))');
      expect(result.stdout).toContain('17'); // "Test context data" is 17 chars
    });
  });

  describe('code execution', () => {
    it('should execute simple Python code', async () => {
      await createSandbox('context');
      const result = await sandbox.execute('print(2 + 2)');

      expect(result.stdout.trim()).toBe('4');
      expect(result.error).toBeUndefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should capture print output', async () => {
      await createSandbox('context');
      const result = await sandbox.execute('print("Hello")\nprint("World")');

      expect(result.stdout).toContain('Hello');
      expect(result.stdout).toContain('World');
    });

    it('should capture errors', async () => {
      await createSandbox('context');
      const result = await sandbox.execute('raise ValueError("Test error")');

      expect(result.error).toContain('ValueError');
      expect(result.error).toContain('Test error');
    });

    it('should maintain state between executions', async () => {
      await createSandbox('context');
      await sandbox.execute('x = 42');
      const result = await sandbox.execute('print(x * 2)');

      expect(result.stdout.trim()).toBe('84');
    });
  });

  describe('getVariable', () => {
    it('should retrieve variable values', async () => {
      await createSandbox('context');
      await sandbox.execute('result = "computed value"');
      const value = await sandbox.getVariable('result');

      expect(value).toBe('computed value');
    });

    it('should return undefined for nonexistent variables', async () => {
      await createSandbox('context');
      const value = await sandbox.getVariable('nonexistent_var');

      expect(value).toBeUndefined();
    });
  });

  describe('bridge callbacks', () => {
    it('should call llm_query bridge', async () => {
      bridges.onLLMQuery = vi.fn().mockResolvedValue('Bridge response from LLM');
      await createSandbox('context');

      await sandbox.execute('response = llm_query("Test prompt")');
      const printed = await sandbox.execute('print(response)');

      expect(bridges.onLLMQuery).toHaveBeenCalledWith('Test prompt');
      expect(printed.stdout).toContain('Bridge response from LLM');
    });

    it('should call rlm_query bridge', async () => {
      bridges.onRLMQuery = vi.fn().mockResolvedValue('Sub-RLM result');
      await createSandbox('My context');

      await sandbox.execute('result = rlm_query("Sub task", "Custom context")');
      const printed = await sandbox.execute('print(result)');

      expect(bridges.onRLMQuery).toHaveBeenCalledWith('Sub task', 'Custom context');
      expect(printed.stdout).toContain('Sub-RLM result');
    });

    it('should use current context for rlm_query without explicit context', async () => {
      bridges.onRLMQuery = vi.fn().mockResolvedValue('Result');
      await createSandbox('Default context');

      await sandbox.execute('result = rlm_query("Task only")');

      // When no context provided, rlm_query passes None which JS sees as undefined
      expect(bridges.onRLMQuery).toHaveBeenCalledWith('Task only', undefined);
    });
  });

  describe('utility functions', () => {
    it('should provide chunk_text function', async () => {
      await createSandbox('AAABBBCCC');
      const result = await sandbox.execute('chunks = chunk_text(context, 3, 0)\nprint(chunks)');

      expect(result.stdout).toContain('AAA');
      expect(result.stdout).toContain('BBB');
      expect(result.stdout).toContain('CCC');
    });

    it('should provide search_context function', async () => {
      await createSandbox('The quick brown fox jumps over the lazy dog');
      const result = await sandbox.execute('matches = search_context("fox", 5)\nprint(matches)');

      expect(result.stdout).toContain('fox');
    });

    it('should provide count_matches function', async () => {
      await createSandbox('apple banana apple cherry apple');
      const result = await sandbox.execute('count = count_matches("apple")\nprint(count)');

      expect(result.stdout.trim()).toBe('3');
    });

    it('should provide extract_json function', async () => {
      await createSandbox('Some text');
      const result = await sandbox.execute(`
data = extract_json('prefix {"key": "value"} suffix')
print(data["key"])
`);

      expect(result.stdout.trim()).toBe('value');
    });

    it('should provide extract_sections function', async () => {
      await createSandbox('# Section 1\nContent A\n# Section 2\nContent B');
      const result = await sandbox.execute(`
sections = extract_sections("^# .*")
print(len(sections))
print(sections[0]["header"])
`);

      expect(result.stdout).toContain('2');
      expect(result.stdout).toContain('# Section 1');
    });

    it('should provide find_line function', async () => {
      await createSandbox('line one\nline two\nline three');
      const result = await sandbox.execute(`
matches = find_line("two")
print(matches[0][0])  # Line number
print(matches[0][1])  # Line content
`);

      expect(result.stdout).toContain('2');
      expect(result.stdout).toContain('line two');
    });

    it('should provide count_lines function', async () => {
      await createSandbox('import os\nimport sys\ndef main():\n    pass');
      const result = await sandbox.execute(`
total = count_lines()
imports = count_lines("import")
print(f"{total},{imports}")
`);

      expect(result.stdout.trim()).toBe('4,2');
    });

    it('should provide get_line function', async () => {
      await createSandbox('first\nsecond\nthird');
      const result = await sandbox.execute(`
line2 = get_line(2)
print(line2)
`);

      expect(result.stdout.trim()).toBe('second');
    });

    it('should return empty string for invalid line numbers in get_line', async () => {
      await createSandbox('only one line');
      const result = await sandbox.execute(`
line0 = get_line(0)
line999 = get_line(999)
print(f"[{line0}][{line999}]")
`);

      expect(result.stdout.trim()).toBe('[][]');
    });

    it('should provide quote_match function', async () => {
      await createSandbox('The max_tokens value is 8192 here');
      const result = await sandbox.execute(`
match = quote_match("max_tokens.*?\\\\d+")
print(match)
`);

      expect(result.stdout).toContain('max_tokens value is 8192');
    });

    it('should return None for no match in quote_match', async () => {
      await createSandbox('no numbers here');
      const result = await sandbox.execute(`
match = quote_match("\\\\d+")
print(match)
`);

      expect(result.stdout.trim()).toBe('None');
    });

    it('should truncate long matches in quote_match', async () => {
      await createSandbox('a'.repeat(200));
      const result = await sandbox.execute(`
match = quote_match("a+", max_length=10)
print(match)
`);

      expect(result.stdout).toContain('...');
      expect(result.stdout.trim().length).toBeLessThan(20);
    });

    it('should provide chunk_by_headers function (4.3.1)', async () => {
      await createSandbox(`# Main Title
Intro text.

## Section 1
Content 1.

## Section 2
Content 2.`);
      const result = await sandbox.execute(`
chunks = chunk_by_headers(level=2)
print(len(chunks))
print(chunks[0]["header"])
print(chunks[1]["header"])
`);

      expect(result.stdout).toContain('2');
      expect(result.stdout).toContain('## Section 1');
      expect(result.stdout).toContain('## Section 2');
    });

    it('should provide chunk_by_size function (4.3.2)', async () => {
      await createSandbox('A'.repeat(100));
      const result = await sandbox.execute(`
chunks = chunk_by_size(chars=30)
print(len(chunks))
print(len(chunks[0]))
`);

      expect(result.stdout).toContain('4'); // 100/30 = ~4 chunks
      expect(result.stdout).toContain('30');
    });

    it('should support overlap in chunk_by_size (4.3.2)', async () => {
      await createSandbox('0123456789' + '0123456789' + '0123456789');
      const result = await sandbox.execute(`
chunks = chunk_by_size(chars=15, overlap=5)
print(chunks[0][-5:])
print(chunks[1][:5])
`);

      const lines = result.stdout.trim().split('\n');
      expect(lines[0]).toBe(lines[1]); // Last 5 of chunk[0] == first 5 of chunk[1]
    });
  });

  describe('cleanup', () => {
    it('should clean up Python process on destroy', async () => {
      await createSandbox('context');
      await sandbox.destroy();

      // After destroy, executing should fail or reinitialize
      await expect(sandbox.execute('print(1)')).rejects.toThrow();

      // Prevent double-destroy in afterEach
      sandbox = null!;
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running code', async () => {
      // Short timeout for testing
      await createSandbox('context', { timeout: 500, maxOutputLength: 50000 });
      const result = await sandbox.execute('import time; time.sleep(10)');

      expect(result.error).toContain('timeout');
    }, 10000);
  });

  describe('batch_llm_query', () => {
    it('should execute multiple LLM queries in a single call', async () => {
      bridges.onLLMQuery = vi.fn()
        .mockResolvedValueOnce('Response 1')
        .mockResolvedValueOnce('Response 2')
        .mockResolvedValueOnce('Response 3');

      await createSandbox('context');
      const result = await sandbox.execute(`
results = batch_llm_query(["prompt1", "prompt2", "prompt3"])
print(len(results))
print(results[0])
print(results[1])
print(results[2])
`);

      expect(result.stdout).toContain('3');
      expect(result.stdout).toContain('Response 1');
      expect(result.stdout).toContain('Response 2');
      expect(result.stdout).toContain('Response 3');
    });

    it('should call onLLMQuery for each prompt in batch', async () => {
      bridges.onLLMQuery = vi.fn().mockResolvedValue('Response');
      await createSandbox('context');

      await sandbox.execute('results = batch_llm_query(["p1", "p2"])');

      expect(bridges.onLLMQuery).toHaveBeenCalledTimes(2);
      expect(bridges.onLLMQuery).toHaveBeenCalledWith('p1');
      expect(bridges.onLLMQuery).toHaveBeenCalledWith('p2');
    });

    it('should process batch queries in parallel', async () => {
      // Track call order and timing
      const callTimes: number[] = [];
      bridges.onLLMQuery = vi.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        // Simulate LLM delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'Response';
      });

      await createSandbox('context');
      const startTime = Date.now();
      await sandbox.execute('results = batch_llm_query(["p1", "p2", "p3"])');
      const endTime = Date.now();

      // If parallel, total time should be ~100ms (one delay), not ~300ms (three delays)
      // Allow some margin for test execution overhead
      expect(endTime - startTime).toBeLessThan(250);
    });

    it('should return empty list for empty batch', async () => {
      await createSandbox('context');
      const result = await sandbox.execute(`
results = batch_llm_query([])
print(len(results))
print(type(results).__name__)
`);

      expect(result.stdout).toContain('0');
      expect(result.stdout).toContain('list');
    });

    it('should handle errors in individual batch items', async () => {
      bridges.onLLMQuery = vi.fn()
        .mockResolvedValueOnce('Success 1')
        .mockRejectedValueOnce(new Error('LLM Error'))
        .mockResolvedValueOnce('Success 3');

      await createSandbox('context');
      // Error in one item should be captured, not crash the whole batch
      const result = await sandbox.execute(`
results = batch_llm_query(["p1", "p2", "p3"])
print(results[0])
print("error" in results[1].lower() if isinstance(results[1], str) else "has_error")
print(results[2])
`);

      expect(result.stdout).toContain('Success 1');
      expect(result.stdout).toContain('Success 3');
    });
  });
});
