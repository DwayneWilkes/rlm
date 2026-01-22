/**
 * Tests for NativePythonSandbox - native Python subprocess sandbox.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Sandbox, SandboxBridges } from './sandbox.js';

// We'll import NativePythonSandbox once it exists
// import { NativePythonSandbox } from './native-python.js';

describe('NativePythonSandbox', () => {
  // Mock bridges for testing
  const createMockBridges = (): SandboxBridges => ({
    onLLMQuery: vi.fn().mockResolvedValue('LLM response'),
    onRLMQuery: vi.fn().mockResolvedValue('RLM response'),
  });

  describe('initialization', () => {
    it('should create a sandbox instance', async () => {
      // Import dynamically to allow test to fail gracefully if not implemented
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      expect(sandbox).toBeDefined();
      await sandbox.destroy();
    });

    it('should initialize with context string', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);

      await sandbox.initialize('Test context data');

      // Execute code that accesses context
      const result = await sandbox.execute('print(len(context))');
      expect(result.stdout).toContain('17'); // "Test context data" is 17 chars

      await sandbox.destroy();
    });
  });

  describe('code execution', () => {
    it('should execute simple Python code', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute('print(2 + 2)');

      expect(result.stdout.trim()).toBe('4');
      expect(result.error).toBeUndefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);

      await sandbox.destroy();
    });

    it('should capture print output', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute('print("Hello")\nprint("World")');

      expect(result.stdout).toContain('Hello');
      expect(result.stdout).toContain('World');

      await sandbox.destroy();
    });

    it('should capture errors', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute('raise ValueError("Test error")');

      expect(result.error).toContain('ValueError');
      expect(result.error).toContain('Test error');

      await sandbox.destroy();
    });

    it('should maintain state between executions', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      await sandbox.execute('x = 42');
      const result = await sandbox.execute('print(x * 2)');

      expect(result.stdout.trim()).toBe('84');

      await sandbox.destroy();
    });
  });

  describe('getVariable', () => {
    it('should retrieve variable values', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      await sandbox.execute('result = "computed value"');
      const value = await sandbox.getVariable('result');

      expect(value).toBe('computed value');

      await sandbox.destroy();
    });

    it('should return undefined for nonexistent variables', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const value = await sandbox.getVariable('nonexistent_var');

      expect(value).toBeUndefined();

      await sandbox.destroy();
    });
  });

  describe('bridge callbacks', () => {
    it('should call llm_query bridge', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onLLMQuery = vi.fn().mockResolvedValue('Bridge response from LLM');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute('response = llm_query("Test prompt")');
      await sandbox.execute('print(response)');
      const printed = await sandbox.execute('print(response)');

      expect(bridges.onLLMQuery).toHaveBeenCalledWith('Test prompt');
      expect(printed.stdout).toContain('Bridge response from LLM');

      await sandbox.destroy();
    });

    it('should call rlm_query bridge', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onRLMQuery = vi.fn().mockResolvedValue('Sub-RLM result');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('My context');

      await sandbox.execute('result = rlm_query("Sub task", "Custom context")');
      const printed = await sandbox.execute('print(result)');

      expect(bridges.onRLMQuery).toHaveBeenCalledWith('Sub task', 'Custom context');
      expect(printed.stdout).toContain('Sub-RLM result');

      await sandbox.destroy();
    });

    it('should use current context for rlm_query without explicit context', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onRLMQuery = vi.fn().mockResolvedValue('Result');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('Default context');

      await sandbox.execute('result = rlm_query("Task only")');

      // When no context provided, rlm_query passes None which JS sees as undefined
      expect(bridges.onRLMQuery).toHaveBeenCalledWith('Task only', undefined);

      await sandbox.destroy();
    });
  });

  describe('utility functions', () => {
    it('should provide chunk_text function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('AAABBBCCC');

      const result = await sandbox.execute('chunks = chunk_text(context, 3, 0)\nprint(chunks)');

      expect(result.stdout).toContain('AAA');
      expect(result.stdout).toContain('BBB');
      expect(result.stdout).toContain('CCC');

      await sandbox.destroy();
    });

    it('should provide search_context function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('The quick brown fox jumps over the lazy dog');

      const result = await sandbox.execute('matches = search_context("fox", 5)\nprint(matches)');

      expect(result.stdout).toContain('fox');

      await sandbox.destroy();
    });

    it('should provide count_matches function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('apple banana apple cherry apple');

      const result = await sandbox.execute('count = count_matches("apple")\nprint(count)');

      expect(result.stdout.trim()).toBe('3');

      await sandbox.destroy();
    });

    it('should provide extract_json function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('Some text');

      const result = await sandbox.execute(`
data = extract_json('prefix {"key": "value"} suffix')
print(data["key"])
`);

      expect(result.stdout.trim()).toBe('value');

      await sandbox.destroy();
    });

    it('should provide extract_sections function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('# Section 1\nContent A\n# Section 2\nContent B');

      const result = await sandbox.execute(`
sections = extract_sections("^# .*")
print(len(sections))
print(sections[0]["header"])
`);

      expect(result.stdout).toContain('2');
      expect(result.stdout).toContain('# Section 1');

      await sandbox.destroy();
    });

    it('should provide find_line function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('line one\nline two\nline three');

      const result = await sandbox.execute(`
matches = find_line("two")
print(matches[0][0])  # Line number
print(matches[0][1])  # Line content
`);

      expect(result.stdout).toContain('2');
      expect(result.stdout).toContain('line two');

      await sandbox.destroy();
    });

    it('should provide count_lines function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('import os\nimport sys\ndef main():\n    pass');

      const result = await sandbox.execute(`
total = count_lines()
imports = count_lines("import")
print(f"{total},{imports}")
`);

      expect(result.stdout.trim()).toBe('4,2');

      await sandbox.destroy();
    });

    it('should provide get_line function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('first\nsecond\nthird');

      const result = await sandbox.execute(`
line2 = get_line(2)
print(line2)
`);

      expect(result.stdout.trim()).toBe('second');

      await sandbox.destroy();
    });

    it('should return empty string for invalid line numbers in get_line', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('only one line');

      const result = await sandbox.execute(`
line0 = get_line(0)
line999 = get_line(999)
print(f"[{line0}][{line999}]")
`);

      expect(result.stdout.trim()).toBe('[][]');

      await sandbox.destroy();
    });

    it('should provide quote_match function', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('The max_tokens value is 8192 here');

      const result = await sandbox.execute(`
match = quote_match("max_tokens.*?\\\\d+")
print(match)
`);

      expect(result.stdout).toContain('max_tokens value is 8192');

      await sandbox.destroy();
    });

    it('should return None for no match in quote_match', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('no numbers here');

      const result = await sandbox.execute(`
match = quote_match("\\\\d+")
print(match)
`);

      expect(result.stdout.trim()).toBe('None');

      await sandbox.destroy();
    });

    it('should truncate long matches in quote_match', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('a'.repeat(200));

      const result = await sandbox.execute(`
match = quote_match("a+", max_length=10)
print(match)
`);

      expect(result.stdout).toContain('...');
      expect(result.stdout.trim().length).toBeLessThan(20);

      await sandbox.destroy();
    });
  });

  describe('cleanup', () => {
    it('should clean up Python process on destroy', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      await sandbox.destroy();

      // After destroy, executing should fail or reinitialize
      // The exact behavior depends on implementation
      await expect(sandbox.execute('print(1)')).rejects.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running code', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      // Short timeout for testing
      const sandbox = new NativePythonSandbox({ timeout: 500, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute('import time; time.sleep(10)');

      expect(result.error).toContain('timeout');

      await sandbox.destroy();
    }, 10000);
  });

  describe('batch_llm_query', () => {
    it('should execute multiple LLM queries in a single call', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onLLMQuery = vi.fn()
        .mockResolvedValueOnce('Response 1')
        .mockResolvedValueOnce('Response 2')
        .mockResolvedValueOnce('Response 3');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

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

      await sandbox.destroy();
    });

    it('should call onLLMQuery for each prompt in batch', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onLLMQuery = vi.fn().mockResolvedValue('Response');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      await sandbox.execute('results = batch_llm_query(["p1", "p2"])');

      expect(bridges.onLLMQuery).toHaveBeenCalledTimes(2);
      expect(bridges.onLLMQuery).toHaveBeenCalledWith('p1');
      expect(bridges.onLLMQuery).toHaveBeenCalledWith('p2');

      await sandbox.destroy();
    });

    it('should process batch queries in parallel', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();

      // Track call order and timing
      const callTimes: number[] = [];
      bridges.onLLMQuery = vi.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        // Simulate LLM delay
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'Response';
      });

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const startTime = Date.now();
      await sandbox.execute('results = batch_llm_query(["p1", "p2", "p3"])');
      const endTime = Date.now();

      // If parallel, total time should be ~100ms (one delay), not ~300ms (three delays)
      // Allow some margin for test execution overhead
      expect(endTime - startTime).toBeLessThan(250);

      await sandbox.destroy();
    });

    it('should return empty list for empty batch', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      const result = await sandbox.execute(`
results = batch_llm_query([])
print(len(results))
print(type(results).__name__)
`);

      expect(result.stdout).toContain('0');
      expect(result.stdout).toContain('list');

      await sandbox.destroy();
    });

    it('should handle errors in individual batch items', async () => {
      const { NativePythonSandbox } = await import('./native-python.js');
      const bridges = createMockBridges();
      bridges.onLLMQuery = vi.fn()
        .mockResolvedValueOnce('Success 1')
        .mockRejectedValueOnce(new Error('LLM Error'))
        .mockResolvedValueOnce('Success 3');

      const sandbox = new NativePythonSandbox({ timeout: 30000, maxOutputLength: 50000 }, bridges);
      await sandbox.initialize('context');

      // Error in one item should be captured, not crash the whole batch
      const result = await sandbox.execute(`
results = batch_llm_query(["p1", "p2", "p3"])
print(results[0])
print("error" in results[1].lower() if isinstance(results[1], str) else "has_error")
print(results[2])
`);

      expect(result.stdout).toContain('Success 1');
      expect(result.stdout).toContain('Success 3');

      await sandbox.destroy();
    });
  });
});
