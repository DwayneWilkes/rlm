# Implementation Waves (TDD)

Tasks organized for parallel execution with **TDD mandatory**: Red → Green → Refactor.

Each task follows the pattern:
1. **RED**: Write failing test first
2. **GREEN**: Write minimal code to pass
3. **REFACTOR**: Clean up while tests pass

---

## Wave 1: Foundation (Parallel) ✅ COMPLETE

Three independent tracks that can run simultaneously.

### Track A: Budget Context (Core) ✅

**1A.1 getAllocatedBudgetDescription() method**
- [x] RED: Write test for `getAllocatedBudgetDescription(depth)` returning formatted budget string
- [x] GREEN: Implement method in BudgetController
- [x] REFACTOR: Clean up string formatting

**1A.2 shouldDowngradeToLLMQuery() method**
- [x] RED: Write test for `shouldDowngradeToLLMQuery()` returning true when cost < $0.50 or iterations < 5
- [x] GREEN: Implement method in BudgetController
- [x] REFACTOR: Extract threshold constants

**Track A Complete**
- [x] COMMIT: `feat(budget): add budget context methods for sub-RLM awareness` (192d4fd)

### Track B: Python Runner Script ✅

**1B.1 JSON-RPC server**
- [x] RED: Write pytest for JSON-RPC request/response parsing
- [x] GREEN: Implement `rlm_sandbox.py` with stdio JSON-RPC
- [x] REFACTOR: Extract protocol handling

**1B.2 Code execution with capture**
- [x] RED: Write pytest for execute method capturing stdout/stderr
- [x] GREEN: Implement execute with StringIO capture
- [x] REFACTOR: Add proper exception handling

**1B.3 Bridge callbacks**
- [x] RED: Write pytest for llm_query/rlm_query blocking bridge calls
- [x] GREEN: Implement bridge callbacks with JSON-RPC requests to host
- [x] REFACTOR: Unify callback pattern

**1B.4 Context injection**
- [x] RED: Write pytest verifying `context` variable available after init
- [x] GREEN: Implement context injection in initialize
- [x] REFACTOR: Add context type hints

**Track B Complete**
- [x] COMMIT: `feat(repl): add Python runner script with JSON-RPC protocol` (d57139d)

### Track C: CLI Package Setup ✅

**1C.1 Package structure**
- [x] RED: Write test that `@rlm/cli` can be imported
- [x] GREEN: Create package.json, tsconfig.json, tsup.config.ts
- [x] REFACTOR: Align with @rlm/core patterns

**1C.2 Workspace integration**
- [x] RED: Write test that `pnpm build` includes cli
- [x] GREEN: Add cli to pnpm-workspace.yaml
- [x] REFACTOR: Verify dependency resolution

**1C.3 Entry point**
- [x] RED: Write test that `bin/rlm.ts` exports CLI runner
- [x] GREEN: Create bin/rlm.ts with shebang and main()
- [x] REFACTOR: Add error boundary

**Track C Complete**
- [x] COMMIT: `feat(cli): scaffold @rlm/cli package structure` (844ddf9)

---

## Wave 2: Core Integration (Parallel) ✅ COMPLETE

Depends on Wave 1 completion.

### Track A: Sub-RLM Budget Awareness (depends on 1A) ✅

**2A.1 Enhanced sub-RLM system prompt**
- [x] RED: Write test for sub-RLM prompt including depth, budget, guidelines
- [x] GREEN: Create prompt template function
- [x] REFACTOR: Extract prompt sections

**2A.2 Budget context injection in Executor**
- [x] RED: Write test that handleRLMQuery injects budget context
- [x] GREEN: Update Executor.buildSystemPrompt for depth > 0
- [x] REFACTOR: Centralize prompt building

**2A.3 Auto-downgrade to llm_query**
- [x] RED: Write test that rlm_query downgrades when budget low
- [x] GREEN: Add downgrade check via shouldDowngradeToLLMQuery()
- [x] REFACTOR: Threshold constants in BudgetController

**Track A Complete**
- [x] COMMIT: `feat(executor): add sub-RLM budget awareness` (06363d3)

### Track B: Native Sandbox TypeScript (depends on 1B) ✅

**2B.1 NativePythonSandbox class**
- [x] RED: Write test for NativePythonSandbox implementing Sandbox interface
- [x] GREEN: Create class with initialize/execute/destroy/getVariable
- [x] REFACTOR: Extract common sandbox behavior

**2B.2 JSON-RPC client**
- [x] RED: Write test for JSON-RPC over child_process stdio
- [x] GREEN: Implement request/response with ID tracking
- [x] REFACTOR: Add timeout handling

**2B.3 Bridge callback handlers**
- [x] RED: Write test for handling bridge:llm and bridge:rlm methods
- [x] GREEN: Implement callback routing to onLLMQuery/onRLMQuery
- [x] REFACTOR: Type-safe callback dispatch

