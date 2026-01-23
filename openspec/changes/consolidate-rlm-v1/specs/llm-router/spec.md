# Spec Delta: llm-router

## ADDED Requirements

### Requirement: Model Capabilities Lookup

The Anthropic adapter SHALL maintain a lookup table of model capabilities including maximum output tokens.

```typescript
const MODEL_CAPABILITIES: Record<string, { maxOutput: number }> = {
  'claude-opus-4-5-20251101': { maxOutput: 64000 },
  'claude-sonnet-4-5-20250929': { maxOutput: 64000 },
  'claude-haiku-4-5-20251001': { maxOutput: 64000 },
  'claude-3-haiku-20240307': { maxOutput: 4096 },
  // ... etc
};
```

#### Scenario: Known model max_tokens
- **WHEN** completing with model "claude-3-haiku-20240307"
- **AND** no explicit maxTokens is specified
- **THEN** the adapter SHALL use at most 4096 for max_tokens

#### Scenario: Unknown model fallback
- **WHEN** completing with an unknown model
- **THEN** the adapter SHALL use the default max_tokens (8192)

#### Scenario: User-specified override
- **WHEN** user specifies maxTokens in the request
- **THEN** the adapter SHALL use `min(userMax, modelMax)`

### Requirement: Contextual Error Wrapping

The Anthropic adapter SHALL wrap API errors with request context for better debugging.

```typescript
class AnthropicAPIError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly cause: Error
  ) {
    super(`Anthropic API error (model=${model}): ${message}`);
  }
}
```

#### Scenario: Error includes model context
- **WHEN** an API call fails
- **THEN** the error message SHALL include the model name
- **AND** the original error SHALL be preserved as `cause`

#### Scenario: Error type identification
- **WHEN** catching errors from the Anthropic adapter
- **THEN** errors SHALL be instances of `AnthropicAPIError`
- **AND** the model SHALL be accessible via `error.model`
