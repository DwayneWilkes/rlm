## 1. Foundation (Wave 1 — parallel, no inter-dependencies)

- [x] 1.1 Create `Cargo.toml` with dependencies (ureq, serde, serde_json, serde_yaml, clap, sha2, anyhow, colored) and `src/main.rs` stub with clap subcommands (serve, run, config, templates). Verify `cargo build` succeeds.
- [x] 1.2 Create `src/types.rs`: core types (`RlmConfig`, `Budget`, `InferenceOptions`, `LlmRequest`, `LlmResponse`, `RlmResult`, `ExecutionTrace`, `Iteration`, `CodeExecution`), traits (`LlmClient`, `Sandbox`, `Executor`), and enums (`Mode`, `OutputFormat`, `BudgetExhaustedReason`). Write serde round-trip tests for all types.
- [x] 1.3 Create `src/budget/mod.rs`: `BudgetController` struct with `check()`, `record_tokens()`, `record_cost()`, `tick_iteration()`, `push_depth()`/`pop_depth()`, `snapshot()`. Write tests: each limit type exceeded, defaults, concurrency limit, snapshot reporting.
- [x] 1.4 Create `src/engine/parser.rs`: `parse_response()` → extracts `ParsedResponse { reasoning, code_blocks, final_answer }`. Handle ` ```repl ``` ` code blocks, `FINAL(...)`, `FINAL_VAR(...)`, nested parentheses, missing markers. Write tests for all edge cases.

## 2. I/O Adapters (Wave 2 — parallel, depend on types from Wave 1)

- [x] 2.1 Create `src/llm/anthropic.rs`: `AnthropicClient` implementing `LlmClient`. Maps `LlmRequest` to Anthropic Messages API JSON, sends via `ureq`, parses response. Write tests with mock HTTP (test request/response mapping, error handling, system prompt placement).
- [x] 2.2 Create `src/llm/openai.rs`: `OpenAiClient` implementing `LlmClient`. Configurable `base_url` for OpenAI/Ollama/etc. Write tests with mock HTTP (request format, no-auth for Ollama, system message mapping).
- [x] 2.3 Create `src/llm/claude_code.rs`: `ClaudeCodeClient` implementing `LlmClient`. Spawns `claude -p --output-format json`, pipes prompt via stdin, parses JSON stdout. Write tests (subprocess mock, token accumulation, no API key needed).
- [x] 2.4 Create `src/llm/router.rs`: `LlmRouter` with `primary` and optional `subcall` client. Dispatches based on call type. Write tests for same-provider and split-provider routing.
- [x] 2.5 Create `src/llm/cache.rs`: `ResponseCache` with SHA-256 keyed HashMap. Write tests for cache hit, cache miss, key stability.
- [x] 2.6 Create `src/llm/mod.rs`: re-export `LlmClient` trait, `LlmRouter`, all adapters, cache.
- [x] 2.7 Create `src/sandbox/harness.py`: Python-side harness script that reads JSON commands from stdin, executes code, returns JSON results on stdout. Supports: `init` (set context), `exec` (run code, capture stdout/stderr), `get_var` (retrieve variable), `register_subcall` (register llm_query/rlm_query stubs that send JSON back). Include `parse_academic_paper()` helper.
- [x] 2.8 Create `src/sandbox/python.rs`: `PythonSandbox` implementing `Sandbox`. Spawns `python3` with `harness.py` via stdin, communicates via JSON pipe protocol. Implements `init()`, `execute()`, `get_var()`, `destroy()`. Write tests for lifecycle, code execution, timeout (process kill), output truncation, variable retrieval.
- [x] 2.9 Create `src/sandbox/mod.rs`: re-export `Sandbox` trait and `PythonSandbox`.

## 3. Executors (Wave 3 — parallel, depend on adapters + sandbox from Wave 2)

- [x] 3.1 Create `src/engine/direct.rs`: `DirectExecutor` implementing `Executor`. Single LLM call with context in prompt. Supports custom systemPrompt from template. Tracks usage. Write tests with mock LlmClient.
- [x] 3.2 Create `src/engine/iterative.rs`: `IterativeExecutor` implementing `Executor`. Full REPL loop: init sandbox → LLM call → parse → execute code → append output → repeat until FINAL or budget exhausted. Handles `llm_query`/`rlm_query` sub-calls (threaded parallel via `std::thread::scope`). Synthesis pass if enabled. Write tests with mock LlmClient and mock Sandbox.
- [x] 3.3 Create `src/engine/mode.rs`: `resolve_mode(mode, context_len, model_limit) -> Mode`. Auto selects direct if context < 70% of limit. Write tests for threshold, explicit override.
- [x] 3.4 Create `src/engine/mod.rs`: re-export `Executor` trait, both executors, mode resolver, parser.

## 4. Config, Templates, Prompts (Wave 4 — parallel, depend on types)

- [x] 4.1 Create `src/config.rs`: YAML config loading with cosmiconfig-like directory resolution. Named profiles with `extends` inheritance. CLI override merging. Provider config (type, model, base_url, api_key_env). Write tests for loading, inheritance, overrides, missing file defaults.
- [x] 4.2 Create `src/prompt/templates.rs`: Template loader — reads YAML files from `templates/` directory. `TemplateInfo` struct (name, description, mode, systemPrompt, inference, synthesize). List and get by name. Write tests for loading, missing template error, minimal template.
- [x] 4.3 Create `src/prompt/mod.rs`: System prompt builder. Assembles from base paper prompt + template override + model-specific hints. Write tests for default prompt, template override, model hints.
- [x] 4.4 Create `templates/academic-summary.yaml`: built-in template with iterative mode, paper-analysis system prompt, synthesis enabled.

## 5. MCP Server + CLI Wiring (Wave 5 — sequential, integrates everything)

- [x] 5.1 Create `src/protocol.rs` and `src/server.rs`: canonical MCP server pattern (copy from another Liberation_Labs tool, adapt).
- [x] 5.2 Create `src/tools/mod.rs`, `src/tools/execute.rs`, `src/tools/templates.rs`: `ToolHandler` trait with `AppContext`. `rlm_execute` tool (parameters: task, context, mode, template, budget overrides). `rlm_templates` tool (no parameters, returns list). Write tool schema tests.
- [x] 5.3 Wire `src/main.rs` CLI: `serve` → MCP server, `run` → load config → build engine → execute → format output, `config show` → display resolved config, `templates` → list templates. Write argument parsing tests.
- [ ] 5.4 Integration test: CLI `run` with mock adapter → config → engine → result. Verify full pipeline produces expected output format.
- [x] 5.5 `cargo test` — all tests pass. `cargo clippy` — no warnings. Build release binary.

## 6. Deployment

- [x] 6.1 Update `.mcp.json` with new RLM binary path and env vars.
- [x] 6.2 Update shell wrapper at `/mnt/d/dev/bin/rlm` to point at Rust binary.
- [ ] 6.3 E2E verification: `rlm run "Summarize" --context <test-file> --template academic-summary` with a real provider.
