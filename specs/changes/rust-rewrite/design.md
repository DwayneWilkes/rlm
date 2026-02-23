## Context

RLM (Read-Loop-Mond) implements the Zhang et al. (2025) paper's approach: treating context as a variable in a Python REPL rather than tokens in a context window. The current TypeScript implementation works but uses a fragile toolchain (Node 22 + pnpm + nvm + tsup) that doesn't match the Rust MCP server pattern used by all 6 other tools in Liberation_Labs.

The existing TS architecture also inherits the paper's gaps: no budget enforcement, Pyodide WASM sandbox complexity, 8 provider-specific inference types, a daemon worker pool that's over-engineered for single-user use.

## Goals / Non-Goals

**Goals:**
- Toolchain consistency: single Rust binary crate matching the Liberation_Labs pattern
- Fix paper gaps: budget enforcement, robust FINAL parsing, Python subprocess sandbox, parallel sub-calls
- Simplify provider matrix: 3 adapters covering all providers (Anthropic, OpenAI-compatible, Claude Code subprocess)
- Preserve user-facing capabilities: templates, profiles, direct/iterative/auto modes, synthesis pass
- Red-green TDD: all modules built test-first

**Non-Goals:**
- Async runtime (tokio/async-std) — synchronous + `std::thread::scope` is sufficient
- GPU/CUDA integration for local inference
- Web UI or interactive REPL mode
- Streaming LLM responses (full response needed for code block extraction)
- Windows native Python subprocess — WSL2 `python3` only

## Decisions

### D1: Three LLM Adapters
**Decision**: Anthropic, OpenAI-compatible, Claude Code — three adapters total.

**Rationale**: Anthropic has a unique API format (system as parameter, not message). OpenAI's format is the de facto standard — Ollama, Gemini, Mistral, Cohere all support it. Claude Code adapter spawns the `claude` binary as subprocess (subscription auth, $0 cost).

**Alternatives**: (a) One adapter per provider (7 adapters, TypeScript status quo) — rejected, too much surface area with minimal value. (b) Single OpenAI-compatible adapter for everything — rejected, Anthropic's API is different enough to warrant its own adapter.

### D2: Python Subprocess Sandbox
**Decision**: Spawn `python3` process, pipe JSON commands via stdin, capture JSON responses from stdout.

**Rationale**: Pyodide WASM had complex bootstrapping (Web Workers, memory limits, missing packages). A subprocess is simple, debuggable, supports the full Python stdlib, and timeout is just process kill. The JSON protocol over pipes gives clean separation.

**Alternatives**: (a) Pyodide WASM — rejected, too complex for server-side use. (b) Docker container per execution — rejected, overkill latency for a single-user tool. (c) nsjail/bubblewrap — possible future enhancement but not needed now.

### D3: Threaded Parallel Sub-Calls
**Decision**: `std::thread::scope` for parallel `llm_query`/`rlm_query` within an iteration.

**Rationale**: The paper acknowledges synchronous sub-calls as a performance bottleneck. `ureq` is thread-safe. Scoped threads keep the borrow checker happy without Arc/Mutex. No async runtime needed. `max_batch_concurrency` in budget controls parallelism.

**Alternatives**: (a) tokio async — rejected, adds runtime complexity for one use case. (b) rayon — overkill for HTTP calls that are I/O-bound.

### D4: Synchronous MCP Server
**Decision**: Same stdin/stdout JSON-RPC pattern as all other Liberation_Labs tools.

**Rationale**: MCP clients wait for tool responses. The `rlm_execute` tool call blocks until execution completes (which may take minutes for long iterative runs). This matches every other tool in the workspace.

### D5: Unified InferenceOptions
**Decision**: Single `InferenceOptions` struct with `temperature`, `top_p`, `top_k`, `max_tokens`, `stop`, `seed`. Adapters ignore unsupported fields.

