# Tasks: consolidate-rlm-v1

## Phase 1: Foundation Fixes

### 1.1 Sandbox Factory Injection (from `inject-sandbox-factory`)

**Problem**: CLI's backend selection is dead code - execution always uses Pyodide.

- [x] 1.1.1 Add `SandboxFactory` type to `packages/core/src/types.ts`
  ```typescript
  export type SandboxFactory = (context: string) => Promise<Sandbox>;
  ```
- [x] 1.1.2 Add optional `sandboxFactory` field to `RLMConfig`
- [x] 1.1.3 Update `Executor` to use injected factory when provided
- [x] 1.1.4 Update CLI's `run.ts` to inject CLI's `createSandbox`
- [x] 1.1.5 Add integration test verifying backend selection works
- [x] 1.1.6 Remove TODO fallback in sandbox factory (v1.0 cleanup)
  - Updated comments to clarify design: Pyodide fallback is intentional for core users
  - CLI injects native/daemon backends via sandboxFactory

### 1.2 Anthropic Adapter Improvements (from `improve-anthropic-adapter`)

- [x] 1.2.1 Add `MODEL_CAPABILITIES` constant with max output limits
  ```typescript
  const MODEL_CAPABILITIES: Record<string, { maxOutput: number }> = {
    'claude-opus-4-5-20251101': { maxOutput: 64000 },
    'claude-sonnet-4-5-20250929': { maxOutput: 64000 },
    'claude-3-haiku-20240307': { maxOutput: 4096 },
    // ... etc
  };
  ```
- [x] 1.2.2 Create `AnthropicAPIError` class for contextual error wrapping
- [x] 1.2.3 Update `complete()` to use model-aware max_tokens default
- [x] 1.2.4 Update `complete()` to wrap errors with context (model name)
- [x] 1.2.5 Add tests for model-aware defaults (known model, unknown model)
- [x] 1.2.6 Add tests for error wrapping (verify error contains model name)

---

## Phase 2: Helper Functions

### 2.1 Utility Functions (from `enhance-helper-functions`)

**Note**: `find_line`, `count_lines`, `get_line`, `quote_match` already implemented in `improve-rlm-accuracy`.

#### 2.1.1 count_matches (Pyodide)
- [x] Write test: returns count of regex matches
- [x] Write test: returns 0 when no matches
- [x] Write test: rejects overly long patterns
- [x] Implement in `python-setup.ts`

#### 2.1.2 extract_json
- [x] Write test: extracts JSON object from text
- [x] Write test: extracts JSON array from text
- [x] Write test: returns None when no valid JSON
- [x] Write test: handles nested JSON
- [x] Implement in `python-setup.ts`

#### 2.1.3 extract_sections
- [x] Write test: extracts sections by header pattern
- [x] Write test: includes content between headers
- [x] Write test: returns empty list when no sections
- [x] Implement in `python-setup.ts`

#### 2.1.4 Sync to native sandbox
- [x] Add `count_matches` to `rlm_sandbox.py` (if not present)
- [x] Add `extract_json` to `rlm_sandbox.py`
- [x] Add `extract_sections` to `rlm_sandbox.py`
- [x] Add tests in `native-python.test.ts`

#### 2.1.5 batch_llm_query parity
- [x] Add `batch_llm_query` to Pyodide (python-setup.ts)
- [x] Add `bridge:batch_llm` handler in pyodide-worker.ts
- [x] Add handler in pyodide.ts for WorkerPyodideSandbox
- [x] Add handler in pyodide.ts for DirectPyodideSandbox

### 2.2 Batch RLM Query (from `enhance-helper-functions`)

Paper evidence: "aim for ~200k chars per call" - batching sub-tasks is critical.

- [x] 2.2.1 Add `onBatchRLMQuery` to `SandboxBridges` interface
- [x] 2.2.2 Implement bridge handler in `executor.ts`
  - Enforce budget check before spawning
  - Cap parallel tasks (configurable, default 5)
  - Handle partial failures gracefully
- [x] 2.2.3 Add Python wrapper to `python-setup.ts`
  ```python
  def batch_rlm_query(tasks: list[dict]) -> list[str]:
      """
      Execute multiple sub-RLMs concurrently.
      tasks: [{"task": str, "context": str (optional)}, ...]
      Returns: list of results in same order
      """
  ```
- [x] 2.2.4 Add to `rlm_sandbox.py` (native sandbox)
- [x] 2.2.5 Write tests for batch execution
- [x] 2.2.6 Write tests for budget enforcement
- [x] 2.2.7 Write tests for partial failure handling

### 2.2.8 Budget configuration for batch queries

- [x] Add `maxBatchConcurrency` to Budget type (default: 5)
- [x] Add `maxBatchSize` to Budget type (default: 10)
- [x] Add `getBatchConcurrency()` to BudgetController
- [x] Add `getMaxBatchSize()` to BudgetController

### 2.3 System Prompt Updates

- [x] 2.3.1 Document new functions in ENVIRONMENT section
  ```
  - `count_matches(pattern)`: Count regex matches in context
  - `extract_json(text)`: Extract JSON object/array from text
  - `extract_sections(pattern)`: Parse document by header pattern
  - `batch_rlm_query(tasks)`: Execute multiple sub-RLMs concurrently
  ```
- [x] 2.3.2 Add batching guidance to STRATEGY section
  ```
  BATCHING: When you need to analyze multiple chunks independently,
  use batch_rlm_query() instead of sequential rlm_query() calls.
  Aim for ~200k chars per sub-call for optimal cost/quality.
  ```

---

## Phase 3: Configuration Profiles

### 3.1 Core Types (from `add-config-profiles`)

