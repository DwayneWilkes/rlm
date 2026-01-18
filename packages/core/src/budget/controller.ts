/**
 * @fileoverview Budget enforcement for RLM execution.
 *
 * The BudgetController tracks resource consumption (cost, tokens, time,
 * iterations, depth) and enforces limits to prevent runaway execution.
 *
 * @module @rlm/core/budget
 */

import type { Budget, Usage } from '../types.js';
import { DEFAULT_BUDGET } from '../types.js';

/**
 * Callback type for budget warning notifications.
 */
export type BudgetWarningHandler = (warning: string) => void;

/**
 * Controls and enforces budget limits during RLM execution.
 *
 * Tracks resource consumption across cost, tokens, time, iterations,
 * and recursion depth. Emits warnings at 80% threshold and blocks
 * operations when limits are exceeded.
 *
 * @example
 * ```typescript
 * const budget = new BudgetController(
 *   { maxCost: 1.0, maxIterations: 10 },
 *   (warning) => console.warn(warning)
 * );
 *
 * while (budget.canProceed('iteration')) {
 *   budget.record({ iteration: true, cost: 0.05, inputTokens: 100 });
 *   // ... do work
 * }
 *
 * console.log(budget.getUsage());
 * ```
 */
export class BudgetController {
  private readonly budget: Budget;
  private readonly usage: Usage;
  private readonly startTime: number;
  private readonly warningHandler?: BudgetWarningHandler;
  private readonly warningsSent: Set<string> = new Set();

