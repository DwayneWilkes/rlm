# types Specification

## Purpose
Define core TypeScript types for RLM configuration, execution, results, and LLM abstraction with sensible defaults.
## Requirements
### Requirement: Configuration Types

The system SHALL provide configuration types for RLM initialization.

#### Scenario: RLMConfig structure
- **WHEN** creating an RLM instance
- **THEN** RLMConfig SHALL include provider, model, providerOptions, subcallModel, defaultBudget, and repl fields

#### Scenario: Budget structure
- **WHEN** specifying execution budget
- **THEN** Budget SHALL include maxCost, maxTokens, maxTime, maxDepth, and maxIterations fields

#### Scenario: REPLConfig structure
- **WHEN** configuring REPL behavior
- **THEN** REPLConfig SHALL include timeout and maxOutputLength fields

### Requirement: Execution Types

The system SHALL provide types for task execution.

#### Scenario: ExecuteOptions structure
- **WHEN** executing a task
- **THEN** ExecuteOptions SHALL include task, context, budget, and hooks fields

#### Scenario: ExecutionHooks structure
- **WHEN** subscribing to execution events
- **THEN** ExecutionHooks SHALL include onIteration, onSubcall, and onBudgetWarning callbacks

### Requirement: Result Types

The system SHALL provide types for execution results.

#### Scenario: RLMResult structure
- **WHEN** execution completes
- **THEN** RLMResult SHALL include success, output, trace, usage, warnings, and optional error fields

#### Scenario: Usage structure
- **WHEN** tracking resource consumption
- **THEN** Usage SHALL include cost, tokens, inputTokens, outputTokens, duration, iterations, subcalls, and maxDepthReached fields

#### Scenario: ExecutionTrace structure
- **WHEN** recording execution history
- **THEN** ExecutionTrace SHALL include id, parentId, depth, task, iterations, subcalls, finalAnswer, and answerSource fields

### Requirement: Iteration Types

The system SHALL provide types for REPL iterations.

#### Scenario: Iteration structure
- **WHEN** recording a REPL iteration
- **THEN** Iteration SHALL include index, prompt, response, and codeExecutions fields

#### Scenario: CodeExecution structure
- **WHEN** recording code execution
- **THEN** CodeExecution SHALL include code, stdout, stderr, optional error, and duration fields

### Requirement: LLM Abstraction Types

The system SHALL provide types for LLM provider abstraction.

#### Scenario: LLMAdapter interface
- **WHEN** implementing a provider adapter
- **THEN** LLMAdapter SHALL require a complete(request) method returning Promise<LLMResponse>

#### Scenario: LLMRequest structure
- **WHEN** making an LLM request
- **THEN** LLMRequest SHALL include model, systemPrompt, userPrompt, and optional maxTokens fields

#### Scenario: LLMResponse structure
- **WHEN** receiving an LLM response
- **THEN** LLMResponse SHALL include content, inputTokens, outputTokens, and cost fields

### Requirement: Default Values

The system SHALL provide sensible default values.

#### Scenario: DEFAULT_BUDGET values
- **WHEN** no budget is specified
- **THEN** defaults SHALL be maxCost=5.0, maxTokens=500000, maxTime=300000, maxDepth=2, maxIterations=30

#### Scenario: DEFAULT_REPL_CONFIG values
- **WHEN** no REPL config is specified
- **THEN** defaults SHALL be timeout=30000, maxOutputLength=50000

