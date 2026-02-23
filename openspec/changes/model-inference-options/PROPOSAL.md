# Proposal: Model-Specific Inference Options

**Status**: Draft
**Created**: 2026-01-23
**Author**: Claude + User

## Problem

RLM's adapters currently hardcode inference parameters, preventing users from tuning:
- Temperature, top_p, top_k for creativity/determinism balance
- Context length overrides for larger documents
- Stop sequences for structured output
- Provider-specific optimizations (Flash Attention, KV cache, keep_alive)

Different use cases need different settings:
- **Research tasks**: Higher temperature for creative exploration
- **Code generation**: Lower temperature for determinism
- **Large documents**: Extended context length
- **Batch processing**: Keep model loaded longer

## Solution

Add `inference` configuration to profiles with provider-family-specific parameters:

```yaml
profiles:
  creative:
    provider: ollama
    model: qwen3:latest
    inference:
      temperature: 0.9
      top_p: 0.95
      top_k: 40

  precise:
    provider: anthropic
    model: claude-sonnet-4-5-20250514
    inference:
      temperature: 0.2
      top_p: 0.9

  large-context:
    provider: ollama
    model: qwen3:latest
    inference:
      num_ctx: 32768
      keep_alive: "1h"
```

## Design

### 1. Common Inference Options (all providers)

```typescript
interface CommonInferenceOptions {
  /** Sampling temperature (0.0-2.0, default varies by model) */
  temperature?: number;
  /** Nucleus sampling threshold (0.0-1.0) */
  top_p?: number;
  /** Top-k sampling (positive integer) */
  top_k?: number;
  /** Stop sequences to halt generation */
  stop?: string[];
}
```

### 2. Ollama-Specific Options

```typescript
interface OllamaInferenceOptions extends CommonInferenceOptions {
  /** Override context window size (tokens) */
  num_ctx?: number;
  /** Max tokens to generate */
  num_predict?: number;
  /** Penalize repeated tokens (0.0-2.0, default 1.1) */
  repeat_penalty?: number;
  /** Last N tokens for repeat penalty (default 64) */
  repeat_last_n?: number;
  /** Random seed for reproducibility (-1 = random) */
  seed?: number;
  /** How long to keep model loaded ("5m", "1h", "-1" = forever) */
  keep_alive?: string;
  /** Mirostat sampling mode (0, 1, or 2) */
  mirostat?: number;
  /** Enable thinking mode ("/think" or "/no_think") */
  think?: boolean;
}
```

### 3. Anthropic-Specific Options

```typescript
interface AnthropicInferenceOptions extends CommonInferenceOptions {
  /** Maximum output tokens (default: model-specific) */
  max_tokens?: number;
}
```

### 4. OpenAI-Specific Options

```typescript
interface OpenAIInferenceOptions extends CommonInferenceOptions {
  /** Penalize tokens by frequency (-2.0 to 2.0) */
  frequency_penalty?: number;
  /** Penalize tokens by presence (-2.0 to 2.0) */
  presence_penalty?: number;
  /** Maximum output tokens */
  max_tokens?: number;
  /** Random seed for reproducibility */
  seed?: number;
}
```

### 5. Gemini-Specific Options

```typescript
interface GeminiInferenceOptions extends CommonInferenceOptions {
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Number of response candidates to generate */
  candidateCount?: number;
  /** Response MIME type ("text/plain", "application/json") */
  responseMimeType?: string;
  /** JSON schema for structured output */
  responseSchema?: object;
  /** Thinking level for reasoning ("low", "medium", "high") */
  thinkingLevel?: 'low' | 'medium' | 'high';
  /** Safety settings threshold */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}
```

### 6. Mistral-Specific Options

