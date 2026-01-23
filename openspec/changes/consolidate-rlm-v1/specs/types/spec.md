# Spec Delta: types

## ADDED Requirements

### Requirement: Sandbox Factory Type

The system SHALL define a `SandboxFactory` type for injectable sandbox creation.

```typescript
export type SandboxFactory = (context: string) => Promise<Sandbox>;
```

#### Scenario: Custom sandbox factory
- **WHEN** a consumer provides a `sandboxFactory` in `RLMConfig`
- **THEN** the executor SHALL use that factory instead of the default

### Requirement: Subcall Provider Configuration

The system SHALL support separate provider configuration for subcalls (rlm_query, batch_rlm_query).

```typescript
export interface RLMConfig {
  // Root LLM configuration
  provider: string;
  model: string;

  // Subcall configuration (optional, defaults to root)
  subcallProvider?: string;
  subcallModel?: string;

  // Sandbox factory injection (optional)
  sandboxFactory?: SandboxFactory;

  // ... existing fields
}
```

#### Scenario: Hybrid provider configuration
- **WHEN** config specifies `provider: "claude-code"` and `subcallProvider: "ollama"`
- **THEN** root queries SHALL use Claude
- **AND** subcalls SHALL use Ollama

#### Scenario: Default subcall provider
- **WHEN** `subcallProvider` is not specified
- **THEN** subcalls SHALL use the same provider as root queries

### Requirement: Batch Query Concurrency Configuration

The system SHALL allow configuring concurrency for batch RLM queries.

```typescript
export interface BudgetConfig {
  // ... existing fields
  maxBatchConcurrency?: number;  // default: 5
  maxBatchSize?: number;         // default: 10
}
```

#### Scenario: Concurrency limit
- **WHEN** `batch_rlm_query` is called with 20 tasks and `maxBatchConcurrency: 5`
- **THEN** at most 5 subcalls SHALL run concurrently
