# Implementation Waves (TDD)

Tasks organized for parallel execution with **TDD mandatory**: Red → Green → Refactor.

Each task follows the pattern:
1. **RED**: Write failing test first
2. **GREEN**: Write minimal code to pass
3. **REFACTOR**: Clean up while tests pass

---

## Wave 1: Foundation (Parallel)

Three independent tracks that can run simultaneously.

### Track A: Budget Context (Core)

**1A.1 getAllocatedBudgetDescription() method**
- [ ] RED: Write test for `getAllocatedBudgetDescription(depth)` returning formatted budget string
- [ ] GREEN: Implement method in BudgetController
- [ ] REFACTOR: Clean up string formatting

**1A.2 shouldDowngradeToLLMQuery() method**
- [ ] RED: Write test for `shouldDowngradeToLLMQuery()` returning true when cost < $0.50 or iterations < 5
- [ ] GREEN: Implement method in BudgetController
- [ ] REFACTOR: Extract threshold constants

**Track A Complete**
- [ ] COMMIT: `feat(budget): add budget context methods for sub-RLM awareness`

### Track B: Python Runner Script

**1B.1 JSON-RPC server**
- [ ] RED: Write pytest for JSON-RPC request/response parsing
- [ ] GREEN: Implement `rlm_sandbox.py` with stdio JSON-RPC
- [ ] REFACTOR: Extract protocol handling

**1B.2 Code execution with capture**
- [ ] RED: Write pytest for execute method capturing stdout/stderr
- [ ] GREEN: Implement execute with StringIO capture
- [ ] REFACTOR: Add proper exception handling

**1B.3 Bridge callbacks**
- [ ] RED: Write pytest for llm_query/rlm_query blocking bridge calls
- [ ] GREEN: Implement bridge callbacks with JSON-RPC requests to host
- [ ] REFACTOR: Unify callback pattern

**1B.4 Context injection**
- [ ] RED: Write pytest verifying `context` variable available after init
- [ ] GREEN: Implement context injection in initialize
- [ ] REFACTOR: Add context type hints

**Track B Complete**
- [ ] COMMIT: `feat(repl): add Python runner script with JSON-RPC protocol`

### Track C: CLI Package Setup

**1C.1 Package structure**
- [ ] RED: Write test that `@rlm/cli` can be imported
- [ ] GREEN: Create package.json, tsconfig.json, tsup.config.ts
- [ ] REFACTOR: Align with @rlm/core patterns

**1C.2 Workspace integration**
- [ ] RED: Write test that `pnpm build` includes cli
- [ ] GREEN: Add cli to pnpm-workspace.yaml
- [ ] REFACTOR: Verify dependency resolution

**1C.3 Entry point**
- [ ] RED: Write test that `bin/rlm.ts` exports CLI runner
- [ ] GREEN: Create bin/rlm.ts with shebang and main()
- [ ] REFACTOR: Add error boundary

**Track C Complete**
- [ ] COMMIT: `feat(cli): scaffold @rlm/cli package structure`

---

## Wave 2: Core Integration (Parallel)

Depends on Wave 1 completion.

### Track A: Sub-RLM Budget Awareness (depends on 1A)

**2A.1 Enhanced sub-RLM system prompt**
- [ ] RED: Write test for sub-RLM prompt including depth, budget, guidelines
- [ ] GREEN: Create prompt template function
- [ ] REFACTOR: Extract prompt sections

**2A.2 Budget context injection in Executor**
- [ ] RED: Write test that handleRLMQuery injects budget context
- [ ] GREEN: Update Executor.handleRLMQuery
- [ ] REFACTOR: Centralize prompt building

**2A.3 Auto-downgrade to llm_query**
- [ ] RED: Write test that rlm_query downgrades when budget low
- [ ] GREEN: Add downgrade check in handleRLMQuery
- [ ] REFACTOR: Make threshold configurable

**Track A Complete**
- [ ] COMMIT: `feat(engine): add sub-RLM budget awareness and auto-downgrade`

### Track B: Native Sandbox TypeScript (depends on 1B)

**2B.1 NativePythonSandbox class**
- [ ] RED: Write test for NativePythonSandbox implementing ISandbox
- [ ] GREEN: Create class with initialize/execute/destroy/getVariable
- [ ] REFACTOR: Extract common sandbox behavior

