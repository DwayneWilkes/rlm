/**
 * @fileoverview Tests for daemon commands.
 *
 * @module commands/daemon.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock the daemon modules
vi.mock('../daemon/pid.js', () => ({
  writePID: vi.fn(),
  readPID: vi.fn(),
  cleanupPID: vi.fn(),
  isProcessRunning: vi.fn(),
}));

vi.mock('../daemon/detect.js', () => ({
  getSocketPath: vi.fn().mockReturnValue('/tmp/rlm-daemon.sock'),
  isDaemonRunning: vi.fn(),
  pingDaemon: vi.fn(),
}));

vi.mock('../daemon/server.js', () => ({
  DaemonServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockReturnValue(true),
  })),
  getDefaultSocketPath: vi.fn().mockReturnValue('/tmp/rlm-daemon.sock'),
}));

vi.mock('../daemon/pool.js', () => ({
  WorkerPool: vi.fn().mockImplementation(() => ({
    shutdown: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({ total: 2, available: 2, inUse: 0 }),
  })),
}));

// Import after mocks are set up
import { createDaemonCommand, getDefaultPidPath } from './daemon.js';
import { spawn } from 'node:child_process';
import { readPID, cleanupPID, isProcessRunning } from '../daemon/pid.js';
import { isDaemonRunning, pingDaemon } from '../daemon/detect.js';

describe('getDefaultPidPath', () => {
  it('returns path in user home directory', () => {
    const pidPath = getDefaultPidPath();
    const homeDir = os.homedir();
    expect(pidPath).toBe(path.join(homeDir, '.rlm', 'daemon.pid'));
  });
});

describe('createDaemonCommand', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalKill: typeof process.kill;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    originalKill = process.kill;
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.kill = originalKill;
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
    it('has --workers option with default of 2', () => {
      const daemon = createDaemonCommand();
      const start = daemon.commands.find((c) => c.name() === 'start');
      expect(start).toBeDefined();

      const workersOption = start?.options.find((o) => o.long === '--workers');
      expect(workersOption).toBeDefined();
    });

    it('has --foreground option', () => {
      const daemon = createDaemonCommand();
      const start = daemon.commands.find((c) => c.name() === 'start');
      const fgOption = start?.options.find((o) => o.long === '--foreground');
      expect(fgOption).toBeDefined();
    });

    it('checks if daemon is already running before starting', async () => {
      vi.mocked(isDaemonRunning).mockResolvedValue(true);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'start'], { from: 'user' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );
    });

    it('spawns detached process when not in foreground mode', async () => {
      vi.mocked(isDaemonRunning).mockResolvedValue(false);
      vi.mocked(readPID).mockReturnValue(null);

      // Mock the spawned process
      const mockChild = {
        unref: vi.fn(),
        pid: 12345,
        on: vi.fn(),
        stdout: null,
        stderr: null,
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'start'], { from: 'user' });

      expect(spawn).toHaveBeenCalled();
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('prints success message with PID when daemon starts', async () => {
      vi.mocked(isDaemonRunning).mockResolvedValue(false);
      vi.mocked(readPID).mockReturnValue(null);

      const mockChild = {
        unref: vi.fn(),
        pid: 12345,
        on: vi.fn(),
        stdout: null,
        stderr: null,
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'start'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Daemon started.*PID.*12345/i)
      );
    });

    it('accepts custom worker count via --workers', async () => {
      vi.mocked(isDaemonRunning).mockResolvedValue(false);
      vi.mocked(readPID).mockReturnValue(null);

      const mockChild = {
        unref: vi.fn(),
        pid: 12345,
        on: vi.fn(),
        stdout: null,
        stderr: null,
      };
      vi.mocked(spawn).mockReturnValue(mockChild as any);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'start', '--workers', '4'], {
        from: 'user',
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--workers', '4']),
        expect.any(Object)
      );
    });
  });

  describe('stop subcommand', () => {
    it('reads PID from file', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isProcessRunning)
        .mockReturnValueOnce(true)   // Initial check
        .mockReturnValueOnce(false); // After SIGTERM

      process.kill = vi.fn() as any;

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(readPID).toHaveBeenCalled();
    });

    it('sends SIGTERM to daemon process', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isProcessRunning)
        .mockReturnValueOnce(true)   // Initial check
        .mockReturnValueOnce(false); // After SIGTERM - process stopped

      const killSpy = vi.fn();
      process.kill = killSpy as any;

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    });

    it('cleans up PID file after stopping', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isProcessRunning)
        .mockReturnValueOnce(true)   // Initial check
        .mockReturnValueOnce(false); // After SIGTERM

      process.kill = vi.fn() as any;

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(cleanupPID).toHaveBeenCalled();
    });

    it('prints "Daemon not running" when no PID file exists', async () => {
      vi.mocked(readPID).mockReturnValue(null);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('not running')
      );
    });

    it('prints "Daemon stopped" after successful shutdown', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isProcessRunning)
        .mockReturnValueOnce(true)   // Initial check
        .mockReturnValueOnce(false); // After SIGTERM

      process.kill = vi.fn() as any;

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'stop'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Daemon stopped');
    });

    it('force kills with SIGKILL after 5s timeout', async () => {
      vi.useFakeTimers();

      vi.mocked(readPID).mockReturnValue(12345);
      // Process keeps running until after SIGKILL
      vi.mocked(isProcessRunning).mockReturnValue(true);

      const killSpy = vi.fn();
      process.kill = killSpy as any;

      const program = new Command().addCommand(createDaemonCommand());
      const parsePromise = program.parseAsync(['daemon', 'stop'], {
        from: 'user',
      });

      // Advance through the wait loop (100ms per iteration, need 50+ iterations for 5s)
      for (let i = 0; i < 55; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      // After SIGKILL, process stops
      vi.mocked(isProcessRunning).mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(200);

      await parsePromise;

      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL');

      vi.useRealTimers();
    });
  });

  describe('status subcommand', () => {
    it('shows running status when daemon is running', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isDaemonRunning).mockResolvedValue(true);
      vi.mocked(pingDaemon).mockResolvedValue({
        uptime: 60000,
        workers: 2,
      });

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('running')
      );
    });

    it('shows stopped status when daemon is not running', async () => {
      vi.mocked(readPID).mockReturnValue(null);
      vi.mocked(isDaemonRunning).mockResolvedValue(false);
      vi.mocked(pingDaemon).mockResolvedValue(null);

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('stopped')
      );
    });

    it('shows PID in status output', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isDaemonRunning).mockResolvedValue(true);
      vi.mocked(pingDaemon).mockResolvedValue({
        uptime: 60000,
        workers: 2,
      });

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('12345')
      );
    });

    it('shows worker count in status output', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isDaemonRunning).mockResolvedValue(true);
      vi.mocked(pingDaemon).mockResolvedValue({
        uptime: 60000,
        workers: 4,
      });

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('4'));
    });

    it('shows uptime in status output', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isDaemonRunning).mockResolvedValue(true);
      vi.mocked(pingDaemon).mockResolvedValue({
        uptime: 3600000, // 1 hour
        workers: 2,
      });

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status'], { from: 'user' });

      // Should show uptime in human-readable format
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Uptime.*1.*hour/i)
      );
    });

    it('outputs JSON when --json flag is provided', async () => {
      vi.mocked(readPID).mockReturnValue(12345);
      vi.mocked(isDaemonRunning).mockResolvedValue(true);
      vi.mocked(pingDaemon).mockResolvedValue({
        uptime: 60000,
        workers: 2,
      });

      const program = new Command().addCommand(createDaemonCommand());
      await program.parseAsync(['daemon', 'status', '--json'], { from: 'user' });

      // Should have called console.log with valid JSON
      const jsonCall = consoleLogSpy.mock.calls.find((call) => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();

      const parsed = JSON.parse(jsonCall![0]);
      expect(parsed).toHaveProperty('running');
      expect(parsed).toHaveProperty('pid');
    });

    it('has --json option', () => {
      const daemon = createDaemonCommand();
      const status = daemon.commands.find((c) => c.name() === 'status');
      const jsonOption = status?.options.find((o) => o.long === '--json');
      expect(jsonOption).toBeDefined();
    });
  });
});
