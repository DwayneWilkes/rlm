# llm-router Specification

## Purpose
Route LLM requests to provider adapters (Ollama, Anthropic, OpenAI) with cost tracking and consistent response format.
## Requirements
### Requirement: Provider Routing

The system SHALL route requests to registered provider adapters.

#### Scenario: Register adapter
- **WHEN** calling router.register(providerId, adapter)
- **THEN** the adapter SHALL be available for that provider

#### Scenario: Route to provider
- **WHEN** calling router.complete(provider, request)
- **THEN** the request SHALL be sent to the registered adapter

#### Scenario: Unknown provider error
- **WHEN** calling router.complete with unregistered provider
- **THEN** it SHALL throw "Unknown provider" error

#### Scenario: Get adapter
- **WHEN** calling router.getAdapter(provider)
- **THEN** it SHALL return the adapter or undefined

### Requirement: Ollama Adapter

The system SHALL support Ollama for local LLM inference.

#### Scenario: Default base URL
- **WHEN** OllamaAdapter is created without baseUrl
- **THEN** it SHALL use 'http://localhost:11434'

#### Scenario: Chat completion
- **WHEN** calling complete(request)
- **THEN** it SHALL POST to /api/chat with model and messages

#### Scenario: Zero cost
- **WHEN** Ollama returns a response
- **THEN** cost SHALL be 0 (local models are free)

#### Scenario: Token counting
- **WHEN** Ollama returns usage stats
- **THEN** inputTokens and outputTokens SHALL be extracted from response

### Requirement: Anthropic Adapter

The system SHALL support Anthropic Claude models.

#### Scenario: API key required
- **WHEN** creating AnthropicAdapter
- **THEN** apiKey SHALL be required in config

#### Scenario: Message creation
- **WHEN** calling complete(request)
- **THEN** it SHALL use client.messages.create with system and user messages

#### Scenario: Cost calculation
- **WHEN** Anthropic returns usage stats
- **THEN** cost SHALL be calculated using model-specific pricing per 1K tokens

#### Scenario: Claude pricing
- **WHEN** using claude-sonnet-4-20250514
- **THEN** pricing SHALL be $0.003/1K input and $0.015/1K output

### Requirement: OpenAI Adapter

The system SHALL support OpenAI GPT models.

#### Scenario: API key required
- **WHEN** creating OpenAIAdapter
- **THEN** apiKey SHALL be required in config

#### Scenario: Chat completion
- **WHEN** calling complete(request)
- **THEN** it SHALL use client.chat.completions.create

#### Scenario: Cost calculation
- **WHEN** OpenAI returns usage stats
- **THEN** cost SHALL be calculated using model-specific pricing per 1K tokens

#### Scenario: GPT-4o pricing
- **WHEN** using gpt-4o
- **THEN** pricing SHALL be $0.005/1K input and $0.015/1K output

### Requirement: LLM Response Format

All adapters SHALL return consistent LLMResponse format.

#### Scenario: Response structure
- **WHEN** any adapter completes a request
- **THEN** it SHALL return content, inputTokens, outputTokens, and cost