**Rationale**: The TS version had 8 provider-specific option types (OllamaInferenceOptions, AnthropicInferenceOptions, etc.) with mostly overlapping fields. One struct is simpler; adapters just skip what they can't map.

### D6: Sub-Call Protocol via Python
**Decision**: `llm_query()` and `rlm_query()` are Python functions in the sandbox that send JSON requests back to the Rust process via stdout, then block waiting for a JSON response on stdin.

**Rationale**: This keeps the sandbox isolated — it doesn't make HTTP calls directly. The Rust process owns the LLM clients and budget tracking. The sandbox just formats prompts and receives results.

### D7: Content-Hash Cache
**Decision**: In-memory HashMap keyed by SHA-256 of (model, messages, inference options). Scoped to a single execution.

**Rationale**: Within an iterative execution, the LLM may issue identical `llm_query()` prompts (e.g., classifying the same entity multiple times). Caching avoids redundant API calls. No persistence needed — each execution starts fresh.

## File Structure

```
tools/rlm/
  Cargo.toml
  templates/
    academic-summary.yaml
  src/
    main.rs           # CLI dispatcher (clap): serve | run | config | templates
    server.rs          # MCP JSON-RPC loop (canonical)
    protocol.rs        # MCP types (canonical)
    types.rs           # Core types, traits (LlmClient, Sandbox, Executor), Budget, RlmResult, etc.
    config.rs          # YAML config + profiles
    tools/
      mod.rs           # ToolHandler trait, AppContext, all_tools()
      execute.rs       # rlm_execute tool
      templates.rs     # rlm_templates tool
    engine/
      mod.rs           # Executor trait re-export
      direct.rs        # DirectExecutor
      iterative.rs     # IterativeExecutor (paper algorithm)
      mode.rs          # Auto mode selection
      parser.rs        # Response parser: code blocks, FINAL markers
    sandbox/
      mod.rs           # Sandbox trait
      python.rs        # Python subprocess sandbox
      harness.py       # Python-side harness (loaded into subprocess)
    llm/
      mod.rs           # LlmClient trait re-export
      router.rs        # Provider routing (primary + subcall)
      anthropic.rs     # Anthropic adapter
      openai.rs        # OpenAI-compatible adapter
      claude_code.rs   # Claude Code subprocess adapter
      cache.rs         # Content-hash response cache
    budget/
      mod.rs           # BudgetController
    prompt/
      mod.rs           # System prompt builder
      templates.rs     # Template loader
```

## Risks / Trade-offs

**[Python 3 required at runtime]** → Document as prerequisite. Most systems have python3. Could add a startup check that fails fast with a clear message if python3 is not found.

**[Claude Code adapter depends on `claude` binary]** → The adapter is optional; users can use Anthropic or OpenAI adapters instead. Document the `claude` binary requirement for that specific provider.

**[No streaming means long waits for iterative runs]** → The MCP protocol doesn't support streaming tool responses. CLI could add progress indicators to stderr in future. For now, acceptable since the TS version also blocks.

**[Subprocess sandbox is not a security boundary]** → The sandbox prevents accidental network access and resource exhaustion (via timeout), but a malicious prompt could craft Python code that escapes. This matches the paper's threat model — the sandbox is for reliability, not adversarial security.

**[Content-hash cache only per-execution]** → Won't help across separate tool calls. Acceptable for v1. Could add persistent cache later if needed.

## Migration Plan

1. Build the Rust crate in `tools/rlm/` alongside the existing TS code
2. Once tests pass, update the shell wrapper at `/mnt/d/dev/bin/rlm` to point at the Rust binary
3. Update `.mcp.json` to use the new binary path
4. Verify MCP tools work with Claude Code
5. TS code (packages/, pnpm-workspace.yaml, etc.) can be archived or removed

## Open Questions

None — all decisions are resolved. The implementation plan in the tasks artifact will detail the wave-based TDD approach.
