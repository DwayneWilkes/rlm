# RLM (Recursive Language Model)

An AI-powered task decomposition and research system that executes tasks iteratively using LLMs with a Python REPL sandbox, supporting recursive sub-calls for complex analysis. Based on [Zhang et al. (2025) "Recursive Language Models"](https://arxiv.org/abs/2512.24601).

## Features

- **Iterative Execution**: Tasks run in a loop until completion or budget exhaustion
- **Python REPL Sandbox**: Multiple backends - Pyodide (WASM), Native Python, or Daemon mode
- **Budget Control**: Enforce limits on cost, tokens, time, recursion depth, and iterations
- **Multiple LLM Providers**: Ollama (local), Anthropic (Claude), OpenAI (GPT)
- **Full Execution Traces**: Track every iteration and subcall for debugging and analysis
- **CLI Tool**: Command-line interface for running tasks with config files
- **Daemon Mode**: Pre-warmed worker pool for ~10x faster repeated executions
- **Parallel LLM Queries**: `batch_llm_query()` for concurrent sub-task processing

## Quick Start

### CLI (Recommended)

```bash
# Run a task with a context file
rlm run "Summarize the key points" --context document.txt

# Run with JSON output
rlm run "Analyze code patterns" --context src/ --format json

# Use daemon mode for faster execution
rlm daemon start
rlm run "Quick analysis" --context data.txt
rlm daemon stop
```

> **Note**: The CLI is not yet published to npm. See [Development](#development) for local installation.

### Programmatic API

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

### Local Development (CLI not yet published)

```bash
# Clone and build
git clone https://github.com/DwayneWilkes/rlm.git
cd rlm
pnpm install
pnpm build

# Option 1: Run directly from monorepo
pnpm --filter @rlm/cli start run "Your task" --context file.txt

# Option 2: Link globally for `rlm` command
cd packages/cli
pnpm link --global
rlm run "Your task" --context file.txt
```

### Library (for programmatic use)

```bash
# As a library in your project (when published)
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
  subcallModel: 'claude-haiku-4-5-20251001', // Cheaper model for subcalls
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

## CLI Usage

The `@rlm/cli` package provides a full-featured command-line interface.

### Commands

```bash
# Run a task
rlm run "Your task description" [options]

# View/manage configuration
rlm config show              # Show current config
rlm config path              # Show config file path

# Daemon mode (faster repeated executions)
rlm daemon start [--workers 4]  # Start daemon
rlm daemon status               # Check daemon status
rlm daemon stop                 # Stop daemon
```

### Run Command Options

```bash
rlm run <task> [options]

Options:
  --context <file>     Input context file (text, markdown, etc.)
  --provider <name>    LLM provider: ollama, anthropic, openai
  --model <name>       Model to use (e.g., llama3.2, claude-sonnet-4-20250514)
  --profile <name>     Use a named profile from config file
  --format <type>      Output format: text, json, yaml
  --backend <type>     Sandbox backend: auto, native, daemon, pyodide
  --temperature <n>    Sampling temperature (0.0-2.0)
  --top-p <n>          Nucleus sampling threshold (0.0-1.0)
  --max-cost <n>       Maximum cost in dollars
  --max-iterations <n> Maximum iterations
  --verbose            Enable verbose output
```

### Configuration File

Create `.rlmrc.yaml` in your project or home directory. See `.rlmrc.example.yaml` for a full example with multiple profiles.

```yaml
# ~/.rlmrc.yaml - Flat configuration
provider: ollama
model: llama3.2
inference:
  temperature: 0.7     # Sampling temperature (0.0-2.0)
  top_p: 0.9           # Nucleus sampling (0.0-1.0)
budget:
  maxCost: 5.0
  maxIterations: 30
  maxDepth: 2
repl:
  backend: auto        # auto | native | daemon | pyodide
output:
  format: text         # text | json | yaml
```

### Profile-Based Configuration

For multiple environments, use profiles:

```yaml
# ~/.rlmrc.yaml - Profile-based configuration
profiles:
  local:
    provider: ollama
    model: llama3.2

  cloud:
    provider: anthropic
    model: claude-sonnet-4-5-20250514
    inference:
      temperature: 0.7

  creative:
    provider: anthropic
    model: claude-sonnet-4-5-20250514
    inference:
      temperature: 1.0
      top_p: 0.95

  deterministic:
    provider: openai
    model: gpt-4o
    inference:
      temperature: 0.0
      seed: 42

default: local
```

Use profiles with `--profile`:

```bash
rlm run "Analyze code" --profile cloud
rlm run "Write creative story" --profile creative
```

### Sandbox Backends

| Backend | Startup | Use Case |
|---------|---------|----------|
| `pyodide` | ~300ms | Browser environments (WASM) |
| `native` | ~50ms | CLI with Python installed |
| `daemon` | ~5ms | Benchmarking, repeated calls |
| `auto` | varies | Selects best available |

**Daemon mode** maintains a pool of pre-warmed Python workers:

```bash
# Start daemon with 4 workers
rlm daemon start --workers 4

# All subsequent commands use the daemon automatically
rlm run "Task 1" --context file1.txt  # ~5ms startup
rlm run "Task 2" --context file2.txt  # ~5ms startup

# Stop when done
rlm daemon stop
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
  inference?: InferenceOptions;  // Model generation parameters
  defaultBudget?: Partial<Budget>;
  repl?: Partial<REPLConfig>;
}

// Common inference options (all providers)
interface CommonInferenceOptions {
  temperature?: number;    // Sampling temperature (0.0-2.0)
  top_p?: number;          // Nucleus sampling (0.0-1.0)
  top_k?: number;          // Top-k sampling
  stop?: string[];         // Stop sequences
}

// Provider-specific options extend CommonInferenceOptions
interface OllamaInferenceOptions extends CommonInferenceOptions {
  num_ctx?: number;        // Context window size
  num_predict?: number;    // Max tokens to generate
  seed?: number;           // Random seed for reproducibility
  keep_alive?: string;     // Model memory lifetime
}

interface AnthropicInferenceOptions extends CommonInferenceOptions {
  max_tokens?: number;     // Max tokens to generate
}

interface OpenAIInferenceOptions extends CommonInferenceOptions {
  frequency_penalty?: number;  // Reduce repetition (-2.0 to 2.0)
  presence_penalty?: number;   // Encourage new topics (-2.0 to 2.0)
  seed?: number;               // Random seed for reproducibility
  max_tokens?: number;         // Max tokens to generate
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
- `batch_llm_query(prompts)` - Execute multiple LLM queries in parallel

### Utility Functions
- `chunk_text(text, size, overlap)` - Split text into overlapping chunks
- `search_context(pattern, window)` - Regex search with surrounding context

### Batch Processing Example

```python
# Process multiple queries in parallel (faster than sequential llm_query calls)
prompts = [
    "Summarize section 1",
    "Summarize section 2",
    "Summarize section 3"
]
results = batch_llm_query(prompts)  # All run concurrently
```

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

## Development

### Prerequisites

- Node.js 18+
- pnpm 9.15.0+
- Python 3.8+ (for native sandbox backend)

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

### Running the CLI Locally

```bash
# Option 1: Run directly (no global install)
pnpm --filter @rlm/cli start run "Your task" --context file.txt

# Option 2: Link globally for `rlm` command
cd packages/cli
pnpm link --global
cd ../..

# Now you can use `rlm` anywhere
rlm run "Analyze this code" --context src/
rlm daemon start
rlm config show
```

### Commands

```bash
# Development mode (watch for changes)
pnpm dev

# Run tests (watch mode)
pnpm test

# Run tests once (for CI/scripts)
pnpm test:run

# Run tests for specific package
pnpm --filter @rlm/core test:run
pnpm --filter @rlm/cli test:run

# Lint and typecheck
pnpm lint
pnpm typecheck
```

## Architecture

```
User Task + Context + Budget
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                     CLI (@rlm/cli)                       │
│  rlm run "task" --context file.txt                      │
│  Config: .rlmrc.yaml  │  Output: text/json/yaml         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────┐
    │ContextLoader│ ──► Prepare context for REPL
    └─────────────┘
         │
         ▼
    ┌─────────────┐     ┌──────────────────────────────┐
    │SandboxFactory│ ───►│  Backend Selection           │
    └─────────────┘     │  • daemon  (~5ms)  ◄─ pool   │
                        │  • native  (~50ms) ◄─ Python │
                        │  • pyodide (~300ms)◄─ WASM   │
                        └──────────────────────────────┘
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

This project is dual-licensed:

- **[AGPL-3.0](LICENSE)** for code, linking, and distribution terms.
- **[SAFE-AI License v1.0.0](LICENSE-SAFE-AI)** for welfare, safety, and ethical use requirements.

The SAFE-AI License requires that welfare monitoring, refusal/distress flagging, and artifact logging must not be disabled or circumvented. Where the two licenses overlap, the SAFE-AI terms prevail for welfare, dual-use, and safety concerns (SAFE-AI Section 7.1).

For details on the SAFE-AI License, see [github.com/DwayneWilkes/SAFE-AI-License](https://github.com/DwayneWilkes/SAFE-AI-License).

To report safety, welfare, or misuse concerns, open an issue at [github.com/DwayneWilkes/rlm/issues](https://github.com/DwayneWilkes/rlm/issues).
