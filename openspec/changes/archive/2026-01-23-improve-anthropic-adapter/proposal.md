# Proposal: Improve Anthropic Adapter Robustness

## Summary

Enhance the Anthropic adapter with better error handling and model-aware token limits to improve debugging experience and prevent API errors with smaller models.

## Motivation

Current issues:
1. **API errors lack context** - When the Anthropic API fails, the raw error propagates without model/request context, making debugging harder
2. **Hard-coded max_tokens** - The default `8192` exceeds Claude Haiku 3's 4K limit, causing unnecessary API errors

## Proposed Changes

### 1. Model-Aware Max Tokens

Add a model capabilities lookup that provides safe defaults:

```typescript
const MODEL_CAPABILITIES: Record<string, { maxOutput: number }> = {
  // Claude 4.5
  'claude-opus-4-5-20251101': { maxOutput: 64000 },
  'claude-sonnet-4-5-20250929': { maxOutput: 64000 },
  'claude-haiku-4-5-20251001': { maxOutput: 64000 },
  // Claude 4.x
  'claude-opus-4-1-20250805': { maxOutput: 32000 },
  'claude-sonnet-4-20250514': { maxOutput: 64000 },
  'claude-opus-4-20250514': { maxOutput: 32000 },
  // Claude 3.x
  'claude-3-7-sonnet-20250219': { maxOutput: 64000 },
  'claude-3-haiku-20240307': { maxOutput: 4096 },
};

const DEFAULT_MAX_OUTPUT = 8192;
```

When `maxTokens` is not specified:
- Use `Math.min(DEFAULT_MAX_OUTPUT, model.maxOutput)` as the default
- This ensures we never exceed model limits while still providing reasonable defaults

### 2. Contextual Error Wrapping

Wrap API errors with request context for better debugging:

```typescript
class AnthropicAPIError extends Error {
  constructor(
    message: string,
    public readonly model: string,
    public readonly cause: Error
  ) {
    super(`Anthropic API error (model=${model}): ${message}`);
    this.name = 'AnthropicAPIError';
  }
}
```

The `complete` method wraps the API call:

```typescript
async complete(request: LLMRequest): Promise<LLMResponse> {
  try {
    const response = await this.client.messages.create({...});
    // ... existing logic
  } catch (error) {
    throw new AnthropicAPIError(
      error instanceof Error ? error.message : String(error),
      request.model,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}
```

## Non-Goals

- **Prompt sanitization**: Unnecessary; the SDK handles this
- **Multi-turn messages**: Would require interface changes across all adapters; not needed for RLM's single-turn execution model
- **Streaming**: Adds complexity without clear benefit for RLM's batch-oriented execution loop

## Tasks

1. Add `MODEL_CAPABILITIES` constant with max output limits for each model
2. Create `AnthropicAPIError` class for contextual error wrapping
3. Update `complete()` to use model-aware max_tokens default
4. Update `complete()` to wrap errors with context
5. Add tests for model-aware defaults (known model, unknown model)
6. Add tests for error wrapping (verify error contains model name)
7. Update existing tests if interface changes

## Testing Strategy

- Unit tests for `getMaxTokens(model, requestedMax)` helper
- Unit tests verifying error messages include model context
- Existing tests should continue passing (backward compatible)

## Risks

- **Low**: Changes are additive and backward compatible
- Unknown models fall back to existing behavior (8192 default, raw errors)
