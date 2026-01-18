# RLM (Recursive Language Model)

An AI-powered task decomposition and research system that executes tasks iteratively using LLMs with a Python REPL sandbox, supporting recursive sub-calls for complex analysis.

## Features

- **Iterative Execution**: Tasks run in a loop until completion or budget exhaustion
- **Python REPL Sandbox**: Pyodide-based sandbox with `llm_query()` and `rlm_query()` bridges
- **Budget Control**: Enforce limits on cost, tokens, time, recursion depth, and iterations
- **Multiple LLM Providers**: Ollama (local), Anthropic (Claude), OpenAI (GPT)
- **Full Execution Traces**: Track every iteration and subcall for debugging and analysis

## Quick Start

```typescript
import { RLM } from '@rlm/core';

// Create an RLM instance with Ollama (local)
const rlm = new RLM({
  provider: 'ollama',
  model: 'llama3.2',
});

// Execute a task
const result = await rlm.execute({
  task: 'Analyze this codebase and identify the main modules',
  context: sourceCode,
  budget: { maxCost: 1.0, maxDepth: 2 },
});

console.log(result.output);
console.log(result.usage); // { cost, tokens, duration, iterations, subcalls }
```

## Installation

```bash
# Install the core package
pnpm add @rlm/core

# Optional: Install cloud provider SDKs
pnpm add @anthropic-ai/sdk  # For Claude
pnpm add openai              # For GPT
```

## Usage Examples

### Basic Usage (Ollama - Local)

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({
  provider: 'ollama',
  model: 'llama3.2',
});

const result = await rlm.execute({
  task: 'Summarize the main points',
  context: myDocument,
});

console.log(result.output);
```

### Cloud Provider (Anthropic Claude)

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  providerOptions: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  subcallModel: 'claude-haiku-3-20240307', // Cheaper model for subcalls
});

const result = await rlm.execute({
  task: 'Analyze this codebase and identify potential bugs',
  context: sourceCode,
  budget: { maxCost: 2.0, maxDepth: 2 },
});
```

### Cloud Provider (OpenAI GPT)

```typescript
import { RLM } from '@rlm/core';

const rlm = new RLM({
  provider: 'openai',
  model: 'gpt-4o',
  providerOptions: {
    apiKey: process.env.OPENAI_API_KEY,
  },
});

const result = await rlm.execute({
  task: 'Research this topic and provide a summary',
  context: notes,
});
```

### With Execution Hooks

```typescript
const result = await rlm.execute({
  task: 'Research this topic',
  context: notes,
  hooks: {
    onIteration: (iter) => {
      console.log(`Iteration ${iter.index + 1}`);
      console.log(`Code blocks: ${iter.codeExecutions.length}`);
    },
    onSubcall: ({ depth, task }) => {
      console.log(`  Subcall at depth ${depth}: ${task.slice(0, 50)}...`);
    },
    onBudgetWarning: (warning) => {
      console.warn(`⚠️ ${warning}`);
    },
  },
});
```

### Custom Budget Configuration

```typescript
import { RLM, DEFAULT_BUDGET } from '@rlm/core';

const rlm = new RLM({
  provider: 'ollama',
  model: 'llama3.2:70b',
  defaultBudget: {
    ...DEFAULT_BUDGET,
    maxCost: 0,           // Local models are free
    maxDepth: 3,          // Allow deeper recursion
    maxIterations: 50,    // More iterations
    maxTime: 600_000,     // 10 minutes
  },
});
```

## API Reference

### RLM Class

```typescript
class RLM {
  constructor(config: RLMConfig);
  execute(options: ExecuteOptions): Promise<RLMResult>;
}
```

### Configuration Types

```typescript
interface RLMConfig {
  provider: string;              // 'ollama' | 'anthropic' | 'openai'
  model: string;                 // Model identifier
  providerOptions?: {
    baseUrl?: string;            // For Ollama (default: 'http://localhost:11434')
    apiKey?: string;             // For cloud providers
  };
  subcallModel?: string;         // Model for recursive subcalls
  defaultBudget?: Partial<Budget>;
  repl?: Partial<REPLConfig>;
}

interface Budget {
  maxCost: number;       // Max cost in dollars (default: 5.0)
  maxTokens: number;     // Max total tokens (default: 500,000)
  maxTime: number;       // Max wall-clock time in ms (default: 300,000)
  maxDepth: number;      // Max recursion depth (default: 2)
  maxIterations: number; // Max REPL iterations (default: 30)
}

interface ExecuteOptions {
  task: string;                  // The task/question to answer
  context: string;               // Context string for the REPL
  budget?: Partial<Budget>;      // Budget overrides
  hooks?: ExecutionHooks;        // Execution callbacks
}
```

