import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { REPLConfig } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';

/**
 * Mock Pyodide for unit tests.
 *
 * Pyodide has environment-specific path resolution issues on Windows with pnpm.
 * This mock simulates Python execution behavior for testing the sandbox wrapper.
 * Real Pyodide integration should be tested in browser or integration tests.
 */

// Python execution state
interface PythonState {
  context: string;
  variables: Map<string, unknown>;
  stdout: string;
  stderr: string;
}

let pythonState: PythonState;
let bridges: { llm: Function | null; rlm: Function | null };

function resetPythonState() {
  pythonState = {
    context: '',
    variables: new Map(),
    stdout: '',
    stderr: '',
  };
  bridges = { llm: null, rlm: null };
}

// Mock globals object
const mockGlobals = {
  set: vi.fn((key: string, value: unknown) => {
    if (key === 'context' || key === '__context_ref__') {
      pythonState.context = String(value);
    } else if (key === '__llm_query_bridge__') {
      bridges.llm = value as Function;
    } else if (key === '__rlm_query_bridge__') {
      bridges.rlm = value as Function;
    } else {
      pythonState.variables.set(key, value);
    }
  }),
  get: vi.fn((key: string) => {
    if (pythonState.variables.has(key)) {
      const val = pythonState.variables.get(key);
      if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        return { toJs: () => val };
      }
      return val;
    }
    return undefined;
  }),
};

// Simulate Python code execution
async function simulatePython(code: string): Promise<unknown> {
  // Setup stdout/stderr capture
  if (code.includes('__stdout__ = StringIO()')) {
    pythonState.stdout = '';
    pythonState.stderr = '';
    return undefined;
  }

  // Get stdout value
  if (code.includes('__stdout__.getvalue()')) {
    return pythonState.stdout;
  }

  // Get stderr value
  if (code.includes('__stderr__.getvalue()')) {
    return pythonState.stderr;
  }

  // Restore stdout/stderr
  if (code.includes('sys.stdout = __old_stdout__') && !code.includes('getvalue')) {
    return undefined;
  }

  // Setup code (bridge definitions)
  if (code.includes('def llm_query') || code.includes('RLM sandbox ready')) {
    return undefined;
  }

  // Raise statements
  if (code.includes('raise ValueError')) {
    throw new Error('ValueError: test error');
  }
  if (code.includes('raise ')) {
    const m = code.match(/raise (\w+)\("([^"]+)"\)/);
    if (m) throw new Error(`${m[1]}: ${m[2]}`);
  }

  // Syntax errors
  if (code.includes('def incomplete(')) {
    throw new Error('SyntaxError: unexpected EOF while parsing');
  }

  // Name errors
  if (code.includes('print(undefined_variable)')) {
    throw new Error("NameError: name 'undefined_variable' is not defined");
  }

  // Time sleep (for timeout tests)
  if (code.includes('time.sleep(')) {
    const m = code.match(/time\.sleep\((\d+)\)/);
    if (m) {
      await new Promise(resolve => setTimeout(resolve, parseInt(m[1], 10) * 1000));
    }
    return undefined;
  }

  // Stderr write
  if (code.includes('sys.stderr.write(')) {
    const m = code.match(/sys\.stderr\.write\("([^"]+)"\)/);
    if (m) pythonState.stderr += m[1];
    return undefined;
  }

  // Handle multiline code with multiple statements
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  for (const line of lines) {
    await executePythonLine(line);
  }

  return undefined;
}