**2B.4 Python utility functions**
- [x] RED: Write test for chunk_text and search_context
- [x] GREEN: Add utilities to Python sandbox
- [x] REFACTOR: Support optional context in rlm_query

**Track B Complete**
- [x] COMMIT: `feat(repl): add NativePythonSandbox for high-performance execution` (23f7a8d)

### Track C: Config Loader (depends on 1C) ✅

**2C.1 Config schema**
- [x] RED: Write test for Zod schema validating config shape
- [x] GREEN: Create schema.ts with ConfigSchema
- [x] REFACTOR: Add default values

**2C.2 Cosmiconfig integration**
- [x] RED: Write test for loading from .rlmrc.yaml
- [x] GREEN: Create loader.ts with cosmiconfig explorer
- [x] REFACTOR: Add search path customization

**2C.3 Config merge**
- [x] RED: Write test for CLI flags overriding file config
- [x] GREEN: Implement deep merge with flag precedence
- [x] REFACTOR: Type-safe merge function

**Track C Complete**
- [x] COMMIT: `feat(cli): add config loader with cosmiconfig and Zod` (b7ac13c)

---

## Wave 3: CLI Features (Parallel) ✅ COMPLETE

Depends on Wave 2 completion.

### Track A: Backend Selection (depends on 2B) ✅

**3A.1 SandboxBackend type**
- [x] RED: Write test for SandboxBackend enum values
- [x] GREEN: Add type to types/index.ts
- [x] REFACTOR: Export from package

**3A.2 createSandbox() factory**
- [x] RED: Write test for factory returning correct sandbox type
- [x] GREEN: Implement factory with backend detection
- [x] REFACTOR: Add logging for selected backend

**3A.3 Backend hierarchy**
- [x] RED: Write test for daemon → native → pyodide fallback
- [x] GREEN: Implement detection chain
- [x] REFACTOR: Make hierarchy configurable

**Track A Complete**
- [x] Tests: 31 tests in sandbox/detect.test.ts, sandbox/factory.test.ts

### Track B: CLI Commands (depends on 2C, 3A) ✅

**3B.1 Commander router**
- [x] RED: Write test for CLI parsing subcommands
- [x] GREEN: Create cli.ts with commander program
- [x] REFACTOR: Extract common options

**3B.2 Run command**
- [x] RED: Write test for `rlm run` executing task
- [x] GREEN: Implement run.ts with context loading
- [x] REFACTOR: Add progress callbacks

**3B.3 Config command**
- [x] RED: Write test for `rlm config show` output
- [x] GREEN: Implement config.ts with show/path subcommands
- [x] REFACTOR: Format output consistently

**3B.4 Daemon stub**
- [x] RED: Write test for daemon commands existing
- [x] GREEN: Create daemon.ts with start/stop/status stubs
- [x] REFACTOR: Add "not implemented" messages

**Track B Complete**
- [x] Tests: 40 tests in commands/cli.test.ts, commands/run.test.ts, commands/config.test.ts, commands/daemon.test.ts

### Track C: Output Formatters (depends on 2C) ✅

**3C.1 Formatter interface**
- [x] RED: Write test for IFormatter interface
- [x] GREEN: Create formatter.ts with interface
- [x] REFACTOR: Add format detection

**3C.2 Text formatter**
- [x] RED: Write test for human-readable output
- [x] GREEN: Implement TextFormatter with colors
- [x] REFACTOR: Add progress spinner

**3C.3 JSON formatter**
- [x] RED: Write test for valid JSON output
- [x] GREEN: Implement JsonFormatter
- [x] REFACTOR: Add pretty-print option

**3C.4 YAML formatter**
- [x] RED: Write test for valid YAML output
- [x] GREEN: Implement YamlFormatter
- [x] REFACTOR: Handle complex types

**Track C Complete**
- [x] Tests: 46 tests in output/text.test.ts, output/json.test.ts, output/yaml.test.ts, output/index.test.ts

---

## Wave 4: Daemon Mode (Parallel) ✅ COMPLETE

Depends on Wave 3 completion.

### Track A: Daemon Server ✅

**4A.1 Worker pool manager**
- [x] RED: Write test for pool spawning N workers
- [x] GREEN: Implement pool with spawn/acquire/release
- [x] REFACTOR: Add health checks

**4A.2 Unix socket server**
- [x] RED: Write test for socket server accepting connections
- [x] GREEN: Implement with net.createServer
- [x] REFACTOR: Add connection limit

**4A.3 Named pipe server (Windows)**
- [x] RED: Write test for pipe server on Windows
- [x] GREEN: Implement with \\.\pipe\ path
- [x] REFACTOR: Unify with Unix socket code