**2B.2 JSON-RPC client**
- [ ] RED: Write test for JSON-RPC over child_process stdio
- [ ] GREEN: Implement request/response with ID tracking
- [ ] REFACTOR: Add timeout handling

**2B.3 Bridge callback handlers**
- [ ] RED: Write test for handling bridge:llm and bridge:rlm methods
- [ ] GREEN: Implement callback routing to onLLMQuery/onRLMQuery
- [ ] REFACTOR: Type-safe callback dispatch

**2B.4 Python availability detection**
- [ ] RED: Write test for isPythonAvailable() returning boolean
- [ ] GREEN: Implement `python --version` check
- [ ] REFACTOR: Cache availability result

**Track B Complete**
- [ ] COMMIT: `feat(repl): add NativePythonSandbox with JSON-RPC client`

### Track C: Config Loader (depends on 1C)

**2C.1 Config schema**
- [ ] RED: Write test for Zod schema validating config shape
- [ ] GREEN: Create schema.ts with RLMConfigSchema
- [ ] REFACTOR: Add default values

**2C.2 Cosmiconfig integration**
- [ ] RED: Write test for loading from .rlmrc.yaml
- [ ] GREEN: Create loader.ts with cosmiconfig explorer
- [ ] REFACTOR: Add search path customization

**2C.3 Config merge**
- [ ] RED: Write test for CLI flags overriding file config
- [ ] GREEN: Implement deep merge with flag precedence
- [ ] REFACTOR: Type-safe merge function

**Track C Complete**
- [ ] COMMIT: `feat(cli): add config loader with cosmiconfig and Zod`

---

## Wave 3: CLI Features (Parallel)

Depends on Wave 2 completion.

### Track A: Backend Selection (depends on 2B)

**3A.1 SandboxBackend type**
- [ ] RED: Write test for SandboxBackend enum values
- [ ] GREEN: Add type to types/index.ts
- [ ] REFACTOR: Export from package

**3A.2 createSandbox() factory**
- [ ] RED: Write test for factory returning correct sandbox type
- [ ] GREEN: Implement factory with backend detection
- [ ] REFACTOR: Add logging for selected backend

**3A.3 Backend hierarchy**
- [ ] RED: Write test for daemon → native → pyodide fallback
- [ ] GREEN: Implement detection chain
- [ ] REFACTOR: Make hierarchy configurable

**Track A Complete**
- [ ] COMMIT: `feat(repl): add sandbox factory with backend selection`

### Track B: CLI Commands (depends on 2C, 3A)

**3B.1 Commander router**
- [ ] RED: Write test for CLI parsing subcommands
- [ ] GREEN: Create cli.ts with commander program
- [ ] REFACTOR: Extract common options

**3B.2 Run command**
- [ ] RED: Write test for `rlm run` executing task
- [ ] GREEN: Implement run.ts with context loading
- [ ] REFACTOR: Add progress callbacks

**3B.3 Config command**
- [ ] RED: Write test for `rlm config show` output
- [ ] GREEN: Implement config.ts with show/path subcommands
- [ ] REFACTOR: Format output consistently

**3B.4 Daemon stub**
- [ ] RED: Write test for daemon commands existing
- [ ] GREEN: Create daemon.ts with start/stop/status stubs
- [ ] REFACTOR: Add "not implemented" messages

**Track B Complete**
- [ ] COMMIT: `feat(cli): implement run, config, and daemon stub commands`

### Track C: Output Formatters (depends on 2C)

**3C.1 Formatter interface**
- [ ] RED: Write test for IFormatter interface
- [ ] GREEN: Create formatter.ts with interface
- [ ] REFACTOR: Add format detection

**3C.2 Text formatter**
- [ ] RED: Write test for human-readable output
- [ ] GREEN: Implement TextFormatter with colors
- [ ] REFACTOR: Add progress spinner

**3C.3 JSON formatter**
- [ ] RED: Write test for valid JSON output
- [ ] GREEN: Implement JsonFormatter
- [ ] REFACTOR: Add pretty-print option

**3C.4 YAML formatter**
- [ ] RED: Write test for valid YAML output
- [ ] GREEN: Implement YamlFormatter
- [ ] REFACTOR: Handle complex types

