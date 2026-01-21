#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for RLM.
 *
 * This file is the executable entry point when running `rlm` from the command line.
 * It delegates to the main function in src/index.ts with proper error handling and logging.
 *
 * Respects the DEBUG environment variable to enable debug-level logging and stack traces.
 *
 * @example
 * ```bash
 * # Run a task
 * rlm run task.md -o output.md
 *
 * # Show help
 * rlm --help
 *
 * # Enable debug logging
 * DEBUG=1 rlm run task.md -o output.md
 * ```
 */

import { main, logger, setLogLevel } from '../src/index.js';

/**
 * Run the CLI with error boundary.
 *
 * Sets up logging based on environment variables and catches any unhandled errors.
 * If DEBUG=1 environment variable is set, enables debug logging and stack traces.
 */
(() => {
  // Set log level based on DEBUG environment variable
  if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
    setLogLevel('debug');
  }

  logger.debug('CLI startup', {
    args: process.argv.slice(2),
    nodeVersion: process.version,
    debugMode: process.env.DEBUG === '1' || process.env.DEBUG === 'true',
  });

  main(process.argv.slice(2)).catch((error: unknown) => {
    if (error instanceof Error) {
      logger.error(`Error: ${error.message}`);
      if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
        logger.debug('Stack trace:', error.stack);
      }
    } else {
      logger.error(`An unexpected error occurred: ${error}`);
    }
    process.exit(1);
  });
})();
