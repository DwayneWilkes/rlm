## Why

RLM is the only tool in Liberation_Labs still written in TypeScript, requiring Node 22 + pnpm + nvm on WSL2 — a fragile toolchain that doesn't match the Rust MCP server pattern used by every other tool. The current implementation also has architectural gaps inherited from the Zhang et al. (2025) paper: no budget enforcement, no sandboxing, brittle FINAL detection, and synchronous-only sub-calls. A Rust rewrite achieves toolchain consistency AND fixes these gaps in one pass.

## What Changes

- **BREAKING**: Replace entire TypeScript codebase (`packages/core/`, `packages/cli/`) with a single Rust binary crate
- **BREAKING**: Drop Pyodide WASM sandbox — replace with Python subprocess sandbox (stdin/stdout pipes, timeout via process kill)
- **BREAKING**: Drop daemon worker pool architecture — synchronous execution, threaded parallel sub-calls via `std::thread::scope`
- **BREAKING**: Consolidate 8 provider-specific inference option types into 1 unified `InferenceOptions` struct
- **BREAKING**: Reduce 7 LLM provider adapters to 3: Anthropic, OpenAI-compatible (covers OpenAI/Ollama/Gemini/Mistral), Claude Code (subprocess)
- Add budget controller: cost, tokens, time, iterations, depth limits with configurable enforcement
- Add robust FINAL/FINAL_VAR parser with fallback heuristics and forced termination
- Add content-hash cache for identical sub-call prompts
- Add model-specific prompt hints in config
- Port direct mode, auto mode selection, synthesis pass, YAML templates, config profiles

## Capabilities

### New Capabilities
- `rlm-engine`: Core execution engine — iterative REPL loop (paper algorithm), direct mode bypass, auto mode selection, response parser
- `rlm-sandbox`: Python subprocess sandbox — code execution, variable access, timeout, output truncation
- `rlm-llm`: LLM client abstraction — Anthropic, OpenAI-compatible, and Claude Code adapters with provider routing
- `rlm-budget`: Budget controller — cost, token, time, iteration, and depth limit enforcement
- `rlm-config`: YAML configuration with named profiles, inheritance, and CLI overrides
- `rlm-templates`: Runtime-loaded YAML prompt templates with system prompt builder
- `rlm-cli`: CLI commands (serve, run, config, templates) and MCP server (rlm_execute, rlm_templates tools)

### Modified Capabilities
<!-- None — this is a ground-up rewrite, no existing Rust specs to modify -->

## Impact

- **Code**: Entire `packages/` TypeScript source replaced by `src/` Rust source. `pnpm-workspace.yaml`, `tsconfig.json`, `tsup.config.ts` replaced by `Cargo.toml`
- **Dependencies**: Node.js/pnpm/nvm → Rust/cargo. Runtime: Python 3 subprocess (for sandbox)
- **Binary**: `tools/rlm/target/release/rlm` replaces `packages/cli/dist/bin/rlm.js`
- **Shell wrapper**: `/mnt/d/dev/bin/rlm` updated to point at Rust binary
- **MCP config**: `.mcp.json` entry updated for new binary path
- **APIs**: MCP tools change — `rlm_execute` and `rlm_templates` replace previous tool set
- **Config**: `.rlmrc.yaml` format preserved (profiles, inference options) but simplified
- **Templates**: `templates/` directory preserved, same YAML schema
