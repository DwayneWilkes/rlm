import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, mergeConfig, getConfigPath, resolveProfile } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/schema.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { logger } from '../../../src/utils/logger.js';

describe('Config Loader', () => {
  describe('loadConfig', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rlm-config-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('loads config from explicit path', async () => {
      const configPath = path.join(tempDir, '.rlmrc.yaml');
      await fs.writeFile(
        configPath,
        `provider: anthropic
model: claude-3-opus
budget:
  maxCost: 10.0
`
      );

      const config = await loadConfig(configPath);

      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3-opus');
      expect(config.budget.maxCost).toBe(10.0);
    });

    it('applies defaults when no config found', async () => {
      // Search in temp dir where no config exists
      const config = await loadConfig(undefined, tempDir);

      expect(config.provider).toBe('ollama');
      expect(config.model).toBe('llama3.2');
      expect(config.budget.maxCost).toBe(5.0);
    });

    it('loads .rlmrc.json format', async () => {
      const configPath = path.join(tempDir, '.rlmrc.json');
      await fs.writeFile(
        configPath,
        JSON.stringify({
          provider: 'openai',
          model: 'gpt-4',
        })
      );

      const config = await loadConfig(configPath);

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4');
    });

    it('throws on invalid config', async () => {
      const configPath = path.join(tempDir, '.rlmrc.yaml');
      await fs.writeFile(
        configPath,
        `provider: invalid-provider
`
      );

      await expect(loadConfig(configPath)).rejects.toThrow();
    });

    it('emits warning when loading JS config file', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const configPath = path.join(tempDir, '.rlmrc.js');
      await fs.writeFile(
        configPath,
        `module.exports = { provider: 'ollama', model: 'llama3.2' };`
      );

      await loadConfig(configPath);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('executing JavaScript')
      );
      warnSpy.mockRestore();
    });

    it('emits warning when loading CJS config file', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const configPath = path.join(tempDir, '.rlmrc.cjs');
      await fs.writeFile(
        configPath,
        `module.exports = { provider: 'anthropic', model: 'claude-3-opus' };`
      );

      await loadConfig(configPath);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('executing JavaScript')
      );
      warnSpy.mockRestore();
    });

    it('does not warn for YAML config files', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const configPath = path.join(tempDir, '.rlmrc.yaml');
      await fs.writeFile(
        configPath,
        `provider: ollama
model: llama3.2
`
      );

      await loadConfig(configPath);

      // warn() may be called for other reasons, but not for JS execution
      const jsWarningCalls = warnSpy.mock.calls.filter(
        (call) => call[0]?.includes?.('executing JavaScript')
      );
      expect(jsWarningCalls).toHaveLength(0);
      warnSpy.mockRestore();
    });
  });

  describe('mergeConfig', () => {
    it('merges file config with CLI flags', () => {
      const fileConfig: Partial<Config> = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: {
          maxCost: 5.0,
          maxIterations: 30,
          maxDepth: 2,
          maxTime: 300000,
        },
      };

      const cliFlags: Partial<Config> = {
        provider: 'anthropic',
        budget: {
          maxCost: 20.0,
        },
      };

      const result = mergeConfig(fileConfig, cliFlags);

      expect(result.provider).toBe('anthropic'); // CLI overrides
      expect(result.model).toBe('llama3.2'); // From file
      expect(result.budget.maxCost).toBe(20.0); // CLI overrides
      expect(result.budget.maxIterations).toBe(30); // From file
    });

    it('CLI flags take precedence over file config', () => {
      const fileConfig: Partial<Config> = {
        provider: 'ollama',
        output: {
          format: 'text',
        },
      };

      const cliFlags: Partial<Config> = {
        provider: 'openai',
        output: {
          format: 'json',
        },
      };

      const result = mergeConfig(fileConfig, cliFlags);

      expect(result.provider).toBe('openai');
      expect(result.output.format).toBe('json');
    });

    it('applies defaults for missing values', () => {
      const fileConfig: Partial<Config> = {
        provider: 'anthropic',
      };

      const cliFlags: Partial<Config> = {};

      const result = mergeConfig(fileConfig, cliFlags);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('llama3.2'); // default
      expect(result.budget.maxCost).toBe(5.0); // default
      expect(result.repl.backend).toBe('auto'); // default
    });

    it('handles empty configs', () => {
      const result = mergeConfig({}, {});

      expect(result.provider).toBe('ollama');
      expect(result.model).toBe('llama3.2');
    });

    it('handles nested partial overrides', () => {
      const fileConfig: Partial<Config> = {
        budget: {
          maxCost: 10.0,
          maxIterations: 50,
          maxDepth: 3,
          maxTime: 600000,
        },
      };

      const cliFlags: Partial<Config> = {
        budget: {
          maxCost: 25.0,
        },
      };

      const result = mergeConfig(fileConfig, cliFlags);

      expect(result.budget.maxCost).toBe(25.0); // CLI overrides
      expect(result.budget.maxIterations).toBe(50); // From file
      expect(result.budget.maxDepth).toBe(3); // From file
    });
  });

  describe('getConfigPath', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rlm-config-test-'));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('returns explicit config path when provided', async () => {
      const configPath = '/some/explicit/path.yaml';
      const result = await getConfigPath(configPath);
      expect(result).toBe(configPath);
    });

    it('returns null when no config found', async () => {
      const result = await getConfigPath(undefined, tempDir);
      expect(result).toBeNull();
    });

    it('finds .rlmrc.yaml in search path', async () => {
      const configPath = path.join(tempDir, '.rlmrc.yaml');
      await fs.writeFile(configPath, 'provider: ollama\n');

      const result = await getConfigPath(undefined, tempDir);
      expect(result).toBe(configPath);
    });
  });

  describe('resolveProfile', () => {
    it('returns profile settings when profile exists', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          local: {
            provider: 'ollama',
            model: 'qwen2.5-coder:14b',
          },
          cloud: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
          },
        },
        default: 'local',
      };

      const result = resolveProfile(config, 'cloud');

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-sonnet-4-5');
    });

    it('resolves extends chain', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          base: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            budget: { maxCost: 10.0, maxIterations: 50, maxDepth: 3, maxTime: 600000 },
          },
          research: {
            extends: 'base',
            model: 'claude-opus-4-5',
            budget: { maxCost: 50.0, maxIterations: 100, maxDepth: 5, maxTime: 900000 },
          },
        },
      };

      const result = resolveProfile(config, 'research');

      expect(result.provider).toBe('anthropic'); // From base
      expect(result.model).toBe('claude-opus-4-5'); // Overridden
      expect(result.budget.maxCost).toBe(50.0); // Overridden
      expect(result.budget.maxIterations).toBe(100); // Overridden
    });

    it('resolves chained extends (A extends B extends C)', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          base: {
            provider: 'anthropic',
            budget: { maxCost: 10.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
          },
          mid: {
            extends: 'base',
            model: 'claude-sonnet-4-5',
          },
          top: {
            extends: 'mid',
            budget: { maxCost: 100.0, maxIterations: 200, maxDepth: 10, maxTime: 1800000 },
          },
        },
      };

      const result = resolveProfile(config, 'top');

      expect(result.provider).toBe('anthropic'); // From base
      expect(result.model).toBe('claude-sonnet-4-5'); // From mid
      expect(result.budget.maxCost).toBe(100.0); // From top
    });

    it('uses default profile when no profile specified', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          local: {
            provider: 'ollama',
            model: 'qwen2.5-coder:14b',
          },
        },
        default: 'local',
      };

      const result = resolveProfile(config);

      expect(result.provider).toBe('ollama');
      expect(result.model).toBe('qwen2.5-coder:14b');
    });

    it('uses flat config when no profiles defined', () => {
      const config: Config = {
        provider: 'anthropic',
        model: 'claude-opus-4-5',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
      };

      const result = resolveProfile(config);

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-opus-4-5');
    });

    it('throws on missing profile', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          local: { provider: 'ollama' },
        },
      };

      expect(() => resolveProfile(config, 'nonexistent')).toThrow(
        /Profile 'nonexistent' not found/
      );
    });

    it('throws on circular extends', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          a: { extends: 'b', provider: 'ollama' },
          b: { extends: 'a', provider: 'anthropic' },
        },
      };

      expect(() => resolveProfile(config, 'a')).toThrow(/Circular extends/);
    });

    it('preserves subcallProvider in resolved profile', () => {
      const config: Config = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
        profiles: {
          hybrid: {
            provider: 'anthropic',
            model: 'claude-opus-4-5',
            subcallProvider: 'ollama',
            subcallModel: 'qwen2.5-coder:14b',
          },
        },
      };

      const result = resolveProfile(config, 'hybrid');

      expect(result.subcallProvider).toBe('ollama');
      expect(result.subcallModel).toBe('qwen2.5-coder:14b');
    });
  });
});
