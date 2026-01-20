## Context

The Pyodide WASM runtime presents challenges for typical JavaScript patterns:
- WASM code runs synchronously and cannot be interrupted by JavaScript
- The ~150MB WASM heap persists until the entire isolate is destroyed
- Bridge functions between Python and JavaScript need careful async handling

This design addresses these issues by running Pyodide inside a Worker thread, enabling true interruption and complete memory cleanup.

## Goals / Non-Goals

**Goals:**
- Enable true execution interruption (not just Promise.race)
- Enable complete WASM memory cleanup on destroy()
- Support configurable CDN URLs with fallbacks
- Maintain backwards compatibility with existing API
- Auto-detect worker support and fall back gracefully

**Non-Goals:**
- Web Worker implementation (this focuses on Node.js worker_threads)
- Worker pooling or reuse (each sandbox gets fresh worker)
- Preemptive timeout (still uses cooperative interrupt)

## Decisions

### Decision: Use SharedArrayBuffer for interruption
Pyodide's `setInterruptBuffer()` API reads from a SharedArrayBuffer to check for interrupt signals. Writing `2` (SIGINT) triggers a `KeyboardInterrupt` in Python. This is the only way to interrupt WASM execution from outside.

**Alternatives considered:**
- AbortController: Doesn't work for WASM, only for fetch/streams
- Worker.terminate() alone: Kills cleanly but can't notify Python code
- Promise.race (current): Only races, doesn't stop execution

### Decision: worker.terminate() for cleanup
Calling `worker.terminate()` destroys the entire V8 isolate including the WASM heap. This is the only reliable way to reclaim Pyodide memory.

**Alternatives considered:**
- Setting pyodide to null: GC may not reclaim WASM heap promptly
- Pyodide.destroy(): Doesn't exist in the API

### Decision: Message-passing for bridge functions
When Python calls `llm_query()` or `rlm_query()`, the worker sends a message to the main thread, which performs the LLM call and sends the result back. This maintains the async nature while allowing the sandbox to run in isolation.

**Alternatives considered:**
- SharedArrayBuffer for results: Complex serialization, size limits
- Synchronous blocks: Would defeat async benefits

### Decision: Auto-detection with explicit override
`detectWorkerSupport()` checks for SharedArrayBuffer availability. Users can override with `useWorker: false` to force direct mode.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| SharedArrayBuffer requires COOP/COEP headers in browsers | Only affects web-ui package; document header requirements |
| Worker startup adds latency | One-time cost per sandbox; acceptable for long-running tasks |
| Message-passing adds overhead to bridges | Only affects LLM calls which are already I/O bound |
| Direct mode has limitations | Documented clearly; most environments support workers |

## Migration Plan

1. **Backwards compatible**: Existing code continues to work without changes
2. **Default behavior**: Worker mode is default when available
3. **Explicit fallback**: Set `useWorker: false` if issues arise
4. **No breaking changes**: API surface unchanged, only extensions

## Open Questions

- Should we implement worker pooling for high-throughput scenarios?
- Should we add COOP/COEP header detection and warning in web-ui?
