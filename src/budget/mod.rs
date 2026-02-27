use std::time::Instant;

use anyhow::{bail, Result};

use crate::types::{Budget, BudgetExhaustedReason, BudgetSnapshot};

/// Tracks resource consumption against configured limits.
pub struct BudgetController {
    budget: Budget,
    start: Instant,
    cost_usd: f64,
    input_tokens: u64,
    output_tokens: u64,
    iterations: u32,
    depth: u32,
}

impl BudgetController {
    pub fn new(budget: Budget) -> Self {
        Self {
            budget,
            start: Instant::now(),
            cost_usd: 0.0,
            input_tokens: 0,
            output_tokens: 0,
            iterations: 0,
            depth: 0,
        }
    }

    /// Check all budget limits. Returns the first violated limit, or None.
    pub fn check(&self) -> Option<BudgetExhaustedReason> {
        if let Some(max_cost) = self.budget.max_cost {
            if self.cost_usd >= max_cost {
                return Some(BudgetExhaustedReason::CostExceeded);
            }
        }

        if let Some(max_tokens) = self.budget.max_tokens {
            if self.total_tokens() >= max_tokens {
                return Some(BudgetExhaustedReason::TokensExceeded);
            }
        }

        let elapsed = self.start.elapsed().as_secs_f64();
        if elapsed >= self.budget.max_time_seconds as f64 {
            return Some(BudgetExhaustedReason::TimeExceeded);
        }

        if self.iterations >= self.budget.max_iterations {
            return Some(BudgetExhaustedReason::IterationsExceeded);
        }

        if self.depth >= self.budget.max_depth {
            return Some(BudgetExhaustedReason::DepthExceeded);
        }

        None
    }

    pub fn record_tokens(&mut self, input: u64, output: u64) {
        self.input_tokens += input;
        self.output_tokens += output;
    }

    pub fn record_cost(&mut self, cost: f64) {
        self.cost_usd += cost;
    }

    pub fn tick_iteration(&mut self) {
        self.iterations += 1;
    }

    pub fn push_depth(&mut self) -> Result<()> {
        if self.depth >= self.budget.max_depth {
            bail!(
                "depth limit reached ({}/{})",
                self.depth,
                self.budget.max_depth,
            );
        }
        self.depth += 1;
        Ok(())
    }

    pub fn pop_depth(&mut self) {
        self.depth = self.depth.saturating_sub(1);
    }

    pub fn snapshot(&self) -> BudgetSnapshot {
        BudgetSnapshot {
            cost_usd: self.cost_usd,
            total_tokens: self.total_tokens(),
            elapsed_seconds: self.start.elapsed().as_secs_f64(),
            iterations: self.iterations,
            depth: self.depth,
            limits: self.budget.clone(),
        }
    }

    pub fn batch_concurrency(&self) -> u32 {
        self.budget.max_batch_concurrency
    }

    fn total_tokens(&self) -> u64 {
        self.input_tokens + self.output_tokens
    }
}
