# Change: Optimize Pyodide Implementation with Worker Isolation

## Why

The current Pyodide sandbox implementation has critical limitations:
1. **Timeout doesn't stop execution** - Promise.race only races, the WASM code continues running
2. **WASM memory not released** - Setting pyodide to null doesn't reclaim ~150MB heap
3. **CDN hardcoded** - No fallback options for Pyodide loading
4. **Bridge function overhead** - ThreadPoolExecutor pattern is unnecessary

## What Changes

- **ADDED**: Worker-based Pyodide sandbox (`WorkerPyodideSandbox`) with true interrupt support via SharedArrayBuffer + `setInterruptBuffer()`
- **ADDED**: `cancel()` method to Sandbox interface for explicit execution cancellation
- **ADDED**: REPLConfig options: `indexURL`, `fullStdLib`, `preloadPackages`, `useWorker`, `onStdout`, `onStderr`
- **ADDED**: `detectWorkerSupport()` helper for environment detection
- **MODIFIED**: Original implementation renamed to `DirectPyodideSandbox` as fallback
- **MODIFIED**: `createSandbox()` auto-detects worker support and chooses implementation

## Impact

- Affected specs: `repl-sandbox`
- Affected code:
  - `packages/core/src/types.ts` - REPLConfig extensions
  - `packages/core/src/types/index.ts` - REPLConfig extensions
  - `packages/core/src/repl/pyodide.ts` - Split into Worker and Direct implementations
  - `packages/core/src/repl/pyodide-worker.ts` - New worker script
  - `packages/core/src/repl/sandbox.ts` - Added cancel() and worker detection
  - `packages/core/src/repl/sandbox.test.ts` - New tests for worker features
