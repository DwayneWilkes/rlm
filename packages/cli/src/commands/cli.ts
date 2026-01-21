/**
 * @fileoverview CLI router for RLM.
 *
 * Creates the main Commander program with all subcommands registered.
 *
 * @module commands/cli
 */

import { Command } from 'commander';
import { createRunCommand } from './run.js';
import { createConfigCommand } from './config.js';
import { createDaemonCommand } from './daemon.js';

/**
 * Create the main CLI program with all subcommands.
 *
 * @returns Configured Commander program
 *
 * @example
 * ```typescript
 * import { createCLI } from './commands/cli.js';
 *
 * const cli = createCLI();
 * cli.parse(process.argv);
 * ```
 */
export function createCLI(): Command {
  const program = new Command()
    .name('rlm')
    .description('RLM - Recursive Language Model CLI')
    .version('0.1.0');

  // Add subcommands
  program.addCommand(createRunCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createDaemonCommand());

  return program;
}
