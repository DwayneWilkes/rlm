# Spec Delta: cli

## ADDED Requirements

### Requirement: Configuration Profiles

The CLI SHALL support named configuration profiles within a single config file.

```yaml
# rlm.config.yaml
profiles:
  local:
    provider: ollama
    model: qwen2.5-coder:14b
    budget:
      maxCost: 0
      maxIterations: 100

  cloud:
    provider: claude-code
    model: claude-sonnet-4-5
    subcallModel: claude-haiku-3-5
    budget:
      maxCost: 10.0

  research:
    extends: cloud
    model: claude-opus-4-5
    budget:
      maxCost: 50.0
      maxIterations: 500

default: cloud
```

#### Scenario: Profile selection via flag
- **WHEN** user runs `rlm run task.md --profile local`
- **THEN** the CLI SHALL use the "local" profile configuration

#### Scenario: Default profile
- **WHEN** no `--profile` flag is provided
- **THEN** the CLI SHALL use the profile named in `default` field

### Requirement: Profile Inheritance

Profiles SHALL support inheriting from other profiles via the `extends` field.

#### Scenario: Simple inheritance
- **WHEN** profile "research" has `extends: cloud`
- **THEN** "research" SHALL inherit all settings from "cloud"
- **AND** explicit fields in "research" SHALL override inherited values

#### Scenario: Deep merge for nested objects
- **WHEN** parent has `budget: {maxCost: 10, maxIterations: 100}`
- **AND** child has `budget: {maxCost: 50}`
- **THEN** resolved budget SHALL be `{maxCost: 50, maxIterations: 100}`

#### Scenario: Circular extends detection
- **WHEN** profile A extends B and B extends A
- **THEN** the CLI SHALL error with a clear message about the cycle

### Requirement: Profile CLI Flag

The `run` command SHALL accept `--profile` / `-p` flag.

#### Scenario: Short flag
- **WHEN** user runs `rlm run task.md -p local`
- **THEN** it SHALL be equivalent to `--profile local`

#### Scenario: CLI flags override profile
- **WHEN** user runs `rlm run task.md --profile local --model different`
- **THEN** the `--model` flag SHALL override the profile's model

### Requirement: Environment Variable Profile Selection

The CLI SHALL support profile selection via `RLM_PROFILE` environment variable.

#### Scenario: Environment variable
- **WHEN** `RLM_PROFILE=research` is set
- **AND** no `--profile` flag is provided
- **THEN** the CLI SHALL use the "research" profile

#### Scenario: Flag overrides environment
- **WHEN** `RLM_PROFILE=research` and `--profile local` are both set
- **THEN** the `--profile` flag SHALL take precedence

### Requirement: Config List Command

The CLI SHALL provide `rlm config list` to show available profiles.

#### Scenario: List profiles
- **WHEN** user runs `rlm config list`
- **THEN** output SHALL show all profile names
- **AND** the default profile SHALL be marked

### Requirement: Config Show Command

The CLI SHALL provide `rlm config show <name>` to display resolved profile settings.

#### Scenario: Show resolved profile
- **WHEN** user runs `rlm config show research`
- **THEN** output SHALL show fully resolved config (with inheritance applied)

#### Scenario: Show current profile
- **WHEN** user runs `rlm config show` without a name
- **THEN** output SHALL show the current/default profile

### Requirement: Sandbox Factory Injection

The CLI SHALL inject its sandbox factory into the core executor.

#### Scenario: CLI backend selection works
- **WHEN** config specifies `repl.backend: native`
- **THEN** execution SHALL use the native Python sandbox
- **AND** NOT the default Pyodide sandbox

## MODIFIED Requirements

### Requirement: Config File Format

The CLI config format SHALL require a profiles structure with named profiles.

**BREAKING CHANGE**: Existing flat configs must be migrated to the profiles structure.

Before:
```yaml
provider: claude-code
model: claude-sonnet-4-5
budget:
  maxCost: 10.0
```

After:
```yaml
profiles:
  default:
    provider: claude-code
    model: claude-sonnet-4-5
    budget:
      maxCost: 10.0
default: default
```

#### Scenario: Migration error for old format
- **WHEN** old flat config format is detected
- **THEN** CLI SHALL error with migration instructions
