# Tasks: Add @rlm/core package specifications

## Wave 1 (Parallel)

These tasks have no dependencies and can be worked on simultaneously.

### 1.1 Types & Interfaces (2Q)
- [x] 1.1.1 Create `packages/core/src/types.ts` with all type definitions
- [x] 1.1.2 Export types from `src/index.ts`
- [x] 1.1.3 Add JSDoc comments on all public interfaces
- [x] 1.1.4 Verify strict TypeScript compilation

### 1.2 Context Loader (3Q)
- [x] 1.2.1 Create `packages/core/src/context/loader.ts`
- [x] 1.2.2 Implement `loadContext()` function
- [x] 1.2.3 Implement `estimateTokens()` helper
- [x] 1.2.4 Implement `detectContentType()` helper
- [x] 1.2.5 Implement `escapeForPython()` helper
- [x] 1.2.6 Write unit tests for context loader

### 1.3 REPL Sandbox (6Q)
- [x] 1.3.1 Create `packages/core/src/repl/sandbox.ts` with interfaces
- [x] 1.3.2 Create `packages/core/src/repl/pyodide.ts` implementation
- [x] 1.3.3 Implement Pyodide initialization with context injection
- [x] 1.3.4 Implement Python bridge functions (`llm_query`, `rlm_query`)
- [x] 1.3.5 Implement utility functions (`chunk_text`, `search_context`)
- [x] 1.3.6 Implement stdout/stderr capture
- [x] 1.3.7 Implement timeout handling
- [x] 1.3.8 Implement output truncation
- [x] 1.3.9 Write unit tests for sandbox

### 1.4 LLM Router + Adapters (4Q)
- [x] 1.4.1 Create `packages/core/src/llm/router.ts`
- [x] 1.4.2 Create `packages/core/src/llm/adapters/ollama.ts`
- [x] 1.4.3 Create `packages/core/src/llm/adapters/anthropic.ts`
- [x] 1.4.4 Create `packages/core/src/llm/adapters/openai.ts`
- [x] 1.4.5 Implement cost calculation for cloud providers
- [x] 1.4.6 Write unit tests for router and adapters

---

## Wave 2 (Parallel, after Wave 1)

These tasks depend on Wave 1 completion but can run parallel to each other.

### 2.1 Budget Controller (3Q)
- [x] 2.1.1 Create `packages/core/src/budget/controller.ts`
- [x] 2.1.2 Implement `canProceed()` with all limit checks
- [x] 2.1.3 Implement `record()` for usage tracking
- [x] 2.1.4 Implement `getSubBudget()` for recursive calls
- [x] 2.1.5 Implement 80% threshold warnings
- [x] 2.1.6 Write unit tests for budget controller

### 2.2 Execution Engine (8Q)
- [x] 2.2.1 Create `packages/core/src/engine/parser.ts`
- [x] 2.2.2 Implement response parsing (code blocks, FINAL markers)
- [x] 2.2.3 Create `packages/core/src/engine/executor.ts`
- [x] 2.2.4 Implement main iteration loop
- [x] 2.2.5 Implement `llm_query` bridge handling
- [x] 2.2.6 Implement `rlm_query` recursive call handling
- [x] 2.2.7 Implement execution trace building
- [x] 2.2.8 Implement forced answer on budget exhaustion
- [x] 2.2.9 Write unit tests for parser
- [x] 2.2.10 Write unit tests for executor

### 2.3 Public API & Tracing (2Q)
- [x] 2.3.1 Create `packages/core/src/rlm.ts` main class
- [x] 2.3.2 Implement provider auto-registration
- [x] 2.3.3 Create `packages/core/src/index.ts` exports
- [x] 2.3.4 Write integration tests
- [x] 2.3.5 Verify `import { RLM } from '@rlm/core'` works

---

## Wave 3 (Sequential, after Wave 2)

### 3.1 Package Configuration
- [x] 3.1.1 Create `packages/core/package.json`
- [x] 3.1.2 Create `packages/core/tsconfig.json`
- [x] 3.1.3 Verify build with `pnpm build`
- [x] 3.1.4 Verify all tests pass with `pnpm test`

---

## Summary

| Wave | Tasks | Quanta | Parallelizable |
|------|-------|--------|----------------|
| 1 | Types, Context, REPL, LLM Router | 15Q | Yes (4 workers) |
| 2 | Budget, Engine, Public API | 13Q | Yes (3 workers) |
| 3 | Package Config | - | No |

**Total: 28Q**
**Status: Complete**
