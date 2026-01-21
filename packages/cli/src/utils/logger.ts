/**
 * @fileoverview Logging utility for @rlm/cli package.
 *
 * Provides a simple, configurable logging system with support for different
 * log levels (debug, info, warn, error, silent).
 *
 * @module logger
 *
 * @example
 * ```typescript
 * import { logger, setLogLevel } from './logger.js';
 *
 * setLogLevel('debug');
 * logger.debug('Debugging info', { key: 'value' });
 * logger.info('Application started');
 * logger.warn('This is a warning');
 * logger.error('An error occurred');
 * ```
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

let currentLevel: LogLevel = 'info';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Set the global log level.
 *
 * @param level - The log level to set
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Get the current log level.
 *
 * @returns The current log level
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Check if a message at the given level should be logged.
 *
 * @param level - The log level to check
 * @returns true if the message should be logged
 */
function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel];
}

/**
 * Logger object with methods for different log levels.
 */
export const logger = {
  /**
   * Log a debug-level message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.debug
   */
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.debug(`[rlm] DEBUG: ${message}`, ...args);
    }
  },

  /**
   * Log an info-level message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.log
   */
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      console.log(`[rlm] ${message}`, ...args);
    }
  },

  /**
   * Log a warning-level message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.warn
   */
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(`[rlm] WARN: ${message}`, ...args);
    }
  },

  /**
   * Log an error-level message.
   *
   * @param message - The message to log
   * @param args - Additional arguments to pass to console.error
   */
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) {
      console.error(`[rlm] ERROR: ${message}`, ...args);
    }
  },
};