```typescript
interface MistralInferenceOptions extends CommonInferenceOptions {
  /** Maximum tokens in completion */
  max_tokens?: number;
  /** Penalize repeated words by frequency (default 0) */
  frequency_penalty?: number;
  /** Penalize word/phrase repetition (default 0) */
  presence_penalty?: number;
  /** Random seed for deterministic output */
  random_seed?: number;
  /** Inject safety guidance before conversation (default false) */
  safe_prompt?: boolean;
  /** Number of completions per request */
  n?: number;
}
```

### 8. Cohere-Specific Options

```typescript
interface CohereInferenceOptions {
  /** Sampling temperature (default 0.3) */
  temperature?: number;
  /** Nucleus sampling threshold (default 0.75, range 0.01-0.99) */
  p?: number;
  /** Top-k sampling (default 0, range 0-500, 0 = disabled) */
  k?: number;
  /** Maximum output tokens */
  max_tokens?: number;
  /** Reduce repetition by frequency (0.0-1.0) */
  frequency_penalty?: number;
  /** Reduce repetition by presence (0.0-1.0) */
  presence_penalty?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Stop sequences (up to 5) */
  stop_sequences?: string[];
  /** Include log probabilities */
  logprobs?: boolean;
  /** Thinking/reasoning mode */
  thinking?: {
    type: 'enabled' | 'disabled';
    /** Max tokens for thinking */
    token_budget?: number;
  };
  /** Request priority (lower = higher priority) */
  priority?: number;
}
```

### 9. Hugging Face-Specific Options

```typescript
interface HuggingFaceInferenceOptions extends CommonInferenceOptions {
  /** Maximum new tokens to generate */
  max_new_tokens?: number;
  /** Repetition penalty (1.0 = no penalty) */
  repetition_penalty?: number;
  /** Frequency penalty (1.0 = no penalty) */
  frequency_penalty?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Enable sampling (vs greedy decoding) */
  do_sample?: boolean;
  /** Typical decoding mass */
  typical_p?: number;
  /** Generate N sequences, return best */
  best_of?: number;
  /** Add watermark to output */
  watermark?: boolean;
  /** Grammar constraint (JSON schema or regex) */
  grammar?: {
    type: 'json' | 'regex' | 'json_schema';
    value: object | string;
  };
  /** Truncate input to N tokens */
  truncate?: number;
  /** LoRA adapter ID */
  adapter_id?: string;
}
```

### 10. Type Union

```typescript
type InferenceOptions =
  | OllamaInferenceOptions
  | AnthropicInferenceOptions
  | OpenAIInferenceOptions
  | GeminiInferenceOptions
  | MistralInferenceOptions
  | CohereInferenceOptions
  | HuggingFaceInferenceOptions;

// Added to RLMConfig
interface RLMConfig {
  // ... existing fields
  inference?: InferenceOptions;
}
```

## Implementation

### Phase 1: Core Types & Ollama

1. Add `InferenceOptions` types to `types.ts`
2. Add `inference` field to `RLMConfig` and `ProfileConfig`
3. Update `OllamaAdapter` to pass options to API:

```typescript
// packages/core/src/llm/adapters/ollama.ts
async complete(request: LLMRequest): Promise<LLMResponse> {
  const inference = request.inference as OllamaInferenceOptions ?? {};

  const response = await fetch(`${this.baseUrl}/api/chat`, {
    method: 'POST',
    body: JSON.stringify({
      model: request.model,
      messages: [...],
      stream: false,
      options: {
        num_predict: inference.num_predict ?? request.maxTokens ?? 4096,
        temperature: inference.temperature,
        top_p: inference.top_p,
        top_k: inference.top_k,
        repeat_penalty: inference.repeat_penalty,
        num_ctx: inference.num_ctx,
        seed: inference.seed,
        mirostat: inference.mirostat,
      },
      keep_alive: inference.keep_alive,
    }),
  });
}
```

### Phase 2: Anthropic & OpenAI

4. Update `AnthropicAdapter` to pass temperature, top_p, top_k
5. Update `OpenAIAdapter` with frequency_penalty, presence_penalty

### Phase 3: CLI Integration

