# Change: Add @rlm/core package specifications

## Why

The project has a detailed implementation spec in `docs/rlm-core-spec-final.md` but lacks formal OpenSpec specifications. Converting to OpenSpec format enables:
- Traceable requirements with scenarios
- Structured change management for future updates
- Clear capability boundaries for implementation

## What Changes

- **ADDED** `types` capability - Core type definitions (RLMConfig, Budget, ExecuteOptions, RLMResult, etc.)
- **ADDED** `context-loader` capability - Context loading and preparation utilities
- **ADDED** `repl-sandbox` capability - Pyodide-based Python execution with LLM bridges
- **ADDED** `llm-router` capability - LLM provider routing and adapters (Ollama, Anthropic, OpenAI)
- **ADDED** `budget-controller` capability - Budget enforcement with cost/token/time/depth limits
- **ADDED** `execution-engine` capability - Main execution loop, response parsing, iteration management
- **ADDED** `public-api` capability - RLM class and package exports

## Impact

- Affected specs: 7 new capabilities (none existing)
- Affected code: None yet (specs precede implementation)
- Source: `docs/rlm-core-spec-final.md`
