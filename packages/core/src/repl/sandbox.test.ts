import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { REPLConfig, CodeExecution } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';
import { createSandbox } from './sandbox.js';

describe('Sandbox', () => {
  const defaultConfig: REPLConfig = {
    timeout: 5000,
    maxOutputLength: 1000,
  };

  const defaultBridges: SandboxBridges = {
    onLLMQuery: vi.fn().mockResolvedValue('LLM response'),
    onRLMQuery: vi.fn().mockResolvedValue('RLM response'),
  };

  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox(defaultConfig, defaultBridges);
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
        // Context should contain newlines and special chars
        expect(result.stdout).toContain('\\n');
      });
    });

    describe('Cleanup on destroy', () => {
      it('should release Pyodide resources after destroy', async () => {
        await sandbox.initialize('test');
        await sandbox.destroy();

        // After destroy, execute should fail
        await expect(sandbox.execute('print(1)')).rejects.toThrow();
      });

      it('should be safe to call destroy multiple times', async () => {
        await sandbox.initialize('test');
        await sandbox.destroy();
        await sandbox.destroy(); // Should not throw
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
    describe('Timeout exceeded', () => {
      it('should terminate execution with timeout error when exceeding config.timeout', async () => {
        const shortTimeoutConfig: REPLConfig = {
          timeout: 100, // 100ms timeout
          maxOutputLength: 1000,
        };
        const shortTimeoutSandbox = createSandbox(shortTimeoutConfig, defaultBridges);
        await shortTimeoutSandbox.initialize('test');

        // Note: In Pyodide/WASM, true interruption of infinite loops is limited.
        // This test verifies the timeout mechanism exists.
        const result = await shortTimeoutSandbox.execute(`
import time
time.sleep(1)  # Sleep for 1 second, but timeout is 100ms
print("done")
`);

        expect(result.error).toBeDefined();
        expect(result.error).toContain('timeout');

        await shortTimeoutSandbox.destroy();
      });
    });

    describe('Timeout configurable', () => {
      it('should use REPLConfig.timeout value as the timeout in milliseconds', async () => {
        const customTimeoutConfig: REPLConfig = {
          timeout: 2000,
          maxOutputLength: 1000,
        };
        const customSandbox = createSandbox(customTimeoutConfig, defaultBridges);
        await customSandbox.initialize('test');

        // Quick execution should succeed
        const result = await customSandbox.execute('print("fast")');

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('fast');

        await customSandbox.destroy();
      });
    });
  });

  describe('Output Truncation', () => {
    describe('Output within limit', () => {
      it('should return full output when stdout length <= maxOutputLength', async () => {
        const config: REPLConfig = {
          timeout: 5000,
          maxOutputLength: 1000,
        };
        const truncSandbox = createSandbox(config, defaultBridges);
        await truncSandbox.initialize('test');

        const result = await truncSandbox.execute('print("short output")');

        expect(result.stdout).toBe('short output\n');
        expect(result.stdout).not.toContain('truncated');

        await truncSandbox.destroy();
      });
    });

    describe('Output exceeds limit', () => {
      it('should truncate output with omission notice when stdout > maxOutputLength', async () => {
        const config: REPLConfig = {
          timeout: 5000,
          maxOutputLength: 50,
        };
        const truncSandbox = createSandbox(config, defaultBridges);
        await truncSandbox.initialize('test');

        const result = await truncSandbox.execute('print("x" * 200)');

        expect(result.stdout.length).toBeLessThan(200);
        expect(result.stdout).toContain('truncated');
        expect(result.stdout).toContain('omitted');

        await truncSandbox.destroy();
      });
    });
  });

  describe('LLM Bridge Functions', () => {
    beforeEach(async () => {
      await sandbox.initialize('bridge test context');
    });

    describe('llm_query function', () => {
      it('should invoke onLLMQuery callback and return the response', async () => {
        const mockLLMQuery = vi.fn().mockResolvedValue('mocked LLM answer');
        const bridgeSandbox = createSandbox(defaultConfig, {
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
    });

    describe('rlm_query function', () => {
      it('should invoke onRLMQuery callback and return the response', async () => {
        const mockRLMQuery = vi.fn().mockResolvedValue('mocked RLM answer');
        const bridgeSandbox = createSandbox(defaultConfig, {
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
        const bridgeSandbox = createSandbox(defaultConfig, {
          ...defaultBridges,
          onRLMQuery: mockRLMQuery,
        });
        await bridgeSandbox.initialize('original context');

        await bridgeSandbox.execute(`
rlm_query("task without context")
`);

        // Should be called with task and the original context
        expect(mockRLMQuery).toHaveBeenCalledWith('task without context', 'original context');

        await bridgeSandbox.destroy();
      });

      it('should use provided ctx when specified', async () => {
        const mockRLMQuery = vi.fn().mockResolvedValue('answer');
        const bridgeSandbox = createSandbox(defaultConfig, {
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
  });

  describe('Utility Functions', () => {
    beforeEach(async () => {
      await sandbox.initialize('This is a test context with some searchable content.');
    });

    describe('chunk_text function', () => {
      it('should return a list of overlapping text chunks', async () => {
        const result = await sandbox.execute(`
text = "0123456789" * 10  # 100 chars
chunks = chunk_text(text, size=30, overlap=5)
print(len(chunks))
print(chunks[0])
print(chunks[1][:10])  # First 10 chars of second chunk
`);

        expect(result.error).toBeUndefined();
        // Should have multiple chunks
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
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('The quick brown fox jumps over the lazy dog');

        const result = await testSandbox.execute(`
results = search_context("fox", window=10)
print(len(results))
if results:
    print(results[0]['match'])
    print('context' in results[0])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('1'); // One match
        expect(result.stdout).toContain('fox'); // The match
        expect(result.stdout).toContain('True'); // Has context key

        await testSandbox.destroy();
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
      const freshSandbox = createSandbox(defaultConfig, defaultBridges);

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
});
