# Tasks: Improve Anthropic Adapter

## Implementation Order

### Phase 1: Model Capabilities (TDD)

1. [x] **Write tests for model-aware max_tokens**
   - Test: known model returns clamped value
   - Test: unknown model returns default (8192)
   - Test: explicit maxTokens in request is respected
   - Test: Haiku 3 gets clamped to 4096

2. [x] **Add MODEL_CAPABILITIES constant**
   - Define max output for each supported model
   - Co-locate with ANTHROPIC_PRICING for maintainability

3. [x] **Implement getEffectiveMaxTokens helper**
   - `getEffectiveMaxTokens(model: string, requested?: number): number`
   - Returns `Math.min(requested ?? DEFAULT, modelMax ?? DEFAULT)`

4. [x] **Update complete() to use helper**
   - Replace hard-coded `8192` with `getEffectiveMaxTokens()`

### Phase 2: Error Wrapping (TDD)

5. [x] **Write tests for error wrapping**
   - Test: API error includes model name in message
   - Test: original error preserved as `cause`
   - Test: error has correct name (`AnthropicAPIError`)

6. [x] **Create AnthropicAPIError class**
   - Extends Error
   - Includes model, original error as cause

7. [x] **Wrap API call in try/catch**
   - Catch errors from `messages.create()`
   - Re-throw as `AnthropicAPIError`

### Phase 3: Verification

8. [x] **Run full test suite**
   - Ensure no regressions
   - Verify new tests pass
   - Core: 438 tests passed
   - CLI: 391 tests passed

9. [ ] **Manual verification** (optional)
   - Test with actual API call if credentials available
   - Verify error message format is useful

## File Changes

| File | Changes |
|------|---------|
| `anthropic.ts` | Add MODEL_CAPABILITIES, AnthropicAPIError, getEffectiveMaxTokens, update complete() |
| `anthropic.test.ts` | Add tests for max_tokens clamping (4 tests) and error wrapping (4 tests) |

## Estimated Complexity

- Lines added: ~70
- Lines modified: ~10
- Risk: Low (additive, backward compatible)
