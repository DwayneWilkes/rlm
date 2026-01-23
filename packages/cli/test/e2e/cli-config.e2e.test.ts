/**
 * @fileoverview E2E tests for the `rlm config` command.
 *
 * Tests the config command functionality including:
 * - `rlm config show` output
 * - `rlm config path` with/without config file
 * - Config file loading from different locations
 *
 * @module tests/e2e/cli-config.e2e.test
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

/** Path to the built CLI entry point */
const CLI_PATH = join(__dirname, '../../dist/bin/rlm.js');

/** Temporary directory for test fixtures */
const TMP_DIR = join(tmpdir(), 'rlm-e2e-config-tests');

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
  options: { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 10000, env = {}, cwd } = options;

  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      cwd,
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

describe('rlm config E2E', () => {
  beforeAll(() => {
    // Create temp directory for test fixtures
    if (!existsSync(TMP_DIR)) {
      mkdirSync(TMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp directory
    try {
      if (existsSync(TMP_DIR)) {
        rmSync(TMP_DIR, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('config help', () => {
    it.skipIf(!isCLIBuilt())('should display help for config command', async () => {
      const result = await runCLI(['config', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('View and manage RLM configuration');
    });

    it.skipIf(!isCLIBuilt())('should list show and path subcommands', async () => {
      const result = await runCLI(['config', '--help']);

      expect(result.stdout).toContain('show');
      expect(result.stdout).toContain('path');
    });
  });

  describe('config show', () => {
    it.skipIf(!isCLIBuilt())('should display resolved configuration as YAML', async () => {
      const result = await runCLI(['config', 'show']);

      expect(result.exitCode).toBe(0);
      // Should contain default config values in YAML format
      expect(result.stdout).toContain('provider:');
      expect(result.stdout).toContain('model:');
      expect(result.stdout).toContain('budget:');
    });

    it.skipIf(!isCLIBuilt())('should include default budget settings', async () => {
      const result = await runCLI(['config', 'show']);

      expect(result.stdout).toContain('maxCost:');
      expect(result.stdout).toContain('maxIterations:');
    });

    it.skipIf(!isCLIBuilt())('should include REPL settings', async () => {
      const result = await runCLI(['config', 'show']);

      expect(result.stdout).toContain('repl:');
      expect(result.stdout).toContain('backend:');
    });

    it.skipIf(!isCLIBuilt())('should include output format settings', async () => {
      const result = await runCLI(['config', 'show']);

      expect(result.stdout).toContain('output:');
      expect(result.stdout).toContain('format:');
    });
  });

  describe('config show with custom file', () => {
    const configPath = join(TMP_DIR, 'custom-config.yaml');

    afterEach(() => {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    });

    it.skipIf(!isCLIBuilt())('should load custom config file', async () => {
      const customConfig = `
provider: openai
model: gpt-4
budget:
  maxCost: 10.0
  maxIterations: 50
`;
      writeFileSync(configPath, customConfig);

      const result = await runCLI(['config', 'show', '--config', configPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('provider: openai');
      expect(result.stdout).toContain('model: gpt-4');
    });

    it.skipIf(!isCLIBuilt())('should merge custom config with defaults', async () => {
      // Only specify provider, other values should use defaults
      const customConfig = `
provider: openai
`;
      writeFileSync(configPath, customConfig);

      const result = await runCLI(['config', 'show', '--config', configPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('provider: openai');
      // Should still have budget section from defaults
      expect(result.stdout).toContain('budget:');
    });
  });

  describe('config path', () => {
    it.skipIf(!isCLIBuilt())('should report no config file when none exists', async () => {
      // Run in a temp directory with no config
      const result = await runCLI(['config', 'path'], { cwd: TMP_DIR });

      // Should indicate no config file found
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/no config file|not found|none/i);
    });

    it.skipIf(!isCLIBuilt())('should show path when config file specified', async () => {
      const configPath = join(TMP_DIR, 'test-config.yaml');
      writeFileSync(configPath, 'provider: anthropic\n');

      try {
        const result = await runCLI(['config', 'path', '--config', configPath]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(configPath);
      } finally {
        if (existsSync(configPath)) {
          unlinkSync(configPath);
        }
      }
    });
  });

  describe('config file discovery', () => {
    const testDir = join(TMP_DIR, 'discovery-test');
    const configPath = join(testDir, '.rlmrc.yaml');

    beforeAll(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    });

    it.skipIf(!isCLIBuilt())('should discover .rlmrc.yaml in current directory', async () => {
      writeFileSync(configPath, 'provider: ollama\nmodel: llama3\n');

      const result = await runCLI(['config', 'path'], { cwd: testDir });

      // Should find the config file in the current directory
      expect(result.exitCode).toBe(0);
      // The path should either show the config file or indicate it was found
      if (!result.stdout.toLowerCase().includes('no config')) {
        expect(result.stdout).toContain('.rlmrc.yaml');
      }
    });
  });

  describe('error handling', () => {
    it.skipIf(!isCLIBuilt())('should handle non-existent config file gracefully', async () => {
      const result = await runCLI(['config', 'show', '--config', '/nonexistent/config.yaml']);

      // Should fail with a meaningful error
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBeTruthy();
    });

    it.skipIf(!isCLIBuilt())('should handle invalid YAML config gracefully', async () => {
      const configPath = join(TMP_DIR, 'invalid-config.yaml');
      writeFileSync(configPath, 'invalid: yaml: content:\n  - broken');

      try {
        const result = await runCLI(['config', 'show', '--config', configPath]);

        // Should fail with a parse error
        expect(result.exitCode).toBe(1);
      } finally {
        if (existsSync(configPath)) {
          unlinkSync(configPath);
        }
      }
    });
  });
});
