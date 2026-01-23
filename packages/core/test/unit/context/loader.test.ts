import { describe, it, expect } from 'vitest';
import {
  loadContext,
  estimateTokens,
  detectContentType,
  escapeForPython,
  type LoadedContext,
} from '../../../src/context/loader.js';

describe('loadContext', () => {
  it('returns LoadedContext with correct structure', () => {
    const content = 'Hello, world!';
    const result = loadContext(content);

    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('length');
    expect(result).toHaveProperty('tokenEstimate');
    expect(result).toHaveProperty('contentType');
  });

  it('preserves the original content', () => {
    const content = 'Test content with special chars: @#$%';
    const result = loadContext(content);

    expect(result.content).toBe(content);
  });

  it('calculates correct character length', () => {
    const content = 'Hello';
    const result = loadContext(content);

    expect(result.length).toBe(5);
  });

  it('handles empty string', () => {
    const result = loadContext('');

    expect(result.content).toBe('');
    expect(result.length).toBe(0);
    expect(result.tokenEstimate).toBe(0);
    expect(result.contentType).toBe('plain');
  });

  it('handles unicode characters', () => {
    const content = 'Hello \u4e16\u754c'; // Hello 世界
    const result = loadContext(content);

    expect(result.content).toBe(content);
    expect(result.length).toBe(content.length);
  });
});

describe('estimateTokens', () => {
  it('estimates tokens using ~4 chars per token', () => {
    const content = 'abcdefgh'; // 8 chars = 2 tokens
    const estimate = estimateTokens(content);

    expect(estimate).toBe(2);
  });

  it('rounds up for partial tokens', () => {
    const content = 'abcde'; // 5 chars = 1.25 tokens -> 2
    const estimate = estimateTokens(content);

    expect(estimate).toBe(2);
  });

  it('returns 0 for empty string', () => {
    const estimate = estimateTokens('');

    expect(estimate).toBe(0);
  });

  it('is within 2x of reasonable token count for English text', () => {
    // Average English word is ~5 chars, and ~1 token per word
    // So 100 chars ~ 20 words ~ 20 tokens
    const content = 'The quick brown fox jumps over the lazy dog.'; // 44 chars
    const estimate = estimateTokens(content);

    // With 4 chars/token: 44/4 = 11 tokens
    // Actual would be around 10 tokens
    // Check that estimate is within 2x (5-22)
    expect(estimate).toBeGreaterThanOrEqual(5);
    expect(estimate).toBeLessThanOrEqual(22);
  });

  it('handles long content', () => {
    const content = 'a'.repeat(10000);
    const estimate = estimateTokens(content);

    expect(estimate).toBe(2500);
  });
});

describe('detectContentType', () => {
  describe('JSON detection', () => {
    it('detects valid JSON object', () => {
      const content = '{"key": "value", "number": 42}';
      const result = detectContentType(content);

      expect(result).toBe('json');
    });

    it('detects valid JSON array', () => {
      const content = '[1, 2, 3, "four"]';
      const result = detectContentType(content);

      expect(result).toBe('json');
    });

    it('detects JSON with leading whitespace', () => {
      const content = '  \n  {"key": "value"}';
      const result = detectContentType(content);

      expect(result).toBe('json');
    });

    it('does not detect invalid JSON starting with {', () => {
      const content = '{not valid json}';
      const result = detectContentType(content);

      expect(result).not.toBe('json');
    });

    it('does not detect invalid JSON starting with [', () => {
      const content = '[not, valid, json';
      const result = detectContentType(content);

      expect(result).not.toBe('json');
    });
  });

  describe('code detection', () => {
    it('detects JavaScript/TypeScript import statements', () => {
      const content = 'import { something } from "module";';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects Python from...import statements', () => {
      const content = 'from module import something';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects const declarations', () => {
      const content = 'const myVariable = 42;';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects function declarations', () => {
      const content = 'function myFunction() {\n  return 42;\n}';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects class declarations', () => {
      const content = 'class MyClass {\n  constructor() {}\n}';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects Python def statements', () => {
      const content = 'def my_function():\n    return 42';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects Java/Go package statements', () => {
      const content = 'package main\n\nimport "fmt"';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });

    it('detects code patterns at start of lines (not just start of string)', () => {
      const content = 'Some comment\nfunction test() {}';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });
  });

  describe('markdown detection', () => {
    it('detects h1 headers', () => {
      const content = '# Main Title\n\nSome content here.';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });

    it('detects h2 headers', () => {
      const content = '## Section Title\n\nContent.';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });

    it('detects h6 headers', () => {
      const content = '###### Deep Header\n\nContent.';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });

    it('detects bullet points with dash', () => {
      const content = 'List:\n- Item one\n- Item two';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });

    it('detects bullet points with asterisk', () => {
      const content = 'List:\n* Item one\n* Item two';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });

    it('detects indented bullet points', () => {
      const content = 'List:\n  - Indented item';
      const result = detectContentType(content);

      expect(result).toBe('markdown');
    });
  });

  describe('plain text fallback', () => {
    it('returns plain for regular text', () => {
      const content = 'This is just regular text without any special formatting.';
      const result = detectContentType(content);

      expect(result).toBe('plain');
    });

    it('returns plain for empty string', () => {
      const result = detectContentType('');

      expect(result).toBe('plain');
    });

    it('returns plain for whitespace only', () => {
      const result = detectContentType('   \n\t  ');

      expect(result).toBe('plain');
    });
  });

  describe('priority ordering', () => {
    it('prioritizes JSON over code patterns', () => {
      // JSON that happens to contain code-like text
      const content = '{"code": "const x = 1"}';
      const result = detectContentType(content);

      expect(result).toBe('json');
    });

    it('prioritizes code over markdown', () => {
      // Code with markdown-like comments
      const content = 'function test() {\n  // # This is a comment\n}';
      const result = detectContentType(content);

      expect(result).toBe('code');
    });
  });
});