### Result Types

```typescript
interface RLMResult {
  success: boolean;
  output: string;                // The final answer
  trace: ExecutionTrace;         // Full execution trace
  usage: Usage;                  // Resource usage stats
  warnings: string[];
  error?: Error;
}

interface Usage {
  cost: number;           // Total cost in dollars
  tokens: number;         // Total tokens used
  inputTokens: number;
  outputTokens: number;
  duration: number;       // Wall-clock duration in ms
  iterations: number;     // Number of REPL iterations
  subcalls: number;       // Number of recursive subcalls
  maxDepthReached: number;
}
```

## Python REPL Environment

Inside the REPL, the LLM has access to:

### Variables
- `context` - The input context string

### Bridge Functions
- `llm_query(prompt)` - Simple LLM query for single-shot questions
- `rlm_query(task, ctx?)` - Spawn a recursive sub-RLM for complex sub-tasks

### Utility Functions
- `chunk_text(text, size, overlap)` - Split text into overlapping chunks
- `search_context(pattern, window)` - Regex search with surrounding context

### Termination Markers
- `FINAL(answer)` - Return a direct answer
- `FINAL_VAR(variable_name)` - Return the contents of a Python variable

## Advanced Usage

### Direct Sandbox Access

```typescript
import { createSandbox, DEFAULT_REPL_CONFIG } from '@rlm/core';

const sandbox = createSandbox(DEFAULT_REPL_CONFIG, {
  onLLMQuery: async (prompt) => {
    // Handle llm_query() calls
    return 'response';
  },
  onRLMQuery: async (task, context) => {
    // Handle rlm_query() calls
    return 'result';
  },
});

await sandbox.initialize('my context data');
const result = await sandbox.execute('print(len(context))');
console.log(result.stdout); // "15"
await sandbox.destroy();
```

### Custom LLM Adapter

```typescript
import { LLMRouter, LLMAdapter, LLMRequest, LLMResponse } from '@rlm/core';

class MyCustomAdapter implements LLMAdapter {
  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Your implementation
    return {
      content: 'response',
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.001,
    };
  }
}

const router = new LLMRouter('custom');
router.register('custom', new MyCustomAdapter());
```

### Budget Controller

```typescript
import { BudgetController, DEFAULT_BUDGET } from '@rlm/core';

const budget = new BudgetController(
  { ...DEFAULT_BUDGET, maxCost: 1.0 },
  (warning) => console.warn(warning)
);

while (budget.canProceed('iteration')) {
  // Do work...
  budget.record({ iteration: true, cost: 0.01, inputTokens: 100 });
}

console.log(budget.getUsage());
console.log(budget.getBlockReason()); // 'Cost budget exhausted'
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@rlm/core` | Core library: context manager, REPL sandbox, LLM router, budget controller, execution engine | ✅ Implemented |
| `@rlm/cli` | Command-line interface | 🚧 Planned |
| `@rlm/web-api` | REST/WebSocket API (Hono, deployable to Cloudflare Workers) | 🚧 Planned |
| `@rlm/web-ui` | Mobile-first React PWA | 🚧 Planned |
| `@rlm/obsidian-plugin` | Obsidian integration | 🚧 Planned |

## Development

### Prerequisites

- Node.js 20+
- pnpm 9.15.0+

### Setup

```bash
# Clone the repository
git clone https://github.com/DwayneWilkes/rlm.git
cd rlm

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Commands

```bash
# Run in development mode
pnpm dev

# Run tests
pnpm test

# Run tests for specific package
pnpm --filter @rlm/core test

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## Architecture

```
User Task + Context + Budget
         │
         ▼
    ┌─────────────┐
    │ContextLoader│ ──► Prepare context for REPL
    └─────────────┘
         │
         ▼
    ┌─────────────┐
    │PyodideSandbox│ ──► Initialize Python REPL with bridges
    └─────────────┘
         │
         ▼
    ┌─────────────┐
    │  Executor   │ ◄──► LLM Router ──► Ollama/Anthropic/OpenAI
    └─────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Iteration   Subcall
  Loop      (recursive)
    │
    ▼
┌─────────────┐
│BudgetController│ ──► Enforce limits, warn at 80%
└─────────────┘
    │
    ▼
 FINAL(answer) or Budget Exhausted
    │
    ▼
  RLMResult
```

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.
