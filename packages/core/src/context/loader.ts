/**
 * Context loading and preparation utilities for REPL injection.
 *
 * @module context/loader
 */

/**
 * Represents loaded context with metadata for budget planning and system prompts.
 */
export interface LoadedContext {
  /** The raw content string */
  content: string;
  /** Character length */
  length: number;
  /** Approximate token count */
  tokenEstimate: number;
  /** Detected content type */
  contentType: 'markdown' | 'code' | 'json' | 'plain';
}

/**
 * Load and prepare context for REPL injection.
 *
 * This is intentionally simple - consumers handle file loading,
 * directory traversal, etc. We just take a string.
 *
 * @param content - The raw context string to load
 * @returns LoadedContext with content, length, tokenEstimate, and contentType
 */
export function loadContext(content: string): LoadedContext {
  return {
    content,
    length: content.length,
    tokenEstimate: estimateTokens(content),
    contentType: detectContentType(content),
  };
}

/**
 * Rough token estimation (~4 chars per token for English).
 * Good enough for budget estimation.
 *
 * @param content - The content to estimate tokens for
 * @returns Estimated token count (rounded up)
 */
export function estimateTokens(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return Math.ceil(content.length / 4);
}

/**
 * Detect content type for system prompt hints.
 *
 * Detection priority:
 * 1. JSON (valid JSON starting with { or [)
 * 2. Code (import/from/const/function/class/def/package patterns)
 * 3. Markdown (headers or bullet points)
 * 4. Plain (fallback)
 *
 * @param content - The content to analyze
 * @returns Detected content type
 */
export function detectContentType(content: string): LoadedContext['contentType'] {
  const trimmed = content.trim();

  // JSON detection: starts with { or [ and is valid JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON, continue checking other types
    }
  }

  // Code indicators (checked at start of any line)
  const codePatterns = [
    /^import\s+/m,
    /^from\s+\w+\s+import/m,
    /^const\s+/m,
    /^function\s+/m,
    /^class\s+/m,
    /^def\s+/m,
    /^package\s+/m,
  ];
  if (codePatterns.some((pattern) => pattern.test(content))) {
    return 'code';
  }

  // Markdown indicators: headers (# Title) or bullet points (- item, * item)
  if (/^#{1,6}\s+/m.test(content) || /^\s*[-*]\s+/m.test(content)) {
    return 'markdown';
  }

  return 'plain';
}

/**
 * Escape content for safe Python string injection.
 *
 * Handles:
 * - Backslashes (doubled)
 * - Triple quotes (escaped)
 * - CRLF line endings (converted to LF)
 *
 * @param content - The content to escape
 * @returns Escaped content safe for Python triple-quoted string injection
 */
export function escapeForPython(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/"""/g, '\\"\\"\\"')
    .replace(/\r\n/g, '\n');
}