**4A.4 PID file management**
- [x] RED: Write test for PID file creation/cleanup
- [x] GREEN: Implement writePID/readPID/cleanupPID
- [x] REFACTOR: Add stale detection

**Track A Complete**
- [x] Tests: 36 tests in daemon/server.test.ts, daemon/pool.test.ts, daemon/pid.test.ts

### Track B: Daemon Client (depends on 2B pattern) ✅

**4B.1 DaemonClientSandbox class**
- [x] RED: Write test for DaemonClientSandbox implementing ISandbox
- [x] GREEN: Create class delegating to daemon
- [x] REFACTOR: Share code with NativePythonSandbox

**4B.2 IPC client**
- [x] RED: Write test for IPC request/response
- [x] GREEN: Implement socket/pipe connection
- [x] REFACTOR: Add reconnection logic

**4B.3 Daemon availability detection**
- [x] RED: Write test for isDaemonRunning()
- [x] GREEN: Implement socket ping
- [x] REFACTOR: Add timeout

**Track B Complete**
- [x] Tests: 78 tests in daemon/client.test.ts, daemon/client-sandbox.test.ts, daemon/detect.test.ts

### Track C: Daemon Commands (depends on 3B, 4A, 4B) ✅

**4C.1 daemon start**
- [x] RED: Write test for daemon start creating PID
- [x] GREEN: Implement start with fork/detach
- [x] REFACTOR: Add startup verification

**4C.2 daemon stop**
- [x] RED: Write test for daemon stop with cleanup
- [x] GREEN: Implement stop with SIGTERM
- [x] REFACTOR: Add force kill option

**4C.3 daemon status**
- [x] RED: Write test for status output format
- [x] GREEN: Implement status with uptime/workers
- [x] REFACTOR: Add JSON output option

**4C.4 Backend priority update**
- [x] RED: Write test for daemon-first selection
- [x] GREEN: Update createSandbox to check daemon
- [x] REFACTOR: Log fallback reasons

**Track C Complete**
- [x] Tests: 23 tests in commands/daemon.test.ts (daemon-specific tests)

---

## Wave 5: Polish & Verification (Sequential) ✅ COMPLETE

Final wave, run after all features complete.

### 5.1 E2E Tests ✅
- [x] RED: E2E test `rlm run` with native backend (expect success)
- [x] GREEN: Fix any integration issues
- [x] RED: E2E test `rlm run` with daemon backend
- [x] GREEN: Fix daemon integration
- [x] RED: E2E test config file loading
- [x] GREEN: Fix config precedence
- [x] RED: E2E test error handling/exit codes
- [x] GREEN: Fix exit code handling
- [x] Tests: 37 tests in tests/e2e/cli-run.e2e.test.ts, tests/e2e/cli-config.e2e.test.ts, tests/e2e/cli-daemon.e2e.test.ts

### 5.2 Documentation ✅
- [x] Add --help text for all commands
- [x] Document config file format in help text

### 5.3 Build Verification ✅
- [x] Verify `pnpm build` across workspace
- [x] Verify `pnpm test` passes (357 core + 292 CLI = 649 tests)
- [x] Verify Python script bundles

---

## Wave 6: Async Batch Support ✅ COMPLETE

Performance optimization for parallel LLM queries.

- [x] RED: Write test for batch_llm_query function
- [x] GREEN: Implement batch_llm_query in Python sandbox
- [x] RED: Write test for parallel LLM dispatch
- [x] GREEN: Implement Promise.all batching in NativePythonSandbox
- [x] Tests: 5 new tests in native-python.test.ts

**Implementation:**
- Added `batch_llm_query(prompts: List[str]) -> List[str]` to Python sandbox
- Processes all prompts in parallel using `Promise.all`
- Reduces wall-clock time from `N * LLM_latency` to `max(LLM_latencies)`

---

## Dependency Graph

```
Wave 1 (Foundation) - 3 parallel tracks
├── 1A: Budget Context ────────────► Wave 2A: Sub-RLM Awareness
├── 1B: Python Runner ─────────────► Wave 2B: Native Sandbox TS ──► Wave 3A: Backend Selection
└── 1C: CLI Package ───────────────► Wave 2C: Config Loader ──────► Wave 3B: CLI Commands
                                                                  └► Wave 3C: Output Formatters

Wave 3 → Wave 4 dependencies
├── 3A: Backend Selection ─────────► 4C: Daemon Commands
├── 3B: CLI Commands ──────────────► 4C: Daemon Commands
├── 4A: Daemon Server ─────────────► 4C: Daemon Commands
└── 4B: Daemon Client ─────────────► 4C: Daemon Commands

Wave 5 (Polish) - Sequential after Wave 4
```

## Summary

**All waves complete.** Total test coverage:
- Core package: 362 tests (357 original + 5 batch support)
- CLI package: 292 tests (1 skipped for CI environments)
- **Total: 654 tests passing**
