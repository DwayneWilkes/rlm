# Style Guide

Style guidelines for RLM with emphasis on LLM-friendly file layout.

## File Size Guidelines

**Why this matters:** Large files cause context bloat for LLM agents, reducing efficiency and increasing costs. Split files proactively to keep agent context windows manageable.

### Size Limits

| Category | Lines | Action |
|----------|-------|--------|
| **Ideal** | 200-300 | Target for new files |
| **Acceptable** | 300-400 | Monitor, consider splitting |
| **Maximum** | 400 | Triggers refactor discussion |
| **Hard Limit** | 500 | Must split before merge |

### When to Split

A file should be split when:

1. **Line count exceeds 400** - Plan the split before it reaches 500
2. **Multiple distinct concerns** - File handles unrelated functionality
3. **Test file mirrors source** - If source splits, tests should too
4. **Repeated scrolling** - You keep jumping between distant sections

### How to Split

**Step 1:** Identify cohesive groups of functionality

```typescript
// Before: packages/core/src/engine/executor.ts (700+ lines)
export class Executor {
  async execute(config: RLMConfig): Promise<RLMResult> { ... }
  private buildPrompt(history: Message[]): string { ... }
  private parseCodeBlocks(response: string): string[] { ... }
  private handleSubcall(task: string): Promise<string> { ... }
}
```

**Step 2:** Extract into focused modules

```
packages/core/src/engine/
├── index.ts           # Public API exports
├── executor.ts        # Main class (delegates to modules)
├── prompt-builder.ts  # buildPrompt() implementation
├── code-parser.ts     # parseCodeBlocks() implementation
└── subcall-handler.ts # handleSubcall() implementation
```

**Step 3:** Use barrel exports for clean imports

```typescript
// index.ts
export { Executor } from './executor.js';
export type { ExecutorOptions } from './types.js';
```

## Naming Conventions

### Files

- **TypeScript modules**: `kebab-case.ts`
- **Test files**: `*.test.ts` or `*.spec.ts`
- **Type definitions**: `types.ts` or `*.types.ts`
- **Config files**: `*.config.ts` or `*.config.js`

### Code

- **Classes**: `PascalCase`
- **Functions/methods**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`
- **Private members**: `#privateField` or `_privateMethod`

### Module Structure

```
packages/<name>/src/
├── index.ts           # Public exports only
├── types.ts           # Shared types for this package
├── <feature>/
│   ├── index.ts       # Feature exports
│   ├── <feature>.ts   # Main implementation
│   └── helpers.ts     # Internal helpers
```

## Import Organization

```typescript
// 1. Node.js built-ins
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 2. External dependencies
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

// 3. Internal packages (monorepo)
import { RLMConfig } from '@rlm/core';

// 4. Relative imports
import { parseCodeBlocks } from './code-parser.js';
import type { ExecutorOptions } from './types.js';
```

## TypeScript Guidelines

### Prefer Type Inference

```typescript
// Good - type is inferred
const items = ['a', 'b', 'c'];
const count = items.length;

// Unnecessary - don't annotate obvious types
const items: string[] = ['a', 'b', 'c'];
const count: number = items.length;
```

### Use `type` for Object Shapes, `interface` for Extension

```typescript
// Type for data shapes
type BudgetState = {
  totalCost: number;
  totalTokens: number;
};

// Interface when extension is expected
interface LLMAdapter {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

class AnthropicAdapter implements LLMAdapter { ... }
```

### Explicit Return Types for Public APIs

```typescript
// Public function - explicit return type
export function createExecutor(config: ExecutorConfig): Executor {
  return new Executor(config);
}

// Private/internal - inference is fine
function parseResponse(text: string) {
  return text.split('\n');
}
```

## Documentation

### JSDoc for Public APIs

```typescript
/**
 * Execute an RLM task with the given configuration.
 *
 * @param config - Task configuration including context and budget
 * @returns Execution result with output and trace
 * @throws {BudgetExceededError} When budget limits are reached
 *
 * @example
 * ```typescript
 * const result = await executor.execute({
 *   task: 'Analyze this code',
 *   context: [{ type: 'file', uri: './src/index.ts' }],
 * });
 * ```
 */
export async function execute(config: RLMConfig): Promise<RLMResult> {
```

### Skip Docs for Self-Documenting Code

```typescript
// No JSDoc needed - name and types are clear
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

## Code Quality

### Before Committing

1. **Run typecheck**: `pnpm typecheck`
2. **Run tests**: `pnpm test`
3. **Run linter**: `pnpm lint`
4. **Check file sizes**: Files should be under 400 lines

### Avoiding Over-Engineering

- Only add features that are directly requested
- Don't add docstrings to code you didn't change
- Don't add error handling for impossible scenarios
- Three similar lines are better than a premature abstraction
- Don't create helpers for one-time operations
