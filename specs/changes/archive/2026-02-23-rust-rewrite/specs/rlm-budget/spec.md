## ADDED Requirements

### Requirement: Budget Controller
The budget controller SHALL track and enforce limits across five dimensions: cost (USD), tokens (input + output), wall-clock time, iteration count, and recursion depth.

#### Scenario: All limits within bounds
- **WHEN** an execution stays within all configured limits
- **THEN** the budget controller allows execution to continue

#### Scenario: Cost limit exceeded
- **WHEN** cumulative estimated cost exceeds the configured `max_cost` limit
- **THEN** the budget controller signals budget exhaustion with reason `cost_exceeded`

#### Scenario: Token limit exceeded
- **WHEN** cumulative tokens (input + output) exceed the configured `max_tokens` limit
- **THEN** the budget controller signals budget exhaustion with reason `tokens_exceeded`

#### Scenario: Time limit exceeded
- **WHEN** wall-clock time since execution start exceeds the configured `max_time_seconds` limit
- **THEN** the budget controller signals budget exhaustion with reason `time_exceeded`

#### Scenario: Iteration limit exceeded
- **WHEN** the iteration count reaches the configured `max_iterations` limit
- **THEN** the budget controller signals budget exhaustion with reason `iterations_exceeded`

#### Scenario: Depth limit exceeded
- **WHEN** recursion depth (nested `rlm_query` calls) reaches the configured `max_depth` limit
- **THEN** the budget controller signals budget exhaustion with reason `depth_exceeded`

### Requirement: Default Budget Values
The budget controller SHALL use sensible defaults when limits are not explicitly configured: no cost limit, no token limit, 300 seconds time limit, 50 iterations, depth 3.

#### Scenario: Default limits applied
- **WHEN** no budget is specified in config or tool call
- **THEN** defaults are used: max_time=300s, max_iterations=50, max_depth=3, no cost/token limit

### Requirement: Budget Reporting
The budget controller SHALL report current usage alongside limits, enabling the engine to include budget status in execution traces.

#### Scenario: Usage snapshot
- **WHEN** the engine queries budget status
- **THEN** the controller returns current cost, tokens, elapsed time, iteration count, and depth along with their limits

### Requirement: Batch Concurrency Limit
The budget controller SHALL enforce a `max_batch_concurrency` limit controlling how many parallel sub-calls can execute simultaneously.

#### Scenario: Concurrency within limit
- **WHEN** 3 parallel sub-calls are requested and `max_batch_concurrency` is 5
- **THEN** all 3 execute concurrently

#### Scenario: Concurrency exceeds limit
- **WHEN** 8 parallel sub-calls are requested and `max_batch_concurrency` is 5
- **THEN** only 5 execute concurrently; the remaining 3 wait for slots
