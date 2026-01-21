# Proposal: inject-sandbox-factory

## Summary

Wire the CLI's sandbox backend selection (native/daemon/pyodide) to the core Executor by allowing sandbox factory injection.

## Problem

The CLI's backend selection is **dead code**. Currently:

1. CLI detects best backend (`detectBestBackend()` → native/daemon/pyodide)
2. CLI resolves the backend and stores it in config
3. CLI creates `RLM` instance with config
4. **But**: `RLM.execute()` → `Executor` → uses core's `createSandbox()` which **always** creates Pyodide

The CLI's `createSandbox` factory (in `packages/cli/src/sandbox/factory.ts`) is never called during execution.

**Impact**: Users cannot use native Python or daemon backends even when configured. Execution always uses Pyodide WASM (slow, limited).

## Solution

Add `sandboxFactory` option to `RLMConfig` so consumers can inject their own sandbox creation logic.

**Changes**:
1. Add `SandboxFactory` type to core types
2. Add optional `sandboxFactory` field to `RLMConfig`
3. Update `Executor` to use injected factory when provided
4. Update CLI's `run.ts` to inject CLI's `createSandbox`
5. Add integration test to verify backend selection works

## Scope

- **Packages affected**: `@rlm/core`, `@rlm/cli`
- **Breaking changes**: None (new optional field)
- **Risk**: Low (additive change)

## Related

- Spec: `repl-sandbox` (Backend Selection requirement)
- Spec: `execution-engine` (uses sandbox)
- Spec: `public-api` (RLMConfig type)
