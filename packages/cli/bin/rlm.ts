#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for RLM.
 *
 * This file is the executable entry point when running `rlm` from the command line.
 * It creates the CLI program and parses command-line arguments.
 *
 * Respects the DEBUG environment variable to enable debug-level logging and stack traces.
 *
 * @example
 * ```bash
 * # Run a task
 * rlm run "Analyze this code" --context file.txt
 *
 * # Show config
 * rlm config show
 *
 * # Show help
 * rlm --help
 *
 * # Enable debug logging
 * DEBUG=1 rlm run task
 * ```
 */

import { createCLI } from '../src/commands/cli.js';
import { logger, setLogLevel } from '../src/index.js';

// Set log level based on DEBUG environment variable
if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
  setLogLevel('debug');
}

logger.debug('CLI startup', {
  args: process.argv.slice(2),
  nodeVersion: process.version,
  debugMode: process.env.DEBUG === '1' || process.env.DEBUG === 'true',
});

const cli = createCLI();
cli.parse(process.argv);