- [x] 3.1.1 Add `subcallProvider` field to `RLMConfig` in `types.ts`
- [x] 3.1.2 Add `subcallModel` field to `RLMConfig`
- [x] 3.1.3 Update executor to use `subcallProvider` for `rlm_query` calls
- [x] 3.1.4 Update executor to use `subcallProvider` for `batch_rlm_query`
- [x] 3.1.5 Add tests for subcallProvider routing

### 3.2 Config Schema

- [x] 3.2.1 Add `ProfileConfig` Zod type
  ```typescript
  const ProfileConfig = z.object({
    extends: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    subcallProvider: z.string().optional(),
    subcallModel: z.string().optional(),
    budget: BudgetConfig.partial().optional(),
    repl: ReplConfig.partial().optional(),
  });
  ```
- [x] 3.2.2 Add `RLMConfigWithProfiles` type
- [x] 3.2.3 Implement `resolveExtends()` for inheritance
- [x] 3.2.4 Implement circular extends detection
- [x] 3.2.5 Implement deep merge for nested objects (budget, repl)
- [x] 3.2.6 Add backward compatibility for flat configs

### 3.3 Config Loader

- [x] 3.3.1 Add `getProfile(name)` function
- [x] 3.3.2 Implement priority resolution (CLI > profile > defaults)
- [x] 3.3.3 Handle RLM_PROFILE environment variable
- [x] 3.3.4 Error with suggestions when profile not found

### 3.4 CLI Commands

- [x] 3.4.1 Add `--profile`/`-p` flag to run command
- [x] 3.4.2 Implement `rlm config list` subcommand
- [x] 3.4.3 Implement `rlm config show <name>` subcommand
- [x] 3.4.4 Add tests for all new CLI commands

### 3.5 Built-in Profiles

Create default profiles in config template:

- [x] 3.5.1 `local` - Ollama with qwen2.5-coder
- [x] 3.5.2 `cloud` - Claude Sonnet with Haiku subcalls
- [x] 3.5.3 `hybrid` - Cloud root + local subcalls
- [x] 3.5.4 `research` - High limits for deep analysis

---

## Phase 4: Paper-Driven Enhancements (Advanced)

### 4.1 Async Sub-Calls

Paper: "RLMs without asynchronous LM calls are slow"

- [x] 4.1.1 Design async sub-call architecture
  - Should `batch_rlm_query` run tasks in parallel? (Yes)
  - How to handle rate limits?
  - How to report partial progress?
- [x] 4.1.2 Implement parallel execution in `batch_rlm_query`
- [x] 4.1.3 Add concurrency limit to budget config
- [x] 4.1.4 Add rate limiting per provider
- [x] 4.1.5 Test concurrent execution

### 4.2 Model-Specific Prompt Tuning

Paper: "Qwen3-Coder needed extra warning about sub-call usage"

- [x] 4.2.1 Add `promptHints` field to model capabilities
  ```typescript
  'qwen3-coder-480b': {
    maxOutput: 64000,
    promptHints: [
      "Be very careful about using llm_query - batch when possible",
      "Avoid making more than 10 sub-calls per iteration"
    ]
  }
  ```
- [x] 4.2.2 Inject model-specific hints into system prompt
- [x] 4.2.3 Allow profile-level prompt overrides

### 4.3 Smart Chunking Helpers

Paper: "chunking by Markdown headers" pattern

- [x] 4.3.1 Add `chunk_by_headers(context, level)` helper
- [x] 4.3.2 Add `chunk_by_size(context, chars, overlap)` helper
- [x] 4.3.3 Document chunking strategies in system prompt

---

## Verification

### All Phases

- [x] Run `pnpm test` - all 882 tests pass (488 core + 394 CLI)
- [x] Run `pnpm typecheck` - no type errors
- [x] Run `pnpm lint` - no lint errors (no lint script configured)
- [x] Run `openspec validate consolidate-rlm-v1 --strict`

### Phase 1 Verification

- [x] Verify `--repl.backend native` uses native Python (factory.test.ts)
- [x] Verify Haiku model doesn't hit max_tokens error (anthropic.test.ts)
- [x] Verify API errors include model name (anthropic.test.ts)

### Phase 2 Verification

- [x] Verify all helpers work in Pyodide sandbox (sandbox.test.ts)
- [x] Verify all helpers work in native sandbox (native-python.test.ts)
- [x] Verify `batch_rlm_query` executes concurrently (executor.test.ts)
- [x] Verify budget enforced for batch queries (executor.test.ts)

### Phase 3 Verification

- [x] Verify `--profile local` uses Ollama (run.test.ts)
- [x] Verify `--profile cloud` uses Claude (run.test.ts)
- [x] Verify `rlm config list` shows all profiles (config.test.ts)
- [x] Verify profile extends works correctly (loader.test.ts)

### Manual E2E Test (requires LLM connection)

- [ ] Run repo analysis with `--profile research`
- [ ] Confirm RLM uses `batch_rlm_query` for parallel sub-tasks
- [x] Confirm native backend works end-to-end (rlm-claude-code.e2e.test.ts)

---

## Completion Criteria

Each phase can be merged independently when:

1. All tasks in phase marked complete
2. All tests pass
3. Backward compatibility maintained
4. Documentation updated

Proposals to archive after each phase:

| Phase | Archive These Proposals |
|-------|------------------------|
| Phase 1 | `inject-sandbox-factory`, `improve-anthropic-adapter` |
| Phase 2 | `enhance-helper-functions` |
| Phase 3 | `add-config-profiles` |
| Phase 4 | (new work, no archive) |

Note: `improve-rlm-accuracy` is already 90% complete and can be archived after Phase 2 (final documentation task).
