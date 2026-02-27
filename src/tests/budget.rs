use crate::budget::BudgetController;
use crate::types::{Budget, BudgetExhaustedReason};

use super::fixtures::budget_with_defaults;

#[test]
fn cost_exceeded_triggers_violation() {
    let budget = Budget {
        max_cost: Some(1.00),
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);
    assert!(ctrl.check().is_none());

    ctrl.record_cost(0.50);
    assert!(ctrl.check().is_none());

    ctrl.record_cost(0.50);
    assert_eq!(ctrl.check(), Some(BudgetExhaustedReason::CostExceeded));
}

#[test]
fn no_cost_limit_means_no_cost_violation() {
    let budget = Budget {
        max_cost: None,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);
    ctrl.record_cost(999_999.0);
    assert_ne!(ctrl.check(), Some(BudgetExhaustedReason::CostExceeded));
}

#[test]
fn tokens_exceeded_triggers_violation() {
    let budget = Budget {
        max_tokens: Some(1000),
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);
    assert!(ctrl.check().is_none());

    ctrl.record_tokens(400, 300);
    assert!(ctrl.check().is_none());

    ctrl.record_tokens(200, 100);
    assert_eq!(ctrl.check(), Some(BudgetExhaustedReason::TokensExceeded));
}

#[test]
fn no_token_limit_means_no_token_violation() {
    let budget = Budget {
        max_tokens: None,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);
    ctrl.record_tokens(1_000_000, 1_000_000);
    assert_ne!(ctrl.check(), Some(BudgetExhaustedReason::TokensExceeded));
}

#[test]
fn time_exceeded_triggers_violation() {
    let budget = Budget {
        max_time_seconds: 0,
        ..budget_with_defaults()
    };
    let ctrl = BudgetController::new(budget);
    assert_eq!(ctrl.check(), Some(BudgetExhaustedReason::TimeExceeded));
}

#[test]
fn generous_time_budget_does_not_trigger() {
    let budget = Budget {
        max_time_seconds: 3600,
        ..budget_with_defaults()
    };
    let ctrl = BudgetController::new(budget);
    assert_ne!(ctrl.check(), Some(BudgetExhaustedReason::TimeExceeded));
}

#[test]
fn iterations_exceeded_triggers_violation() {
    let budget = Budget {
        max_iterations: 3,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);

    ctrl.tick_iteration();
    ctrl.tick_iteration();
    assert!(ctrl.check().is_none());

    ctrl.tick_iteration();
    assert_eq!(
        ctrl.check(),
        Some(BudgetExhaustedReason::IterationsExceeded)
    );
}

#[test]
fn depth_exceeded_triggers_violation() {
    let budget = Budget {
        max_depth: 2,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);

    ctrl.push_depth().unwrap();
    assert!(ctrl.check().is_none());

    ctrl.push_depth().unwrap();
    assert_eq!(ctrl.check(), Some(BudgetExhaustedReason::DepthExceeded));
}

#[test]
fn push_depth_beyond_limit_returns_error() {
    let budget = Budget {
        max_depth: 1,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);

    ctrl.push_depth().unwrap();
    let err = ctrl.push_depth();
    assert!(err.is_err());
    assert!(err.unwrap_err().to_string().contains("depth limit reached"));
}

#[test]
fn push_and_pop_depth_tracks_correctly() {
    let budget = Budget {
        max_depth: 3,
        ..budget_with_defaults()
    };
    let mut ctrl = BudgetController::new(budget);

    assert_eq!(ctrl.snapshot().depth, 0);
    ctrl.push_depth().unwrap();
    assert_eq!(ctrl.snapshot().depth, 1);
    ctrl.push_depth().unwrap();
    assert_eq!(ctrl.snapshot().depth, 2);
    ctrl.pop_depth();
    assert_eq!(ctrl.snapshot().depth, 1);
    ctrl.pop_depth();
    assert_eq!(ctrl.snapshot().depth, 0);
}

#[test]
fn pop_depth_saturates_at_zero() {
    let mut ctrl = BudgetController::new(budget_with_defaults());
    ctrl.pop_depth();
    assert_eq!(ctrl.snapshot().depth, 0);
}

#[test]
fn default_budget_allows_reasonable_usage() {
    let mut ctrl = BudgetController::new(budget_with_defaults());
    ctrl.record_tokens(5000, 2000);
    ctrl.record_cost(0.10);
    ctrl.tick_iteration();
    ctrl.tick_iteration();
    ctrl.tick_iteration();
    assert!(
        ctrl.check().is_none(),
        "default budget should allow moderate usage"
    );
}

#[test]
fn snapshot_returns_accurate_data() {
    let budget = Budget {
        max_cost: Some(5.0),
        max_tokens: Some(100_000),
        max_time_seconds: 600,
        max_iterations: 20,
        max_depth: 4,
        max_batch_concurrency: 8,
    };
    let mut ctrl = BudgetController::new(budget);

    ctrl.record_tokens(1000, 500);
    ctrl.record_tokens(200, 100);
    ctrl.record_cost(0.25);
    ctrl.record_cost(0.10);
    ctrl.tick_iteration();
    ctrl.tick_iteration();
    ctrl.push_depth().unwrap();

    let snap = ctrl.snapshot();

    assert_eq!(snap.total_tokens, 1800);
    assert!((snap.cost_usd - 0.35).abs() < f64::EPSILON);
    assert_eq!(snap.iterations, 2);
    assert_eq!(snap.depth, 1);
    assert!(snap.elapsed_seconds >= 0.0);
    assert_eq!(snap.limits.max_cost, Some(5.0));
    assert_eq!(snap.limits.max_tokens, Some(100_000));
    assert_eq!(snap.limits.max_time_seconds, 600);
    assert_eq!(snap.limits.max_iterations, 20);
    assert_eq!(snap.limits.max_depth, 4);
    assert_eq!(snap.limits.max_batch_concurrency, 8);
}

#[test]
fn batch_concurrency_returns_configured_value() {
    let budget = Budget {
        max_batch_concurrency: 10,
        ..budget_with_defaults()
    };
    let ctrl = BudgetController::new(budget);
    assert_eq!(ctrl.batch_concurrency(), 10);
}

#[test]
fn batch_concurrency_default_is_five() {
    let ctrl = BudgetController::new(budget_with_defaults());
    assert_eq!(ctrl.batch_concurrency(), 5);
}

#[test]
fn check_returns_first_violation_in_priority_order() {
    let budget = Budget {
        max_cost: Some(0.0),
        max_tokens: Some(0),
        max_time_seconds: 0,
        max_iterations: 0,
        max_depth: 0,
        max_batch_concurrency: 1,
    };
    let ctrl = BudgetController::new(budget);
    assert_eq!(ctrl.check(), Some(BudgetExhaustedReason::CostExceeded));
}
