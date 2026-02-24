# CLAUDE.md

## Build & Test

```bash
cargo build --release        # release binary at target/release/rlm
cargo test                   # unit + integration tests
cargo clippy                 # must pass with zero warnings
```

## CLI

```bash
rlm serve                                    # MCP server (default)
rlm run "task" --context file.txt            # execute task
rlm run "task" --mode direct --format json   # direct mode, JSON output
rlm templates                                # list prompt templates
rlm config show                              # display resolved config
```

## Architecture

Single Rust binary — MCP server + CLI. Implements Zhang et al. (2025) iterative LLM + REPL algorithm.

**Execution flow**: task + context → mode resolution (direct/iterative/auto) → LLM call(s) → optional Python REPL loop → FINAL marker → result.

**Modules** (`src/`):

| Module | Purpose |
|--------|---------|
| `types.rs` | All types, traits (`LlmClient`, `Sandbox`, `Executor`), enums |
| `config.rs` | YAML config loading, profile inheritance, CLI overrides |
| `engine/parser.rs` | Response parser: ` ```repl``` ` blocks, `FINAL()`, `FINAL_VAR()` |
| `engine/mode.rs` | Auto mode: direct if context < 70% model limit |
| `engine/direct.rs` | Single LLM call executor |
| `engine/iterative.rs` | REPL loop executor (paper algorithm) |
| `llm/{anthropic,openai,claude_code}.rs` | LLM provider adapters |
| `llm/router.rs` | Primary + subcall provider routing |
| `llm/cache.rs` | SHA-256 content-hash response cache |
| `sandbox/python.rs` | Python subprocess sandbox (stdin/stdout JSON pipes) |
| `prompt/mod.rs` | System prompt builder with model hints |
| `prompt/templates.rs` | YAML template loader (builtins via `include_str!`) |
| `protocol.rs` + `server.rs` | MCP JSON-RPC server (canonical pattern) |
| `tools/execute.rs` | `rlm_execute` MCP tool |
| `tools/templates.rs` | `rlm_templates` MCP tool |

## Config

YAML config at `.rlmrc.yaml` with named profiles:

```yaml
profiles:
  default:
    provider:
      type: anthropic        # anthropic | openai | claude-code
      model: claude-sonnet-4-20250514
    budget:
      max_iterations: 50
      max_time_seconds: 300
```

Provider configs require `type` field as object (not bare string).

**Note**: `claude-code` provider only supports direct mode — iterative mode auto-downgrades to direct with a warning. Use `anthropic` or `openai` provider for iterative REPL execution.

## Conventions

- **TDD mandatory**: write failing test first, then implement
- **No `#[allow(dead_code)]`**: delete unused code
- **Clippy clean**: zero warnings required
- **Conventional commits**: `feat(rlm):`, `fix(rlm):`, `test(rlm):`
- Unit tests in `#[cfg(test)]` modules within each source file
- Integration tests in `tests/`
- Built-in templates compiled via `include_str!` from `templates/`
- Python harness compiled via `include_str!` from `src/sandbox/harness.py`
