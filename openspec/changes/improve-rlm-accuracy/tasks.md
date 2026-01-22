# Tasks: Improve RLM Output Accuracy

## Phase 1: Line-Based Helper Functions (High Priority)

These helpers enable accurate line-based verification, directly addressing the hallucination issues where RLM cited wrong line numbers.

1. [x] **Add `find_line(pattern)` helper** (`python-setup.ts`)
   - Returns list of `(line_number, content)` tuples matching regex
   - Enables LLM to cite specific lines accurately
   - Security: Apply same pattern length limits as other helpers

2. [x] **Add `count_lines(pattern=None)` helper** (`python-setup.ts`)
   - Returns total line count when no pattern
   - Returns count of matching lines when pattern given
   - Prevents errors like "69 lines" when file has 113

3. [x] **Add `get_line(n)` helper** (`python-setup.ts`)
   - Returns content of specific line number (1-indexed)
   - Enables verification of "line X contains Y"
   - Returns empty string if line doesn't exist

4. [x] **Write tests for new helpers** (`python-setup.test.ts`)
   - Test with multi-line context
   - Test regex patterns with find_line
   - Test edge cases: empty context, no matches, out-of-bounds

## Phase 2: System Prompt Anti-Hallucination (High Priority)

Based on RLM paper technique: "Check the content of the 'context' variable to avoid hallucinations"

5. [x] **Add ACCURACY section to system prompt** (`executor.ts`)

   Insert after ENVIRONMENT section:
   ```
   ACCURACY (CRITICAL):
   - Check the content of the 'context' variable to avoid hallucinations
   - ALWAYS quote exact text when referencing code or data
   - Use find_line("pattern") to verify line numbers before citing
   - Use count_lines() for accurate counts, not estimates
   - NEVER assume values from memory - verify against actual context
   - If you cannot find evidence, say "not found in context"
   ```

6. [x] **Document new helpers in system prompt** (`executor.ts`)
   - Add to ENVIRONMENT section:
   ```
   - `find_line(pattern)`: Find lines matching regex, returns [(line_num, content), ...]
   - `count_lines(pattern?)`: Count total lines, or lines matching pattern
   - `get_line(n)`: Get content of line n (1-indexed)
   ```

7. [x] **Add verification example to STRATEGY section** (`executor.ts`)
   ```
   # Bad: "The method query() on line 41..."
   # Good: Use find_line() first
   matches = find_line("def.*complete")
   print(matches)  # [(87, "  async def complete(...)")]
   # Then cite: "The method complete() on line 87 (verified)"
   ```

## Phase 3: Verification Helper (Medium Priority)

8. [x] **Add `quote_match(pattern)` helper** (`python-setup.ts`)
   - Returns the actual matched text
   - Easier than constructing verification manually
   ```python
   def quote_match(pattern: str, max_length: int = 100) -> str | None:
       """Return first match of pattern in context, or None."""
   ```

9. [x] **Write tests for quote_match** (`python-setup.test.ts`)

## Phase 4: Documentation

10. [ ] **Update AGENTS.md with accuracy guidelines** (deferred - optional)
    - Best practices for grounded analysis
    - Common hallucination patterns to avoid
    - When to use verification helpers

## Validation Checklist

After implementation, verify:

- [x] All 430 core tests pass
- [ ] Re-run the anthropic.ts analysis task (manual verification)
- [ ] RLM uses new helpers (find_line, count_lines) in output
- [ ] Line numbers cited match actual file lines
- [ ] Values (like max_tokens) match actual code
- [ ] Method names match actual names in file

## Files Changed

| File | Changes |
|------|---------|
| `packages/core/src/repl/python-setup.ts` | Added find_line, count_lines, get_line, quote_match |
| `packages/core/src/repl/sandbox.test.ts` | Added tests for new helpers |
| `packages/core/src/engine/executor.ts` | Added ACCURACY section, documented helpers, added verification example |

## Estimated Complexity

- Lines added: ~250 (Python helpers in both PYTHON_SETUP variants + tests)
- Lines modified: ~30 (system prompt updates)
- Risk: Low (additive changes, backward compatible)
