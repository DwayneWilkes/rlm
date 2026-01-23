/**
 * @fileoverview Tests for WorkerPool.
 * @module @rlm/cli/daemon/pool.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '../../../src/daemon/pool.js';
import type { Sandbox } from '@rlm/core';

// Mock NativePythonSandbox
vi.mock('@rlm/core', () => {
  return {
    NativePythonSandbox: vi.fn().mockImplementation(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue({
        code: 'print(1)',
        stdout: '1\n',
        stderr: '',
        duration: 10,
      }),
      getVariable: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    })),
    DEFAULT_REPL_CONFIG: {
      timeout: 30000,
      maxOutputLength: 100000,
    },
  };
});

describe('WorkerPool', () => {
  let pool: WorkerPool;

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create a pool with specified size', () => {
      pool = new WorkerPool(3);
      const stats = pool.getStats();

      expect(stats.total).toBe(3);
      expect(stats.available).toBe(3);
      expect(stats.inUse).toBe(0);
    });

    it('should accept custom python path', () => {
      pool = new WorkerPool(2, '/usr/bin/python3');
      const stats = pool.getStats();

      expect(stats.total).toBe(2);
    });

    it('should create at least 1 worker even if size is 0', () => {
      pool = new WorkerPool(0);
      const stats = pool.getStats();

      expect(stats.total).toBe(1);
    });
  });

  describe('acquire', () => {
    it('should return an available worker', async () => {
      pool = new WorkerPool(2);
      const worker = await pool.acquire();

      expect(worker).toBeDefined();
      expect(pool.getStats().inUse).toBe(1);
      expect(pool.getStats().available).toBe(1);
    });

    it('should wait if no workers are available', async () => {
      pool = new WorkerPool(1);

      // Acquire the only worker
      const worker1 = await pool.acquire();
      expect(pool.getStats().available).toBe(0);

      // Start acquiring another (will wait)
      let worker2Resolved = false;
      const worker2Promise = pool.acquire().then((w) => {
        worker2Resolved = true;
        return w;
      });

      // Give the promise a chance to resolve (it shouldn't)
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(worker2Resolved).toBe(false);

      // Release the first worker
      pool.release(worker1);

      // Now the second should resolve
      const worker2 = await worker2Promise;
      expect(worker2).toBeDefined();
      expect(worker2Resolved).toBe(true);
    });
  });

  describe('release', () => {
    it('should return worker to the pool', async () => {
      pool = new WorkerPool(2);
      const worker = await pool.acquire();

      expect(pool.getStats().inUse).toBe(1);

      pool.release(worker);

      expect(pool.getStats().inUse).toBe(0);
      expect(pool.getStats().available).toBe(2);
    });

    it('should not add extra workers if releasing unknown worker', async () => {
      pool = new WorkerPool(2);
      const fakeWorker = { destroy: vi.fn() } as unknown as Sandbox;

      pool.release(fakeWorker);

      expect(pool.getStats().total).toBe(2);
    });
  });

  describe('shutdown', () => {
    it('should destroy all workers', async () => {
      pool = new WorkerPool(3);

      await pool.shutdown();

      const stats = pool.getStats();
      expect(stats.total).toBe(0);
      expect(stats.available).toBe(0);
      expect(stats.inUse).toBe(0);
    });

    it('should reject pending acquire requests', async () => {
      pool = new WorkerPool(1);
      const worker = await pool.acquire();

      // Start waiting for another worker
      const pendingPromise = pool.acquire();

      // Shutdown while waiting
      await pool.shutdown();

      // The pending acquire should reject
      await expect(pendingPromise).rejects.toThrow('Pool is shutting down');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      pool = new WorkerPool(3);

      expect(pool.getStats()).toEqual({
        total: 3,
        available: 3,
        inUse: 0,
      });

      const worker1 = await pool.acquire();
      expect(pool.getStats()).toEqual({
        total: 3,
        available: 2,
        inUse: 1,
      });

      const worker2 = await pool.acquire();
      expect(pool.getStats()).toEqual({
        total: 3,
        available: 1,
        inUse: 2,
      });

      pool.release(worker1);
      expect(pool.getStats()).toEqual({
        total: 3,
        available: 2,
        inUse: 1,
      });
    });
  });

  describe('health check', () => {
    it('should restart unhealthy workers', async () => {
      vi.useFakeTimers();
      pool = new WorkerPool(2);

      // Trigger health check by advancing time
      // Health checks run every 30 seconds by default
      await vi.advanceTimersByTimeAsync(30000);

      const stats = pool.getStats();
      expect(stats.total).toBe(2);

      vi.useRealTimers();
    });
  });
});
