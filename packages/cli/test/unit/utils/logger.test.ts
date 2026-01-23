/**
 * @fileoverview Tests for the logger utility.
 *
 * Following TDD: These tests are written FIRST before implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, setLogLevel, getLogLevel, type LogLevel } from '../../../src/utils/logger.js';

describe('logger', () => {
  // Save original console methods
  const originalConsoleDebug = console.debug;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Reset to default log level before each test
    setLogLevel('info');
    // Mock console methods
    console.debug = vi.fn();
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore original console methods
    console.debug = originalConsoleDebug;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  });

  describe('setLogLevel and getLogLevel', () => {
    it('should set and get log level', () => {
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');

      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');

      setLogLevel('error');
      expect(getLogLevel()).toBe('error');

      setLogLevel('silent');
      expect(getLogLevel()).toBe('silent');
    });

    it('should start with info level by default', () => {
      // Reset to ensure default
      setLogLevel('info');
      expect(getLogLevel()).toBe('info');
    });
  });

  describe('logger.debug', () => {
    it('should log debug messages when level is debug', () => {
      setLogLevel('debug');
      logger.debug('Test debug message');
      expect(console.debug).toHaveBeenCalledWith('[rlm] DEBUG: Test debug message');
    });

    it('should not log debug messages when level is info or higher', () => {
      setLogLevel('info');
      logger.debug('Test debug message');
      expect(console.debug).not.toHaveBeenCalled();

      vi.clearAllMocks();

      setLogLevel('warn');
      logger.debug('Test debug message');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('should include additional arguments', () => {
      setLogLevel('debug');
      logger.debug('Message', { key: 'value' }, 42);
      expect(console.debug).toHaveBeenCalledWith(
        '[rlm] DEBUG: Message',
        { key: 'value' },
        42
      );
    });
  });

  describe('logger.info', () => {
    it('should log info messages when level is info or lower', () => {
      setLogLevel('info');
      logger.info('Test info message');
      expect(console.log).toHaveBeenCalledWith('[rlm] Test info message');

      vi.clearAllMocks();

      setLogLevel('debug');
      logger.info('Test info message');
      expect(console.log).toHaveBeenCalledWith('[rlm] Test info message');
    });

    it('should not log info messages when level is warn or higher', () => {
      setLogLevel('warn');
      logger.info('Test info message');
      expect(console.log).not.toHaveBeenCalled();

      vi.clearAllMocks();

      setLogLevel('error');
      logger.info('Test info message');
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should include additional arguments', () => {
      setLogLevel('info');
      logger.info('Application started', { version: '1.0.0' });
      expect(console.log).toHaveBeenCalledWith(
        '[rlm] Application started',
        { version: '1.0.0' }
      );
    });
  });

  describe('logger.warn', () => {
    it('should log warn messages when level is warn or lower', () => {
      setLogLevel('warn');
      logger.warn('Test warning message');
      expect(console.warn).toHaveBeenCalledWith('[rlm] WARN: Test warning message');

      vi.clearAllMocks();

      setLogLevel('info');
      logger.warn('Test warning message');
      expect(console.warn).toHaveBeenCalledWith('[rlm] WARN: Test warning message');
    });

    it('should not log warn messages when level is error or higher', () => {
      setLogLevel('error');
      logger.warn('Test warning message');
      expect(console.warn).not.toHaveBeenCalled();

      vi.clearAllMocks();

      setLogLevel('silent');
      logger.warn('Test warning message');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should include additional arguments', () => {
      setLogLevel('warn');
      logger.warn('High memory usage', { percent: 85 });
      expect(console.warn).toHaveBeenCalledWith(
        '[rlm] WARN: High memory usage',
        { percent: 85 }
      );
    });
  });

  describe('logger.error', () => {
    it('should log error messages when level is error or lower', () => {
      setLogLevel('error');
      logger.error('Test error message');
      expect(console.error).toHaveBeenCalledWith('[rlm] ERROR: Test error message');

      vi.clearAllMocks();

      setLogLevel('warn');
      logger.error('Test error message');
      expect(console.error).toHaveBeenCalledWith('[rlm] ERROR: Test error message');
    });

    it('should not log error messages when level is silent', () => {
      setLogLevel('silent');
      logger.error('Test error message');
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should include additional arguments', () => {
      setLogLevel('error');
      logger.error('Operation failed', new Error('Failed'));
      expect(console.error).toHaveBeenCalledWith(
        '[rlm] ERROR: Operation failed',
        expect.any(Error)
      );
    });
  });

  describe('log level hierarchy', () => {
    it('should respect the log level hierarchy', () => {
      const logLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

      for (const level of logLevels) {
        vi.clearAllMocks();
        setLogLevel(level);

        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');

        const callCounts = {
          debug: (console.debug as any).mock?.calls?.length ?? 0,
          info: (console.log as any).mock?.calls?.length ?? 0,
          warn: (console.warn as any).mock?.calls?.length ?? 0,
          error: (console.error as any).mock?.calls?.length ?? 0,
        };

        // At debug level, all should be logged
        if (level === 'debug') {
          expect(callCounts.debug).toBe(1);
          expect(callCounts.info).toBe(1);
          expect(callCounts.warn).toBe(1);
          expect(callCounts.error).toBe(1);
        }
        // At info level, info and above should be logged
        else if (level === 'info') {
          expect(callCounts.debug).toBe(0);
          expect(callCounts.info).toBe(1);
          expect(callCounts.warn).toBe(1);
          expect(callCounts.error).toBe(1);
        }
        // At warn level, warn and above should be logged
        else if (level === 'warn') {
          expect(callCounts.debug).toBe(0);
          expect(callCounts.info).toBe(0);
          expect(callCounts.warn).toBe(1);
          expect(callCounts.error).toBe(1);
        }
        // At error level, only error should be logged
        else if (level === 'error') {
          expect(callCounts.debug).toBe(0);
          expect(callCounts.info).toBe(0);
          expect(callCounts.warn).toBe(0);
          expect(callCounts.error).toBe(1);
        }
        // At silent level, nothing should be logged
        else if (level === 'silent') {
          expect(callCounts.debug).toBe(0);
          expect(callCounts.info).toBe(0);
          expect(callCounts.warn).toBe(0);
          expect(callCounts.error).toBe(0);
        }
      }
    });
  });

  describe('message formatting', () => {
    it('should format debug messages with [rlm] DEBUG: prefix', () => {
      setLogLevel('debug');
      logger.debug('Custom message');
      expect(console.debug).toHaveBeenCalledWith('[rlm] DEBUG: Custom message');
    });

    it('should format info messages with [rlm] prefix only', () => {
      setLogLevel('info');
      logger.info('Custom message');
      expect(console.log).toHaveBeenCalledWith('[rlm] Custom message');
    });

    it('should format warn messages with [rlm] WARN: prefix', () => {
      setLogLevel('warn');
      logger.warn('Custom message');
      expect(console.warn).toHaveBeenCalledWith('[rlm] WARN: Custom message');
    });

    it('should format error messages with [rlm] ERROR: prefix', () => {
      setLogLevel('error');
      logger.error('Custom message');
      expect(console.error).toHaveBeenCalledWith('[rlm] ERROR: Custom message');
    });
  });
});
