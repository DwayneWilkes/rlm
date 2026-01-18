/**
 * @fileoverview Tests for BudgetController.
 *
 * Following TDD: tests written first, then implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BudgetController } from './controller.js';
import { DEFAULT_BUDGET } from '../types.js';

describe('BudgetController', () => {
  // Use fake timers for time-dependent tests
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with default budget when none provided', () => {
      const controller = new BudgetController();
      const usage = controller.getUsage();

      expect(usage.cost).toBe(0);
      expect(usage.tokens).toBe(0);
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBe(0);
      expect(usage.iterations).toBe(0);
      expect(usage.subcalls).toBe(0);
      expect(usage.maxDepthReached).toBe(0);
    });

    it('merges provided budget with defaults', () => {
      const controller = new BudgetController({ maxCost: 1.0, maxDepth: 5 });
      const remaining = controller.getRemaining();

      expect(remaining.cost).toBe(1.0);
      expect(remaining.depth).toBe(5);
      // Default values should be preserved
      expect(remaining.tokens).toBe(DEFAULT_BUDGET.maxTokens);
      expect(remaining.iterations).toBe(DEFAULT_BUDGET.maxIterations);
    });

    it('accepts a warning handler callback', () => {
      const onWarning = vi.fn();
      const controller = new BudgetController({ maxCost: 1.0 }, onWarning);

      // Record 80% of cost to trigger warning
      controller.record({ cost: 0.8 });
      controller.canProceed('iteration');

      expect(onWarning).toHaveBeenCalled();
    });
  });

  describe('canProceed', () => {
    describe('cost limit check', () => {
      it('returns true when cost is under limit', () => {
        const controller = new BudgetController({ maxCost: 1.0 });
        controller.record({ cost: 0.5 });

        expect(controller.canProceed('iteration')).toBe(true);
      });

      it('returns false when cost reaches limit', () => {
        const controller = new BudgetController({ maxCost: 1.0 });
        controller.record({ cost: 1.0 });

        expect(controller.canProceed('iteration')).toBe(false);
      });

      it('returns false when cost exceeds limit', () => {
        const controller = new BudgetController({ maxCost: 1.0 });
        controller.record({ cost: 1.5 });

        expect(controller.canProceed('iteration')).toBe(false);
      });
    });

    describe('token limit check', () => {
      it('returns true when tokens are under limit', () => {
        const controller = new BudgetController({ maxTokens: 1000 });
        controller.record({ inputTokens: 400, outputTokens: 100 });

        expect(controller.canProceed('iteration')).toBe(true);
      });

      it('returns false when tokens reach limit', () => {
        const controller = new BudgetController({ maxTokens: 1000 });
        controller.record({ inputTokens: 600, outputTokens: 400 });

        expect(controller.canProceed('iteration')).toBe(false);
      });

      it('returns false when tokens exceed limit', () => {
        const controller = new BudgetController({ maxTokens: 1000 });
        controller.record({ inputTokens: 800, outputTokens: 500 });

        expect(controller.canProceed('iteration')).toBe(false);
      });
    });

    describe('time limit check', () => {
      it('returns true when time is under limit', () => {
        const controller = new BudgetController({ maxTime: 10000 });
        vi.advanceTimersByTime(5000);

        expect(controller.canProceed('iteration')).toBe(true);
      });

      it('returns false when time reaches limit', () => {
        const controller = new BudgetController({ maxTime: 10000 });
        vi.advanceTimersByTime(10000);

        expect(controller.canProceed('iteration')).toBe(false);
      });

      it('returns false when time exceeds limit', () => {
        const controller = new BudgetController({ maxTime: 10000 });
        vi.advanceTimersByTime(15000);

        expect(controller.canProceed('iteration')).toBe(false);
      });
    });

    describe('iteration limit check', () => {
      it('returns true when iterations are under limit', () => {
        const controller = new BudgetController({ maxIterations: 10 });
        for (let i = 0; i < 5; i++) {
          controller.record({ iteration: true });
        }

        expect(controller.canProceed('iteration')).toBe(true);
      });

      it('returns false when iterations reach limit', () => {
        const controller = new BudgetController({ maxIterations: 10 });
        for (let i = 0; i < 10; i++) {
          controller.record({ iteration: true });
        }

        expect(controller.canProceed('iteration')).toBe(false);
      });

      it('does not check iteration limit for subcall operations', () => {
        const controller = new BudgetController({ maxIterations: 10, maxDepth: 5 });
        for (let i = 0; i < 10; i++) {
          controller.record({ iteration: true });
        }

        // Subcall should not be blocked by iteration limit
        expect(controller.canProceed('subcall', 0)).toBe(true);
      });
    });

    describe('depth limit check', () => {
      it('returns true when depth is under limit', () => {
        const controller = new BudgetController({ maxDepth: 3 });

        expect(controller.canProceed('subcall', 1)).toBe(true);
      });

      it('returns false when depth reaches limit', () => {
        const controller = new BudgetController({ maxDepth: 3 });

        expect(controller.canProceed('subcall', 3)).toBe(false);
      });

      it('returns false when depth exceeds limit', () => {
        const controller = new BudgetController({ maxDepth: 3 });

        expect(controller.canProceed('subcall', 5)).toBe(false);
      });

      it('does not check depth limit for iteration operations', () => {
        const controller = new BudgetController({ maxDepth: 0, maxIterations: 10 });

        // Iteration should not be blocked by depth limit
        expect(controller.canProceed('iteration')).toBe(true);
      });

      it('uses depth 0 when depth is not provided for subcall', () => {
        const controller = new BudgetController({ maxDepth: 0 });

        // depth=0 should hit maxDepth=0
        expect(controller.canProceed('subcall')).toBe(false);
      });
    });
  });

  describe('record', () => {
    describe('cost recording', () => {
      it('accumulates cost correctly', () => {
        const controller = new BudgetController({ maxCost: 10.0 });

        controller.record({ cost: 0.5 });
        expect(controller.getUsage().cost).toBe(0.5);

        controller.record({ cost: 0.3 });
        expect(controller.getUsage().cost).toBeCloseTo(0.8, 10);

        controller.record({ cost: 0.7 });
        expect(controller.getUsage().cost).toBeCloseTo(1.5, 10);
      });
    });

    describe('token recording', () => {
      it('accumulates input tokens correctly', () => {
        const controller = new BudgetController();

        controller.record({ inputTokens: 100 });
        expect(controller.getUsage().inputTokens).toBe(100);
        expect(controller.getUsage().tokens).toBe(100);

        controller.record({ inputTokens: 50 });
        expect(controller.getUsage().inputTokens).toBe(150);
        expect(controller.getUsage().tokens).toBe(150);
      });

      it('accumulates output tokens correctly', () => {
        const controller = new BudgetController();

        controller.record({ outputTokens: 200 });
        expect(controller.getUsage().outputTokens).toBe(200);
        expect(controller.getUsage().tokens).toBe(200);

        controller.record({ outputTokens: 100 });
        expect(controller.getUsage().outputTokens).toBe(300);
        expect(controller.getUsage().tokens).toBe(300);
      });

      it('accumulates both input and output tokens to total', () => {
        const controller = new BudgetController();

        controller.record({ inputTokens: 100, outputTokens: 50 });
        expect(controller.getUsage().tokens).toBe(150);

        controller.record({ inputTokens: 200, outputTokens: 100 });
        expect(controller.getUsage().tokens).toBe(450);
      });
    });

    describe('iteration recording', () => {
      it('increments iterations when iteration=true', () => {
        const controller = new BudgetController();

        controller.record({ iteration: true });
        expect(controller.getUsage().iterations).toBe(1);

        controller.record({ iteration: true });
        expect(controller.getUsage().iterations).toBe(2);
      });

      it('does not increment iterations when iteration=false', () => {
        const controller = new BudgetController();

        controller.record({ iteration: false });
        expect(controller.getUsage().iterations).toBe(0);
      });
    });

    describe('subcall recording', () => {
      it('increments subcalls when subcall=true', () => {
        const controller = new BudgetController();

        controller.record({ subcall: true });
        expect(controller.getUsage().subcalls).toBe(1);

        controller.record({ subcall: true });
        expect(controller.getUsage().subcalls).toBe(2);
      });

      it('does not increment subcalls when subcall=false', () => {
        const controller = new BudgetController();

        controller.record({ subcall: false });
        expect(controller.getUsage().subcalls).toBe(0);
      });

      it('updates maxDepthReached when depth is provided', () => {
        const controller = new BudgetController();

        controller.record({ subcall: true, depth: 1 });
        expect(controller.getUsage().maxDepthReached).toBe(1);

        controller.record({ subcall: true, depth: 2 });
        expect(controller.getUsage().maxDepthReached).toBe(2);

        // Should not decrease
        controller.record({ subcall: true, depth: 1 });
        expect(controller.getUsage().maxDepthReached).toBe(2);
      });

      it('records depth 0 correctly', () => {
        const controller = new BudgetController();

        controller.record({ subcall: true, depth: 0 });
        expect(controller.getUsage().maxDepthReached).toBe(0);

        controller.record({ subcall: true, depth: 1 });
        expect(controller.getUsage().maxDepthReached).toBe(1);
      });
    });

    describe('combined recording', () => {
      it('handles multiple fields in single record call', () => {
        const controller = new BudgetController();

        controller.record({
          cost: 0.5,
          inputTokens: 100,
          outputTokens: 50,
          iteration: true,
          subcall: true,
          depth: 1,
        });

        const usage = controller.getUsage();
        expect(usage.cost).toBe(0.5);
        expect(usage.inputTokens).toBe(100);
        expect(usage.outputTokens).toBe(50);
        expect(usage.tokens).toBe(150);
        expect(usage.iterations).toBe(1);
        expect(usage.subcalls).toBe(1);
        expect(usage.maxDepthReached).toBe(1);
      });
    });
  });

  describe('getSubBudget', () => {
    describe('cost allocation', () => {
      it('allocates 50% of remaining cost', () => {
        const controller = new BudgetController({ maxCost: 10.0 });
        controller.record({ cost: 2.0 }); // 8.0 remaining

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxCost).toBe(4.0); // 50% of 8.0
      });

      it('handles zero remaining cost', () => {
        const controller = new BudgetController({ maxCost: 1.0 });
        controller.record({ cost: 1.0 });

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxCost).toBe(0);
      });
    });

    describe('token allocation', () => {
      it('allocates 50% of remaining tokens', () => {
        const controller = new BudgetController({ maxTokens: 10000 });
        controller.record({ inputTokens: 2000 }); // 8000 remaining

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxTokens).toBe(4000); // 50% of 8000
      });
    });

    describe('time allocation', () => {
      it('allocates 50% of remaining time', () => {
        const controller = new BudgetController({ maxTime: 10000 });
        vi.advanceTimersByTime(2000); // 8000 remaining

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxTime).toBe(4000); // 50% of 8000
      });
    });

    describe('depth reduction', () => {
      it('reduces maxDepth by (depth + 1)', () => {
        const controller = new BudgetController({ maxDepth: 5 });

        expect(controller.getSubBudget(0).maxDepth).toBe(4); // 5 - (0 + 1) = 4
        expect(controller.getSubBudget(1).maxDepth).toBe(3); // 5 - (1 + 1) = 3
        expect(controller.getSubBudget(2).maxDepth).toBe(2); // 5 - (2 + 1) = 2
      });

      it('returns 0 when depth reduction goes negative', () => {
        const controller = new BudgetController({ maxDepth: 2 });

        expect(controller.getSubBudget(2).maxDepth).toBe(0); // max(0, 2 - 3) = 0
        expect(controller.getSubBudget(5).maxDepth).toBe(0); // max(0, 2 - 6) = 0
      });
    });

    describe('iteration allocation', () => {
      it('allocates 50% of original maxIterations', () => {
        const controller = new BudgetController({ maxIterations: 20 });
        controller.record({ iteration: true }); // Use some iterations

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxIterations).toBe(10); // 50% of 20 (original)
      });

      it('rounds up for odd maxIterations', () => {
        const controller = new BudgetController({ maxIterations: 15 });

        const subBudget = controller.getSubBudget(0);
        expect(subBudget.maxIterations).toBe(8); // ceil(15 * 0.5) = 8
      });
    });
  });

  describe('getUsage', () => {
    it('returns current usage with updated duration', () => {
      const controller = new BudgetController();
      controller.record({ cost: 0.5, inputTokens: 100, iteration: true });
      vi.advanceTimersByTime(5000);

      const usage = controller.getUsage();

      expect(usage.cost).toBe(0.5);
      expect(usage.inputTokens).toBe(100);
      expect(usage.tokens).toBe(100);
      expect(usage.iterations).toBe(1);
      expect(usage.duration).toBe(5000);
    });

    it('returns a copy, not a reference to internal state', () => {
      const controller = new BudgetController();
      const usage1 = controller.getUsage();
      usage1.cost = 999;

      const usage2 = controller.getUsage();
      expect(usage2.cost).toBe(0); // Should not be affected
    });
  });

  describe('getRemaining', () => {
    it('returns remaining budget for all limits', () => {
      const controller = new BudgetController({
        maxCost: 10.0,
        maxTokens: 10000,
        maxTime: 10000,
        maxDepth: 5,
        maxIterations: 20,
      });

      controller.record({ cost: 2.0, inputTokens: 3000, iteration: true });
      vi.advanceTimersByTime(2000);

      const remaining = controller.getRemaining();

      expect(remaining.cost).toBe(8.0);
      expect(remaining.tokens).toBe(7000);
      expect(remaining.time).toBe(8000);
      expect(remaining.depth).toBe(5);
      expect(remaining.iterations).toBe(19);
    });

    it('returns 0 for negative remaining values', () => {
      const controller = new BudgetController({ maxCost: 1.0, maxTokens: 100 });
      controller.record({ cost: 2.0, inputTokens: 200 });

      const remaining = controller.getRemaining();

      expect(remaining.cost).toBe(0);
      expect(remaining.tokens).toBe(0);
    });
  });

  describe('getBlockReason', () => {
    it('returns null when all limits have headroom', () => {
      const controller = new BudgetController();

      expect(controller.getBlockReason()).toBeNull();
    });

    it('returns cost message when cost exceeded', () => {
      const controller = new BudgetController({ maxCost: 1.0 });
      controller.record({ cost: 1.0 });

      expect(controller.getBlockReason()).toBe('Cost budget exhausted');
    });

    it('returns token message when tokens exceeded', () => {
      const controller = new BudgetController({ maxTokens: 100 });
      controller.record({ inputTokens: 100 });

      expect(controller.getBlockReason()).toBe('Token budget exhausted');
    });

    it('returns time message when time exceeded', () => {
      const controller = new BudgetController({ maxTime: 1000 });
      vi.advanceTimersByTime(1000);

      expect(controller.getBlockReason()).toBe('Time budget exhausted');
    });

    it('returns iteration message when iterations exceeded', () => {
      const controller = new BudgetController({ maxIterations: 5 });
      for (let i = 0; i < 5; i++) {
        controller.record({ iteration: true });
      }

      expect(controller.getBlockReason()).toBe('Max iterations reached');
    });

    it('returns first reason when multiple limits exceeded', () => {
      const controller = new BudgetController({
        maxCost: 1.0,
        maxTokens: 100,
      });
      controller.record({ cost: 1.0, inputTokens: 100 });

      // Should return cost first (checked first in implementation)
      expect(controller.getBlockReason()).toBe('Cost budget exhausted');
    });
  });

  describe('budget warnings', () => {
    describe('cost warning at 80%', () => {
      it('fires warning when cost reaches 80%', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxCost: 10.0 }, onWarning);

        controller.record({ cost: 7.9 });
        controller.canProceed('iteration');
        expect(onWarning).not.toHaveBeenCalled();

        controller.record({ cost: 0.1 }); // Total: 8.0 = 80%
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);
        expect(onWarning).toHaveBeenCalledWith(
          expect.stringMatching(/cost.*80%/i)
        );
      });

      it('fires warning only once for cost', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxCost: 10.0 }, onWarning);

        controller.record({ cost: 8.0 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);

        controller.record({ cost: 0.5 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1); // Still 1, not 2
      });
    });

    describe('token warning at 80%', () => {
      it('fires warning when tokens reach 80%', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxTokens: 1000 }, onWarning);

        controller.record({ inputTokens: 799 });
        controller.canProceed('iteration');
        expect(onWarning).not.toHaveBeenCalled();

        controller.record({ inputTokens: 1 }); // Total: 800 = 80%
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);
        expect(onWarning).toHaveBeenCalledWith(
          expect.stringMatching(/tokens.*80%/i)
        );
      });

      it('fires warning only once for tokens', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxTokens: 1000 }, onWarning);

        controller.record({ inputTokens: 800 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);

        controller.record({ inputTokens: 100 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);
      });
    });

    describe('time warning at 80%', () => {
      it('fires warning when time reaches 80%', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxTime: 10000 }, onWarning);

        vi.advanceTimersByTime(7999);
        controller.canProceed('iteration');
        expect(onWarning).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1); // Total: 8000 = 80%
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);
        expect(onWarning).toHaveBeenCalledWith(
          expect.stringMatching(/time.*80%/i)
        );
      });

      it('fires warning only once for time', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController({ maxTime: 10000 }, onWarning);

        vi.advanceTimersByTime(8000);
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1000);
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);
      });
    });

    describe('multiple warnings', () => {
      it('fires separate warnings for each limit type', () => {
        const onWarning = vi.fn();
        const controller = new BudgetController(
          { maxCost: 10.0, maxTokens: 1000, maxTime: 10000 },
          onWarning
        );

        // Trigger cost warning
        controller.record({ cost: 8.0 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(1);

        // Trigger token warning
        controller.record({ inputTokens: 800 });
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(2);

        // Trigger time warning
        vi.advanceTimersByTime(8000);
        controller.canProceed('iteration');
        expect(onWarning).toHaveBeenCalledTimes(3);
      });
    });

    describe('no warning handler', () => {
      it('does not throw when no warning handler provided', () => {
        const controller = new BudgetController({ maxCost: 10.0 });
        controller.record({ cost: 8.0 });

        expect(() => controller.canProceed('iteration')).not.toThrow();
      });
    });
  });
});
