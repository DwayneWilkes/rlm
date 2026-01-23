# Proposal: consolidate-rlm-v1

## Summary

Consolidate all pending RLM improvement proposals into a single coordinated implementation plan, incorporating key insights from the Zhang et al. (2025) RLM paper to dramatically improve accuracy, performance, and usability.

## Why

We have 5 pending proposals with overlapping concerns:
- `improve-rlm-accuracy` - Anti-hallucination helpers (mostly complete)
- `enhance-helper-functions` - Utility functions + batch queries
- `add-config-profiles` - Named profiles + model-specific settings
- `improve-anthropic-adapter` - Model-aware limits + error handling
- `inject-sandbox-factory` - Fix dead code (CLI backend selection)

The RLM paper reveals additional critical improvements:
- **Async sub-calls** - Paper explicitly notes sequential calls are slow
- **Model-specific prompts** - Different models need different prompt strategies
- **Smart batching** - "aim for ~200k chars per call" for sub-LM queries

Consolidating these ensures coherent implementation order, avoids conflicts, and delivers maximum value incrementally.

## What Changes

### Phase 1: Foundation Fixes (Critical)

| Change | Source Proposal | Impact |
|--------|-----------------|--------|
| Fix sandbox factory injection | `inject-sandbox-factory` | Unblocks native/daemon backends |
| Model-aware max_tokens | `improve-anthropic-adapter` | Prevents API errors with smaller models |
| Contextual error wrapping | `improve-anthropic-adapter` | Better debugging experience |

### Phase 2: Helper Functions (High Value)

| Change | Source | Paper Evidence |
|--------|--------|----------------|
| `count_matches(pattern)` | `enhance-helper-functions` | "probe the context" pattern |
| `extract_json(text)` | `enhance-helper-functions` | Common analysis pattern |
| `extract_sections(pattern)` | `enhance-helper-functions` | "chunking by headers" pattern (p.25) |
| `batch_rlm_query(tasks)` | `enhance-helper-functions` | "aim for ~200k chars per call" |

### Phase 3: Configuration Profiles (Usability)

| Change | Source | Paper Evidence |
|--------|--------|----------------|
| Named profiles (`--profile`) | `add-config-profiles` | Different use cases need different configs |
| Profile inheritance (`extends`) | `add-config-profiles` | Reduce duplication |
| `subcallProvider` support | `add-config-profiles` | "GPT-5 for root, GPT-5-mini for subcalls" (p.4) |
| Hybrid provider support | `add-config-profiles` | "Cloud root + Local subcalls" pattern |

### Phase 4: Paper-Driven Enhancements (NEW)

| Change | Paper Evidence | Priority |
|--------|----------------|----------|
| Async sub-calls | "RLMs without async calls are slow" (Appendix A) | HIGH |
| Model-specific prompt tuning | "Qwen3 needed extra warning about sub-call usage" (p.6) | MEDIUM |
| Smart chunking helpers | "chunking by Markdown headers" (p.25) | LOW |

## Impact

### Affected Packages
- `@rlm/core` - Types, executor, sandbox, LLM adapters
- `@rlm/cli` - Config loader, CLI commands, sandbox factory injection

### Affected Specs
- `repl-sandbox` - New helper functions
- `execution-engine` - Batch queries, async support
- `llm-router` - Model capabilities, error handling
- `cli` - Profile configuration
- `types` - RLMConfig extensions

### Breaking Changes
- **None** - All changes are additive with backward compatibility

## Paper Alignment

Key findings from Zhang et al. (2025) that inform this work:

| Paper Finding | Our Response |
|---------------|--------------|
| "RLMs can scale to 10M+ tokens" | Ensure budget controller handles large contexts |
| "REPL environment is necessary for long inputs" | Already implemented via Pyodide/native sandboxes |
| "Recursive sub-calling critical for information-dense tasks" | `batch_rlm_query` + async support |
| "Different models exhibit different behaviors" | `subcallProvider` + model-specific prompts |
| "RLMs filter context using regex based on model priors" | Anti-hallucination helpers (Phase 1 complete) |
| "Costs scale proportionally to task complexity" | Profile-based budget presets |

## Success Criteria

1. **Sandbox backends work** - Native Python/daemon selectable via config
2. **API errors clear** - Include model context in error messages
3. **Helpers available** - All 8 utility functions work in all sandbox types
4. **Profiles work** - `--profile local` uses Ollama, `--profile cloud` uses Claude
5. **Batch queries work** - `batch_rlm_query([...])` runs sub-RLMs in parallel
6. **All 654+ tests pass** - No regression

## Estimated Effort

| Phase | Complexity | Risk |
|-------|------------|------|
| Phase 1: Foundation | Low | Low (bug fixes, additive) |
| Phase 2: Helpers | Medium | Low (pure functions, testable) |
| Phase 3: Profiles | Medium | Low (config-only, no runtime changes) |
| Phase 4: Async | High | Medium (concurrency concerns) |

## Dependencies

```
Phase 1 ─────────────────────────┐
        (sandbox factory,        │
         anthropic adapter)      │
                                 ↓
Phase 2 ─────────────────────────┐
        (helper functions,       │
         batch_rlm_query)        │
                                 ↓
Phase 3 ─────────────────────────┐
        (config profiles,        │
         subcallProvider)        │
                                 ↓
Phase 4
        (async sub-calls,
         model prompts)
```
