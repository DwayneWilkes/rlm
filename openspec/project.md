# Project Context

## Purpose

RLM (Recursive Language Model) is a TypeScript library implementing Recursive Language Models (Zhang et al., 2025). It executes tasks iteratively using LLMs with a Python REPL sandbox, supporting recursive sub-calls for complex analysis.

**Key innovation**: Context is loaded as a variable in a Python REPL, and the LLM can recursively spawn sub-RLMs to handle complex sub-tasks.

## Tech Stack

- **Package Manager**: pnpm 9.15.0+ (workspaces monorepo)
- **Runtime**: Node.js 20+ / Bun
- **Language**: TypeScript (strict mode)
- **Build**: tsup (core/cli/web-api), Vite (web-ui), esbuild (obsidian)
- **Testing**: Vitest
- **LLM SDKs**: @anthropic-ai/sdk, openai (optional peer deps)
- **LLM Providers**: Ollama (default, local), Anthropic, OpenAI
- **Web Framework**: Hono (backend, Cloudflare Workers deployable)
- **Frontend**: React 18, Zustand, Tailwind CSS, react-markdown
- **Python Runtime**: Pyodide (browser WASM)

## Project Conventions

### Code Style

**File Size Limits** (LLM-friendly)
| Category | Lines | Action |
|----------|-------|--------|
| Ideal | 200-300 | Target for new files |
| Acceptable | 300-400 | Monitor, consider splitting |
| Maximum | 400 | Triggers refactor discussion |
| Hard Limit | 500 | Must split before merge |

**Naming**
- Files: `kebab-case.ts`
- Classes/Types/Interfaces: `PascalCase`
- Functions/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

**Import Order**
1. Node.js built-ins (`node:fs/promises`)
2. External dependencies (`zod`, `@anthropic-ai/sdk`)
3. Internal packages (`@rlm/core`)
4. Relative imports (`./code-parser.js`)

**TypeScript**
- Prefer type inference over explicit annotations
- Use `type` for data shapes, `interface` for extension
- Explicit return types for public APIs only
- JSDoc for public APIs only

### Architecture Patterns

**Monorepo Structure**
```
@rlm/core/
├── src/
│   ├── index.ts              # Public API
│   ├── types.ts              # All type definitions
│   ├── rlm.ts                # Main RLM class
│   ├── context/
│   │   └── loader.ts         # Context loading
│   ├── repl/
│   │   ├── sandbox.ts        # Abstract sandbox
│   │   └── pyodide.ts        # Pyodide implementation
│   ├── llm/
│   │   ├── router.ts         # Provider routing
│   │   └── adapters/         # Ollama, Anthropic, OpenAI
│   ├── budget/
│   │   └── controller.ts     # Budget enforcement
│   └── engine/
│       ├── executor.ts       # Main execution loop
│       └── parser.ts         # Response parsing
```

**Core Data Flow**
1. User provides task + context + budget config
2. ContextManager loads context (string input)
3. PyodideSandbox initializes with context, provides `llm_query()` and `rlm_query()` bridges
4. Executor runs iteration loop: prompt → LLM response → parse code → execute → capture results
5. BudgetController enforces limits (cost, tokens, time, depth, iterations)
6. Loop continues until FINAL marker or budget exhaustion

### Testing Strategy

**TDD is mandatory.** Red-Green-Refactor cycle:
1. Write a failing test first
2. Write minimal code to pass
3. Refactor while tests pass

- Target 100% coverage on new code
- Unit tests colocated with source files (`*.test.ts`)
- Integration tests in `tests/integration/`
- Test fixtures in `tests/fixtures/`
- Same 400-line limit applies to test files

### Git Workflow

**Branching: GitHub Flow**
- `main` is always deployable
- Create feature branches from `main` for all changes
- Open PRs for code review before merging
- Delete branches after merge

**Commits: Conventional Commits**
```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, no code change
- `refactor` - Code change that neither fixes nor adds
- `test` - Adding or updating tests
- `chore` - Build, CI, dependencies

Examples:
```
feat(core): add budget controller with cost tracking
fix(repl): handle timeout in Pyodide sandbox
docs: update README with usage examples
test(llm): add mock adapter for router tests
```

## Domain Context

**Key Types** (from spec)
- `RLMConfig` - Provider, model, options, budget defaults
- `Budget` - maxCost, maxTokens, maxTime, maxDepth, maxIterations
- `ExecuteOptions` - task, context, budget overrides, hooks
- `RLMResult` - success, output, trace, usage, warnings, error
- `ExecutionTrace` - id, depth, task, iterations, subcalls, finalAnswer
- `LLMAdapter` - complete(request) interface for providers

**Python REPL Bridges**
- `llm_query(prompt)` - Simple LLM query for single-shot questions
- `rlm_query(task, ctx?)` - Spawn recursive sub-RLM for complex sub-tasks
- `chunk_text(text, size, overlap)` - Split text into chunks
- `search_context(pattern, window)` - Regex search with surrounding context

**Termination Markers**
- `FINAL(answer)` - Direct answer in response
- `FINAL_VAR(variable_name)` - Return Python variable contents

## Important Constraints

- Budget enforcement is critical - must respect all limits
- Python sandbox runs via Pyodide WASM - browser environment limitations apply
- File size limits (500 lines hard limit) ensure LLM-friendly codebases
- Avoid over-engineering - only add features directly requested
- Cloud provider SDKs are optional peer dependencies

## External Dependencies

- **Pyodide** (required) - Python WASM runtime for browser-based code execution
- **Anthropic API** (optional) - Claude models via @anthropic-ai/sdk
- **OpenAI API** (optional) - GPT models via openai SDK
- **Ollama** (default) - Local LLM serving at http://localhost:11434
