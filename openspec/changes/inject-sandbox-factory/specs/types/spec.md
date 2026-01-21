# types Spec Delta

## ADDED Requirements

### Requirement: Sandbox Factory Type

The system SHALL provide a type for custom sandbox factory functions.

#### Scenario: SandboxFactory type signature
- **WHEN** importing SandboxFactory from '@rlm/core'
- **THEN** it SHALL be a function type accepting (config: REPLConfig, bridges: SandboxBridges)
- **AND** returning Sandbox

#### Scenario: SandboxFactory in RLMConfig
- **WHEN** creating RLMConfig
- **THEN** sandboxFactory SHALL be an optional field
- **AND** it SHALL accept a SandboxFactory function

#### Scenario: Default sandbox behavior
- **WHEN** sandboxFactory is not provided in RLMConfig
- **THEN** the system SHALL use the default Pyodide sandbox factory