**Track C Complete**
- [ ] COMMIT: `feat(cli): add output formatters (text, json, yaml)`

---

## Wave 4: Daemon Mode (Parallel)

Depends on Wave 3 completion.

### Track A: Daemon Server

**4A.1 Worker pool manager**
- [ ] RED: Write test for pool spawning N workers
- [ ] GREEN: Implement pool with spawn/acquire/release
- [ ] REFACTOR: Add health checks

**4A.2 Unix socket server**
- [ ] RED: Write test for socket server accepting connections
- [ ] GREEN: Implement with net.createServer
- [ ] REFACTOR: Add connection limit

**4A.3 Named pipe server (Windows)**
- [ ] RED: Write test for pipe server on Windows
- [ ] GREEN: Implement with \\.\pipe\ path
- [ ] REFACTOR: Unify with Unix socket code

**4A.4 PID file management**
- [ ] RED: Write test for PID file creation/cleanup
- [ ] GREEN: Implement writePID/readPID/cleanupPID
- [ ] REFACTOR: Add stale detection

**Track A Complete**
- [ ] COMMIT: `feat(daemon): add worker pool and IPC server`

### Track B: Daemon Client (depends on 2B pattern)

**4B.1 DaemonClientSandbox class**
- [ ] RED: Write test for DaemonClientSandbox implementing ISandbox
- [ ] GREEN: Create class delegating to daemon
- [ ] REFACTOR: Share code with NativePythonSandbox

**4B.2 IPC client**
- [ ] RED: Write test for IPC request/response
- [ ] GREEN: Implement socket/pipe connection
- [ ] REFACTOR: Add reconnection logic

**4B.3 Daemon availability detection**
- [ ] RED: Write test for isDaemonRunning()
- [ ] GREEN: Implement socket ping
- [ ] REFACTOR: Add timeout

**Track B Complete**
- [ ] COMMIT: `feat(repl): add DaemonClientSandbox with IPC`

### Track C: Daemon Commands (depends on 3B, 4A, 4B)

**4C.1 daemon start**
- [ ] RED: Write test for daemon start creating PID
- [ ] GREEN: Implement start with fork/detach
- [ ] REFACTOR: Add startup verification

**4C.2 daemon stop**
- [ ] RED: Write test for daemon stop with cleanup
- [ ] GREEN: Implement stop with SIGTERM
- [ ] REFACTOR: Add force kill option

**4C.3 daemon status**
- [ ] RED: Write test for status output format
- [ ] GREEN: Implement status with uptime/workers
- [ ] REFACTOR: Add JSON output option

**4C.4 Backend priority update**
- [ ] RED: Write test for daemon-first selection
- [ ] GREEN: Update createSandbox to check daemon
- [ ] REFACTOR: Log fallback reasons

**Track C Complete**
- [ ] COMMIT: `feat(cli): implement daemon start/stop/status commands`

---

## Wave 5: Polish & Verification (Sequential)

Final wave, run after all features complete.

### 5.1 E2E Tests
- [ ] RED: E2E test `rlm run` with native backend (expect success)
- [ ] GREEN: Fix any integration issues
- [ ] RED: E2E test `rlm run` with daemon backend
- [ ] GREEN: Fix daemon integration
- [ ] RED: E2E test config file loading
- [ ] GREEN: Fix config precedence
- [ ] RED: E2E test error handling/exit codes
- [ ] GREEN: Fix exit code handling
- [ ] COMMIT: `test(cli): add E2E tests for all backends and config`

### 5.2 Documentation
- [ ] Add --help text for all commands
- [ ] Document config file format
- [ ] COMMIT: `docs(cli): add CLI usage documentation`

### 5.3 Build Verification
- [ ] Verify `pnpm build` across workspace
- [ ] Verify `pnpm test` passes
- [ ] Verify Python script bundles
- [ ] COMMIT: `chore(cli): finalize build and package configuration`

---

## Deferred: Async Batch Support

Follow-up change after CLI is stable.

- [ ] RED: Write test for batch collecting multiple llm_query calls
- [ ] GREEN: Implement batch window (10ms)
- [ ] RED: Write test for parallel LLM dispatch
- [ ] GREEN: Implement Promise.all batching
- [ ] REFACTOR: Make window configurable

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
