# cli Spec Delta

## MODIFIED Requirements

### Requirement: Backend Selection Integration (Modified)

The CLI SHALL wire backend selection to execution via sandbox factory.

#### Scenario: Native backend execution
- **WHEN** backend is detected/configured as 'native'
- **THEN** CLI SHALL create sandboxFactory that returns NativePythonSandbox
- **AND** pass sandboxFactory to RLM constructor

#### Scenario: Daemon backend execution
- **WHEN** backend is detected/configured as 'daemon'
- **THEN** CLI SHALL create sandboxFactory that returns DaemonClientSandbox
- **AND** pass sandboxFactory to RLM constructor

#### Scenario: Pyodide backend execution
- **WHEN** backend is detected/configured as 'pyodide'
- **THEN** CLI SHALL create sandboxFactory that returns PyodideSandbox
- **AND** pass sandboxFactory to RLM constructor

#### Scenario: Auto backend selection
- **WHEN** backend is 'auto'
- **THEN** CLI SHALL detect best available backend
- **AND** create sandboxFactory for that backend
- **AND** pass sandboxFactory to RLM constructor
