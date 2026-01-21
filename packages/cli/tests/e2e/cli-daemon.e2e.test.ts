/**
 * @fileoverview E2E tests for the `rlm daemon` command.
 *
 * Tests daemon lifecycle commands:
 * - `rlm daemon start`
 * - `rlm daemon status`
 * - `rlm daemon stop`
 *
 * Note: These tests may be skipped in CI environments where daemon
 * processes cannot be started reliably (e.g., containerized environments,
 * Windows without proper permissions, etc.)
 *
 * @module tests/e2e/cli-daemon.e2e.test
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

/** Path to the built CLI entry point */
const CLI_PATH = join(__dirname, '../../dist/bin/rlm.js');

/** Default PID file location */
const PID_PATH = join(homedir(), '.rlm', 'daemon.pid');

/**
 * Check if the CLI binary exists.
 */
function isCLIBuilt(): boolean {
  return existsSync(CLI_PATH);
}

/**
 * Check if we're running in a CI environment where daemon tests may fail.
 */
function isInCIEnvironment(): boolean {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.TRAVIS ||
    process.env.CIRCLECI ||
    process.env.JENKINS_URL
  );
}

/**
 * Check if Python is available (required for daemon workers).
 */
function isPythonAvailable(): boolean {
  try {
    execSync('python --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run the CLI command and capture output.
 *
 * @param args - Command line arguments
 * @param options - Optional spawn options
 * @returns Promise with stdout, stderr, and exit code
 */
async function runCLI(
  args: string[],
  options: { timeout?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 10000, env = {} } = options;

  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeoutHandle = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      resolve({
        stdout,
        stderr: stderr + err.message,
        exitCode: 1,
      });
    });
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure daemon is stopped before/after tests.
 */
async function ensureDaemonStopped(): Promise<void> {
  try {
    await runCLI(['daemon', 'stop'], { timeout: 10000 });
    await sleep(500); // Give it time to clean up
  } catch {
    // Ignore errors - daemon may not be running
  }
}

describe('rlm daemon E2E', () => {
  describe('daemon help', () => {
    it.skipIf(!isCLIBuilt())('should display help for daemon command', async () => {
      const result = await runCLI(['daemon', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Manage the RLM daemon process');
    });

    it.skipIf(!isCLIBuilt())('should list start, stop, and status subcommands', async () => {
      const result = await runCLI(['daemon', '--help']);

      expect(result.stdout).toContain('start');
      expect(result.stdout).toContain('stop');
      expect(result.stdout).toContain('status');
    });
  });

  describe('daemon start help', () => {
    it.skipIf(!isCLIBuilt())('should show workers option', async () => {
      const result = await runCLI(['daemon', 'start', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--workers');
      expect(result.stdout).toContain('-w');
    });

    it.skipIf(!isCLIBuilt())('should show foreground option', async () => {
      const result = await runCLI(['daemon', 'start', '--help']);

      expect(result.stdout).toContain('--foreground');
      expect(result.stdout).toContain('-f');
    });
  });

  describe('daemon status help', () => {
    it.skipIf(!isCLIBuilt())('should show json option', async () => {
      const result = await runCLI(['daemon', 'status', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('--json');
    });
  });

  describe('daemon status (not running)', () => {
    beforeAll(async () => {
      await ensureDaemonStopped();
    });

    it.skipIf(!isCLIBuilt())('should report stopped status when daemon is not running', async () => {
      const result = await runCLI(['daemon', 'status']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('stopped');
    });

    it.skipIf(!isCLIBuilt())('should report stopped in JSON format', async () => {
      const result = await runCLI(['daemon', 'status', '--json']);

      expect(result.exitCode).toBe(0);

      const status = JSON.parse(result.stdout);
      expect(status).toHaveProperty('running', false);
    });
  });

  describe('daemon stop (not running)', () => {
    beforeAll(async () => {
      await ensureDaemonStopped();
    });

    it.skipIf(!isCLIBuilt())('should handle stop when daemon is not running', async () => {
      const result = await runCLI(['daemon', 'stop']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('not running');
    });
  });

  // Daemon lifecycle tests - require Python and ability to spawn daemon processes
  describe('daemon lifecycle', () => {
    // Skip in CI environments where daemon cannot run reliably
    const shouldSkip = !isCLIBuilt() || isInCIEnvironment() || !isPythonAvailable();

    afterEach(async () => {
      if (!shouldSkip) {
        await ensureDaemonStopped();
      }
    });

    it.skipIf(shouldSkip)('should start daemon and report running status', async () => {
      // Start the daemon
      const startResult = await runCLI(['daemon', 'start'], { timeout: 10000 });

      // Allow time for startup
      await sleep(2000);

      // Check status
      const statusResult = await runCLI(['daemon', 'status']);

      // Should report running
      expect(statusResult.stdout.toLowerCase()).toContain('running');
    });

    it.skipIf(shouldSkip)('should stop running daemon', async () => {
      // Start the daemon first
      await runCLI(['daemon', 'start'], { timeout: 10000 });
      await sleep(2000);

      // Stop the daemon
      const stopResult = await runCLI(['daemon', 'stop'], { timeout: 10000 });
      expect(stopResult.stdout.toLowerCase()).toContain('stopped');

      // Verify it's stopped
      await sleep(500);
      const statusResult = await runCLI(['daemon', 'status']);
      expect(statusResult.stdout.toLowerCase()).toContain('stopped');
    });

    it.skipIf(shouldSkip)('should report worker count in status', async () => {
      // Start with specific worker count
      await runCLI(['daemon', 'start', '--workers', '3'], { timeout: 10000 });
      await sleep(2000);

      const statusResult = await runCLI(['daemon', 'status', '--json']);
      const status = JSON.parse(statusResult.stdout);

      expect(status).toHaveProperty('workers');
      expect(status.workers).toBe(3);
    });

    it.skipIf(shouldSkip)('should report uptime in status', async () => {
      await runCLI(['daemon', 'start'], { timeout: 10000 });
      await sleep(2000);

      const statusResult = await runCLI(['daemon', 'status', '--json']);
      const status = JSON.parse(statusResult.stdout);

      expect(status).toHaveProperty('uptime');
      expect(typeof status.uptime).toBe('number');
      expect(status.uptime).toBeGreaterThan(0);
    });

    it.skipIf(shouldSkip)('should not start if already running', async () => {
      // Start the daemon
      await runCLI(['daemon', 'start'], { timeout: 10000 });
      await sleep(2000);

      // Try to start again
      const secondStart = await runCLI(['daemon', 'start'], { timeout: 10000 });

      // Should indicate already running
      expect(secondStart.stderr.toLowerCase()).toContain('already running');
    });
  });
});
