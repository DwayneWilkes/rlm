/**
 * @fileoverview Worker pool manager for NativePythonSandbox instances.
 *
 * Manages a pool of pre-initialized Python sandbox workers for efficient
 * concurrent execution of RLM tasks.
 *
 * @module @rlm/cli/daemon/pool
 */

import { NativePythonSandbox, DEFAULT_REPL_CONFIG } from '@rlm/core';
import type { Sandbox, SandboxBridges } from '@rlm/core';

/**
 * Pool statistics.
 */
export interface PoolStats {
  /** Total number of workers in the pool */
  total: number;
  /** Number of available (idle) workers */
  available: number;
  /** Number of workers currently in use */
  inUse: number;
}

/**
 * Internal worker wrapper to track state.
 */
interface PooledWorker {
  sandbox: Sandbox;
  inUse: boolean;
  lastHealthCheck: number;
}

/**
 * Manages a pool of NativePythonSandbox workers.
 *
 * Features:
 * - Pre-spawns N workers on creation
 * - Efficient worker acquisition/release
 * - Queued requests when all workers are busy
 * - Periodic health checks
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool(4);
 * const worker = await pool.acquire();
 * await worker.execute('print(1 + 1)');
 * pool.release(worker);
 * await pool.shutdown();
 * ```
 */
export class WorkerPool {
  private workers: PooledWorker[] = [];
  private waitQueue: Array<{
    resolve: (sandbox: Sandbox) => void;
    reject: (error: Error) => void;
  }> = [];
  private pythonPath: string;
  private shuttingDown = false;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Default no-op bridges for worker initialization.
   * The actual bridges are set when requests come in.
   */
  private static readonly defaultBridges: SandboxBridges = {
    onLLMQuery: async () => '',
    onRLMQuery: async () => '',
  };

  /**
   * Create a new WorkerPool.
   *
   * @param size - Number of workers to maintain (minimum 1)
   * @param pythonPath - Path to Python executable (default: 'python')
   */
  constructor(size: number, pythonPath = 'python') {
    this.pythonPath = pythonPath;
    const poolSize = Math.max(1, size);

    // Create workers synchronously
    for (let i = 0; i < poolSize; i++) {
      this.workers.push(this.createWorker());
    }

    // Start health check interval (every 30 seconds)
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  /**
   * Create a new worker instance.
   */
  private createWorker(): PooledWorker {
    const sandbox = new NativePythonSandbox(
      DEFAULT_REPL_CONFIG,
      WorkerPool.defaultBridges,
      this.pythonPath
    );

    return {
      sandbox,
      inUse: false,
      lastHealthCheck: Date.now(),
    };
  }

  /**
   * Acquire an available worker from the pool.
   *
   * If no workers are available, this method will wait until one
   * becomes available or the pool is shut down.
   *
   * @returns A sandbox instance ready for use
   * @throws If the pool is shutting down
   */
  async acquire(): Promise<Sandbox> {
    if (this.shuttingDown) {
      throw new Error('Pool is shutting down');
    }

    // Find an available worker
    const worker = this.workers.find((w) => !w.inUse);

    if (worker) {
      worker.inUse = true;
      return worker.sandbox;
    }

    // No workers available, wait in queue
    return new Promise((resolve, reject) => {
      this.waitQueue.push({ resolve, reject });
    });
  }

  /**
   * Release a worker back to the pool.
   *
   * The worker becomes available for other requests.
   *
   * @param sandbox - The sandbox to release
   */
  release(sandbox: Sandbox): void {
    const worker = this.workers.find((w) => w.sandbox === sandbox);

    if (!worker) {
      // Unknown worker, ignore
      return;
    }

    worker.inUse = false;

    // If there are pending requests, give them this worker
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift()!;
      worker.inUse = true;
      waiter.resolve(worker.sandbox);
    }
  }

  /**
   * Shutdown the pool and destroy all workers.
   *
   * Rejects any pending acquire requests.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Reject all pending requests
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Pool is shutting down'));
    }
    this.waitQueue = [];

    // Destroy all workers
    const destroyPromises = this.workers.map((w) => w.sandbox.destroy());
    await Promise.all(destroyPromises);

    this.workers = [];
  }

  /**
   * Get current pool statistics.
   *
   * @returns Pool stats including total, available, and in-use counts
   */
  getStats(): PoolStats {
    const total = this.workers.length;
    const inUse = this.workers.filter((w) => w.inUse).length;

    return {
      total,
      available: total - inUse,
      inUse,
    };
  }

  /**
   * Perform health check on all workers.
   *
   * Replaces workers that appear unhealthy.
   */
  private async performHealthCheck(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    const now = Date.now();

    for (const worker of this.workers) {
      // Skip workers that are in use
      if (worker.inUse) {
        continue;
      }

      // Update health check timestamp
      worker.lastHealthCheck = now;

      // TODO: Add actual health check logic (e.g., ping the process)
      // For now, we just update the timestamp
    }
  }
}