  /**
   * Create a new BudgetController.
   *
   * @param budget - Partial budget config to merge with defaults
   * @param onWarning - Optional callback for 80% threshold warnings
   */
  constructor(budget: Partial<Budget> = {}, onWarning?: BudgetWarningHandler) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.warningHandler = onWarning;
    this.startTime = Date.now();
    this.usage = {
      cost: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      duration: 0,
      iterations: 0,
      subcalls: 0,
      maxDepthReached: 0,
    };
  }

  /**
   * Check if an operation is allowed within budget.
   *
   * For 'iteration' operations: checks cost, tokens, time, and iteration limits.
   * For 'subcall' operations: checks cost, tokens, time, and depth limits.
   *
   * Also triggers 80% threshold warnings when applicable.
   *
   * @param operation - Type of operation to check ('iteration' or 'subcall')
   * @param depth - Current recursion depth (required for 'subcall' operations)
   * @returns true if operation can proceed, false if blocked
   */
  canProceed(operation: 'iteration' | 'subcall', depth?: number): boolean {
    this.updateDuration();

    // Hard limits - checked for all operations
    if (this.usage.cost >= this.budget.maxCost) {
      return false;
    }
    if (this.usage.tokens >= this.budget.maxTokens) {
      return false;
    }
    if (this.usage.duration >= this.budget.maxTime) {
      return false;
    }

    // Operation-specific limits
    if (
      operation === 'iteration' &&
      this.usage.iterations >= this.budget.maxIterations
    ) {
      return false;
    }
    if (operation === 'subcall' && (depth ?? 0) >= this.budget.maxDepth) {
      return false;
    }

    // Check and emit warnings at 80% threshold
    this.checkWarnings();

    return true;
  }

  /**
   * Record usage from an operation.
   *
   * Accumulates cost, tokens, iterations, and subcall counts.
   * Also updates maxDepthReached if depth is provided.
   *
   * @param update - Usage update object with optional fields
   */
  record(update: {
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
    iteration?: boolean;
    subcall?: boolean;
    depth?: number;
  }): void {
    if (update.cost) {
      this.usage.cost += update.cost;
    }
    if (update.inputTokens) {
      this.usage.inputTokens += update.inputTokens;
      this.usage.tokens += update.inputTokens;
    }
    if (update.outputTokens) {
      this.usage.outputTokens += update.outputTokens;
      this.usage.tokens += update.outputTokens;
    }
    if (update.iteration) {
      this.usage.iterations++;
    }
    if (update.subcall) {
      this.usage.subcalls++;
    }
    if (update.depth !== undefined) {
      this.usage.maxDepthReached = Math.max(
        this.usage.maxDepthReached,
        update.depth
      );
    }
    this.updateDuration();
  }

  /**
   * Get a sub-budget for a recursive call.
   *
   * Allocates 50% of remaining resources (cost, tokens, time) and
   * reduces maxDepth by (depth + 1). maxIterations is 50% of original.
   *
   * @param depth - Current recursion depth
   * @returns Partial budget for the subcall
   */
  getSubBudget(depth: number): Partial<Budget> {
    const remaining = this.getRemaining();
    return {
      maxCost: remaining.cost * 0.5,
      maxTokens: remaining.tokens * 0.5,
      maxTime: remaining.time * 0.5,
      maxDepth: Math.max(0, this.budget.maxDepth - depth - 1),
      maxIterations: Math.ceil(this.budget.maxIterations * 0.5),
    };
  }

  /**
   * Get current usage statistics.
   *
   * Returns a copy of the usage object with updated duration.
   *
   * @returns Current Usage stats
   */
  getUsage(): Usage {
    this.updateDuration();
    return { ...this.usage };
  }

  /**
   * Get remaining budget.
   *
   * Returns the difference between budget limits and current usage.
   * Values are clamped to 0 (no negative remaining).
   *
   * @returns Remaining budget for each limit type
   */
  getRemaining(): {
    cost: number;
    tokens: number;
    time: number;
    depth: number;
    iterations: number;
  } {
    this.updateDuration();
    return {
      cost: Math.max(0, this.budget.maxCost - this.usage.cost),
      tokens: Math.max(0, this.budget.maxTokens - this.usage.tokens),
      time: Math.max(0, this.budget.maxTime - this.usage.duration),
      depth: this.budget.maxDepth,
      iterations: Math.max(
        0,
        this.budget.maxIterations - this.usage.iterations
      ),
    };
  }

  /**
   * Get the reason execution cannot proceed (if any).
   *
   * Checks limits in order: cost, tokens, time, iterations.
   * Note: depth is not checked here as it's context-dependent.
   *
   * @returns Descriptive message if blocked, null if can proceed
   */
  getBlockReason(): string | null {
    this.updateDuration();

    if (this.usage.cost >= this.budget.maxCost) {
      return 'Cost budget exhausted';
    }
    if (this.usage.tokens >= this.budget.maxTokens) {
      return 'Token budget exhausted';
    }
    if (this.usage.duration >= this.budget.maxTime) {
      return 'Time budget exhausted';
    }
    if (this.usage.iterations >= this.budget.maxIterations) {
      return 'Max iterations reached';
    }
    return null;
  }

  /**
   * Update duration from elapsed time since construction.
   */
  private updateDuration(): void {
    this.usage.duration = Date.now() - this.startTime;
  }

  /**
   * Check and emit warnings at 80% threshold.
   *
   * Each warning type (cost, tokens, time) is only emitted once.
   */
  private checkWarnings(): void {
    const threshold = 0.8;

    const costPct = this.usage.cost / this.budget.maxCost;
    if (costPct >= threshold && !this.warningsSent.has('cost')) {
      this.warn(`Cost at ${(costPct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('cost');
    }

    const tokenPct = this.usage.tokens / this.budget.maxTokens;
    if (tokenPct >= threshold && !this.warningsSent.has('tokens')) {
      this.warn(`Tokens at ${(tokenPct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('tokens');
    }

    const timePct = this.usage.duration / this.budget.maxTime;
    if (timePct >= threshold && !this.warningsSent.has('time')) {
      this.warn(`Time at ${(timePct * 100).toFixed(0)}% of budget`);
      this.warningsSent.add('time');
    }
  }

  /**
   * Emit a warning via the handler if configured.
   */
  private warn(message: string): void {
    this.warningHandler?.(message);
  }
}
