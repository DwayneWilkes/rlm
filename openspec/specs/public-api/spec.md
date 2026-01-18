# public-api Specification

## Purpose
Provide the RLM class as the primary interface and export all public types, utilities, and adapters from @rlm/core.
## Requirements
### Requirement: RLM Class

The system SHALL provide an RLM class as the primary interface.

#### Scenario: Constructor with config
- **WHEN** creating new RLM(config)
- **THEN** it SHALL accept RLMConfig with provider, model, and optional fields

#### Scenario: Execute method
- **WHEN** calling rlm.execute(options)
- **THEN** it SHALL return Promise<RLMResult>

#### Scenario: Provider auto-registration
- **WHEN** RLM is constructed
- **THEN** Ollama adapter SHALL always be registered

#### Scenario: Cloud provider registration
- **WHEN** RLM is constructed with apiKey for anthropic or openai
- **THEN** the corresponding adapter SHALL be registered

### Requirement: Package Exports

The system SHALL export all public types and utilities.

#### Scenario: Main class export
- **WHEN** importing from '@rlm/core'
- **THEN** RLM class SHALL be available

#### Scenario: Type exports
- **WHEN** importing from '@rlm/core'
- **THEN** all public types SHALL be available (RLMConfig, ExecuteOptions, RLMResult, etc.)

#### Scenario: Default exports
- **WHEN** importing from '@rlm/core'
- **THEN** DEFAULT_BUDGET and DEFAULT_REPL_CONFIG SHALL be available

#### Scenario: Utility exports
- **WHEN** importing from '@rlm/core'
- **THEN** loadContext, parseResponse, and BudgetController SHALL be available

#### Scenario: Adapter exports
- **WHEN** importing from '@rlm/core'
- **THEN** LLMRouter, OllamaAdapter, AnthropicAdapter, and OpenAIAdapter SHALL be available

### Requirement: Basic Usage

The system SHALL support simple usage patterns.

#### Scenario: Ollama basic usage
- **WHEN** creating RLM with provider='ollama' and model='llama3.2'
- **THEN** execute() SHALL work without additional configuration

#### Scenario: Cloud provider usage
- **WHEN** creating RLM with provider='anthropic' and apiKey
- **THEN** execute() SHALL use Anthropic API

#### Scenario: Budget override
- **WHEN** calling execute() with budget option
- **THEN** specified limits SHALL override defaults

#### Scenario: Hooks support
- **WHEN** calling execute() with hooks option
- **THEN** callbacks SHALL be invoked during execution

### Requirement: Package Configuration

The package SHALL be properly configured for distribution.

#### Scenario: ESM module
- **WHEN** package is built
- **THEN** it SHALL produce ESM format output

#### Scenario: TypeScript declarations
- **WHEN** package is built
- **THEN** .d.ts files SHALL be generated

#### Scenario: Optional peer dependencies
- **WHEN** consuming package without cloud SDKs
- **THEN** Ollama SHALL still work

#### Scenario: Node version
- **WHEN** running package
- **THEN** it SHALL require Node.js >= 18.0.0