6. Add `inference` to config schema in CLI
7. Support CLI flag overrides: `--temperature 0.5`
8. Update config template with examples

## Config Examples

### Research Profile (Creative)

```yaml
profiles:
  research:
    provider: ollama
    model: qwen3:latest
    inference:
      temperature: 0.8
      top_p: 0.95
      top_k: 50
      num_ctx: 32768
      keep_alive: "30m"
```

### Code Generation (Precise)

```yaml
profiles:
  code:
    provider: anthropic
    model: claude-sonnet-4-5-20250514
    inference:
      temperature: 0.1
      top_p: 0.9
```

### Reproducible Testing

```yaml
profiles:
  test:
    provider: ollama
    model: qwen3:latest
    inference:
      temperature: 0
      seed: 42
```

### Gemini with Structured Output

```yaml
profiles:
  gemini-json:
    provider: gemini
    model: gemini-2.0-flash
    inference:
      temperature: 0.5
      responseMimeType: "application/json"
      thinkingLevel: "medium"
```

### Gemini Reasoning Mode

```yaml
profiles:
  gemini-think:
    provider: gemini
    model: gemini-2.5-pro
    inference:
      temperature: 1.0  # Recommended default for Gemini 3
      thinkingLevel: "high"
      maxOutputTokens: 16384
```

### Mistral with Safety Mode

```yaml
profiles:
  mistral-safe:
    provider: mistral
    model: mistral-large-latest
    inference:
      temperature: 0.3
      top_p: 0.9
      safe_prompt: true
      max_tokens: 4096
```

### Mistral Codestral (Code Generation)

```yaml
profiles:
  codestral:
    provider: mistral
    model: codestral-latest
    inference:
      temperature: 0.1
      random_seed: 42  # Reproducible
      max_tokens: 8192
```

### Cohere with Thinking Mode

```yaml
profiles:
  cohere-think:
    provider: cohere
    model: command-r-plus
    inference:
      temperature: 0.3
      p: 0.9
      k: 50
      thinking:
        type: enabled
        token_budget: 2048
```

### Cohere High Priority

```yaml
profiles:
  cohere-priority:
    provider: cohere
    model: command-r
    inference:
      temperature: 0.5
      max_tokens: 4096
      priority: 1  # High priority
      logprobs: true
```

### Hugging Face with LoRA Adapter

```yaml
profiles:
  hf-custom:
    provider: huggingface
    model: Qwen/Qwen2.5-Coder-32B-Instruct
    inference:
      temperature: 0.7
      top_p: 0.9
      max_new_tokens: 4096
      repetition_penalty: 1.1
      do_sample: true
```

### Hugging Face Structured Output

```yaml
profiles:
  hf-json:
    provider: huggingface
    model: meta-llama/Llama-3.3-70B-Instruct
    inference:
      temperature: 0.3
      grammar:
        type: json_schema
        value:
          name: analysis_output
          schema:
            type: object
            properties:
              summary: { type: string }
              confidence: { type: number }
```

## API Documentation Reference

### Ollama Options
https://docs.ollama.com/api#parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | Creativity (0.0-2.0) |
| top_p | float | Nucleus sampling (0.0-1.0) |
| top_k | int | Top-k tokens to consider |
| num_ctx | int | Context window size |
| num_predict | int | Max tokens to generate |
| repeat_penalty | float | Repetition penalty |
| seed | int | Random seed |
| mirostat | int | Mirostat mode (0/1/2) |
| keep_alive | string | Model retention ("5m", "1h", "-1") |

### Anthropic Options
https://docs.anthropic.com/en/api/messages

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | 0.0-1.0 (default 1.0) |
| top_p | float | 0.0-1.0 |
| top_k | int | Only sample from top K |
| max_tokens | int | Output limit |
| stop_sequences | string[] | Stop generation |

