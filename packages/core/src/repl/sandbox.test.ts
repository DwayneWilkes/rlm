import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { REPLConfig } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';
import { mockGlobals, simulatePython, resetPythonState } from './test-helpers/mock-python.js';
import { DEFAULT_CONFIG, createMockBridges, withSandbox } from './test-helpers/sandbox-test-utils.js';

/**
 * Mock Pyodide for unit tests.
 *
 * Pyodide has environment-specific path resolution issues on Windows with pnpm.
 * This mock simulates Python execution behavior for testing the sandbox wrapper.
 * Real Pyodide integration should be tested in browser or integration tests.
 */

// Mock the pyodide module
vi.mock('pyodide', () => ({
  loadPyodide: vi.fn().mockImplementation(async () => ({
    globals: mockGlobals,
    runPythonAsync: simulatePython,
  })),
}));

// Mock pyodide.js to force direct mode and control detection
vi.mock('./pyodide.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pyodide.js')>();
  return {
    ...actual,
    detectWorkerSupport: vi.fn().mockReturnValue(false),
  };
});

import { createSandbox } from './sandbox.js';
import { detectWorkerSupport } from './pyodide.js';

// Helper to run tests with temporary sandbox
const runWithSandbox = (
  context: string,
  testFn: (sandbox: Sandbox) => Promise<void>,
  config?: REPLConfig,
) => withSandbox(createSandbox, context, testFn, config ?? DEFAULT_CONFIG);

