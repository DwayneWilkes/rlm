/**
 * Mock Python interpreter for sandbox tests.
 *
 * This module provides a mock implementation of Pyodide that simulates
 * Python execution behavior for testing the sandbox wrapper.
 */

import { vi } from 'vitest';

// Python execution state
interface PythonState {
  context: string;
  variables: Map<string, unknown>;
  stdout: string;
  stderr: string;
}

let pythonState: PythonState;
let bridges: { llm: Function | null; rlm: Function | null };

export function resetPythonState(): void {
  pythonState = {
    context: '',
    variables: new Map(),
    stdout: '',
    stderr: '',
  };
  bridges = { llm: null, rlm: null };
}

// Mock globals object
export const mockGlobals = {
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
export async function simulatePython(code: string): Promise<unknown> {
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

  // len(array[idx]) function
  const lenArrayIdxMatch = expr.match(/^len\((\w+)\[(\d+)\]\)$/);
  if (lenArrayIdxMatch) {
    const arr = pythonState.variables.get(lenArrayIdxMatch[1]) as unknown[];
    if (!arr) return 0;
    const elem = arr[parseInt(lenArrayIdxMatch[2], 10)];
    if (typeof elem === 'string') return elem.length;
    if (Array.isArray(elem)) return elem.length;
    return 0;
  }

  // repr() function
  const reprMatch = expr.match(/^repr\((\w+)\)$/);
  if (reprMatch) {
    const val = pythonState.variables.get(reprMatch[1]) ?? pythonState.context;
    return JSON.stringify(val);
  }

  // String multiplication: "x" * 200
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

  // extract_json call
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

  // "data is None" check
  const isNoneMatch = expr.match(/^(\w+) is None$/);
  if (isNoneMatch) {
    const val = pythonState.variables.get(isNoneMatch[1]);
    return (val === null || val === undefined) ? 'True' : 'False';
  }

  // Dict/object access like data['key']
  const dictAccessMatch = expr.match(/^(\w+)(\[['"][\w]+['"]\])+$/);
  if (dictAccessMatch) {
    let obj = pythonState.variables.get(dictAccessMatch[1]) as Record<string, unknown>;
    if (!obj) return undefined;

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

  // find_line call
  const findLineMatch = expr.match(/^find_line\((?:r)?"([^"]+)"\)$/);
  if (findLineMatch) {
    const pattern = findLineMatch[1];
    const context = pythonState.context;
    const lines = context.split('\n');
    const regex = new RegExp(pattern, 'i');
    const results: Array<[number, string]> = [];
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        results.push([i + 1, lines[i]]);
      }
    }
    return results;
  }

  // count_lines call
  const countLinesPatternMatch = expr.match(/^count_lines\((?:r)?"([^"]+)"\)$/);
  const countLinesNoArgMatch = expr.match(/^count_lines\(\)$/);
  if (countLinesPatternMatch) {
    const pattern = countLinesPatternMatch[1];
    const context = pythonState.context;
    const lines = context.split('\n');
    const regex = new RegExp(pattern, 'i');
    return lines.filter(line => regex.test(line)).length;
  }
  if (countLinesNoArgMatch) {
    const context = pythonState.context;
    return context.split('\n').length;
  }

  // get_line call
  const getLineMatch = expr.match(/^get_line\((\d+)\)$/);
  if (getLineMatch) {
    const lineNum = parseInt(getLineMatch[1], 10);
    const context = pythonState.context;
    const lines = context.split('\n');
    if (lineNum < 1 || lineNum > lines.length) {
      return '';
    }
    return lines[lineNum - 1];
  }

  // quote_match call
  const quoteMatchMatch = expr.match(/^quote_match\((?:r)?"([^"]+)"(?:,\s*max_length=(\d+))?\)$/);
  if (quoteMatchMatch) {
    const pattern = quoteMatchMatch[1];
    const maxLength = quoteMatchMatch[2] ? parseInt(quoteMatchMatch[2], 10) : 100;
    const context = pythonState.context;
    const regex = new RegExp(pattern, 'i');
    const match = context.match(regex);
    if (match) {
      const result = match[0];
      if (result.length > maxLength) {
        return result.slice(0, maxLength) + '...';
      }
      return result;
    }
    return null;
  }

  // chunk_by_headers call
  const chunkByHeadersMatch = expr.match(/^chunk_by_headers\((?:level=(\d+))?\)$/);
  if (chunkByHeadersMatch) {
    const level = chunkByHeadersMatch[1] ? parseInt(chunkByHeadersMatch[1], 10) : 2;
    const context = pythonState.context;
    const headerPattern = new RegExp(`^${'#'.repeat(level)} .+$`, 'gm');
    const chunks: Array<{ header: string; content: string; start: number }> = [];

    const matches = [...context.matchAll(headerPattern)];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];
      const start = match.index!;
      const end = nextMatch ? nextMatch.index! : context.length;
      const header = match[0];
      const content = context.slice(start + header.length, end).trim();
      chunks.push({ header, content, start });
    }
    return chunks;
  }

  // chunk_by_size call
  const chunkBySizeMatch = expr.match(/^chunk_by_size\((?:chars=(\d+))?(?:,?\s*overlap=(\d+))?\)$/);
  if (chunkBySizeMatch) {
    const chars = chunkBySizeMatch[1] ? parseInt(chunkBySizeMatch[1], 10) : 50000;
    const overlap = chunkBySizeMatch[2] ? parseInt(chunkBySizeMatch[2], 10) : 0;
    const context = pythonState.context;
    const chunks: string[] = [];
    let start = 0;
    while (start < context.length) {
      const end = Math.min(start + chars, context.length);
      chunks.push(context.slice(start, end));
      if (end >= context.length) break;
      start = end - overlap;
    }
    return chunks;
  }

  // Tuple indexing: matches[0][0]
  const tupleAccess = expr.match(/^(\w+)\[(\d+)\]\[(\d+)\]$/);
  if (tupleAccess) {
    const arr = pythonState.variables.get(tupleAccess[1]) as unknown[];
    if (!arr) return undefined;
    const tuple = arr[parseInt(tupleAccess[2], 10)] as unknown[];
    if (!tuple) return undefined;
    return tuple[parseInt(tupleAccess[3], 10)];
  }

  // Array access with negative slice: chunks[0][-5:]
  const negativeSliceAccess = expr.match(/^(\w+)\[(\d+)\]\[(-?\d+):\]$/);
  if (negativeSliceAccess) {
    const arr = pythonState.variables.get(negativeSliceAccess[1]) as unknown[];
    if (!arr) return undefined;
    const elem = arr[parseInt(negativeSliceAccess[2], 10)];
    if (typeof elem === 'string') {
      const sliceStart = parseInt(negativeSliceAccess[3], 10);
      return elem.slice(sliceStart);
    }
    return undefined;
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

  // 'content' in results[0]
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
