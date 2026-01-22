# Proposal: Improve RLM Output Accuracy

## Problem Statement

RLM outputs contain factual errors even when the correct information was read and displayed in earlier iterations. The LLM appears to hallucinate from training data rather than using the actual context it retrieved.

### Evidence

In a test run analyzing `anthropic.ts`:
- RLM read file showing `max_tokens: request.maxTokens ?? 8192`
- RLM then claimed "Hardcoded max_tokens (4096)" - **wrong value**
- RLM said method is `query()` - **actually `complete()`**
- RLM said "Line 41" - **actually line 90**
- RLM said "69 lines of code" - **actually 113 lines**

### Root Cause Analysis

The LLM pattern-matches from training data instead of grounding in the actual context. This is a known issue addressed in the RLM paper (Zhang et al. 2025) through:
1. Explicit anti-hallucination instructions
2. Helper functions that force verification against context
3. Verification sub-calls for complex analyses

## Proposed Improvements

### 1. Verification Helper Function

Add a `verify_claim(claim, evidence)` helper that forces the LLM to cite specific evidence:

```python
def verify_claim(claim: str, pattern: str) -> dict:
    """
    Verify a claim against the context using regex.
    Returns {"verified": bool, "evidence": str, "line": int}
    Forces the LLM to ground claims in actual data.
    """
    matches = re.finditer(pattern, context, re.MULTILINE)
    evidence = [(m.group(), context[:m.start()].count('\n') + 1) for m in matches]
    return {
        "claim": claim,
        "verified": len(evidence) > 0,
        "evidence": evidence[:5]  # First 5 matches
    }
```

### 2. System Prompt Enhancement (from RLM Paper)

Add explicit anti-hallucination instructions based on the RLM paper's approach:

```
ACCURACY (CRITICAL):
- Check the content of the 'context' variable to avoid hallucinations
- ALWAYS quote exact text when referencing code or data
- ALWAYS use find_line() to verify line numbers before citing them
- NEVER assume values from memory - verify against the actual context
- If you cannot find specific evidence, say "not found in context"

When making claims about code:
- Use find_line("pattern") to locate and verify
- Quote the actual line: `line 90: max_tokens: request.maxTokens ?? 8192`
- Use count_lines() for accurate line counts, not estimates
- Do NOT rely on typical values from training - read the actual context
```

This mirrors the paper's approach: "Check the content of the 'context' variable to avoid hallucinations"

### 3. Self-Verification Pass

Add a final verification iteration that cross-checks claims:

```python
# System could inject this as a final step
verification_prompt = """
Review your output for factual claims about the code.
For each specific claim (line numbers, values, method names):
1. Search the context for evidence
2. Quote the exact match
3. Mark as VERIFIED or UNVERIFIED

Any UNVERIFIED claims must be corrected or removed.
"""
```

### 4. Structured Output with Citations

Encourage outputs that include citations:

```python
{
    "claim": "max_tokens defaults to 8192",
    "evidence": "line 90: `max_tokens: request.maxTokens ?? 8192`",
    "verified": True
}
```

### 5. Count/Measure Helper Functions

Add helpers that return verified counts:

```python
def count_lines(pattern: str = None) -> int:
    """Count lines in context, optionally matching pattern."""
    lines = context.split('\n')
    if pattern:
        return len([l for l in lines if re.search(pattern, l)])
    return len(lines)

def find_line(pattern: str) -> list[tuple[int, str]]:
    """Find lines matching pattern. Returns [(line_num, content), ...]"""
    return [(i+1, line) for i, line in enumerate(context.split('\n'))
            if re.search(pattern, line)]
```

## Techniques from RLM Paper (Zhang et al. 2025)

The paper addresses hallucination through several techniques we should adopt:

| Technique | Paper's Approach | Our Adaptation |
|-----------|-----------------|----------------|
| Anti-hallucination | "Check the content of the 'context' variable" | Explicit ACCURACY section in system prompt |
| Verification | Sub-LM calls to verify answers | `verify_claim()` helper + verification guidance |
| Grounding | Context filtering via regex before analysis | `find_line()`, `count_lines()` helpers |
| Context metadata | Context type + length in prompt | Already implemented ✓ |

## Implementation Priority

1. **HIGH**: Add `find_line()`, `count_lines()`, `get_line()` helpers - simple, immediate value
2. **HIGH**: Update system prompt with ACCURACY section (anti-hallucination)
3. **MEDIUM**: Add `quote_match()` helper for easy text quoting
4. **LOW**: Add automatic verification pass (more complex, defer)

## Success Metrics

- Claims about line numbers should match actual lines
- Claims about values should match actual values
- Method/function names should match actual names
- Numeric counts should be verifiable

## Non-Goals

- Perfect accuracy (LLMs will still make mistakes)
- Automated fact-checking of all claims (too expensive)
- Preventing all hallucinations (impossible)

The goal is to **provide tools that make verification easy** and **prompt patterns that encourage grounded claims**.
