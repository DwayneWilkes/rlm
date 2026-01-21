# budget-controller Specification Delta

## ADDED Requirements

### Requirement: Budget Context Description

The system SHALL provide human-readable budget context for sub-RLMs.

#### Scenario: Get allocated budget description
- **WHEN** calling getAllocatedBudgetDescription(depth)
- **THEN** it SHALL return a formatted string with:
  - Allocated cost (50% of remaining)
  - Allocated iterations (50% of remaining)
  - Remaining depth
  - Parent's remaining budget for context

#### Scenario: Budget description format
- **WHEN** generating budget description
- **THEN** format SHALL include dollar amounts and iteration counts
- **AND** indicate the allocation is from parent's remaining budget

### Requirement: Budget-Based Depth Decision

The system SHALL support automatic depth downgrade decisions.

#### Scenario: Should downgrade check
- **WHEN** calling shouldDowngradeToLLMQuery()
- **THEN** it SHALL return true if remaining cost < $0.50 OR remaining iterations < 5

#### Scenario: Downgrade threshold configurability
- **WHEN** budget thresholds are set in config
- **THEN** shouldDowngradeToLLMQuery() SHALL use configured thresholds
