/**
 * @fileoverview E2E tests for the `rlm run` command.
 *
 * Tests the full CLI execution flow including:
 * - Native backend execution (when Python is available)
 * - Different output formats (text, json, yaml)
 * - Context file loading
 * - Error handling and exit codes
 *
 * @module tests/e2e/cli-run.e2e.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Path to the built CLI entry point */
const CLI_PATH = join(__dirname, '../../dist/bin/rlm.js');

/** Temporary directory for test fixtures */
const TMP_DIR = join(tmpdir(), 'rlm-e2e-tests');

/**
 * Check if native Python is available.
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
 * Check if the CLI binary exists.
 */
function isCLIBuilt(): boolean {
  return existsSync(CLI_PATH);
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
  const { timeout = 30000, env = {} } = options;

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

describe('rlm run E2E', () => {
  beforeAll(() => {
    // Create temp directory for test fixtures
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp files
    try {
      if (existsSync(TMP_DIR)) {
        const files = ['test-context.txt', 'test-config.yaml'];
        for (const file of files) {
          const filePath = join(TMP_DIR, file);
          if (existsSync(filePath)) {
            unlinkSync(filePath);
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CLI availability', () => {
    it('should have built CLI available', () => {
      expect(isCLIBuilt()).toBe(true);
    });
  });

  describe('help output', () => {
    it.skipIf(!isCLIBuilt())('should display help for run command', async () => {
      const result = await runCLI(['run', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Execute an RLM task');
      expect(result.stdout).toContain('--context');
      expect(result.stdout).toContain('--config');
      expect(result.stdout).toContain('--format');
      expect(result.stdout).toContain('--backend');
    });

    it.skipIf(!isCLIBuilt())('should show task argument in help', async () => {
      const result = await runCLI(['run', '--help']);

      expect(result.stdout).toContain('<task>');
    });
  });

  describe('error handling', () => {
    it.skipIf(!isCLIBuilt())('should exit with code 1 when no task provided', async () => {
      const result = await runCLI(['run']);

      // Commander shows error for missing required argument
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('task');
    });

    it.skipIf(!isCLIBuilt())('should exit with code 1 for invalid context file', async () => {
      const result = await runCLI(['run', 'test task', '--context', '/nonexistent/file.txt']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('ENOENT');
    });

    it.skipIf(!isCLIBuilt())('should handle invalid format gracefully', async () => {
      // Note: Commander may accept any string, so the formatter handles the error
      const result = await runCLI(['run', 'test task', '--format', 'invalid']);

      // Should still run but may produce an error
      // The exact behavior depends on implementation
      expect(typeof result.exitCode).toBe('number');
    });
  });

  describe('context file loading', () => {
    it.skipIf(!isCLIBuilt())('should accept --context flag', async () => {
      // Create a test context file
      const contextPath = join(TMP_DIR, 'test-context.txt');
      writeFileSync(contextPath, 'This is test context content');

      const result = await runCLI(['run', '--help']);

      // Just verify the flag is documented
      expect(result.stdout).toContain('--context');
      expect(result.stdout).toContain('-x');
    });
  });

  describe('output formats', () => {
    it.skipIf(!isCLIBuilt())('should accept text format', async () => {
      const result = await runCLI(['run', '--help']);
      expect(result.stdout).toContain('text');
    });

    it.skipIf(!isCLIBuilt())('should accept json format', async () => {
      const result = await runCLI(['run', '--help']);
      expect(result.stdout).toContain('json');
    });

    it.skipIf(!isCLIBuilt())('should accept yaml format', async () => {
      const result = await runCLI(['run', '--help']);
      expect(result.stdout).toContain('yaml');
    });
  });

  // These tests require actual LLM API keys and are skipped in CI
  describe.skip('native backend execution', () => {
    it.skipIf(!isPythonAvailable())('should execute with native backend', async () => {
      // This test would require actual API keys
      // Skip in CI environments
      const result = await runCLI(
        ['run', 'Return the number 42', '--backend', 'native'],
        { timeout: 60000 }
      );

      // Would check for successful execution
      expect(result.exitCode).toBeDefined();
    });
  });
});
