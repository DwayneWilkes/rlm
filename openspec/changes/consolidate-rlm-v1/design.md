# Design: consolidate-rlm-v1

## Context

This document captures technical decisions for the consolidated RLM improvement effort, incorporating insights from the Zhang et al. (2025) RLM paper.

### Stakeholders
- RLM users (CLI and API)
- LLM providers (Anthropic, OpenAI, Ollama)
- Codebase maintainers

### Constraints
- Must maintain backward compatibility with existing configs
- Must work with all sandbox backends (Pyodide, native, daemon)
- Must not exceed reasonable memory/CPU for concurrent operations

## Goals / Non-Goals

### Goals
1. Enable users to easily switch between configurations for different use cases
2. Improve RLM accuracy through better helper functions
3. Reduce execution time through async sub-calls
4. Fix the dead code issue with sandbox backend selection
5. Improve debugging experience with better error messages

### Non-Goals
- Training custom models for RLM (future work per paper)
- GUI configuration management
- Remote/shared profile storage
- Automatic retry logic (separate concern)

## Decisions

### D1: Phase-Based Implementation

**Decision**: Implement in 4 phases that can be merged independently.

**Rationale**:
- Each phase delivers standalone value
- Reduces risk of large PRs
- Allows early validation of foundational changes

**Alternatives Considered**:
- Big-bang merge: Rejected - too risky, hard to review
- Feature flags: Rejected - adds complexity for temporary state

### D2: Sandbox Factory Injection

**Decision**: Add optional `sandboxFactory` to `RLMConfig` instead of modifying core's `createSandbox`.

**Rationale**:
- Keeps core independent of CLI-specific backends
- Allows different consumers to inject their own factories
- Backward compatible (factory is optional)

**Code Pattern**:
```typescript
// packages/core/src/types.ts
export type SandboxFactory = (context: string) => Promise<Sandbox>;

export interface RLMConfig {
  // ... existing fields
  sandboxFactory?: SandboxFactory;
}

// packages/core/src/engine/executor.ts
const sandbox = config.sandboxFactory
  ? await config.sandboxFactory(context)
  : await createSandbox(context);  // default
```

### D3: SubcallProvider Architecture

**Decision**: Add `subcallProvider` and `subcallModel` fields to enable hybrid configurations.

**Rationale** (from paper, p.4):
> "For the GPT-5 experiments, we use GPT-5-mini for the recursive LMs and GPT-5 for the root LM, as we found this choice to strike a powerful tradeoff between the capabilities of RLMs and the cost of the recursive calls."

**Use Cases**:
1. **Cloud root + Local subcalls**: Quality root reasoning, free/unlimited subcalls
2. **Big model + Small model**: Same provider, tiered by complexity
3. **Same model everywhere**: Simplified config (backward compatible)

**Code Pattern**:
```typescript
// When executing rlm_query or batch_rlm_query
const subcallConfig = {
  provider: config.subcallProvider ?? config.provider,
  model: config.subcallModel ?? config.model,
  // inherit other settings from parent config
};
```

### D4: Profile Inheritance via `extends`

**Decision**: Profiles can inherit from other profiles using `extends` with deep merge for nested objects.

**Rationale**:
- Reduces config duplication
- Allows "base + override" pattern
- Common pattern in config systems (tsconfig, babel)

**Merge Behavior**:
```yaml
# Base profile
hybrid:
  provider: claude-code
  budget:
    maxCost: 5.0
    maxIterations: 100

# Extended profile
research:
  extends: hybrid
  budget:
    maxCost: 50.0  # Only override cost
    # maxIterations: 100 inherited
```

**Cycle Detection**:
```typescript
function resolveExtends(profile, allProfiles, visited = new Set()) {
  if (visited.has(profile.name)) {
    throw new Error(`Circular extends: ${[...visited, profile.name].join(' -> ')}`);
  }
  // ... resolve chain
}
```

### D5: Batch RLM Query with Concurrency Control

**Decision**: `batch_rlm_query` runs sub-RLMs concurrently with configurable concurrency limit.

**Rationale** (from paper, Appendix A):
> "RLMs without asynchronous LM calls are slow. We implemented all sub-LM queries naively as blocking/sequential calls, which caused our RLM experiments to be slow."

**Implementation**:
```typescript
async function executeBatch(
  tasks: Array<{task: string; context?: string}>,
  concurrency: number = 5
): Promise<string[]> {
  const results: string[] = new Array(tasks.length);
  const queue = tasks.map((t, i) => ({...t, index: i}));

  await Promise.all(
    Array.from({length: concurrency}, () => processQueue(queue, results))
  );

  return results;
}
```

**Budget Enforcement**:
- Check remaining budget before spawning batch
- Total batch cost = sum of subcall costs
- Fail-fast if budget would be exceeded

### D6: Model Capabilities Lookup

**Decision**: Maintain a static lookup table of model capabilities with safe defaults.

**Rationale**:
- Prevents API errors from exceeding model limits
- No external API calls needed at runtime
- Easy to update when new models released

**Fallback Strategy**:
1. If model in lookup → use lookup values
2. If model unknown → use conservative defaults (8192 max_tokens)
3. If user specifies maxTokens → use user value (trust user)

```typescript
function getMaxTokens(model: string, requested?: number): number {
  const caps = MODEL_CAPABILITIES[model];
  const modelMax = caps?.maxOutput ?? DEFAULT_MAX_OUTPUT;

  if (requested) {
    return Math.min(requested, modelMax);
  }
  return Math.min(DEFAULT_MAX_OUTPUT, modelMax);
}
```

## Risks / Trade-offs

### R1: Concurrency and Rate Limits

**Risk**: Concurrent sub-calls may hit provider rate limits.

**Mitigation**:
- Default concurrency of 5 (conservative)
- Profile-level concurrency override
- Future: Add per-provider rate limiting

### R2: Budget Exhaustion with Batch Queries

**Risk**: Batch queries could quickly exhaust budget.

**Mitigation**:
- Pre-compute estimated batch cost
- Fail if batch would exceed remaining budget
- Cap max batch size (default 10)

### R3: Profile Config Complexity

**Risk**: Users may create overly complex inheritance chains.

**Mitigation**:
- Limit extends depth (max 5 levels)
- Clear error messages showing resolved values
- `rlm config show <profile>` to debug

### R4: Async Error Handling

**Risk**: Partial failures in batch queries.

**Mitigation**:
- Return partial results with error indicators
- Log individual failures
- Don't fail entire batch for single failure

## Migration Plan

### Phase 1 Migration
- No migration needed (additive changes)
- Existing configs continue working

### Phase 3 Migration (Profiles)
- Support both flat config and profiles format
- Flat config treated as implicit "default" profile
- Migration guide in release notes

## Open Questions

### Q1: Should `batch_rlm_query` respect recursion depth?
**Proposed**: Yes - each batch item counts as depth+1, consistent with `rlm_query`.

### Q2: Should we add streaming for long-running batches?
**Proposed**: Defer to future work - adds significant complexity.

### Q3: Should profile extends work across files?
**Proposed**: No - keep profiles in single file for simplicity. Revisit if users request.

## References

- Zhang et al. (2025). "Recursive Language Models". arXiv:2512.24601
- `openspec/changes/inject-sandbox-factory/proposal.md`
- `openspec/changes/add-config-profiles/proposal.md`
- `openspec/changes/enhance-helper-functions/proposal.md`
- `openspec/changes/improve-anthropic-adapter/proposal.md`
- `openspec/changes/improve-rlm-accuracy/proposal.md`