### OpenAI Options
https://platform.openai.com/docs/api-reference/chat

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | 0.0-2.0 (default 1.0) |
| top_p | float | Nucleus sampling |
| frequency_penalty | float | -2.0 to 2.0 |
| presence_penalty | float | -2.0 to 2.0 |
| max_tokens | int | Output limit |
| seed | int | Reproducibility |

### Gemini Options
https://ai.google.dev/api/generate-content

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | 0.0-2.0 (default 1.0 for Gemini 3) |
| topP | float | Nucleus sampling |
| topK | int | Top-k tokens to consider |
| maxOutputTokens | int | Max tokens to generate |
| stopSequences | string[] | Stop generation triggers |
| candidateCount | int | Number of response variations |
| responseMimeType | string | Output format ("application/json") |
| responseSchema | object | JSON schema for structured output |
| thinkingLevel | string | Reasoning depth ("low"/"medium"/"high") |
| safetySettings | array | Content safety thresholds |

### Mistral Options
https://docs.mistral.ai/api/

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | 0.0-0.7 recommended (higher = more random) |
| top_p | float | Nucleus sampling (default 1) |
| max_tokens | int | Maximum completion tokens |
| frequency_penalty | float | Penalize by frequency (default 0) |
| presence_penalty | float | Penalize repetition (default 0) |
| random_seed | int | Deterministic output seed |
| safe_prompt | bool | Inject safety guidance (default false) |
| n | int | Number of completions per request |

### Cohere Options
https://docs.cohere.com/v2/reference/chat

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | Randomness (default 0.3) |
| p | float | Nucleus sampling (default 0.75, range 0.01-0.99) |
| k | int | Top-k sampling (default 0 = disabled, range 0-500) |
| max_tokens | int | Maximum output tokens |
| frequency_penalty | float | Reduce by frequency (0.0-1.0) |
| presence_penalty | float | Reduce by presence (0.0-1.0) |
| seed | int | Random seed for reproducibility |
| stop_sequences | string[] | Up to 5 stop sequences |
| logprobs | bool | Include log probabilities |
| thinking.type | string | "enabled" or "disabled" |
| thinking.token_budget | int | Max tokens for reasoning |
| priority | int | Request priority (lower = higher) |

### Hugging Face Options
https://huggingface.co/docs/api-inference/tasks/text-generation

| Parameter | Type | Description |
|-----------|------|-------------|
| temperature | float | Logits distribution modifier |
| top_p | float | Nucleus sampling threshold |
| top_k | int | Top-k filtering |
| max_new_tokens | int | Maximum tokens to generate |
| repetition_penalty | float | Penalty for repetition (1.0 = none) |
| frequency_penalty | float | Penalty based on frequency (1.0 = none) |
| seed | int | Random seed for reproducibility |
| do_sample | bool | Enable sampling (vs greedy) |
| typical_p | float | Typical decoding mass |
| best_of | int | Generate N, return best |
| stop | string[] | Stop sequences |
| grammar | object | JSON schema or regex constraint |
| watermark | bool | Add watermark to output |
| adapter_id | string | LoRA adapter ID |

## Success Criteria

- [ ] Config file supports `inference` options per profile
- [ ] Ollama adapter passes all supported options
- [ ] Anthropic adapter passes temperature, top_p, top_k
- [ ] OpenAI adapter passes frequency_penalty, presence_penalty
- [ ] Gemini adapter passes temperature, topP, topK, thinkingLevel
- [ ] Mistral adapter passes temperature, safe_prompt, random_seed
- [ ] Cohere adapter passes temperature, p, k, thinking
- [ ] Hugging Face adapter passes temperature, grammar, repetition_penalty
- [ ] CLI shows inference options in `rlm config show`
- [ ] Tests verify options are passed through correctly
- [ ] Documentation includes parameter reference

## Future Enhancements

- **Environment variable overrides**: `OLLAMA_TEMPERATURE=0.5`
- **Model-specific defaults**: Auto-tune for known models
- **Validation**: Warn on invalid parameter combinations
- **Flash Attention**: `OLLAMA_FLASH_ATTENTION=1` via config