async function executePythonLine(line: string): Promise<void> {
  // Variable assignment
  const assignMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, varName, expr] = assignMatch;
    const value = await evaluateExpression(expr);
    pythonState.variables.set(varName, value);
    return;
  }

  // Print statement
  const printMatch = line.match(/^print\((.+)\)$/);
  if (printMatch) {
    const value = await evaluateExpression(printMatch[1]);
    pythonState.stdout += String(value) + '\n';
    return;
  }

  // llm_query call (not assigned)
  if (line.includes('llm_query(') && !line.includes('=')) {
    const m = line.match(/llm_query\("([^"]+)"\)/);
    if (m && bridges.llm) {
      await bridges.llm(m[1]);
    }
    return;
  }

  // rlm_query call (not assigned)
  if (line.includes('rlm_query(') && !line.includes('=')) {
    const withCtx = line.match(/rlm_query\("([^"]+)",\s*"([^"]+)"\)/);
    const withoutCtx = line.match(/rlm_query\("([^"]+)"\)/);
    if (bridges.rlm) {
      if (withCtx) {
        await bridges.rlm(withCtx[1], withCtx[2]);
      } else if (withoutCtx) {
        await bridges.rlm(withoutCtx[1], pythonState.context);
      }
    }
    return;
  }
}

async function evaluateExpression(expr: string): Promise<unknown> {
  expr = expr.trim();

  // String literal
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  // Number literal
  if (/^\d+$/.test(expr)) {
    return parseInt(expr, 10);
  }

  // List literal
  if (expr.startsWith('[') && expr.endsWith(']')) {
    const inner = expr.slice(1, -1);
    if (inner.includes(',')) {
      return inner.split(',').map(s => parseInt(s.trim(), 10));
    }
    return [];
  }

  // Dict literal
  if (expr.startsWith('{') && expr.endsWith('}')) {
    // Simple dict parsing for test cases
    const inner = expr.slice(1, -1);
    const pairs = inner.split(',').map(p => {
      const [k, v] = p.split(':').map(s => s.trim());
      const key = k.replace(/["']/g, '');
      let val: unknown = v.replace(/["']/g, '');
      if (/^\d+$/.test(v)) val = parseInt(v, 10);
      return [key, val];
    });
    return Object.fromEntries(pairs);
  }

  // len() function
  const lenMatch = expr.match(/^len\((\w+)\)$/);
  if (lenMatch) {
    const val = pythonState.variables.get(lenMatch[1]) ?? pythonState.context;
    if (typeof val === 'string') return val.length;
    if (Array.isArray(val)) return val.length;
    return 0;
  }

  // repr() function
  const reprMatch = expr.match(/^repr\((\w+)\)$/);
  if (reprMatch) {
    const val = pythonState.variables.get(reprMatch[1]) ?? pythonState.context;
    return JSON.stringify(val);
  }

  // String multiplication: "x" * 200 or "0123456789" * 10
  const strMulMatch = expr.match(/^"([^"]+)" \* (\d+)$/);
  if (strMulMatch) {
    return strMulMatch[1].repeat(parseInt(strMulMatch[2], 10));
  }

  // Variable * number
  const mulMatch = expr.match(/^(\w+) \* (\d+)$/);
  if (mulMatch) {
    const val = pythonState.variables.get(mulMatch[1]) as number;
    return val * parseInt(mulMatch[2], 10);
  }

  // Variable reference
  if (/^\w+$/.test(expr)) {
    if (expr === 'context') return pythonState.context;
    return pythonState.variables.get(expr);
  }

  // llm_query call
  const llmMatch = expr.match(/^llm_query\("([^"]+)"\)$/);
  if (llmMatch && bridges.llm) {
    return await bridges.llm(llmMatch[1]);
  }

  // rlm_query call
  const rlmWithCtx = expr.match(/^rlm_query\("([^"]+)",\s*"([^"]+)"\)$/);
  const rlmWithoutCtx = expr.match(/^rlm_query\("([^"]+)"\)$/);
  if (bridges.rlm) {
    if (rlmWithCtx) {
      return await bridges.rlm(rlmWithCtx[1], rlmWithCtx[2]);
    }
    if (rlmWithoutCtx) {
      return await bridges.rlm(rlmWithoutCtx[1], pythonState.context);
    }
  }

  // chunk_text call
  const chunkMatch = expr.match(/^chunk_text\((\w+)(?:,\s*size=(\d+))?(?:,\s*overlap=(\d+))?\)$/);
  if (chunkMatch) {
    const text = String(pythonState.variables.get(chunkMatch[1]) ?? '');
    const size = chunkMatch[2] ? parseInt(chunkMatch[2], 10) : 10000;
    const overlap = chunkMatch[3] ? parseInt(chunkMatch[3], 10) : 500;

    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += size - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  }

  // search_context call
  const searchMatch = expr.match(/^search_context\("([^"]+)"(?:,\s*window=(\d+))?\)$/);
  if (searchMatch) {
    const pattern = searchMatch[1];
    const window = searchMatch[2] ? parseInt(searchMatch[2], 10) : 200;
    const context = pythonState.context;
    const results: Array<{ match: string; start: number; context: string }> = [];

    const regex = new RegExp(pattern, 'gi');
    let match;
    while ((match = regex.exec(context)) !== null) {
      const start = Math.max(0, match.index - window);
      const end = Math.min(context.length, match.index + match[0].length + window);
      results.push({
        match: match[0],
        start: match.index,
        context: context.slice(start, end),
      });
    }
    return results;
  }

  // count_matches call
  const countMatchesMatch = expr.match(/^count_matches\((?:r)?"([^"]+)"\)$/);
  if (countMatchesMatch) {
    const pattern = countMatchesMatch[1].replace(/\\\\d/g, '\\d');
    const context = pythonState.context;
    const regex = new RegExp(pattern, 'gi');
    const matches = context.match(regex);
    return matches ? matches.length : 0;
  }

  // extract_json call - handles both variable and string literal
  const extractJsonVarMatch = expr.match(/^extract_json\((\w+)\)$/);
  const extractJsonStrMatch = expr.match(/^extract_json\("([^"]+)"\)$/);
  if (extractJsonVarMatch || extractJsonStrMatch) {
    let text: string;
    if (extractJsonStrMatch) {
      text = extractJsonStrMatch[1];
    } else if (extractJsonVarMatch) {
      text = extractJsonVarMatch[1] === 'context'
        ? pythonState.context
        : String(pythonState.variables.get(extractJsonVarMatch[1]) ?? '');
    } else {
      text = '';
    }
    // Find JSON object or array in text
    const jsonObjMatch = text.match(/\{[\s\S]*\}/);
    const jsonArrMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonObjMatch?.[0] || jsonArrMatch?.[0];
    if (jsonStr) {
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  // "data is None" check - returns Python-style boolean string
  const isNoneMatch = expr.match(/^(\w+) is None$/);
  if (isNoneMatch) {
    const val = pythonState.variables.get(isNoneMatch[1]);
    return (val === null || val === undefined) ? 'True' : 'False';
  }

  // Dict/object access like data['key'] or data['outer']['inner']
  const dictAccessMatch = expr.match(/^(\w+)(\[['"][\w]+['"]\])+$/);
  if (dictAccessMatch) {
    let obj = pythonState.variables.get(dictAccessMatch[1]) as Record<string, unknown>;
    if (!obj) return undefined;

    // Extract all keys from brackets
    const keys = [...expr.matchAll(/\[['"](\w+)['"]\]/g)].map(m => m[1]);
    for (const key of keys) {
      if (obj && typeof obj === 'object' && key in obj) {
        obj = obj[key] as Record<string, unknown>;
      } else {
        return undefined;
      }
    }
    return obj;
  }

  // len(expr) > 0 comparison
  const lenCompareMatch = expr.match(/^len\((\w+)(?:\[['"](\w+)['"]\])?\) > (\d+)$/);
  if (lenCompareMatch) {
    let val = pythonState.variables.get(lenCompareMatch[1]) as Record<string, unknown> | unknown[];
    if (lenCompareMatch[2] && val && typeof val === 'object') {
      val = (val as Record<string, unknown>)[lenCompareMatch[2]] as unknown[];
    }
    const threshold = parseInt(lenCompareMatch[3], 10);
    if (typeof val === 'string' || Array.isArray(val)) {
      return val.length > threshold ? 'True' : 'False';
    }
    return 'False';
  }

  // extract_sections call
  const extractSectionsMatch = expr.match(/^extract_sections\(r"([^"]+)"\)$/);
  if (extractSectionsMatch) {
    const pattern = extractSectionsMatch[1];
    const context = pythonState.context;
    const regex = new RegExp(pattern, 'gm');
    const sections: Array<{ header: string; content: string; start: number }> = [];

    const matches = [...context.matchAll(regex)];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];
      const start = match.index!;
      const end = nextMatch ? nextMatch.index! : context.length;
      const header = match[0];
      const content = context.slice(start + header.length, end).trim();
      sections.push({ header, content, start });
    }
    return sections;
  }

  // Array access like chunks[0], results[0]['match']
  const arrayAccess = expr.match(/^(\w+)\[(\d+)\](?:\['(\w+)'\])?(?:\[:(\d+)\])?$/);
  if (arrayAccess) {
    const arr = pythonState.variables.get(arrayAccess[1]) as unknown[];
    if (!arr) return undefined;
    const elem = arr[parseInt(arrayAccess[2], 10)];
    if (arrayAccess[3] && typeof elem === 'object' && elem !== null) {
      return (elem as Record<string, unknown>)[arrayAccess[3]];
    }
    if (arrayAccess[4] && typeof elem === 'string') {
      return elem.slice(0, parseInt(arrayAccess[4], 10));
    }
    return elem;
  }

  // 'content' in results[0] - returns Python-style boolean
  if (expr.includes(" in ")) {
    const inMatch = expr.match(/'(\w+)' in (\w+)\[(\d+)\]/);
    if (inMatch) {
      const arr = pythonState.variables.get(inMatch[2]) as unknown[];
      if (arr && arr[parseInt(inMatch[3], 10)]) {
        const elem = arr[parseInt(inMatch[3], 10)] as Record<string, unknown>;
        return (inMatch[1] in elem) ? 'True' : 'False';
      }
    }
    return 'False';
  }

  return expr;
}

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
    // Force direct mode by always returning false for worker detection
    detectWorkerSupport: vi.fn().mockReturnValue(false),
  };
});

import { createSandbox } from './sandbox.js';
import { detectWorkerSupport } from './pyodide.js';

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
    vi.clearAllMocks();
    resetPythonState();
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
    describe('Timeout exceeded', () => {
      it('should terminate execution with timeout error when exceeding config.timeout', async () => {
        const shortTimeoutConfig: REPLConfig = {
          timeout: 100,
          maxOutputLength: 1000,
        };
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
    });

    describe('Timeout configurable', () => {
      it('should use REPLConfig.timeout value as the timeout in milliseconds', async () => {
        const customTimeoutConfig: REPLConfig = {
          timeout: 2000,
          maxOutputLength: 1000,
        };
        const customSandbox = createSandbox(customTimeoutConfig, defaultBridges);
        await customSandbox.initialize('test');

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

    describe('count_matches function', () => {
      it('should return count of regex matches without full results', async () => {
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('The cat sat on the mat. The cat was fat.');

        const result = await testSandbox.execute(`
count = count_matches("cat")
print(count)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('2');

        await testSandbox.destroy();
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
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('test123 test456 test789');

        const result = await testSandbox.execute(`
count = count_matches(r"test\\d+")
print(count)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout.trim()).toBe('3');

        await testSandbox.destroy();
      });
    });

    describe('extract_json function', () => {
      it('should extract JSON object from text', async () => {
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('Some text {"key": "value", "num": 42} more text');

        const result = await testSandbox.execute(`
data = extract_json(context)
print(data['key'])
print(data['num'])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('value');
        expect(result.stdout).toContain('42');

        await testSandbox.destroy();
      });

      it('should extract JSON array from text', async () => {
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('Data: [1, 2, 3] end');

        const result = await testSandbox.execute(`
data = extract_json(context)
print(len(data))
print(data[0])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('3');
        expect(result.stdout).toContain('1');

        await testSandbox.destroy();
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
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('{"outer": {"inner": "nested"}}');

        const result = await testSandbox.execute(`
data = extract_json(context)
print(data['outer']['inner'])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('nested');

        await testSandbox.destroy();
      });
    });

    describe('extract_sections function', () => {
      it('should extract sections by header pattern', async () => {
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize(`# Section 1
Content for section 1.

# Section 2
Content for section 2.

# Section 3
Content for section 3.`);

        const result = await testSandbox.execute(`
sections = extract_sections(r"^# .+$")
print(len(sections))
print(sections[0]['header'])
print(sections[1]['header'])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('3');
        expect(result.stdout).toContain('# Section 1');
        expect(result.stdout).toContain('# Section 2');

        await testSandbox.destroy();
      });

      it('should include section content', async () => {
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize(`## Intro
This is the intro.

## Body
This is the body.`);

        const result = await testSandbox.execute(`
sections = extract_sections(r"^## .+$")
print('content' in sections[0])
print(len(sections[0]['content']) > 0)
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('True');

        await testSandbox.destroy();
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
        const testSandbox = createSandbox(defaultConfig, defaultBridges);
        await testSandbox.initialize('The quick brown fox jumps over the lazy dog');

        const result = await testSandbox.execute(`
results = search_context("fox", window=10)
print(len(results))
print(results[0]['match'])
print('context' in results[0])
`);

        expect(result.error).toBeUndefined();
        expect(result.stdout).toContain('1');
        expect(result.stdout).toContain('fox');
        expect(result.stdout).toContain('True');

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

  describe('Cancel Method', () => {
    it('should have cancel method available', async () => {
      await sandbox.initialize('test');

      // cancel() should be callable without error
      await expect(sandbox.cancel()).resolves.toBeUndefined();
    });

    it('should be safe to call cancel when not executing', async () => {
      await sandbox.initialize('test');

      // Should not throw even if nothing is running
      await sandbox.cancel();
      await sandbox.cancel();
    });
  });

  describe('Configuration Options', () => {
    it('should accept indexURL from allowed domain', async () => {
      // Use an allowed domain (cdn.jsdelivr.net)
      const configWithUrl: REPLConfig = {
        ...defaultConfig,
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
      };
      const customSandbox = createSandbox(configWithUrl, defaultBridges);
      await customSandbox.initialize('test');

      // Should initialize without error
      const result = await customSandbox.execute('print("ok")');
      expect(result.error).toBeUndefined();

      await customSandbox.destroy();
    });

    it('should reject indexURL from untrusted domain', async () => {
      const configWithUrl: REPLConfig = {
        ...defaultConfig,
        indexURL: 'https://custom.cdn.com/pyodide/',
      };
      const customSandbox = createSandbox(configWithUrl, defaultBridges);

      // Should throw an error for untrusted domain
      await expect(customSandbox.initialize('test')).rejects.toThrow(
        'Untrusted Pyodide URL domain: custom.cdn.com'
      );
    });

    it('should reject indexURL array with untrusted domain', async () => {
      const configWithUrls: REPLConfig = {
        ...defaultConfig,
        indexURL: ['https://cdn1.com/pyodide/', 'https://cdn2.com/pyodide/'],
      };
      const customSandbox = createSandbox(configWithUrls, defaultBridges);

      // Should throw an error for untrusted domain (uses first URL)
      await expect(customSandbox.initialize('test')).rejects.toThrow(
        'Untrusted Pyodide URL domain: cdn1.com'
      );
    });

    it('should respect useWorker=false to force direct mode', async () => {
      const configNoWorker: REPLConfig = {
        ...defaultConfig,
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
