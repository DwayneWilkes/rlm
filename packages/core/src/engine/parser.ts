/**
 * @fileoverview LLM response parser for extracting code blocks and final answers.
 *
 * Parses LLM responses to identify:
 * - Python code blocks (```repl or ```python)
 * - FINAL(answer) markers for direct answers
 * - FINAL_VAR(varname) markers for variable references
 * - Thinking/reasoning text outside these structures
 *
 * @module @rlm/core/engine/parser
 */

/**
 * Result of parsing an LLM response.
 */
export interface ParsedResponse {
  /** Any thinking/reasoning text outside code blocks and markers */
  thinking: string;
  /** Code blocks to execute (from ```repl or ```python blocks) */
  codeBlocks: string[];
  /** Final answer if present (FINAL or FINAL_VAR marker) */
  finalAnswer: {
    /** Type of final answer */
    type: 'direct' | 'variable';
    /** The answer content (direct) or variable name (variable) */
    value: string;
  } | null;
}

/**
 * Regular expression to match code blocks with repl or python language markers.
 * Captures the content between the opening and closing ``` markers.
 */
const CODE_BLOCK_REGEX = /```(?:repl|python)\n([\s\S]*?)```/g;

/**
 * Regular expression to match FINAL(answer) markers.
 * Uses a non-greedy match to handle multiline content.
 * Note: This has a limitation with nested parentheses in the answer.
 */
const FINAL_DIRECT_REGEX = /FINAL\(([\s\S]*?)\)(?!\w)/;

/**
 * Regular expression to match FINAL_VAR(varname) markers.
 * Variable names must be valid Python identifiers.
 */
const FINAL_VAR_REGEX = /FINAL_VAR\((\w+)\)/;

/**
 * Parse LLM response to extract code blocks and final answer.
 *
 * @param response - The raw LLM response text
 * @returns ParsedResponse with thinking, codeBlocks, and finalAnswer
 *
 * @example
 * ```typescript
 * const parsed = parseResponse(`
 * Let me analyze this.
 *
 * \`\`\`repl
 * print(len(context))
 * \`\`\`
 *
 * FINAL(The context has 1000 characters)
 * `);
 *
 * // parsed.thinking = "Let me analyze this."
 * // parsed.codeBlocks = ["print(len(context))"]
 * // parsed.finalAnswer = { type: 'direct', value: 'The context has 1000 characters' }
 * ```
 */
export function parseResponse(response: string): ParsedResponse {
  const codeBlocks: string[] = [];

  // Extract code blocks (```repl or ```python)
  // Need to create a new regex instance for exec loop
  const codeBlockRegex = new RegExp(CODE_BLOCK_REGEX.source, 'g');
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    codeBlocks.push(match[1].trim());
  }

  // Check for FINAL() - direct answer
  const finalDirectMatch = response.match(FINAL_DIRECT_REGEX);

  // Check for FINAL_VAR() - variable reference
  const finalVarMatch = response.match(FINAL_VAR_REGEX);

  // Determine final answer (FINAL takes priority over FINAL_VAR)
  let finalAnswer: ParsedResponse['finalAnswer'] = null;
  if (finalDirectMatch) {
    finalAnswer = { type: 'direct', value: finalDirectMatch[1].trim() };
  } else if (finalVarMatch) {
    finalAnswer = { type: 'variable', value: finalVarMatch[1] };
  }

  // Extract thinking: everything except code blocks and FINAL markers
  let thinking = response
    // Remove code blocks
    .replace(CODE_BLOCK_REGEX, '')
    // Remove FINAL() markers (including multiline content)
    .replace(/FINAL\([\s\S]*?\)(?!\w)/g, '')
    // Remove FINAL_VAR() markers
    .replace(/FINAL_VAR\(\w+\)/g, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { thinking, codeBlocks, finalAnswer };
}
