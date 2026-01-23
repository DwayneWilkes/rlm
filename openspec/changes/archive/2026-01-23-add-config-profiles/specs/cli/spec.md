# cli Spec Delta

## ADDED Requirements

### Requirement: Configuration Profiles

The system SHALL support named configuration profiles.

#### Scenario: Profile definition
- **WHEN** config file contains `profiles` object
- **THEN** each key SHALL be a named profile
- **AND** each profile SHALL contain provider, model, and optional budget/repl settings

#### Scenario: Mixed provider support
- **WHEN** a profile contains `subcallProvider` field
- **THEN** subcalls (rlm_query, batch_rlm_query) SHALL use that provider
- **AND** root LLM calls SHALL use the main `provider`

#### Scenario: Subcall provider fallback
- **WHEN** a profile does not contain `subcallProvider`
- **THEN** subcalls SHALL use the main `provider` value

#### Scenario: Default profile
- **WHEN** config file contains `default` key
- **THEN** that profile SHALL be used when no profile is specified

#### Scenario: Profile inheritance
- **WHEN** a profile contains `extends: other_profile`
- **THEN** it SHALL inherit all settings from the extended profile
- **AND** local settings SHALL override inherited settings

#### Scenario: Deep merge for nested objects
- **WHEN** a profile extends another and overrides nested object fields (budget, repl)
- **THEN** only specified nested fields SHALL be overridden
- **AND** unspecified nested fields SHALL be inherited from parent

#### Scenario: Chained extends
- **WHEN** profile A extends B, and B extends C
- **THEN** A SHALL inherit from fully resolved B (which includes C's settings)

#### Scenario: Circular extends detection
- **WHEN** profiles have circular extends references
- **THEN** config loader SHALL error with clear message listing the cycle

#### Scenario: Backward compatibility
- **WHEN** config file uses flat format (no profiles key)
- **THEN** it SHALL be treated as a single unnamed profile
- **AND** all existing configs SHALL continue to work

### Requirement: Profile CLI Flag

The system SHALL support profile selection via CLI.

#### Scenario: --profile flag
- **WHEN** `rlm run --profile <name>` is invoked
- **THEN** the named profile SHALL be loaded

#### Scenario: -p shorthand
- **WHEN** `rlm run -p <name>` is invoked
- **THEN** it SHALL behave the same as --profile

#### Scenario: Missing profile error
- **WHEN** --profile specifies a non-existent profile
- **THEN** CLI SHALL error with message listing available profiles

#### Scenario: CLI overrides profile
- **WHEN** both --profile and specific flags (--model, --provider) are used
- **THEN** specific flags SHALL override profile values

### Requirement: Profile Environment Variable

The system SHALL support profile selection via environment variable.

#### Scenario: RLM_PROFILE env var
- **WHEN** RLM_PROFILE environment variable is set
- **THEN** that profile SHALL be used as default

#### Scenario: CLI flag overrides env var
- **WHEN** both RLM_PROFILE and --profile are set
- **THEN** --profile SHALL take precedence

### Requirement: Config List Command

The system SHALL provide a command to list profiles.

#### Scenario: List all profiles
- **WHEN** `rlm config list` is invoked
- **THEN** it SHALL display all profile names

#### Scenario: Mark default profile
- **WHEN** listing profiles
- **THEN** the default profile SHALL be marked (e.g., with asterisk)

#### Scenario: Show profile summary
- **WHEN** listing profiles
- **THEN** each profile SHALL show provider and model

### Requirement: Config Show Command

The system SHALL provide a command to show profile details.

#### Scenario: Show named profile
- **WHEN** `rlm config show <name>` is invoked
- **THEN** it SHALL display the fully resolved profile config

#### Scenario: Show current profile
- **WHEN** `rlm config show` is invoked without name
- **THEN** it SHALL display the current/default profile

#### Scenario: Show resolved extends
- **WHEN** showing a profile with extends
- **THEN** it SHALL display the fully merged configuration
