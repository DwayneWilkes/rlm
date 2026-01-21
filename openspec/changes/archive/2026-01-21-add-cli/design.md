# Design: High-Performance CLI with Native Python Backend

## Context

The current RLM implementation uses Pyodide (WASM) for Python execution, which has 200-500ms cold start and ~50ms per-call overhead. For E2E testing and benchmarking, this overhead dominates the execution time since LLM calls are 500ms-5s (network bound).

**Stakeholders:**
- Developers running benchmarks (need fast iteration)
- CI/CD pipelines (need reliable, consistent performance)
- Researchers reproducing paper results (need accurate timing)

## Goals / Non-Goals

### Goals
- <50ms infrastructure overhead per call (excluding LLM latency)
- Cross-platform support (Windows, Linux, macOS)
- Drop-in replacement for Pyodide sandbox interface
- Daemon mode for benchmark scenarios (10-20x faster)
- Intelligent depth selection aligned with paper recommendations

### Non-Goals
- Browser support (Pyodide handles this)
- Python package management (user installs packages separately)
- Replacing Pyodide for web use cases

## Decisions

### Decision 1: JSON-RPC over stdio (not HTTP)

**What:** Communication between Node.js and Python subprocess uses JSON-RPC 2.0 over stdio.

**Why:**
- ~5-10ms overhead vs ~20-50ms for HTTP localhost
- No port management or conflicts
- Simpler process lifecycle management
- Works consistently across platforms

**Protocol:**
```json
// Request (Node.js → Python)
{"jsonrpc":"2.0","id":"1","method":"execute","params":{"code":"print(2+2)"}}

// Response (Python → Node.js)
{"jsonrpc":"2.0","id":"1","result":{"stdout":"4\n","stderr":"","duration":15}}

// Bridge callback (Python → Node.js, when code calls llm_query)
{"jsonrpc":"2.0","id":"bridge:1","method":"bridge:llm","params":{"prompt":"..."}}

// Bridge response (Node.js → Python)
{"jsonrpc":"2.0","id":"bridge:1","result":"LLM response text"}
```

### Decision 2: Backend Selection Hierarchy

**What:** Automatic backend selection based on availability.

```
1. Daemon running? → DaemonClientSandbox (~5ms)
2. Python available? → NativePythonSandbox (~50ms)
3. Fallback → PyodideSandbox (~300ms)
```

**Configuration override:** Users can force specific backend via config or `--backend` flag.

### Decision 3: Daemon Worker Pool

**What:** Long-running process with pre-initialized Python workers.

**Why:**
- Eliminates cold start for repeated calls
- Workers maintain state between calls (within same session)
- Pool size configurable (default: 4)

**IPC:**
- Unix socket: `~/.rlm/daemon.sock` (Linux/macOS)
- Named pipe: `\\.\pipe\rlm-daemon` (Windows)

**Protocol:** Same JSON-RPC as native sandbox, routed through IPC.

### Decision 4: Dynamic Recursive Depth (LLM-Guided)

**What:** Instead of static `maxDepth`, let LLM choose between `llm_query()` and `rlm_query()`.

**System prompt guidance:**
```
CHOOSING BETWEEN llm_query() and rlm_query():
- llm_query(prompt): For simple questions, fact lookups
  Cost: ~$0.01-0.05, Time: ~1-3s
- rlm_query(task, ctx): For complex multi-step reasoning
  Cost: ~$0.10-0.50, Time: ~10-60s

Your remaining budget: $X.XX / Y iterations
```

**Budget-based auto-downgrade:**
When remaining budget is low (<$0.50 or <5 iterations), auto-downgrade `rlm_query()` to `llm_query()`.

### Decision 5: Sub-RLM Budget Awareness

**What:** Sub-RLMs receive explicit budget context in system prompt.

**Why:** Paper notes that sub-calls should be cheaper (model hierarchy). Making budget explicit helps sub-RLMs be efficient.

**Enhanced sub-RLM prompt:**
```
You are a SUB-RLM at depth ${depth}/${maxDepth}.
YOUR ALLOCATED BUDGET (from parent):
- Cost: $${allocated.cost} (parent had $${parentRemaining.cost})
- Iterations: ${allocated.iterations}

EFFICIENCY GUIDELINES:
- Prefer llm_query() over rlm_query() unless truly necessary
- Aim to complete in 2-5 iterations
- Return FINAL() as soon as you have a reasonable answer
```

### Decision 6: Config File Format

**What:** YAML config via cosmiconfig with Zod validation.

**Location search order:**
1. `--config` flag
2. `.rlmrc.yaml` in current directory
3. `~/.config/rlm/config.yaml`
4. `~/.rlm/config.yaml`

**Schema:**
```yaml
provider: ollama
model: llama3.2
budget:
  maxCost: 5.0
  maxIterations: 30
repl:
  backend: auto  # auto|native|daemon|pyodide
output:
  format: text   # text|json|yaml
```

## Risks / Trade-offs

### Risk: Python not available on all systems
**Mitigation:** Fall back to Pyodide. Log warning suggesting Python installation for better performance.

### Risk: Daemon process becomes orphaned
**Mitigation:**
- PID file at `~/.rlm/daemon.pid`
- Stale PID detection on startup
- Automatic cleanup on `daemon stop`
- `--force` flag for cleanup

### Risk: Windows named pipe permission issues
**Mitigation:** Use user-specific pipe name with security descriptor.

### Trade-off: Complexity vs Performance
We're adding significant complexity (native sandbox, daemon, IPC) for 10-20x performance improvement. This is justified for:
- Benchmark scenarios (hundreds of calls)
- CI/CD pipelines (time is money)
- Development iteration speed

For casual use, Pyodide remains fine.

## Migration Plan

No migration needed - additive changes only:
1. Existing code continues to work with Pyodide
2. CLI is optional package
3. Native/daemon backends opt-in via config

## Open Questions

1. **Worker pool sizing:** Should pool size be dynamic based on system resources?
   - Initial decision: Fixed default (4), user-configurable

2. **Async batch window:** How long to wait for additional `llm_query()` calls before dispatching batch?
   - Initial decision: 10ms window, configurable

3. **Budget split ratio:** What percentage of remaining budget should sub-RLMs receive?
   - Initial decision: 50% of remaining (already implemented in BudgetController.getSubBudget)
