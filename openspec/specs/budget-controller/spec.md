# budget-controller Specification

## Purpose
TBD - created by archiving change add-core-specs. Update Purpose after archive.
## Requirements
### Requirement: Budget Limit Checking

The system SHALL enforce all budget limits.

#### Scenario: Cost limit check
- **WHEN** usage.cost >= budget.maxCost
- **THEN** canProceed SHALL return false

#### Scenario: Token limit check
- **WHEN** usage.tokens >= budget.maxTokens
- **THEN** canProceed SHALL return false

#### Scenario: Time limit check
- **WHEN** usage.duration >= budget.maxTime
- **THEN** canProceed SHALL return false

#### Scenario: Iteration limit check
- **WHEN** operation is 'iteration' and usage.iterations >= budget.maxIterations
- **THEN** canProceed SHALL return false

#### Scenario: Depth limit check
- **WHEN** operation is 'subcall' and depth >= budget.maxDepth
- **THEN** canProceed SHALL return false

### Requirement: Usage Recording

The system SHALL accurately track resource consumption.

#### Scenario: Record cost
- **WHEN** recording cost
- **THEN** usage.cost SHALL accumulate the value

#### Scenario: Record tokens
- **WHEN** recording inputTokens and outputTokens
- **THEN** usage.tokens SHALL equal sum of input and output tokens

#### Scenario: Record iteration
- **WHEN** recording iteration=true
- **THEN** usage.iterations SHALL increment by 1

#### Scenario: Record subcall
- **WHEN** recording subcall=true with depth
- **THEN** usage.subcalls SHALL increment and maxDepthReached SHALL update

### Requirement: Budget Warnings

The system SHALL emit warnings at threshold.

#### Scenario: Warning at 80% cost
- **WHEN** usage.cost reaches 80% of maxCost
- **THEN** onWarning callback SHALL be invoked once

#### Scenario: Warning at 80% tokens
- **WHEN** usage.tokens reaches 80% of maxTokens
- **THEN** onWarning callback SHALL be invoked once

#### Scenario: Warning at 80% time
- **WHEN** usage.duration reaches 80% of maxTime
- **THEN** onWarning callback SHALL be invoked once

#### Scenario: Single warning per limit
- **WHEN** a threshold warning has been sent
- **THEN** it SHALL NOT be sent again for that limit

### Requirement: Sub-Budget Allocation

The system SHALL allocate proportional budgets for recursive calls.

#### Scenario: Sub-budget calculation
- **WHEN** calling getSubBudget(depth)
- **THEN** it SHALL return 50% of remaining cost, tokens, and time

#### Scenario: Sub-budget depth reduction
- **WHEN** calling getSubBudget(depth)
- **THEN** maxDepth SHALL be reduced by (depth + 1)

#### Scenario: Sub-budget iterations
- **WHEN** calling getSubBudget(depth)
- **THEN** maxIterations SHALL be 50% of original

### Requirement: Status Reporting

The system SHALL report budget status.

#### Scenario: Get usage
- **WHEN** calling getUsage()
- **THEN** it SHALL return current Usage with updated duration

#### Scenario: Get remaining
- **WHEN** calling getRemaining()
- **THEN** it SHALL return remaining cost, tokens, time, depth, and iterations

#### Scenario: Get block reason
- **WHEN** a limit is exceeded
- **THEN** getBlockReason() SHALL return descriptive message

#### Scenario: No block reason
- **WHEN** all limits have headroom
- **THEN** getBlockReason() SHALL return null

