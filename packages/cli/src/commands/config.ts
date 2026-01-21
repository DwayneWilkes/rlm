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
    .description(
      'View and manage RLM configuration\n\n' +
        'Configuration is loaded from .rlmrc.yaml, .rlmrc.json, or rlm.config.js\n' +
        'files in the current directory or parent directories.\n\n' +
        'Examples:\n' +
        '  $ rlm config show\n' +
        '  $ rlm config path\n' +
        '  $ rlm config show --config /path/to/config.yaml'
    );

  config
    .command('show')
    .description(
      'Show resolved configuration as YAML\n\n' +
        'Displays the full configuration with all defaults merged.'
    )
    .option('-c, --config <path>', 'Path to a specific config file to load')
    .action(async (options: { config?: string }) => {
      const resolvedConfig = await loadConfig(options.config);
      const yaml = yamlStringify(resolvedConfig);
      console.log(yaml);
    });

  config
    .command('path')
    .description(
      'Show config file path\n\n' +
        'Displays the path to the discovered config file, or indicates if none found.'
    )
    .option('-c, --config <path>', 'Path to a specific config file to check')
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
