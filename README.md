# RLM (Recursive Language Model)

An AI-powered task decomposition and research system that executes tasks iteratively using LLMs with a Python REPL sandbox, supporting recursive sub-calls for complex analysis.

## Features

- **Iterative Execution**: Tasks run in a loop until completion or budget exhaustion
- **Python REPL Sandbox**: Pyodide-based sandbox with `llm_query()` and `rlm_query()` bridges
- **Budget Control**: Enforce limits on cost, tokens, time, recursion depth, and iterations
- **Multiple Context Sources**: Load context from strings, files, directories, URLs, or Obsidian vaults
- **Full Execution Traces**: Track every iteration and subcall for debugging and analysis

## Packages

| Package | Description |
|---------|-------------|
| `@rlm/core` | Core library: context manager, REPL sandbox, LLM router, budget controller, execution engine |
| `@rlm/cli` | Command-line interface |
| `@rlm/web-api` | REST/WebSocket API (Hono, deployable to Cloudflare Workers) |
| `@rlm/web-ui` | Mobile-first React PWA |
| `@rlm/obsidian-plugin` | Obsidian integration |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9.15.0+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/rlm.git
cd rlm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Run in development mode (all packages in parallel)
pnpm dev

# Run tests
pnpm test

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## How It Works

1. User provides a task + context + budget configuration
2. **ContextManager** loads and optionally chunks context
3. **PyodideSandbox** initializes with context, providing LLM bridges
4. **Executor** runs the iteration loop: prompt → LLM response → parse code → execute → capture results
5. **BudgetController** enforces configured limits
6. Loop continues until `FINAL` marker or budget exhaustion

## Tech Stack

- **Runtime**: Node.js 20+ / Bun
- **Build**: tsup, Vite, esbuild
- **Testing**: Vitest
- **LLM SDKs**: @anthropic-ai/sdk, openai
- **Web Framework**: Hono (backend), React 18 + Zustand (frontend)
- **UI**: Tailwind CSS, react-markdown
- **Python Runtime**: Pyodide (browser WASM)

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
