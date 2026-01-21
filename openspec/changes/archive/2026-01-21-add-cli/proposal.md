# Change: High-Performance CLI with Native Python Backend

## Why

A CLI with near-real-time performance enables:
1. **E2E testing** of the full RLM pipeline without test harnesses
2. **Benchmarking** with minimal infrastructure overhead (<50ms target)
3. **Quick experimentation** from the command line
4. **Shell script integration** for automation workflows

The paper (Zhang et al. 2025) explicitly notes: "RLMs without asynchronous LM calls are slow... alternative strategies involving asynchronous sub-calls and sandboxed REPLs can potentially significantly reduce runtime."

## What Changes

### Core Optimizations (Phase 0)

- **MODIFIED**: Executor with intelligent depth selection (LLM-guided)
- **MODIFIED**: BudgetController with sub-RLM budget context methods
- **ADDED**: Async sub-LM batch support for parallel `llm_query()` calls

### Native Python Backend (Phase 1)

- **ADDED**: `NativePythonSandbox` - JSON-RPC over stdio (~20ms per call)
- **ADDED**: `packages/core/python/rlm_sandbox.py` - Python runner script
- **MODIFIED**: Backend selection factory in sandbox module

### CLI Package (Phase 2)

- **ADDED**: `packages/cli/` - Full CLI package with subcommands
- **ADDED**: `rlm run` - Execute tasks
- **ADDED**: `rlm daemon` - Start/stop/status daemon mode
- **ADDED**: `rlm config` - Show/set configuration
- **ADDED**: Config loader with cosmiconfig + Zod validation

### Daemon Mode (Phase 3)

- **ADDED**: Daemon server with pre-initialized worker pool
- **ADDED**: `DaemonClientSandbox` - IPC client (~5-10ms overhead)
- **ADDED**: Unix socket / named pipe support (cross-platform)

### Output & Polish (Phase 4)

- **ADDED**: Output formatters (text/json/yaml)
- **ADDED**: Verbose mode with progress indicators

## Impact

### Performance Analysis

| Backend | Cold Start | Per-Call | Use Case |
|---------|------------|----------|----------|
| Pyodide WASM | 200-500ms | ~50ms | Browser only |
| Native Python | 50-100ms | ~20ms | CLI single calls |
| **Daemon Mode** | 0ms* | **~5-10ms** | **Benchmarking** |

*after one-time warmup

### Affected Specs

- `cli` - New/expanded capability
- `repl-sandbox` - New backend types
- `budget-controller` - Budget context methods
- `execution-engine` - Dynamic depth, async batch

### Affected Code

- `packages/cli/` - New package
- `packages/core/src/repl/native-python.ts` - Native sandbox
- `packages/core/src/repl/daemon-client.ts` - Daemon client
- `packages/core/src/repl/sandbox.ts` - Backend selection
- `packages/core/src/engine/executor.ts` - Dynamic depth, async batch
- `packages/core/src/budget/controller.ts` - Budget context methods
- `packages/core/python/rlm_sandbox.py` - Python runner
- `pnpm-workspace.yaml` - Add cli workspace

## Key Decisions

1. **JSON-RPC over stdio** (not HTTP) - Lower latency, no port management
2. **Native Python default** when available - 4x faster than Pyodide
3. **Daemon for benchmarks** - 10-20x faster for repeated calls
4. **YAML config** via cosmiconfig - Human-readable, standard locations
5. **Subcommands** (`run`, `daemon`, `config`) - Familiar CLI patterns