describe('escapeForPython', () => {
  describe('backslash escaping', () => {
    it('doubles single backslashes', () => {
      const content = 'path\\to\\file';
      const result = escapeForPython(content);

      expect(result).toBe('path\\\\to\\\\file');
    });

    it('doubles multiple consecutive backslashes', () => {
      const content = 'test\\\\value';
      const result = escapeForPython(content);

      expect(result).toBe('test\\\\\\\\value');
    });

    it('handles backslash at end of string', () => {
      const content = 'ends with\\';
      const result = escapeForPython(content);

      expect(result).toBe('ends with\\\\');
    });
  });

  describe('triple quote escaping', () => {
    it('escapes triple double quotes', () => {
      const content = 'text with """ inside';
      const result = escapeForPython(content);

      expect(result).toBe('text with \\"\\"\\" inside');
    });

    it('handles multiple triple quotes', () => {
      const content = '"""start""" and """end"""';
      const result = escapeForPython(content);

      expect(result).toBe('\\"\\"\\"start\\"\\"\\" and \\"\\"\\"end\\"\\"\\"');
    });
  });

  describe('line ending normalization', () => {
    it('converts CRLF to LF', () => {
      const content = 'line1\r\nline2\r\nline3';
      const result = escapeForPython(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('preserves existing LF', () => {
      const content = 'line1\nline2\nline3';
      const result = escapeForPython(content);

      expect(result).toBe('line1\nline2\nline3');
    });

    it('handles mixed line endings', () => {
      const content = 'line1\r\nline2\nline3\r\nline4';
      const result = escapeForPython(content);

      expect(result).toBe('line1\nline2\nline3\nline4');
    });
  });

  describe('combined escaping', () => {
    it('handles backslashes and triple quotes together', () => {
      const content = 'path\\file with """quotes"""';
      const result = escapeForPython(content);

      expect(result).toBe('path\\\\file with \\"\\"\\"quotes\\"\\"\\"');
    });

    it('handles all escape cases together', () => {
      const content = 'path\\to\\file\r\nwith """quotes"""';
      const result = escapeForPython(content);

      expect(result).toBe('path\\\\to\\\\file\nwith \\"\\"\\"quotes\\"\\"\\"');
    });

    it('handles empty string', () => {
      const result = escapeForPython('');

      expect(result).toBe('');
    });

    it('passes through regular text unchanged', () => {
      const content = 'Regular text without special chars';
      const result = escapeForPython(content);

      expect(result).toBe(content);
    });
  });

  describe('edge cases', () => {
    it('handles unicode characters', () => {
      const content = 'Unicode: \u4e16\u754c \u2603';
      const result = escapeForPython(content);

      expect(result).toBe(content);
    });

    it('handles newlines and tabs', () => {
      const content = 'tabs:\t\tand\nnewlines';
      const result = escapeForPython(content);

      expect(result).toBe('tabs:\t\tand\nnewlines');
    });

    it('handles single and double quotes (not triple)', () => {
      const content = "single ' and double \" quotes";
      const result = escapeForPython(content);

      // Single/double quotes don't need escaping for triple-quoted strings
      expect(result).toBe("single ' and double \" quotes");
    });
  });
});
