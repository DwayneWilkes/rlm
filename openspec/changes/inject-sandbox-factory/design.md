# Design: inject-sandbox-factory

## Architecture Decision

### Option A: Inject factory into RLMConfig (Selected)

```typescript
// In types.ts
export type SandboxFactory = (
  config: REPLConfig,
  bridges: SandboxBridges
) => Sandbox;

export interface RLMConfig {
  // ... existing fields
  sandboxFactory?: SandboxFactory;
}

// In executor.ts
const sandbox = this.config.sandboxFactory
  ? this.config.sandboxFactory(replConfig, bridges)
  : createSandbox(replConfig, bridges);
```

**Pros**:
- Minimal change to core
- CLI controls sandbox creation entirely
- No new dependencies in core

**Cons**:
- Requires CLI to build the factory with backend already resolved

### Option B: Pass backend type to core

```typescript
// Core would need to import CLI's backends
export interface RLMConfig {
  repl?: REPLConfig & { backend?: 'native' | 'daemon' | 'pyodide' };
}
```

**Rejected**: Creates circular dependency (core → cli).

### Option C: Core exports backend selection

```typescript
// Core would need native-python and daemon-client
export function createSandbox(
  config: REPLConfig & { backend?: SandboxBackend },
  bridges: SandboxBridges
): Sandbox;
```

**Rejected**: Bloats core with CLI-specific code (daemon client, etc.).

## Data Flow After Change

```
CLI run.ts
    │
    ├─→ detectBestBackend() → 'native'
    │
    ├─→ Build sandboxFactory = (config, bridges) =>
    │       createSandbox({ backend: 'native', ...config }, bridges)
    │
    └─→ new RLM({ sandboxFactory, ... })
            │
            └─→ Executor.execute()
                    │
                    └─→ this.config.sandboxFactory(replConfig, bridges)
                            │
                            └─→ NativePythonSandbox
```

## Type Additions

```typescript
// packages/core/src/types.ts

import type { Sandbox, SandboxBridges } from './repl/sandbox.js';

/**
 * Factory function for creating sandbox instances.
 * Used to inject custom sandbox implementations (native, daemon, etc.).
 */
export type SandboxFactory = (
  config: REPLConfig,
  bridges: SandboxBridges
) => Sandbox;

export interface RLMConfig {
  provider: 'anthropic' | 'openai' | 'ollama' | 'claude-code';
  model: string;
  subcallModel?: string;
  providerOptions?: { ... };
  defaultBudget?: Partial<Budget>;
  repl?: Partial<REPLConfig>;

  // NEW: Optional custom sandbox factory
  sandboxFactory?: SandboxFactory;
}
```

## CLI Integration

```typescript
// packages/cli/src/commands/run.ts

import { createSandbox as cliCreateSandbox } from '../sandbox/index.js';

// In action handler:
let backend = config.repl.backend;
if (backend === 'auto') {
  backend = await detectBestBackend();
}

const sandboxFactory: SandboxFactory = (replConfig, bridges) =>
  cliCreateSandbox({
    backend,
    timeout: replConfig.timeout,
    maxOutputLength: replConfig.maxOutputLength,
    useWorker: replConfig.useWorker,
    indexURL: replConfig.indexURL,
  }, bridges);

const rlm = new RLM({
  provider: config.provider,
  model: config.model,
  subcallModel: config.subcallModel,
  sandboxFactory,  // Inject CLI's factory
  defaultBudget: { ... },
  repl: { ... },
});
```

## Backward Compatibility

- `sandboxFactory` is optional
- If not provided, Executor uses core's `createSandbox()` (Pyodide)
- Existing code using `RLM` without factory continues to work
- Programmatic users can also inject custom sandboxes

**TODO: Remove fallback in v1.0** - Once CLI is the primary entry point, consider making `sandboxFactory` required or moving all backend implementations to core. The fallback to Pyodide-only exists for backward compatibility during the transition period.
