# Testing Guide

## Quick Start

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @rlm/core test

# Run a specific test file
pnpm --filter @rlm/core test src/budget/budget-controller.test.ts

# Run tests matching a pattern
pnpm --filter @rlm/core test -t "budget"

# Watch mode
pnpm --filter @rlm/core test --watch
```

## TDD Mandate

**All coding work MUST follow TDD.** This is non-negotiable.

### The TDD Cycle

1. **RED**: Write a failing test first
2. **GREEN**: Write minimal code to pass
3. **REFACTOR**: Clean up while tests pass

```bash
# 1. Write test first (packages/core/src/budget/budget-controller.test.ts)
# 2. Run test (should fail)
pnpm --filter @rlm/core test src/budget/budget-controller.test.ts

# 3. Implement feature
# 4. Run test (should pass)
pnpm --filter @rlm/core test src/budget/budget-controller.test.ts

# 5. Run full suite before commit
pnpm test
```

### Quality Gates

- **Target 100% coverage** on new code
- **All tests must pass** before commit
- **No implementation without tests**

---

## Test File Organization

### Hybrid Approach (Modern Best Practice)

**Unit tests**: Colocated with source files (1:1 mapping)
**Integration tests**: Separate `tests/` directory
**Shared fixtures**: `tests/fixtures/`

```
packages/core/
├── src/
│   ├── budget/
│   │   ├── budget-controller.ts
│   │   ├── budget-controller.test.ts    # Unit test colocated
│   │   └── index.ts
│   ├── llm/
│   │   ├── router.ts
│   │   ├── router.test.ts               # Unit test colocated
│   │   └── adapters/
│   │       ├── anthropic.ts
│   │       ├── anthropic.test.ts
│   │       ├── openai.ts
│   │       └── openai.test.ts
│   └── engine/
│       ├── executor.ts
│       └── executor.test.ts
├── tests/
│   ├── fixtures/                        # Shared test data
│   │   ├── sample-context.md
│   │   └── mock-responses.json
│   ├── integration/                     # Cross-module tests
│   │   └── executor-with-llm.test.ts
│   └── setup.ts                         # Global test setup
```

### Why This Structure

| Test Type | Location | Reason |
|-----------|----------|--------|
| Unit tests | Next to source | Easy to find, encourages testing |
| Integration tests | `tests/integration/` | Tests multiple modules together |
| Fixtures | `tests/fixtures/` | Shared across all tests |
| E2E tests | `tests/e2e/` | Full system tests |

### Test Size Limits

Same as source files:

| Category | Lines | Action |
|----------|-------|--------|
| **Ideal** | 200-300 | Target for new test files |
| **Acceptable** | 300-400 | Monitor, consider splitting |
| **Maximum** | 400 | Split into feature-specific test files |

---

## Writing Tests

### Basic Test

```typescript
import { describe, it, expect } from 'vitest';
import { BudgetController } from './budget-controller.js';

describe('BudgetController', () => {
  it('should allow requests within budget', () => {
    const controller = new BudgetController({ maxTotalCost: 10 });
    const result = controller.check({ estimatedCost: 5 });
    expect(result.allowed).toBe(true);
  });
});
```

### Async Test

```typescript
it('should complete LLM request', async () => {
  const result = await adapter.complete({
    model: 'claude-3-haiku',
    messages: [{ role: 'user', content: 'Hello' }],
  });
  expect(result.content).toBeDefined();
});
```

### Using Test Fixtures

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Executor', () => {
  let executor: Executor;
  let mockAdapter: MockLLMAdapter;

  beforeEach(() => {
    mockAdapter = new MockLLMAdapter();
    executor = new Executor({ adapter: mockAdapter });
  });

  it('should execute simple task', async () => {
    mockAdapter.setResponse('FINAL: Done');
    const result = await executor.execute({ task: 'test' });
    expect(result.success).toBe(true);
  });
});
```

### Parameterized Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('parseOutputFormat', () => {
  it.each([
    ['text', 'text'],
    ['markdown', 'markdown'],
    ['json', 'json'],
    ['todo-list', 'todo-list'],
    ['invalid', 'text'], // Falls back to text
  ])('should parse "%s" as "%s"', (input, expected) => {
    expect(parseOutputFormat(input)).toBe(expected);
  });
});
```

---

## Mocking

### Mocking LLM Responses

```typescript
import { vi } from 'vitest';

const mockAdapter = {
  complete: vi.fn().mockResolvedValue({
    content: 'Mocked response',
    usage: { inputTokens: 10, outputTokens: 5, cost: 0.001 },
  }),
  countTokens: vi.fn().mockResolvedValue(100),
};

// Use in tests
const executor = new Executor({ adapter: mockAdapter });
```

### Mocking Modules

```typescript
import { vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file contents'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
```

### Spying on Methods

```typescript
import { vi } from 'vitest';

it('should call complete with correct params', async () => {
  const completeSpy = vi.spyOn(adapter, 'complete');

  await executor.execute({ task: 'test' });

  expect(completeSpy).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'claude-3-haiku' })
  );
});
```

---

## Test Isolation

### Use Temporary Directories

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('ContextManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'rlm-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should load file context', async () => {
    // Write test file to tempDir
    // Test loading from tempDir
  });
});
```

### Isolate External Services

```typescript
// Don't call real LLM APIs in unit tests
// Use mocks or test doubles

// For integration tests, use test markers
describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Anthropic Integration', () => {
  it('should complete real request', async () => {
    // Real API call
  });
});
```

---

## Test Markers

```typescript
// Skip slow tests in CI
describe.skipIf(process.env.CI)('Slow Tests', () => { ... });

// Only run with API key
describe.runIf(process.env.ANTHROPIC_API_KEY)('Integration', () => { ... });

// Skip entirely
describe.skip('WIP', () => { ... });

// Focus on specific test
it.only('this one test', () => { ... });
```

---

## Coverage

```bash
# Run with coverage
pnpm --filter @rlm/core test --coverage

# Generate HTML report
pnpm --filter @rlm/core test --coverage --reporter=html
```

### Documenting Uncovered Code

When code cannot be covered, use comments:

```typescript
/* v8 ignore next 3 */
if (process.platform === 'win32') {
  // Windows-specific handling
}
```

**Valid reasons:** Platform-specific, defensive programming, external dependencies.
**Invalid reasons:** "Too hard to test" - refactor or test it.

---

## Debugging

```bash
# Run with full output
pnpm --filter @rlm/core test --reporter=verbose

# Debug specific test
pnpm --filter @rlm/core test --inspect-brk src/budget/budget-controller.test.ts

# Run failed tests only
pnpm --filter @rlm/core test --failed
```

---

## Troubleshooting

**Tests pass locally but fail in CI:**
- Check for hardcoded paths (use temp directories)
- Ensure test isolation
- Check for timezone-dependent code

**Async tests hang:**
- Check for unawaited promises
- Use timeouts: `it('test', { timeout: 5000 }, async () => { ... })`

**Flaky tests:**
- Avoid timing-dependent assertions
- Use deterministic test data
- Mock external dependencies
