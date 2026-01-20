## 1. Type Extensions

- [x] 1.1 Extend REPLConfig in `types.ts` with new options (indexURL, fullStdLib, preloadPackages, useWorker, onStdout, onStderr)
- [x] 1.2 Extend REPLConfig in `types/index.ts` with matching fields

## 2. Interface Updates

- [x] 2.1 Add `cancel()` method to Sandbox interface in `sandbox.ts`
- [x] 2.2 Update `createSandbox()` with worker detection and fallback logic

## 3. Worker Implementation

- [x] 3.1 Create `pyodide-worker.ts` worker script
- [x] 3.2 Implement SharedArrayBuffer-based interrupt handling
- [x] 3.3 Implement message-passing for bridge functions (llm_query, rlm_query)

## 4. Sandbox Refactoring

- [x] 4.1 Create `WorkerPyodideSandbox` class with worker lifecycle management
- [x] 4.2 Rename original implementation to `DirectPyodideSandbox`
- [x] 4.3 Add `detectWorkerSupport()` helper function
- [x] 4.4 Implement configurable indexURL with fallback support

## 5. Testing

- [x] 5.1 Add tests for `cancel()` method
- [x] 5.2 Add tests for new REPLConfig options
- [x] 5.3 Add tests for `detectWorkerSupport()`
- [x] 5.4 Update mocks to force direct mode in tests
- [x] 5.5 Verify all 325 tests pass
