# RLM — Read-Loop-Mond

## Build & Test

```bash
cargo build --release
cargo test
cargo clippy  # must pass with zero warnings
```

## Key Facts

- Single Rust binary — MCP server + CLI
- Implements iterative LLM + REPL algorithm (Zhang et al. 2025)
- `claude-code` provider only supports direct mode — use `anthropic` or `openai` for iterative REPL
- Provider configs require `type` field as object (not bare string) in `.rlmrc.yaml`
- Python harness compiled via `include_str!` from `src/sandbox/harness.py`

## Conventions

- TDD mandatory: write failing test first, then implement
- No `#[allow(dead_code)]`: delete unused code
- Clippy clean: zero warnings required
- Conventional commits: `feat(rlm):`, `fix(rlm):`, `test(rlm):`
- Unit tests in `src/tests/` (centralized, shared fixtures in `src/tests/fixtures.rs`)
- Integration tests in `tests/`
