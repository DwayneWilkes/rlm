/**
 * @fileoverview Tests for @rlm/cli package exports.
 *
 * Following TDD: These tests are written FIRST before implementation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as rlmCli from './index.js';

describe('@rlm/cli exports', () => {
  describe('main function', () => {
    let processExitSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      processExitSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should export a main function', () => {
      expect(rlmCli.main).toBeDefined();
      expect(typeof rlmCli.main).toBe('function');
    });

    it('main should return a Promise', async () => {
      // main() should be an async function that can be called with args
      // Using --help to get a predictable exit
      const result = rlmCli.main(['--help']);
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('logger exports', () => {
    beforeEach(() => {
      // Reset to default level
      rlmCli.setLogLevel('info');
    });

    it('should export logger object', () => {
      expect(rlmCli.logger).toBeDefined();
      expect(typeof rlmCli.logger).toBe('object');
    });

    it('should export setLogLevel function', () => {
      expect(rlmCli.setLogLevel).toBeDefined();
      expect(typeof rlmCli.setLogLevel).toBe('function');
    });

    it('should export getLogLevel function', () => {
      expect(rlmCli.getLogLevel).toBeDefined();
      expect(typeof rlmCli.getLogLevel).toBe('function');
    });

    it('should export LogLevel type', () => {
      // The type should be available for type checking
      expect(rlmCli.LogLevel).toBeUndefined(); // Runtime value is undefined for types
    });

    it('logger should have debug, info, warn, error methods', () => {
      expect(rlmCli.logger.debug).toBeDefined();
      expect(rlmCli.logger.info).toBeDefined();
      expect(rlmCli.logger.warn).toBeDefined();
      expect(rlmCli.logger.error).toBeDefined();
      expect(typeof rlmCli.logger.debug).toBe('function');
      expect(typeof rlmCli.logger.info).toBe('function');
      expect(typeof rlmCli.logger.warn).toBe('function');
      expect(typeof rlmCli.logger.error).toBe('function');
    });

    it('setLogLevel and getLogLevel should work correctly', () => {
      rlmCli.setLogLevel('debug');
      expect(rlmCli.getLogLevel()).toBe('debug');

      rlmCli.setLogLevel('error');
      expect(rlmCli.getLogLevel()).toBe('error');
    });
  });

  describe('sandbox exports', () => {
    it('should export createSandbox function', () => {
      expect(rlmCli.createSandbox).toBeDefined();
      expect(typeof rlmCli.createSandbox).toBe('function');
    });

    it('should export detectBestBackend function', () => {
      expect(rlmCli.detectBestBackend).toBeDefined();
      expect(typeof rlmCli.detectBestBackend).toBe('function');
    });

    it('should export isNativeAvailable function', () => {
      expect(rlmCli.isNativeAvailable).toBeDefined();
      expect(typeof rlmCli.isNativeAvailable).toBe('function');
    });

    it('should export isDaemonRunning function', () => {
      expect(rlmCli.isDaemonRunning).toBeDefined();
      expect(typeof rlmCli.isDaemonRunning).toBe('function');
    });
  });

  describe('workspace integration', () => {
    it('should be able to import @rlm/core', async () => {
      // Verify that the CLI package can access the core package via workspace
      const core = await import('@rlm/core');
      expect(core.RLM).toBeDefined();
      expect(core.DEFAULT_BUDGET).toBeDefined();
    });
  });
});
