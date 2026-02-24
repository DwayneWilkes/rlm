### Requirement: YAML Configuration File
The config system SHALL load configuration from a `.rlmrc.yaml` file, searching the current directory and parent directories (cosmiconfig-like resolution).

#### Scenario: Config found in current directory
- **WHEN** `.rlmrc.yaml` exists in the current working directory
- **THEN** it is loaded and parsed

#### Scenario: Config found in parent directory
- **WHEN** `.rlmrc.yaml` is not in the current directory but exists in a parent directory
- **THEN** the parent's config is loaded

#### Scenario: No config file found
- **WHEN** no `.rlmrc.yaml` exists in the directory chain
- **THEN** built-in defaults are used

### Requirement: Named Profiles
The config file SHALL support named profiles, each defining provider, model, inference options, budget, and template settings.

#### Scenario: Profile selection
- **WHEN** `--profile claude-code` is specified
- **THEN** the `claude-code` profile's settings are loaded

#### Scenario: Default profile
- **WHEN** no profile is specified and a `default` profile exists
- **THEN** the `default` profile is used

### Requirement: Profile Inheritance
Profiles SHALL support an `extends` field that inherits settings from another profile, with local values overriding inherited ones.

#### Scenario: Extends another profile
- **WHEN** profile `fast` has `extends: default` and overrides `temperature: 0.0`
- **THEN** all settings from `default` are inherited, with `temperature` overridden to 0.0

#### Scenario: Deep inheritance
- **WHEN** profile `a` extends `b` which extends `c`
- **THEN** settings cascade: `a` overrides `b` overrides `c`

### Requirement: CLI Overrides
Command-line arguments SHALL override config file and profile settings for all applicable options.

#### Scenario: CLI overrides profile model
- **WHEN** the profile specifies `model: claude-sonnet` but `--model claude-opus` is passed
- **THEN** `claude-opus` is used

#### Scenario: CLI overrides budget
- **WHEN** `--max-iterations 10` is passed
- **THEN** the iteration limit is 10 regardless of profile/config values

### Requirement: Provider Configuration
Each provider in a profile SHALL specify at minimum a `type` (anthropic, openai, claude-code) and `model`. Optional fields: `base_url`, `api_key_env` (env var name for the API key).

#### Scenario: Anthropic provider config
- **WHEN** a profile has `provider: { type: anthropic, model: claude-sonnet-4-20250514, api_key_env: ANTHROPIC_API_KEY }`
- **THEN** the Anthropic adapter is used with the specified model and API key from the environment

#### Scenario: Ollama provider config
- **WHEN** a profile has `provider: { type: openai, model: llama3, base_url: http://localhost:11434/v1 }`
- **THEN** the OpenAI-compatible adapter is used with the Ollama endpoint and no API key

### Requirement: Config Display
The `config show` command SHALL display the fully resolved configuration including defaults, profile values, and any overrides.

#### Scenario: Show resolved config
- **WHEN** `rlm config show --profile fast` is run
- **THEN** the output shows all resolved settings with their sources (default, profile, override)
