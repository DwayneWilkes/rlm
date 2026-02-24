### Requirement: LLM Client Trait
The LLM subsystem SHALL define an `LlmClient` trait with a `complete(request) -> response` method that all adapters implement.

#### Scenario: Trait contract
- **WHEN** any adapter receives an `LlmRequest` with messages, model, and inference options
- **THEN** it returns an `LlmResponse` with the completion text, usage stats (input tokens, output tokens), and optional cost estimate

### Requirement: Anthropic Adapter
The Anthropic adapter SHALL call the Anthropic Messages API using `ureq`, mapping `LlmRequest` fields to the Anthropic-specific JSON format.

#### Scenario: Successful completion
- **WHEN** a request is sent with a valid API key and model
- **THEN** the adapter returns the assistant's response text and usage counts

#### Scenario: API error handling
- **WHEN** the Anthropic API returns an error (rate limit, invalid key, etc.)
- **THEN** the adapter returns a structured error with the HTTP status and error message

#### Scenario: System prompt mapping
- **WHEN** the request includes a system prompt
- **THEN** the adapter maps it to the Anthropic `system` parameter (not a message)

### Requirement: OpenAI-Compatible Adapter
The OpenAI-compatible adapter SHALL call any OpenAI-format chat completions endpoint using `ureq`, supporting OpenAI, Ollama, Gemini, Mistral, and other compatible providers via configurable base URL.

#### Scenario: OpenAI endpoint
- **WHEN** configured with `base_url: https://api.openai.com/v1` and a valid API key
- **THEN** the adapter calls `/chat/completions` and parses the standard response format

#### Scenario: Ollama endpoint
- **WHEN** configured with `base_url: http://localhost:11434/v1` and no API key
- **THEN** the adapter calls the Ollama-compatible endpoint without an Authorization header

#### Scenario: System prompt mapping
- **WHEN** the request includes a system prompt
- **THEN** the adapter includes it as a message with role `system`

### Requirement: Claude Code Adapter
The Claude Code adapter SHALL spawn a `claude` subprocess in non-interactive mode, send the prompt via stdin, and parse the JSON output to extract the response and token usage.

#### Scenario: Subprocess execution
- **WHEN** a request is made via the Claude Code adapter
- **THEN** the adapter spawns `claude -p --output-format json` with the prompt, captures stdout, and parses the JSON response

#### Scenario: Token accumulation
- **WHEN** multiple calls are made through the Claude Code adapter
- **THEN** each call's token usage is tracked independently and reported in the response

#### Scenario: No API key required
- **WHEN** the Claude Code adapter is used
- **THEN** authentication is handled by the `claude` binary's subscription (no API key in config)

### Requirement: Provider Routing
The LLM subsystem SHALL support routing: a primary provider for the main execution loop and an optional separate provider for sub-calls (`llm_query`).

#### Scenario: Same provider for main and sub-calls
- **WHEN** no subcall provider is configured
- **THEN** the primary provider is used for all LLM calls

#### Scenario: Separate subcall provider
- **WHEN** a subcall provider is configured (e.g., Ollama for sub-calls while Anthropic is primary)
- **THEN** `llm_query()` sub-calls use the subcall provider while the main loop uses the primary

### Requirement: Unified Inference Options
All adapters SHALL accept a single `InferenceOptions` struct with common fields: `temperature`, `top_p`, `top_k`, `max_tokens`, `stop`, `seed`. Each adapter maps these to its API format, ignoring unsupported fields.

#### Scenario: Temperature mapping
- **WHEN** `InferenceOptions { temperature: 0.7 }` is provided
- **THEN** all adapters include `temperature: 0.7` in their API requests

#### Scenario: Unsupported field ignored
- **WHEN** `top_k` is set but the provider doesn't support it
- **THEN** the adapter omits the field without error

### Requirement: Content-Hash Cache
The LLM subsystem SHALL cache responses keyed by content hash of (model, messages, inference options). Identical sub-call prompts within an execution MUST return cached results.

#### Scenario: Cache hit
- **WHEN** an identical request (same model, messages, options) is made within the same execution
- **THEN** the cached response is returned without making an API call

#### Scenario: Cache miss
- **WHEN** a request with new content is made
- **THEN** the API is called and the response is cached
