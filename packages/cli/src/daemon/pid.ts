/**
 * @fileoverview PID file management utilities for daemon process.
 *
 * Provides functions for managing the daemon PID file, which is used
 * to track whether a daemon is already running and to enable graceful
 * shutdown coordination.
 *
 * @module @rlm/cli/daemon/pid
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Write the current process PID to a file.
 *
 * Creates parent directories if they don't exist.
 *
 * @param pidPath - Path to the PID file
 *
 * @example
 * ```typescript
 * writePID('/var/run/rlm-daemon.pid');
 * ```
 */
export function writePID(pidPath: string): void {
  const dir = path.dirname(pidPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(pidPath, `${process.pid}\n`, 'utf-8');
}

/**
 * Read a PID from a file.
 *
 * @param pidPath - Path to the PID file
 * @returns The PID as a number, or null if file doesn't exist or is invalid
 *
 * @example
 * ```typescript
 * const pid = readPID('/var/run/rlm-daemon.pid');
 * if (pid !== null) {
 *   console.log(`Daemon running with PID: ${pid}`);
 * }
 * ```
 */
export function readPID(pidPath: string): number | null {
  try {
    const content = fs.readFileSync(pidPath, 'utf-8').trim();
    if (!content) {
      return null;
    }
    const pid = parseInt(content, 10);
    if (isNaN(pid)) {
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

/**
 * Remove the PID file.
 *
 * Does not throw if the file doesn't exist.
 *
 * @param pidPath - Path to the PID file
 *
 * @example
 * ```typescript
 * cleanupPID('/var/run/rlm-daemon.pid');
 * ```
 */
export function cleanupPID(pidPath: string): void {
  try {
    fs.unlinkSync(pidPath);
  } catch {
    // Ignore errors - file may not exist
  }
}

/**
 * Check if a process with the given PID is currently running.
 *
 * Uses `process.kill(pid, 0)` to check process existence without
 * sending a signal.
 *
 * @param pid - The process ID to check
 * @returns True if the process exists, false otherwise
 *
 * @example
 * ```typescript
 * const pid = readPID('/var/run/rlm-daemon.pid');
 * if (pid !== null && isProcessRunning(pid)) {
 *   console.log('Daemon is already running');
 * }
 * ```
 */
export function isProcessRunning(pid: number): boolean {
  if (pid <= 0) {
    return false;
  }
  try {
    // Sending signal 0 tests process existence without affecting it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
