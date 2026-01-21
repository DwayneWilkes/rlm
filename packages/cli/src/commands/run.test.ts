/**
 * @fileoverview Tests for run command.
 *
 * @module commands/run.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createRunCommand } from './run.js';

// Mock dependencies
vi.mock('../config/index.js', () => ({
  loadConfig: vi.fn(),
  mergeConfig: vi.fn(),
}));

vi.mock('../sandbox/index.js', () => ({
  createSandbox: vi.fn(),
  detectBestBackend: vi.fn(),
}));

vi.mock('../output/index.js', () => ({
  createFormatter: vi.fn(),
}));

vi.mock('@rlm/core', () => ({
  RLM: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { loadConfig, mergeConfig } from '../config/index.js';
import { createSandbox, detectBestBackend } from '../sandbox/index.js';
import { createFormatter } from '../output/index.js';
import { RLM } from '@rlm/core';
import { readFile } from 'node:fs/promises';

const mockLoadConfig = vi.mocked(loadConfig);
const mockMergeConfig = vi.mocked(mergeConfig);
const mockCreateSandbox = vi.mocked(createSandbox);
const mockDetectBestBackend = vi.mocked(detectBestBackend);
const mockCreateFormatter = vi.mocked(createFormatter);
const mockRLM = vi.mocked(RLM);
const mockReadFile = vi.mocked(readFile);

describe('createRunCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let mockExecute: ReturnType<typeof vi.fn>;
  let mockFormatter: { format: ReturnType<typeof vi.fn>; formatError: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.clearAllMocks();

    // Default mock setup
    mockLoadConfig.mockResolvedValue({
      provider: 'ollama',
      model: 'llama3.2',
      budget: { maxCost: 5.0, maxIterations: 30, maxDepth: 2, maxTime: 300000 },
      repl: { backend: 'auto', timeout: 30000 },
      output: { format: 'text' },
    } as any);

    mockMergeConfig.mockImplementation((fileConfig, cliFlags) => ({
      ...fileConfig,
      ...cliFlags,
    }) as any);

    mockDetectBestBackend.mockResolvedValue('native');
    mockCreateSandbox.mockReturnValue({} as any);

    mockExecute = vi.fn();
    mockRLM.mockImplementation(() => ({
      execute: mockExecute,
    }) as any);

    mockFormatter = {
      format: vi.fn((result) => `Output: ${result.output}`),
      formatError: vi.fn((error) => `Error: ${error.message}`),
    };
    mockCreateFormatter.mockReturnValue(mockFormatter as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should return a Command instance', () => {
    const command = createRunCommand();
    expect(command).toBeInstanceOf(Command);
  });

  it('should be named "run"', () => {
    const command = createRunCommand();
    expect(command.name()).toBe('run');
  });

  it('should have a description', () => {
    const command = createRunCommand();
    expect(command.description()).toBeTruthy();
  });

  it('should require a task argument', () => {
    const command = createRunCommand();
    const args = command.registeredArguments;
    expect(args.length).toBeGreaterThan(0);
    expect(args[0].name()).toBe('task');
    expect(args[0].required).toBe(true);
  });

  describe('execution', () => {
    it('should load config and execute task', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Task completed successfully',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Analyze this code'], { from: 'user' });

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(mockRLM).toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'Analyze this code',
        })
      );
    });

    it('should read context from file when --context is provided', async () => {
      mockReadFile.mockResolvedValueOnce('file content here');
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Summarize', '--context', '/path/to/file.txt'], { from: 'user' });

      expect(mockReadFile).toHaveBeenCalledWith('/path/to/file.txt', 'utf-8');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'file content here',
        })
      );
    });

    it('should use specified config file with --config', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task', '--config', '/custom/config.yaml'], { from: 'user' });

      expect(mockLoadConfig).toHaveBeenCalledWith('/custom/config.yaml');
    });

    it('should use specified format with --format', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task', '--format', 'json'], { from: 'user' });

      expect(mockCreateFormatter).toHaveBeenCalledWith('json');
    });

    it('should use specified backend with --backend', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task', '--backend', 'pyodide'], { from: 'user' });

      // Backend should be passed through config merge
      expect(mockMergeConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          repl: expect.objectContaining({
            backend: 'pyodide',
          }),
        })
      );
    });

    it('should format and output successful result', async () => {
      const result = {
        success: true,
        output: 'Analysis complete',
        trace: {},
        usage: {},
        warnings: [],
      };
      mockExecute.mockResolvedValueOnce(result);
      mockFormatter.format.mockReturnValueOnce('Formatted: Analysis complete');

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Analyze'], { from: 'user' });

      expect(mockFormatter.format).toHaveBeenCalledWith(result);
      expect(consoleLogSpy).toHaveBeenCalledWith('Formatted: Analysis complete');
    });

    it('should exit with code 0 on success', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task'], { from: 'user' });

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit with code 1 on execution failure', async () => {
      mockExecute.mockResolvedValueOnce({
        success: false,
        output: '',
        trace: {},
        usage: {},
        warnings: [],
        error: new Error('Execution failed'),
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task'], { from: 'user' });

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit with code 1 on exception', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Unexpected error'));

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task'], { from: 'user' });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should detect best backend when auto is specified', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        output: 'Done',
        trace: {},
        usage: {},
        warnings: [],
      });

      const program = new Command().addCommand(createRunCommand());
      await program.parseAsync(['run', 'Task'], { from: 'user' });

      // Auto is the default, so detectBestBackend should be called
      expect(mockDetectBestBackend).toHaveBeenCalled();
    });
  });
});
