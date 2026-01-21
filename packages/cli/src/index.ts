/**
 * @fileoverview Public API for @rlm/cli package.
 *
 * This module exports the main CLI entry point and configuration types
 * for running RLM tasks from the command line.
 *
 * @module @rlm/cli
 *
 * @example
 * ```typescript
 * import { main, logger, setLogLevel } from '@rlm/cli';
 *
 * // Set logging level
 * setLogLevel('debug');
 *
 * // Run CLI with arguments
 * await main(['run', 'task.md', '-o', 'output.md']);
 * ```
 */

import { logger, setLogLevel, getLogLevel, type LogLevel } from './utils/logger.js';

// Re-export logger utilities
export { logger, setLogLevel, getLogLevel, type LogLevel };

// Re-export config utilities
export {
  ConfigSchema,
  parseConfig,
  loadConfig,
  mergeConfig,
  getConfigPath,
  type Config,
  type Provider,
  type Backend,
  type OutputFormat,
  type BudgetConfig,
  type ReplConfig,
  type OutputConfig,
} from './config/index.js';

// Re-export sandbox utilities
export {
  createSandbox,
  detectBestBackend,
  isNativeAvailable,
  isDaemonRunning,
  type CreateSandboxConfig,
  type DetectOptions,
} from './sandbox/index.js';

// Re-export types
export type { SandboxBackend } from './types/index.js';

// Re-export daemon utilities
export {
  WorkerPool,
  DaemonServer,
  getDefaultSocketPath,
  writePID,
  readPID,
  cleanupPID,
  isProcessRunning,
  type PoolStats,
} from './daemon/index.js';

/**
 * Main CLI entry point.
 *
 * Parses command-line arguments and executes the appropriate command.
 * Logs startup information and any errors.
 *
 * @param args - Command-line arguments (typically process.argv.slice(2))
 * @returns A promise that resolves when the CLI completes
 *
 * @example
 * ```typescript
 * // In bin/rlm.ts
 * import { main } from '../src/index.js';
 * main(process.argv.slice(2)).catch(console.error);
 * ```
 */
export async function main(args: string[]): Promise<void> {
  logger.debug('CLI main() called', { args });

  // Placeholder implementation - will be expanded in future waves
  // Currently just validates that the function exists and is callable
  void args;
}
