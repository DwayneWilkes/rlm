# Spec Delta: execution-engine

## ADDED Requirements

### Requirement: Sandbox Factory Injection

The executor SHALL support injecting a custom sandbox factory via `RLMConfig.sandboxFactory`.

#### Scenario: Custom factory used
- **WHEN** `config.sandboxFactory` is provided
- **THEN** the executor SHALL call that factory to create the sandbox
- **AND** the executor SHALL NOT use the default createSandbox

#### Scenario: Default factory fallback
- **WHEN** `config.sandboxFactory` is not provided
- **THEN** the executor SHALL use the built-in Pyodide sandbox

### Requirement: Subcall Provider Routing

The executor SHALL route subcalls (rlm_query, batch_rlm_query) to the configured subcall provider.

#### Scenario: Subcall uses different provider
- **WHEN** root config has `provider: "claude-code"` and `subcallProvider: "ollama"`
- **THEN** `rlm_query` calls SHALL use Ollama
- **AND** root LLM calls SHALL continue using Claude

#### Scenario: Inherited subcall provider
- **WHEN** `subcallProvider` is not specified
- **THEN** subcalls SHALL use the root `provider`

### Requirement: Batch RLM Query Bridge

The executor SHALL implement the `onBatchRLMQuery` bridge for concurrent sub-RLM execution.

#### Scenario: Concurrent execution
- **WHEN** `batch_rlm_query` is called from Python with 5 tasks
- **AND** `maxBatchConcurrency` is 3
- **THEN** the executor SHALL run at most 3 subcalls concurrently

#### Scenario: Results ordering
- **WHEN** `batch_rlm_query` completes
- **THEN** results SHALL be in the same order as input tasks
- **AND** failed tasks SHALL have error messages in their result slots

#### Scenario: Budget check before batch
- **WHEN** estimated batch cost exceeds remaining budget
- **THEN** the executor SHALL reject the batch before spawning any subcalls

### Requirement: System Prompt Batching Guidance

The system prompt SHALL include guidance on using `batch_rlm_query` for concurrent sub-tasks.

#### Scenario: Batching instruction present
- **WHEN** system prompt is generated
- **THEN** it SHALL include guidance to use `batch_rlm_query` for independent sub-tasks
- **AND** it SHALL recommend ~200k chars per sub-call for optimal cost/quality