describe('Sandbox', () => {
  const defaultBridges = createMockBridges();
  let sandbox: Sandbox;

  beforeEach(() => {
    vi.clearAllMocks();
    resetPythonState();
    sandbox = createSandbox(DEFAULT_CONFIG, defaultBridges);
  });

  afterEach(async () => {
    await sandbox.destroy();
  });

  describe('Sandbox Lifecycle', () => {
    describe('Initialize with context', () => {
      it('should make context available as the context variable in Python', async () => {
        const testContext = 'Hello, this is test context!';
        await sandbox.initialize(testContext);

        const result = await sandbox.execute('print(context)');

        expect(result.stdout).toContain(testContext);
        expect(result.error).toBeUndefined();
      });

      it('should handle empty context', async () => {
        await sandbox.initialize('');

        const result = await sandbox.execute('print(len(context))');

        expect(result.stdout).toContain('0');
        expect(result.error).toBeUndefined();
      });

      it('should handle context with special characters', async () => {
        const specialContext = 'Line1\nLine2\tTabbed\n"Quoted"';
        await sandbox.initialize(specialContext);

        const result = await sandbox.execute('print(repr(context))');

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('\\n');
      });
    });

    describe('Cleanup on destroy', () => {
      it('should release Pyodide resources after destroy', async () => {
        await sandbox.initialize('test');
        await sandbox.destroy();

        await expect(sandbox.execute('print(1)')).rejects.toThrow();
      });

      it('should be safe to call destroy multiple times', async () => {
        await sandbox.initialize('test');
        await sandbox.destroy();
        await sandbox.destroy();
      });
    });
  });

  describe('Code Execution', () => {
    beforeEach(async () => {
      await sandbox.initialize('test context');
    });

    describe('Execute returns result', () => {
      it('should return CodeExecution with stdout, stderr, error, and duration', async () => {
        const result = await sandbox.execute('print("hello")');

        expect(result).toHaveProperty('code');
        expect(result).toHaveProperty('stdout');
        expect(result).toHaveProperty('stderr');
        expect(result).toHaveProperty('duration');
        expect(typeof result.duration).toBe('number');
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Stdout capture', () => {
      it('should capture printed text in stdout', async () => {
        const result = await sandbox.execute('print("hello world")');

        expect(result.stdout).toContain('hello world');
        expect(result.error).toBeUndefined();
      });

      it('should capture multiple print statements', async () => {
        const result = await sandbox.execute(`
print("line 1")
print("line 2")
print("line 3")
`);

        expect(result.stdout).toContain('line 1');
        expect(result.stdout).toContain('line 2');
        expect(result.stdout).toContain('line 3');
      });
    });

    describe('Stderr capture', () => {
      it('should capture stderr output', async () => {
        const result = await sandbox.execute(`
import sys
sys.stderr.write("error message")
`);

        expect(result.stderr).toContain('error message');
      });
    });

    describe('Error capture', () => {
      it('should capture exception message in error field', async () => {
        const result = await sandbox.execute('raise ValueError("test error")');

        expect(result.error).toBeDefined();
        expect(result.error).toContain('ValueError');
        expect(result.error).toContain('test error');
      });

      it('should capture syntax errors', async () => {
        const result = await sandbox.execute('def incomplete(');

        expect(result.error).toBeDefined();
        expect(result.error).toContain('SyntaxError');
      });

      it('should capture name errors', async () => {
        const result = await sandbox.execute('print(undefined_variable)');

        expect(result.error).toBeDefined();
        expect(result.error).toContain('NameError');
      });
    });
  });

  describe('Timeout Handling', () => {
    it('should terminate execution with timeout error when exceeding config.timeout', async () => {
      const shortTimeoutConfig: REPLConfig = { timeout: 100, maxOutputLength: 1000 };
      const shortTimeoutSandbox = createSandbox(shortTimeoutConfig, defaultBridges);
      await shortTimeoutSandbox.initialize('test');

      const result = await shortTimeoutSandbox.execute(`
import time
time.sleep(1)
print("done")
`);

      expect(result.error).toBeDefined();
      expect(result.error).toContain('timeout');

      await shortTimeoutSandbox.destroy();
    });

    it('should use REPLConfig.timeout value as the timeout in milliseconds', async () => {
      const customTimeoutConfig: REPLConfig = { timeout: 2000, maxOutputLength: 1000 };
      const customSandbox = createSandbox(customTimeoutConfig, defaultBridges);
      await customSandbox.initialize('test');

      const result = await customSandbox.execute('print("fast")');

      expect(result.error).toBeUndefined();
      expect(result.stdout).toContain('fast');

      await customSandbox.destroy();
    });
  });

  describe('Output Truncation', () => {
    it('should return full output when stdout length <= maxOutputLength', async () => {
      await runWithSandbox('test', async (sb) => {
        const result = await sb.execute('print("short output")');

        expect(result.stdout).toBe('short output\n');
        expect(result.stdout).not.toContain('truncated');
      });
    });

    it('should truncate output with omission notice when stdout > maxOutputLength', async () => {
      const config: REPLConfig = { timeout: 5000, maxOutputLength: 50 };
      await runWithSandbox('test', async (sb) => {
        const result = await sb.execute('print("x" * 200)');

        expect(result.stdout.length).toBeLessThan(200);
        expect(result.stdout).toContain('truncated');
        expect(result.stdout).toContain('omitted');
      }, config);
    });
  });

  describe('LLM Bridge Functions', () => {
    beforeEach(async () => {
      await sandbox.initialize('bridge test context');
    });

    it('should invoke onLLMQuery callback and return the response', async () => {
      const mockLLMQuery = vi.fn().mockResolvedValue('mocked LLM answer');
      const bridgeSandbox = createSandbox(DEFAULT_CONFIG, {
        ...defaultBridges,
        onLLMQuery: mockLLMQuery,
      });
      await bridgeSandbox.initialize('test');

      const result = await bridgeSandbox.execute(`
response = llm_query("What is 2+2?")
print(response)
`);

      expect(mockLLMQuery).toHaveBeenCalledWith('What is 2+2?');
      expect(result.stdout).toContain('mocked LLM answer');

      await bridgeSandbox.destroy();
    });

    it('should invoke onRLMQuery callback and return the response', async () => {
      const mockRLMQuery = vi.fn().mockResolvedValue('mocked RLM answer');
      const bridgeSandbox = createSandbox(DEFAULT_CONFIG, {
        ...defaultBridges,
        onRLMQuery: mockRLMQuery,
      });
      await bridgeSandbox.initialize('test context here');

      const result = await bridgeSandbox.execute(`
response = rlm_query("Analyze this data")
print(response)
`);

      expect(mockRLMQuery).toHaveBeenCalled();
      expect(result.stdout).toContain('mocked RLM answer');

      await bridgeSandbox.destroy();
    });

    it('should use current context when ctx argument is not provided', async () => {
      const mockRLMQuery = vi.fn().mockResolvedValue('answer');
      const bridgeSandbox = createSandbox(DEFAULT_CONFIG, {
        ...defaultBridges,
        onRLMQuery: mockRLMQuery,
      });
      await bridgeSandbox.initialize('original context');

      await bridgeSandbox.execute(`
rlm_query("task without context")
`);

      expect(mockRLMQuery).toHaveBeenCalledWith('task without context', 'original context');

      await bridgeSandbox.destroy();
    });

    it('should use provided ctx when specified', async () => {
      const mockRLMQuery = vi.fn().mockResolvedValue('answer');
      const bridgeSandbox = createSandbox(DEFAULT_CONFIG, {
        ...defaultBridges,
        onRLMQuery: mockRLMQuery,
      });
      await bridgeSandbox.initialize('original context');

      await bridgeSandbox.execute(`
rlm_query("task with custom context", "custom context data")
`);

      expect(mockRLMQuery).toHaveBeenCalledWith('task with custom context', 'custom context data');

      await bridgeSandbox.destroy();
    });
  });

  describe('Utility Functions', () => {
    beforeEach(async () => {
      await sandbox.initialize('This is a test context with some searchable content.');
    });

    describe('count_matches function', () => {
      it('should return count of regex matches without full results', async () => {
        await runWithSandbox('The cat sat on the mat. The cat was fat.', async (sb) => {
          const result = await sb.execute(`
count = count_matches("cat")
print(count)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('2');
        });
      });

      it('should return 0 when no matches', async () => {
        const result = await sandbox.execute(`
count = count_matches("nonexistent_xyz")
print(count)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('0');
      });

      it('should support regex patterns', async () => {
        await runWithSandbox('test123 test456 test789', async (sb) => {
          const result = await sb.execute(`
count = count_matches(r"test\\d+")
print(count)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('3');
        });
      });
    });

    describe('extract_json function', () => {
      it('should extract JSON object from text', async () => {
        await runWithSandbox('Some text {"key": "value", "num": 42} more text', async (sb) => {
          const result = await sb.execute(`
data = extract_json(context)
print(data['key'])
print(data['num'])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('value');
          expect(result.stdout).toContain('42');
        });
      });

      it('should extract JSON array from text', async () => {
        await runWithSandbox('Data: [1, 2, 3] end', async (sb) => {
          const result = await sb.execute(`
data = extract_json(context)
print(len(data))
print(data[0])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('3');
          expect(result.stdout).toContain('1');
        });
      });

      it('should return None when no valid JSON found', async () => {
        const result = await sandbox.execute(`
data = extract_json("no json here")
print(data is None)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('True');
      });

      it('should handle nested JSON', async () => {
        await runWithSandbox('{"outer": {"inner": "nested"}}', async (sb) => {
          const result = await sb.execute(`
data = extract_json(context)
print(data['outer']['inner'])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('nested');
        });
      });
    });

    describe('extract_sections function', () => {
      it('should extract sections by header pattern', async () => {
        const context = `# Section 1
Content for section 1.

# Section 2
Content for section 2.

# Section 3
Content for section 3.`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
sections = extract_sections(r"^# .+$")
print(len(sections))
print(sections[0]['header'])
print(sections[1]['header'])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('3');
          expect(result.stdout).toContain('# Section 1');
          expect(result.stdout).toContain('# Section 2');
        });
      });

      it('should include section content', async () => {
        const context = `## Intro
This is the intro.

## Body
This is the body.`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
sections = extract_sections(r"^## .+$")
print('content' in sections[0])
print(len(sections[0]['content']) > 0)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('True');
        });
      });

      it('should return empty list when no sections found', async () => {
        const result = await sandbox.execute(`
sections = extract_sections(r"^### .+$")
print(len(sections))
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('0');
      });
    });

    describe('chunk_text function', () => {
      it('should return a list of overlapping text chunks', async () => {
        const result = await sandbox.execute(`
text = "0123456789" * 10
chunks = chunk_text(text, size=30, overlap=5)
print(len(chunks))
print(chunks[0])
print(chunks[1][:10])
`);

        expect(result.error).toBeUndefined();
        const lines = result.stdout.trim().split('\n');
        const numChunks = parseInt(lines[0], 10);
        expect(numChunks).toBeGreaterThan(1);
      });

      it('should handle default parameters', async () => {
        const result = await sandbox.execute(`
text = "short text"
chunks = chunk_text(text)
print(len(chunks))
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('1');
      });
    });

    describe('search_context function', () => {
      it('should return matches with surrounding context', async () => {
        await runWithSandbox('The quick brown fox jumps over the lazy dog', async (sb) => {
          const result = await sb.execute(`
results = search_context("fox", window=10)
print(len(results))
print(results[0]['match'])
print('context' in results[0])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('1');
          expect(result.stdout).toContain('fox');
          expect(result.stdout).toContain('True');
        });
      });

      it('should return empty list when no matches', async () => {
        const result = await sandbox.execute(`
results = search_context("nonexistent_pattern_xyz")
print(len(results))
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('0');
      });
    });

    describe('find_line function', () => {
      it('should return line numbers and content for matching lines', async () => {
        const context = `line one
line two with target
line three
another target line`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
matches = find_line("target")
print(len(matches))
print(matches[0][0])
print(matches[0][1])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('2');
          expect(result.stdout).toContain('line two with target');
        });
      });

      it('should return 1-indexed line numbers', async () => {
        const context = `first line
second line
third line`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
matches = find_line("first")
print(matches[0][0])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('1');
        });
      });

      it('should return empty list when no matches', async () => {
        const result = await sandbox.execute(`
matches = find_line("nonexistent_xyz")
print(len(matches))
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('0');
      });

      it('should support regex patterns', async () => {
        const context = `def foo():
    pass
def bar():
    return 1`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
matches = find_line(r"def \\w+")
print(len(matches))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('2');
        });
      });
    });

    describe('count_lines function', () => {
      it('should return total line count when no pattern', async () => {
        const context = `line 1
line 2
line 3
line 4
line 5`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
count = count_lines()
print(count)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('5');
        });
      });

      it('should return count of matching lines when pattern given', async () => {
        const context = `import os
import sys
def main():
    pass
import json`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
count = count_lines("import")
print(count)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('3');
        });
      });

      it('should return 0 when pattern matches nothing', async () => {
        const result = await sandbox.execute(`
count = count_lines("nonexistent_xyz")
print(count)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('0');
      });
    });

    describe('get_line function', () => {
      it('should return content of specific line (1-indexed)', async () => {
        const context = `first line
second line
third line`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
line = get_line(2)
print(line)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('second line');
        });
      });

      it('should return empty string for out-of-bounds line number', async () => {
        await runWithSandbox('only one line', async (sb) => {
          const result = await sb.execute(`
line = get_line(999)
print(repr(line))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toMatch(/['"]{2}/);
        });
      });

      it('should return empty string for line 0', async () => {
        await runWithSandbox('some content', async (sb) => {
          const result = await sb.execute(`
line = get_line(0)
print(repr(line))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toMatch(/['"]{2}/);
        });
      });
    });

    describe('quote_match function', () => {
      it('should return first match of pattern', async () => {
        await runWithSandbox('The value is max_tokens: 8192, other stuff', async (sb) => {
          const result = await sb.execute(`
match = quote_match("max_tokens: \\d+")
print(match)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('max_tokens: 8192');
        });
      });

      it('should return None when no match', async () => {
        const result = await sandbox.execute(`
match = quote_match("nonexistent_xyz")
print(match is None)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('True');
      });

      it('should truncate long matches with max_length', async () => {
        await runWithSandbox('This is a very long string that should be truncated when matched', async (sb) => {
          const result = await sb.execute(`
match = quote_match("This is a very long string", max_length=15)
print(match)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('...');
          expect(result.stdout.trim().length).toBeLessThan(25);
        });
      });
    });

    describe('chunk_by_headers function (4.3.1)', () => {
      it('should chunk context by markdown headers at default level 2', async () => {
        const context = `# Main Title
Intro content.

## Section 1
Content for section 1.

## Section 2
Content for section 2.

### Subsection
Not at level 2.`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_headers()
print(len(chunks))
print(chunks[0]['header'])
print(chunks[1]['header'])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('2');
          expect(result.stdout).toContain('## Section 1');
          expect(result.stdout).toContain('## Section 2');
        });
      });

      it('should chunk at specified header level', async () => {
        const context = `# H1 First
Content 1.

# H1 Second
Content 2.

## H2 Sub
Sub content.`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_headers(level=1)
print(len(chunks))
print(chunks[0]['header'])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('2');
          expect(result.stdout).toContain('# H1 First');
        });
      });

      it('should return empty list when no headers at level', async () => {
        await runWithSandbox('Plain text with no headers.', async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_headers()
print(len(chunks))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout.trim()).toBe('0');
        });
      });

      it('should include content between headers', async () => {
        const context = `## First
First content here.

## Second
Second content here.`;

        await runWithSandbox(context, async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_headers()
print('content' in chunks[0])
print(len(chunks[0]['content']) > 0)
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('True');
        });
      });
    });

    describe('chunk_by_size function (4.3.2)', () => {
      it('should chunk context by character count', async () => {
        await runWithSandbox('A'.repeat(100), async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_size(chars=30)
print(len(chunks))
print(len(chunks[0]))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('4');
          expect(result.stdout).toContain('30');
        });
      });

      it('should support overlap parameter', async () => {
        await runWithSandbox('0123456789' + '0123456789' + '0123456789', async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_size(chars=15, overlap=5)
print(len(chunks))
print(chunks[0][-5:])
print(chunks[1][:5])
`);

          expect(result.error).toBeUndefined();
          const lines = result.stdout.trim().split('\n');
          expect(lines[1]).toBe(lines[2]);
        });
      });

      it('should use default parameters when not specified', async () => {
        await runWithSandbox('Short context', async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_size()
print(len(chunks))
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('1');
        });
      });

      it('should return single chunk when context smaller than chars', async () => {
        await runWithSandbox('Small text', async (sb) => {
          const result = await sb.execute(`
chunks = chunk_by_size(chars=1000)
print(len(chunks))
print(chunks[0])
`);

          expect(result.error).toBeUndefined();
          expect(result.stdout).toContain('1');
          expect(result.stdout).toContain('Small text');
        });
      });
    });
  });

  describe('Variable Access', () => {
    beforeEach(async () => {
      await sandbox.initialize('test');
    });

    describe('Get existing variable', () => {
      it('should return the variable value converted to JavaScript', async () => {
        await sandbox.execute(`
my_number = 42
my_string = "hello"
my_list = [1, 2, 3]
`);

        const numValue = await sandbox.getVariable('my_number');
        const strValue = await sandbox.getVariable('my_string');
        const listValue = await sandbox.getVariable('my_list');

        expect(numValue).toBe(42);
        expect(strValue).toBe('hello');
        expect(listValue).toEqual([1, 2, 3]);
      });

      it('should handle dict conversion', async () => {
        await sandbox.execute(`
my_dict = {"key": "value", "num": 123}
`);

        const dictValue = await sandbox.getVariable('my_dict');

        expect(dictValue).toEqual({ key: 'value', num: 123 });
      });
    });

    describe('Get missing variable', () => {
      it('should return undefined for non-existent variable', async () => {
        const value = await sandbox.getVariable('nonexistent_variable');

        expect(value).toBeUndefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle execution without initialization', async () => {
      const freshSandbox = createSandbox(DEFAULT_CONFIG, defaultBridges);

      await expect(freshSandbox.execute('print(1)')).rejects.toThrow('not initialized');
    });

    it('should preserve variables across multiple executions', async () => {
      await sandbox.initialize('test');

      await sandbox.execute('x = 10');
      await sandbox.execute('y = x * 2');
      const result = await sandbox.execute('print(y)');

      expect(result.stdout).toContain('20');
    });

    it('should handle large context', async () => {
      const largeContext = 'x'.repeat(100000);
      await sandbox.initialize(largeContext);

      const result = await sandbox.execute('print(len(context))');

      expect(result.error).toBeUndefined();
      expect(result.stdout).toContain('100000');
    });
  });

  describe('Cancel Method', () => {
    it('should have cancel method available', async () => {
      await sandbox.initialize('test');

      await expect(sandbox.cancel()).resolves.toBeUndefined();
    });

    it('should be safe to call cancel when not executing', async () => {
      await sandbox.initialize('test');

      await sandbox.cancel();
      await sandbox.cancel();
    });
  });

  describe('Configuration Options', () => {
    it('should accept indexURL from allowed domain', async () => {
      const configWithUrl: REPLConfig = {
        ...DEFAULT_CONFIG,
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
      };
      const customSandbox = createSandbox(configWithUrl, defaultBridges);
      await customSandbox.initialize('test');

      const result = await customSandbox.execute('print("ok")');
      expect(result.error).toBeUndefined();

      await customSandbox.destroy();
    });

    it('should reject indexURL from untrusted domain', async () => {
      const configWithUrl: REPLConfig = {
        ...DEFAULT_CONFIG,
        indexURL: 'https://custom.cdn.com/pyodide/',
      };
      const customSandbox = createSandbox(configWithUrl, defaultBridges);

      await expect(customSandbox.initialize('test')).rejects.toThrow(
        'Untrusted Pyodide URL domain: custom.cdn.com'
      );
    });

    it('should reject indexURL array with untrusted domain', async () => {
      const configWithUrls: REPLConfig = {
        ...DEFAULT_CONFIG,
        indexURL: ['https://cdn1.com/pyodide/', 'https://cdn2.com/pyodide/'],
      };
      const customSandbox = createSandbox(configWithUrls, defaultBridges);

      await expect(customSandbox.initialize('test')).rejects.toThrow(
        'Untrusted Pyodide URL domain: cdn1.com'
      );
    });

    it('should respect useWorker=false to force direct mode', async () => {
      const configNoWorker: REPLConfig = {
        ...DEFAULT_CONFIG,
        useWorker: false,
      };
      const directSandbox = createSandbox(configNoWorker, defaultBridges);
      await directSandbox.initialize('test');

      const result = await directSandbox.execute('print("direct mode")');
      expect(result.error).toBeUndefined();
      expect(result.stdout).toContain('direct mode');

      await directSandbox.destroy();
    });
  });

  describe('Worker Detection', () => {
    it('should export detectWorkerSupport function', () => {
      expect(typeof detectWorkerSupport).toBe('function');
    });

    it('should return boolean from detectWorkerSupport', () => {
      const result = detectWorkerSupport();
      expect(typeof result).toBe('boolean');
    });
  });
});
