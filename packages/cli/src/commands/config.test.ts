/**
 * @fileoverview Tests for config command.
 *
 * @module commands/config.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createConfigCommand } from './config.js';

// Mock the config loader module
vi.mock('../config/index.js', () => ({
  loadConfig: vi.fn(),
  getConfigPath: vi.fn(),
  resolveProfile: vi.fn((config) => config), // Identity by default
}));

// Mock the yaml module
vi.mock('yaml', () => ({
  stringify: vi.fn((obj) => `provider: ${obj.provider}\nmodel: ${obj.model}\n`),
}));

import { loadConfig, getConfigPath, resolveProfile } from '../config/index.js';
import { stringify as yamlStringify } from 'yaml';

const mockLoadConfig = vi.mocked(loadConfig);
const mockGetConfigPath = vi.mocked(getConfigPath);
const mockResolveProfile = vi.mocked(resolveProfile);
const mockYamlStringify = vi.mocked(yamlStringify);

describe('createConfigCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
    // resolveProfile returns config unchanged by default
    mockResolveProfile.mockImplementation((config) => config);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should return a Command instance', () => {
    const command = createConfigCommand();
    expect(command).toBeInstanceOf(Command);
  });

  it('should be named "config"', () => {
    const command = createConfigCommand();
    expect(command.name()).toBe('config');
  });

  it('should have a description', () => {
    const command = createConfigCommand();
    expect(command.description()).toBeTruthy();
  });

  describe('show subcommand', () => {
    it('should load config and output as YAML', async () => {
      const mockConfig = {
        provider: 'ollama',
        model: 'llama3.2',
        budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
        repl: { backend: 'auto', timeout: 30000 },
        output: { format: 'text' },
      };
      mockLoadConfig.mockResolvedValueOnce(mockConfig as any);
      mockYamlStringify.mockReturnValueOnce('provider: ollama\nmodel: llama3.2\n');

      const program = new Command().addCommand(createConfigCommand());
      await program.parseAsync(['config', 'show'], { from: 'user' });

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockYamlStringify).toHaveBeenCalledWith(mockConfig);
      expect(consoleLogSpy).toHaveBeenCalledWith('provider: ollama\nmodel: llama3.2\n');
    });

    it('should use explicit config path when provided', async () => {
      const mockConfig = { provider: 'anthropic', model: 'claude-3' };
      mockLoadConfig.mockResolvedValueOnce(mockConfig as any);
      mockYamlStringify.mockReturnValueOnce('provider: anthropic\n');

      const program = new Command().addCommand(createConfigCommand());
      await program.parseAsync(['config', 'show', '--config', '/path/to/config.yaml'], { from: 'user' });

      expect(mockLoadConfig).toHaveBeenCalledWith('/path/to/config.yaml');
    });
  });

  describe('path subcommand', () => {
    it('should print config file path when found', async () => {
      mockGetConfigPath.mockResolvedValueOnce('/home/user/.rlmrc');

      const program = new Command().addCommand(createConfigCommand());
      await program.parseAsync(['config', 'path'], { from: 'user' });

      expect(mockGetConfigPath).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('/home/user/.rlmrc');
    });

    it('should print "no config file found" when no config exists', async () => {
      mockGetConfigPath.mockResolvedValueOnce(null);

      const program = new Command().addCommand(createConfigCommand());
      await program.parseAsync(['config', 'path'], { from: 'user' });

      expect(mockGetConfigPath).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('no config file found');
    });

    it('should check explicit config path when provided', async () => {
      mockGetConfigPath.mockResolvedValueOnce('/custom/path.yaml');

      const program = new Command().addCommand(createConfigCommand());
      await program.parseAsync(['config', 'path', '--config', '/custom/path.yaml'], { from: 'user' });

      expect(mockGetConfigPath).toHaveBeenCalledWith('/custom/path.yaml');
    });
  });
});
