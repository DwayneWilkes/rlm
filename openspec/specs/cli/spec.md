# cli Specification

## Purpose
TBD - created by archiving change add-cli. Update Purpose after archive.
## Requirements
### Requirement: CLI Run Command

The CLI SHALL provide a `run` command to execute RLM tasks.

#### Scenario: Basic invocation with file context
- **WHEN** running `rlm run "Summarize" --context ./file.txt --provider ollama --model llama3.2`
- **THEN** it SHALL read context from the file
- **AND** execute RLM with the specified provider and model
- **AND** output result to stdout

#### Scenario: Context from stdin
- **WHEN** running `echo "content" | rlm run "Analyze" --context -`
- **THEN** it SHALL read context from stdin
- **AND** execute RLM with default provider

#### Scenario: Inline context
- **WHEN** running `rlm run "Question" --context "inline text"`
- **THEN** it SHALL use the string as context directly

#### Scenario: Positional task argument
- **WHEN** running `rlm run "Summarize this" --context file.txt`
- **THEN** it SHALL use the positional argument as the task

### Requirement: Configuration Options

The CLI SHALL support configuration via flags and config files.

#### Scenario: Provider and model flags
- **WHEN** `--provider` and `--model` flags are provided
- **THEN** they SHALL be used for RLM configuration

#### Scenario: Budget flags
- **WHEN** `--max-cost`, `--max-iterations`, or `--max-depth` flags are provided
- **THEN** they SHALL override default budget values

#### Scenario: API key from environment
- **WHEN** using cloud providers (anthropic, openai)
- **THEN** API key SHALL be read from `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variables

#### Scenario: Backend selection
- **WHEN** `--backend` flag is provided with value `native`, `daemon`, or `pyodide`
- **THEN** it SHALL use the specified sandbox backend

### Requirement: Config File Loading

The CLI SHALL load configuration from YAML files.

#### Scenario: Config file search order
- **WHEN** CLI starts without explicit `--config` flag
- **THEN** it SHALL search for config files in order:
  1. `.rlmrc.yaml` in current directory
  2. `~/.config/rlm/config.yaml`
  3. `~/.rlm/config.yaml`

#### Scenario: Explicit config file
- **WHEN** `--config path/to/config.yaml` is provided
- **THEN** it SHALL load configuration from that file

#### Scenario: Flag overrides config
- **WHEN** both config file and CLI flags specify the same option
- **THEN** CLI flags SHALL take precedence

### Requirement: Output Formats

The CLI SHALL support multiple output formats.

#### Scenario: Text output (default)
- **WHEN** `--format text` or no format flag
- **THEN** it SHALL output human-readable text with progress indicators

#### Scenario: JSON output
- **WHEN** `--format json`
- **THEN** it SHALL output machine-readable JSON to stdout

#### Scenario: YAML output
- **WHEN** `--format yaml`
- **THEN** it SHALL output YAML-formatted result

#### Scenario: Verbose mode
- **WHEN** `--verbose` flag is provided
- **THEN** it SHALL output progress information during execution

### Requirement: Exit Codes

The CLI SHALL use standard exit codes.

#### Scenario: Success
- **WHEN** execution succeeds
- **THEN** it SHALL exit with code 0

#### Scenario: User error
- **WHEN** invalid arguments or configuration
- **THEN** it SHALL exit with code 1

#### Scenario: Runtime error
- **WHEN** execution fails
- **THEN** it SHALL exit with code 2

### Requirement: Daemon Commands

The CLI SHALL provide daemon management commands.

#### Scenario: Start daemon
- **WHEN** running `rlm daemon start [--pool-size N]`
- **THEN** it SHALL start the daemon process with N workers (default: 4)
- **AND** create PID file at `~/.rlm/daemon.pid`

#### Scenario: Stop daemon
- **WHEN** running `rlm daemon stop [--force]`
- **THEN** it SHALL stop the running daemon process
- **AND** remove PID file

#### Scenario: Daemon status
- **WHEN** running `rlm daemon status`
- **THEN** it SHALL report whether daemon is running
- **AND** show worker count and uptime if running

### Requirement: Config Commands

The CLI SHALL provide config inspection commands.

#### Scenario: Show config
- **WHEN** running `rlm config show`
- **THEN** it SHALL display the merged configuration (file + defaults)

#### Scenario: Config path
- **WHEN** running `rlm config path`
- **THEN** it SHALL display the path to the active config file

### Requirement: Help and Version

The CLI SHALL provide usage information.

#### Scenario: Help flag
- **WHEN** running `rlm --help` or `rlm <command> --help`
- **THEN** it SHALL display usage information and available flags

#### Scenario: Version flag
- **WHEN** running `rlm --version`
- **THEN** it SHALL display the package version

