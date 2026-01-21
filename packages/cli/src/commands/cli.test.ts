/**
 * @fileoverview Tests for CLI router.
 *
 * @module commands/cli.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createCLI } from './cli.js';

// Mock the subcommand modules to avoid their side effects
vi.mock('./run.js', () => ({
  createRunCommand: vi.fn(() => new Command('run').description('Execute a task')),
}));

vi.mock('./config.js', () => ({
  createConfigCommand: vi.fn(() => new Command('config').description('Manage config')),
}));

vi.mock('./daemon.js', () => ({
  createDaemonCommand: vi.fn(() => new Command('daemon').description('Manage daemon')),
}));

import { createRunCommand } from './run.js';
import { createConfigCommand } from './config.js';
import { createDaemonCommand } from './daemon.js';

describe('createCLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return a Command instance', () => {
    const cli = createCLI();
    expect(cli).toBeInstanceOf(Command);
  });

  it('should be named "rlm"', () => {
    const cli = createCLI();
    expect(cli.name()).toBe('rlm');
  });

  it('should have version "0.1.0"', () => {
    const cli = createCLI();
    expect(cli.version()).toBe('0.1.0');
  });

  it('should have a description', () => {
    const cli = createCLI();
    expect(cli.description()).toBeTruthy();
    expect(cli.description()).toContain('RLM');
  });

  it('should add run command', () => {
    createCLI();
    expect(createRunCommand).toHaveBeenCalled();
  });

  it('should add config command', () => {
    createCLI();
    expect(createConfigCommand).toHaveBeenCalled();
  });

  it('should add daemon command', () => {
    createCLI();
    expect(createDaemonCommand).toHaveBeenCalled();
  });

  it('should have run as a subcommand', () => {
    const cli = createCLI();
    const commands = cli.commands.map((cmd) => cmd.name());
    expect(commands).toContain('run');
  });

  it('should have config as a subcommand', () => {
    const cli = createCLI();
    const commands = cli.commands.map((cmd) => cmd.name());
    expect(commands).toContain('config');
  });

  it('should have daemon as a subcommand', () => {
    const cli = createCLI();
    const commands = cli.commands.map((cmd) => cmd.name());
    expect(commands).toContain('daemon');
  });
});

describe('CLI integration', () => {
  let writeStdoutSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeStdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    writeStdoutSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should display help when --help is passed', async () => {
    const cli = createCLI();
    cli.configureOutput({
      writeOut: (str) => writeStdoutSpy(str),
      writeErr: () => {},
    });

    try {
      await cli.parseAsync(['--help'], { from: 'user' });
    } catch {
      // Commander may throw on --help
    }

    const output = writeStdoutSpy.mock.calls.map((call) => call[0]).join('');
    expect(output).toContain('rlm');
  });

  it('should display version when --version is passed', async () => {
    const cli = createCLI();
    cli.configureOutput({
      writeOut: (str) => writeStdoutSpy(str),
      writeErr: () => {},
    });

    try {
      await cli.parseAsync(['--version'], { from: 'user' });
    } catch {
      // Commander may throw on --version
    }

    const output = writeStdoutSpy.mock.calls.map((call) => call[0]).join('');
    expect(output).toContain('0.1.0');
  });
});
