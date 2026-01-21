# execution-engine Spec Delta

## MODIFIED Requirements

### Requirement: Sandbox Creation (Modified)

The system SHALL support injected sandbox factories.

#### Scenario: Use injected factory
- **WHEN** RLMConfig.sandboxFactory is provided
- **THEN** Executor SHALL call sandboxFactory(replConfig, bridges) to create sandbox

#### Scenario: Fallback to default factory
- **WHEN** RLMConfig.sandboxFactory is not provided
- **THEN** Executor SHALL use the default createSandbox() from repl/sandbox.js

#### Scenario: Factory receives bridges
- **WHEN** creating sandbox via factory
- **THEN** factory SHALL receive onLLMQuery and onRLMQuery bridge callbacks
