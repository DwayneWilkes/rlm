/**
 * @fileoverview Daemon commands for RLM CLI.
 *
 * Provides commands for managing the RLM daemon process:
 * - start: Start the daemon with worker pool
 * - stop: Stop the daemon gracefully
 * - status: Show daemon status information
 *
 * @module commands/daemon
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { readPID, cleanupPID, isProcessRunning, writePID } from '../daemon/pid.js';
import { getSocketPath, isDaemonRunning, pingDaemon } from '../daemon/detect.js';
import { DaemonServer, getDefaultSocketPath } from '../daemon/server.js';
import { WorkerPool } from '../daemon/pool.js';

/**
 * Get the default PID file path.
 *
 * @returns Path to ~/.rlm/daemon.pid
 */
export function getDefaultPidPath(): string {
  return path.join(os.homedir(), '.rlm', 'daemon.pid');
}

/**
 * Format milliseconds into human-readable uptime string.
 *
 * @param ms - Uptime in milliseconds
 * @returns Human-readable uptime (e.g., "1 hour 30 minutes")
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Wait for a specified time.
 *
 * @param ms - Milliseconds to wait
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle the daemon start command.
 */
async function handleStart(options: { workers: string; foreground: boolean }): Promise<void> {
  const workers = parseInt(options.workers, 10);
  const pidPath = getDefaultPidPath();

  // Check if daemon is already running
  if (await isDaemonRunning()) {
    console.error('Daemon is already running');
    return;
  }

  if (options.foreground) {
    // Run in foreground (for debugging)
    await runDaemonForeground(workers, pidPath);
  } else {
    // Fork a detached process
    const args = [
      process.argv[1],
      'daemon',
      'start',
      '--foreground',
      '--workers',
      String(workers),
    ];

    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    console.log(`Daemon started (PID: ${child.pid})`);
  }
}

/**
 * Run the daemon in foreground mode.
 */
async function runDaemonForeground(workers: number, pidPath: string): Promise<void> {
  // Write PID file
  writePID(pidPath);

  const pool = new WorkerPool(workers);
  const server = new DaemonServer(pool, getDefaultSocketPath());

  // Setup graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down daemon...');
    await server.stop();
    await pool.shutdown();
    cleanupPID(pidPath);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.start();
  console.log(`Daemon running with ${workers} workers (PID: ${process.pid})`);

  // Keep running until shutdown signal
  await new Promise(() => {});
}

/**
 * Handle the daemon stop command.
 */
async function handleStop(): Promise<void> {
  const pidPath = getDefaultPidPath();
  const pid = readPID(pidPath);

  if (pid === null) {
    console.log('Daemon is not running');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log('Daemon is not running');
    cleanupPID(pidPath);
    return;
  }

  // Send SIGTERM for graceful shutdown
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    console.log('Daemon is not running');
    cleanupPID(pidPath);
    return;
  }

  // Wait for graceful shutdown (max 5 seconds)
  const startTime = Date.now();
  const timeout = 5000;

  while (Date.now() - startTime < timeout) {
    if (!isProcessRunning(pid)) {
      console.log('Daemon stopped');
      cleanupPID(pidPath);
      return;
    }
    await sleep(100);
  }

  // Force kill if still running
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process may have died
  }

  // Wait a bit for SIGKILL to take effect
  await sleep(100);

  console.log('Daemon stopped');
  cleanupPID(pidPath);
}

/**
 * Handle the daemon status command.
 */
async function handleStatus(options: { json: boolean }): Promise<void> {
  const pidPath = getDefaultPidPath();
  const pid = readPID(pidPath);

  // First do a quick check if daemon is running (short timeout)
  const isRunning = await isDaemonRunning();

  // Only try to ping for detailed info if daemon appears to be running
  const info = isRunning ? await pingDaemon(undefined, 2000) : null;

  if (options.json) {
    const status = {
      running: info !== null,
      pid: pid,
      uptime: info?.uptime ?? null,
      workers: info?.workers ?? null,
    };
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  if (info === null) {
    console.log('Status: stopped');
    return;
  }

  const uptimeStr = formatUptime(info.uptime);
  console.log(`Status: running`);
  console.log(`PID: ${pid}`);
  console.log(`Workers: ${info.workers}`);
  console.log(`Uptime: ${uptimeStr}`);
}

/**
 * Create the daemon command with start, stop, and status subcommands.
 *
 * @returns Command instance for daemon management
 *
 * @example
 * ```typescript
 * const program = new Command();
 * program.addCommand(createDaemonCommand());
 * program.parse(['daemon', 'start']);
 * ```
 */
export function createDaemonCommand(): Command {
  const daemon = new Command('daemon')
    .description(
      'Manage the RLM daemon process\n\n' +
        'The daemon maintains a pool of Python worker processes for faster execution.\n' +
        'Start the daemon once and it will be automatically used by subsequent commands.\n\n' +
        'Examples:\n' +
        '  $ rlm daemon start\n' +
        '  $ rlm daemon start --workers 4\n' +
        '  $ rlm daemon status\n' +
        '  $ rlm daemon stop'
    );

  daemon
    .command('start')
    .description(
      'Start the RLM daemon\n\n' +
        'Starts a background daemon process with a pool of Python workers.\n' +
        'The daemon will be used automatically when running tasks.'
    )
    .option('-w, --workers <n>', 'Number of worker processes to spawn (default: 2)', '2')
    .option('-f, --foreground', 'Run in foreground instead of daemonizing (for debugging)', false)
    .action(handleStart);

  daemon
    .command('stop')
    .description(
      'Stop the RLM daemon\n\n' +
        'Gracefully shuts down the daemon and all worker processes.'
    )
    .action(handleStop);

  daemon
    .command('status')
    .description(
      'Show the RLM daemon status\n\n' +
        'Displays whether the daemon is running, its PID, worker count, and uptime.'
    )
    .option('--json', 'Output status in JSON format for scripting', false)
    .action(handleStatus);

  return daemon;
}
