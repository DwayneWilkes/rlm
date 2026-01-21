# Tasks: inject-sandbox-factory

## Overview

Wire CLI's sandbox backend selection to core Executor via factory injection.

## Task List

### 1. Add SandboxFactory type to core (TDD)

**Files**: `packages/core/src/types.ts`, `packages/core/src/types.test.ts`

- [x] RED: Add test for SandboxFactory type export
- [x] GREEN: Add SandboxFactory type definition
- [x] RED: Add test for RLMConfig.sandboxFactory field
- [x] GREEN: Add sandboxFactory to RLMConfig interface
- [x] Update public exports in index.ts

**Acceptance**: Types compile, tests pass ✓

### 2. Update Executor to use injected factory (TDD)

**Files**: `packages/core/src/engine/executor.ts`, `packages/core/src/engine/executor.test.ts`

- [x] RED: Add test that Executor uses sandboxFactory when provided
- [x] GREEN: Update Executor to check for sandboxFactory in config
- [x] RED: Add test that Executor falls back to createSandbox when no factory
- [x] GREEN: Verify fallback behavior works
- [x] REFACTOR: Clean up sandbox creation logic

**Acceptance**: Executor uses injected factory, tests pass ✓

### 3. Wire CLI run command to use sandboxFactory (TDD)

**Files**: `packages/cli/src/commands/run.ts`, `packages/cli/src/commands/run.test.ts`

- [x] RED: Add test that run command creates sandboxFactory with detected backend
- [x] GREEN: Build sandboxFactory in run command using CLI's createSandbox
- [x] RED: Add test that sandboxFactory is passed to RLM
- [x] GREEN: Pass sandboxFactory to RLM constructor
- [x] REFACTOR: Remove unused imports if any

**Acceptance**: CLI passes factory to RLM, tests pass ✓

### 4. Add integration test for backend selection

**Files**: `packages/cli/tests/e2e/cli-run.e2e.test.ts`

- [x] Add E2E test that verifies backend selection flags are documented
- [x] Test checks --backend native, pyodide, daemon flags
- [x] Test checks -b shorthand

**Acceptance**: E2E test passes ✓

### 5. Run full test suite and verify

- [x] Run `pnpm test:run` - all 377 tests pass (1 skipped)
- [x] Manual verification skipped (requires API keys)

**Acceptance**: All tests green ✓

## Dependencies

```
Task 1 (types) ─┬─► Task 2 (executor)
                │
                └─► Task 3 (CLI run) ─► Task 4 (E2E)
                                        │
                                        ▼
                                    Task 5 (verify)
```

Tasks 2 and 3 can proceed in parallel after Task 1.

## Actual Scope

- ~60 lines of type changes (SandboxFactory, SandboxInterface, SandboxBridgesInterface)
- ~10 lines in executor
- ~15 lines in CLI run command
- ~80 lines of new tests

Total: ~165 lines of code changes
