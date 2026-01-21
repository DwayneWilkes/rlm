/**
 * @fileoverview Daemon module exports for RLM CLI.
 *
 * Provides both server and client implementations for the daemon:
 *
 * Server-side:
 * - WorkerPool: Manages a pool of NativePythonSandbox workers
 * - DaemonServer: IPC server using JSON-RPC over Unix sockets/named pipes
 * - PID utilities: Process management helpers
 *
 * Client-side:
 * - Detection utilities: Check if daemon is running
 * - IPCClient: Low-level JSON-RPC client
 * - DaemonClientSandbox: Sandbox implementation using daemon
 *
 * @module @rlm/cli/daemon
 *
 * @example Server usage
 * ```typescript
 * import { WorkerPool, DaemonServer, getDefaultSocketPath, writePID } from '@rlm/cli/daemon';
 *
 * // Create a pool of workers
 * const pool = new WorkerPool(4);
 *
 * // Start the IPC server
 * const server = new DaemonServer(pool, getDefaultSocketPath());
 * await server.start();
 *
 * // Write PID file for process management
 * writePID('/var/run/rlm-daemon.pid');
 *
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   await server.stop();
 *   await pool.shutdown();
 * });
 * ```
 *
 * @example Client usage
 * ```typescript
 * import { getSocketPath, isDaemonRunning, DaemonClientSandbox } from '@rlm/cli/daemon';
 *
 * if (await isDaemonRunning()) {
 *   const sandbox = new DaemonClientSandbox(getSocketPath(), bridges);
 *   await sandbox.initialize(context);
 *   const result = await sandbox.execute('print(1+1)');
 * }
 * ```
 */

// ============================================
// SERVER-SIDE EXPORTS
// ============================================

// Worker pool
export { WorkerPool, type PoolStats } from './pool.js';

// IPC server
export { DaemonServer, getDefaultSocketPath } from './server.js';

// PID utilities
export { writePID, readPID, cleanupPID, isProcessRunning } from './pid.js';

// Authentication utilities
export {
  getDefaultTokenPath,
  generateToken,
  writeToken,
  readToken,
  cleanupToken,
  validateToken,
} from './auth.js';

// ============================================
// CLIENT-SIDE EXPORTS
// ============================================

// Detection utilities
export {
  getSocketPath,
  isDaemonRunning,
  pingDaemon,
  type DaemonInfo,
} from './detect.js';

// IPC client
export { IPCClient, type IPCClientOptions } from './client.js';

// Daemon client sandbox
export { DaemonClientSandbox } from './client-sandbox.js';
