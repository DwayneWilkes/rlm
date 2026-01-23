import { describe, it, expect } from 'vitest';
import { parseResponse, type ParsedResponse } from '../../../src/engine/parser.js';

describe('parseResponse', () => {
  describe('code block extraction', () => {
    it('should extract a single repl code block', () => {
      const response = `Let me analyze the context.

\`\`\`repl
print(len(context))
\`\`\`

Now let me check further.`;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]).toBe('print(len(context))');
    });

    it('should extract a single python code block', () => {
      const response = `Here's the analysis:

\`\`\`python
result = context.split('\\n')
print(len(result))
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]).toBe("result = context.split('\\n')\nprint(len(result))");
    });

    it('should extract multiple code blocks in order', () => {
      const response = `First step:

\`\`\`repl
print("step 1")
\`\`\`

Second step:

\`\`\`python
print("step 2")
\`\`\`

Third step:

\`\`\`repl
print("step 3")
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(3);
      expect(result.codeBlocks[0]).toBe('print("step 1")');
      expect(result.codeBlocks[1]).toBe('print("step 2")');
      expect(result.codeBlocks[2]).toBe('print("step 3")');
    });

    it('should return empty array when no code blocks', () => {
      const response = 'Just some text without any code blocks.';

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should ignore other code block types (js, json, etc)', () => {
      const response = `Some code:

\`\`\`json
{"key": "value"}
\`\`\`

And JavaScript:

\`\`\`js
console.log("hello");
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(0);
    });

    it('should handle multiline code blocks', () => {
      const response = `Complex code:

\`\`\`repl
def analyze(text):
    lines = text.split('\\n')
    return len(lines)

result = analyze(context)
print(f"Lines: {result}")
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]).toContain('def analyze(text):');
      expect(result.codeBlocks[0]).toContain('print(f"Lines: {result}")');
    });

    it('should trim whitespace from extracted code', () => {
      const response = `Code:

\`\`\`repl

   print("hello")

\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks[0]).toBe('print("hello")');
    });
  });

  describe('FINAL direct answer extraction', () => {
    it('should extract FINAL with simple answer', () => {
      const response = `After analysis:

FINAL(The answer is 42)`;

      const result = parseResponse(response);

      expect(result.finalAnswer).not.toBeNull();
      expect(result.finalAnswer?.type).toBe('direct');
      expect(result.finalAnswer?.value).toBe('The answer is 42');
    });

    it('should extract FINAL with multiline answer', () => {
      const response = `FINAL(The main findings are:
1. First point
2. Second point
3. Third point)`;

      const result = parseResponse(response);

      expect(result.finalAnswer?.type).toBe('direct');
      expect(result.finalAnswer?.value).toContain('First point');
      expect(result.finalAnswer?.value).toContain('Third point');
    });

    it('should trim whitespace from final answer', () => {
      const response = 'FINAL(  trimmed answer  )';

      const result = parseResponse(response);

      expect(result.finalAnswer?.value).toBe('trimmed answer');
    });

    it('should handle FINAL with special characters', () => {
      const response = 'FINAL(The result: $100 at 50% rate)';

      const result = parseResponse(response);

      expect(result.finalAnswer?.value).toBe('The result: $100 at 50% rate');
    });
  });

  describe('FINAL_VAR variable reference extraction', () => {
    it('should extract FINAL_VAR with variable name', () => {
      const response = `\`\`\`repl
summary = "This is the summary"
\`\`\`

FINAL_VAR(summary)`;

      const result = parseResponse(response);

      expect(result.finalAnswer).not.toBeNull();
      expect(result.finalAnswer?.type).toBe('variable');
      expect(result.finalAnswer?.value).toBe('summary');
    });

    it('should extract FINAL_VAR with underscore in name', () => {
      const response = 'FINAL_VAR(final_result)';

      const result = parseResponse(response);

      expect(result.finalAnswer?.type).toBe('variable');
      expect(result.finalAnswer?.value).toBe('final_result');
    });

    it('should extract FINAL_VAR with numbers in name', () => {
      const response = 'FINAL_VAR(result2)';

      const result = parseResponse(response);

      expect(result.finalAnswer?.type).toBe('variable');
      expect(result.finalAnswer?.value).toBe('result2');
    });

    it('should prioritize FINAL over FINAL_VAR when both present', () => {
      const response = `FINAL(Direct answer)
FINAL_VAR(some_var)`;

      const result = parseResponse(response);

      expect(result.finalAnswer?.type).toBe('direct');
      expect(result.finalAnswer?.value).toBe('Direct answer');
    });
  });

  describe('thinking extraction', () => {
    it('should capture text outside code blocks as thinking', () => {
      const response = `Let me think about this problem.

\`\`\`repl
print("hello")
\`\`\`

That shows some information.`;

      const result = parseResponse(response);

      expect(result.thinking).toContain('Let me think about this problem');
      expect(result.thinking).toContain('That shows some information');
      expect(result.thinking).not.toContain('print("hello")');
    });

    it('should exclude FINAL marker from thinking', () => {
      const response = `I analyzed the data.

FINAL(The conclusion)`;

      const result = parseResponse(response);

      expect(result.thinking).toBe('I analyzed the data.');
      expect(result.thinking).not.toContain('FINAL');
      expect(result.thinking).not.toContain('The conclusion');
    });

    it('should exclude FINAL_VAR marker from thinking', () => {
      const response = `Setting up result variable.

\`\`\`repl
result = "done"
\`\`\`

FINAL_VAR(result)`;

      const result = parseResponse(response);

      expect(result.thinking).toContain('Setting up result variable');
      expect(result.thinking).not.toContain('FINAL_VAR');
      expect(result.thinking).not.toContain('(result)');
    });

    it('should return empty thinking when only code block', () => {
      const response = `\`\`\`repl
print("just code")
\`\`\``;

      const result = parseResponse(response);

      expect(result.thinking).toBe('');
    });

    it('should trim thinking text', () => {
      const response = `

   Some thinking with extra whitespace.

\`\`\`repl
print("code")
\`\`\`

`;

      const result = parseResponse(response);

      expect(result.thinking).toBe('Some thinking with extra whitespace.');
    });
  });

  describe('no final answer', () => {
    it('should return null finalAnswer when no FINAL marker', () => {
      const response = `Just analyzing:

\`\`\`repl
print(len(context))
\`\`\`

Need more iterations.`;

      const result = parseResponse(response);

      expect(result.finalAnswer).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty response', () => {
      const result = parseResponse('');

      expect(result.thinking).toBe('');
      expect(result.codeBlocks).toHaveLength(0);
      expect(result.finalAnswer).toBeNull();
    });

    it('should handle response with only whitespace', () => {
      const result = parseResponse('   \n\n   ');

      expect(result.thinking).toBe('');
      expect(result.codeBlocks).toHaveLength(0);
      expect(result.finalAnswer).toBeNull();
    });

    it('should handle code block with empty content', () => {
      const response = `\`\`\`repl
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]).toBe('');
    });

    it('should handle nested backticks in code', () => {
      const response = `\`\`\`repl
code = """
some text with \`backticks\`
"""
print(code)
\`\`\``;

      const result = parseResponse(response);

      expect(result.codeBlocks).toHaveLength(1);
      expect(result.codeBlocks[0]).toContain('backticks');
    });

    it('should handle FINAL with parentheses in content', () => {
      const response = 'FINAL(The function foo(x) returns bar(y))';

      const result = parseResponse(response);

      // Note: This is a known limitation - greedy matching stops at first )
      // The regex could be improved but this documents current behavior
      expect(result.finalAnswer).not.toBeNull();
    });
  });

  describe('return type structure', () => {
    it('should return complete ParsedResponse structure', () => {
      const response = `Thinking text

\`\`\`repl
print("code")
\`\`\`

FINAL(answer)`;

      const result = parseResponse(response);

      expect(result).toHaveProperty('thinking');
      expect(result).toHaveProperty('codeBlocks');
      expect(result).toHaveProperty('finalAnswer');
      expect(typeof result.thinking).toBe('string');
      expect(Array.isArray(result.codeBlocks)).toBe(true);
    });
  });
});
