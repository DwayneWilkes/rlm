/**
 * @fileoverview Tests for daemon command stubs.
 *
 * @module commands/daemon.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createDaemonCommand } from './daemon.js';

describe('createDaemonCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should return a Command instance', () => {
    const command = createDaemonCommand();
    expect(command).toBeInstanceOf(Command);
  });

  it('should be named "daemon"', () => {
    const command = createDaemonCommand();
    expect(command.name()).toBe('daemon');
  });

  it('should have a description', () => {
    const command = createDaemonCommand();
    expect(command.description()).toBeTruthy();
  });

  describe('start subcommand', () => {
    it('should print "daemon start not yet implemented"', async () => {
      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'start'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('daemon start not yet implemented');
    });
  });

  describe('stop subcommand', () => {
    it('should print "daemon stop not yet implemented"', async () => {
      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('daemon stop not yet implemented');
    });
  });

  describe('status subcommand', () => {
    it('should print "daemon status not yet implemented"', async () => {
      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('daemon status not yet implemented');
    });
  });
});
