/**
 * @fileoverview Config command for RLM CLI.
 *
 * Provides subcommands for viewing and managing RLM configuration.
 *
 * @module commands/config
 */

import { Command } from 'commander';
import { stringify as yamlStringify } from 'yaml';
import { loadConfig, getConfigPath } from '../config/index.js';

/**
 * Create the config command with show and path subcommands.
 *
 * @returns Command instance for config management
 *
 * @example
 * ```typescript
 * const program = new Command();
 * program.addCommand(createConfigCommand());
 * program.parse(['config', 'show']);
 * ```
 */
export function createConfigCommand(): Command {
  const config = new Command('config')
    .description('View and manage RLM configuration');

  config
    .command('show')
    .description('Show resolved configuration as YAML')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options: { config?: string }) => {
      const resolvedConfig = await loadConfig(options.config);
      const yaml = yamlStringify(resolvedConfig);
      console.log(yaml);
    });

  config
    .command('path')
    .description('Show config file path')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options: { config?: string }) => {
      const configPath = await getConfigPath(options.config);
      if (configPath) {
        console.log(configPath);
      } else {
        console.log('no config file found');
      }
    });

  return config;
}
