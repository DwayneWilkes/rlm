# Proposal: add-config-profiles

## Summary

Add named configuration profiles to RLM CLI, allowing users to switch between different provider/model/budget configurations for different use cases.

## Motivation

Users need to switch between configurations for different scenarios:
- **Local GPU** - Fast, free, private (Ollama with local models)
- **Cloud high-quality** - Best results (Claude Opus, GPT-4)
- **Cloud fast** - Quick iterations (Claude Haiku, GPT-4o-mini)
- **Budget-constrained** - Strict cost limits for production
- **Deep research** - High depth/iteration limits for complex analysis

Currently requires manually editing `.rlmrc.yaml` or maintaining multiple config files.

## Scope

### In Scope
- Named profiles within single config file
- CLI flag to select profile (`--profile`, `-p`)
- Environment variable override (`RLM_PROFILE`)
- Profile inheritance/composition
- `rlm config list` to show available profiles
- `rlm config show <profile>` to display profile settings

### Out of Scope
- GUI for profile management
- Remote/shared profile storage
- Profile encryption for API keys

## Solution Overview

### Config File Format

```yaml
# .rlmrc.yaml
profiles:
  #──────────────────────────────────────────────────────────────
  # Base profiles (standalone)
  #──────────────────────────────────────────────────────────────

  local:
    provider: ollama
    model: qwen2.5-coder:14b
    subcallModel: qwen2.5-coder:7b
    budget:
      maxCost: 0
      maxIterations: 100
      maxDepth: 5
    repl:
      backend: native
      timeout: 60000

  cloud:
    provider: claude-code
    model: claude-sonnet-4-5
    subcallModel: claude-haiku-3-5
    budget:
      maxCost: 10.0
      maxIterations: 60
      maxDepth: 3

  #──────────────────────────────────────────────────────────────
  # Hybrid: Cloud root + Local GPU subcalls
  #──────────────────────────────────────────────────────────────

  hybrid:
    provider: claude-code
    model: claude-sonnet-4-5
    subcallProvider: ollama          # Subcalls use local GPU!
    subcallModel: qwen2.5-coder:14b
    budget:
      maxCost: 5.0                   # Only root calls cost money
      maxIterations: 100
      maxDepth: 5

  #──────────────────────────────────────────────────────────────
  # Extended profiles (inherit + override)
  #──────────────────────────────────────────────────────────────

  # Quick local tasks - extends local with tighter limits
  local-quick:
    extends: local
    model: qwen2.5-coder:7b          # Faster, smaller model
    budget:
      maxIterations: 10
      maxDepth: 1

  # Deep research - extends hybrid with higher limits
  research:
    extends: hybrid
    model: claude-opus-4-5           # Upgrade root to Opus
    budget:
      maxCost: 50.0
      maxIterations: 500
      maxDepth: 10
      maxTime: 1800000               # 30 minutes

  # Code review - extends cloud with specific settings
  code-review:
    extends: cloud
    model: claude-sonnet-4-5
    budget:
      maxIterations: 20
      maxDepth: 2

  # Paper analysis - extends research
  paper-analysis:
    extends: research
    budget:
      maxIterations: 200             # Override just iterations

default: hybrid  # Best of both worlds as default
```

### Profile Inheritance (`extends`)

Profiles can inherit from other profiles using `extends`:

```yaml
research:
  extends: hybrid        # Inherit all settings from 'hybrid'
  model: claude-opus-4-5 # Override just the model
  budget:
    maxCost: 50.0        # Override budget fields (deep merge)
```

**Merge behavior:**
- Top-level fields: Override completely
- Nested objects (`budget`, `repl`): Deep merge (override only specified keys)
- `extends` chains: Resolved in order (child overrides parent)

**Example resolution:**
```
hybrid.budget = { maxCost: 5.0, maxIterations: 100, maxDepth: 5 }
research.budget = { maxCost: 50.0 }
                          ↓
resolved.budget = { maxCost: 50.0, maxIterations: 100, maxDepth: 5 }
```

### Mixed Provider Support

The `subcallProvider` field allows using a different LLM provider for subcalls:

| Field | Used For | Default |
|-------|----------|---------|
| `provider` | Root LLM, llm_query | Required |
| `model` | Root LLM model | Required |
| `subcallProvider` | rlm_query, batch_rlm_query | Falls back to `provider` |
| `subcallModel` | Subcall model | Falls back to `model` |

**Hybrid examples:**
- Cloud root + Local subcalls: Quality reasoning, unlimited free subcalls
- Local root + Cloud subcalls: Fast iteration, quality sub-analysis
- Big local + Small local: All free, tiered by complexity

### CLI Usage

```bash
# Use default profile
rlm run task.md

# Explicit profile selection
rlm run task.md --profile cloud
rlm run task.md -p research

# Environment variable
RLM_PROFILE=cloud rlm run task.md

# List profiles
rlm config list

# Show profile details
rlm config show research
```

### Priority Order (highest to lowest)
1. CLI flags (`--provider`, `--model`, etc.)
2. `--profile` flag
3. `RLM_PROFILE` environment variable
4. `default` profile in config
5. Built-in defaults

## Affected Components

- `packages/core/src/types.ts` - Add subcallProvider to RLMConfig
- `packages/core/src/engine/executor.ts` - Use subcallProvider for subcalls
- `packages/cli/src/config/loader.ts` - Profile parsing and resolution
- `packages/cli/src/config/schema.ts` - Zod schema for profiles
- `packages/cli/src/commands/run.ts` - `--profile` flag
- `packages/cli/src/commands/config.ts` - `list` and `show` subcommands
- `openspec/specs/cli/spec.md` - Document profile requirements
- `openspec/specs/types/spec.md` - Document subcallProvider

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Circular extends | Detect cycles during config load, error with clear message |
| Missing profile | Error with list of available profiles |
| Breaking existing configs | Support both flat config and profiles format |
