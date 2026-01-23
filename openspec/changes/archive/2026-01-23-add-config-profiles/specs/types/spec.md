# types Spec Delta

## MODIFIED Requirements

### Requirement: Configuration Types

The system SHALL define core configuration types.

#### Scenario: RLMConfig structure
- **GIVEN** an RLMConfig object
- **THEN** it SHALL have provider, model, and optional repl/defaultBudget fields

#### Scenario: RLMConfig subcall provider
- **GIVEN** an RLMConfig object
- **THEN** it MAY have optional `subcallProvider` field
- **AND** `subcallProvider` SHALL specify the provider for rlm_query and batch_rlm_query
- **AND** if not specified, it SHALL fall back to the main `provider`

#### Scenario: Budget structure
- **GIVEN** a Budget object
- **THEN** it SHALL have optional maxCost, maxTokens, maxTime, maxDepth, maxIterations

#### Scenario: REPLConfig structure
- **GIVEN** a REPLConfig object
- **THEN** it SHALL have optional timeout, maxOutputLength, backend, indexURL, useWorker
