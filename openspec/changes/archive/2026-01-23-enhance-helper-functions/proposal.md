# Proposal: enhance-helper-functions

## Summary

Enhance the RLM Python sandbox with additional utility functions and improved system prompt guidance to improve analysis efficiency and response quality.

## Motivation

Based on analysis of real-world RLM execution (analyzing the Zhang et al. RLM paper), several capability gaps were identified:

1. **Missing utility functions**: Common operations like counting regex matches, extracting JSON from text, and parsing document sections require boilerplate code that could be provided as helpers.

2. **Inefficient iteration patterns**: The LLM often produces many small code blocks across multiple iterations when batching would be more efficient.

3. **No parallel sub-task support**: Complex analyses could benefit from running multiple sub-RLMs concurrently for independent sub-tasks.

## Scope

### In Scope
- Add new utility functions: `count_matches`, `extract_json`, `extract_sections`
- Add `batch_rlm_query` for parallel sub-RLM execution
- Enhance system prompt with code block batching guidance
- Update documentation and tests

### Out of Scope
- Changes to budget controller logic
- Changes to LLM adapter implementations
- Output formatting changes (separate proposal)

## Solution Overview

### New Helper Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `count_matches(pattern)` | Fast regex match counting | `int` |
| `extract_json(text)` | Extract JSON from mixed text | `dict/list/None` |
| `extract_sections(pattern)` | Parse document by headers | `list[{header, content, start}]` |
| `batch_rlm_query(tasks)` | Parallel sub-RLM execution | `list[str]` |

### System Prompt Enhancement

Add guidance on:
- Batching multiple code blocks in one response (more efficient than multiple iterations)
- Using `count_matches()` before full search to estimate scope
- Using `batch_rlm_query()` for parallel independent sub-tasks

## Affected Components

- `packages/core/src/repl/python-setup.ts` - Add helper functions
- `packages/core/src/engine/executor.ts` - Update system prompt, add batch_rlm_query bridge
- `packages/core/src/repl/sandbox.test.ts` - Add tests for new functions
- `openspec/specs/repl-sandbox/spec.md` - Document new utility functions
- `openspec/specs/execution-engine/spec.md` - Document batch_rlm_query bridge

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `extract_json` security (arbitrary code in JSON) | Use Python's `json.loads`, no eval |
| `batch_rlm_query` budget exhaustion | Enforce budget check before spawning, cap parallel tasks |
| Pattern length DoS in `count_matches` | Reuse existing MAX_PATTERN_LENGTH (500 chars) |
