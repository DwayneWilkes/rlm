<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RLM (Recursive Language Model) is an AI-powered task decomposition and research system. It executes tasks iteratively using LLMs with a Python REPL sandbox, supporting recursive sub-calls for complex analysis.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Development mode (all packages in parallel)
pnpm dev

# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @rlm/core test

# Run a specific test file
pnpm --filter @rlm/core test src/budget/budget-controller.test.ts

# Run tests matching a pattern
pnpm --filter @rlm/core test -t "budget"

# Watch mode for tests
pnpm --filter @rlm/core test --watch

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## Architecture

### Monorepo Structure (pnpm workspaces)

- **@rlm/core** - Core library: context manager, REPL sandbox, LLM router, budget controller, execution engine
- **@rlm/cli** - Command-line interface
- **@rlm/web-api** - REST/WebSocket API (Hono, deployable to Cloudflare Workers)
- **@rlm/web-ui** - Mobile-first React PWA
- **@rlm/obsidian-plugin** - Obsidian integration

### Core Components Data Flow

1. User provides task + context + budget config
2. **ContextManager** loads and optionally chunks context (string/file/directory/URL/Obsidian vault)
3. **PyodideSandbox** initializes with context, provides `llm_query()` and `rlm_query()` bridges
4. **Executor** runs iteration loop: prompt → LLM response → parse code → execute → capture results
5. **BudgetController** enforces limits on cost, tokens, time, recursion depth, iterations
6. Loop continues until FINAL marker or budget exhaustion

### Key Types (packages/core/src/types/index.ts)

- `RLMConfig` - Main execution configuration
- `RLMResult` - Execution result with output, trace, usage stats
- `BudgetConfig` - Cost/token/time/depth/iteration limits
- `ExecutionTrace` - Full trace of iterations and subcalls
- `ContextSource` - Input context specification (string/file/directory/url/obsidian-vault)

## Testing Requirements

**TDD is mandatory.** All coding work must follow Red-Green-Refactor:
1. Write a failing test first
2. Write minimal code to pass
3. Refactor while tests pass

- Target 100% coverage on new code
- Unit tests colocated with source files (`*.test.ts`)
- Integration tests in `tests/integration/`
- Test fixtures in `tests/fixtures/`

## Code Style

### File Size Limits (LLM-friendly)

| Category | Lines | Action |
|----------|-------|--------|
| Ideal | 200-300 | Target for new files |
| Acceptable | 300-400 | Monitor, consider splitting |
| Maximum | 400 | Triggers refactor discussion |
| Hard Limit | 500 | Must split before merge |

### Naming Conventions

- Files: `kebab-case.ts`
- Classes/Types/Interfaces: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Import Order

1. Node.js built-ins (`node:fs/promises`)
2. External dependencies (`zod`, `@anthropic-ai/sdk`)
3. Internal packages (`@rlm/core`)
4. Relative imports (`./code-parser.js`)

### TypeScript

- Prefer type inference over explicit annotations
- Use `type` for data shapes, `interface` for extension
- Explicit return types for public APIs only
- JSDoc for public APIs only, skip for self-documenting code

## Tech Stack

- **Package Manager**: pnpm 9.15.0+
- **Runtime**: Node.js 20+ / Bun
- **Build**: tsup (core/cli/web-api), Vite (web-ui), esbuild (obsidian)
- **Testing**: Vitest
- **LLM SDKs**: @anthropic-ai/sdk, openai
- **Web Framework**: Hono (backend), React 18 + Zustand (frontend)
- **UI**: Tailwind CSS, react-markdown
- **Python Runtime**: Pyodide (browser WASM)
