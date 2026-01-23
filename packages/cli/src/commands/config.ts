/**
 * @fileoverview Config command for RLM CLI.
 *
 * Provides subcommands for viewing and managing RLM configuration and profiles.
 *
 * @module commands/config
 */

import { Command } from 'commander';
import { stringify as yamlStringify } from 'yaml';
import { loadConfig, getConfigPath, resolveProfile } from '../config/index.js';

/**
 * Create the config command with list, show, and path subcommands.
 *
 * @returns Command instance for config management
 *
 * @example
 * ```typescript
 * const program = new Command();
 * program.addCommand(createConfigCommand());
 * program.parse(['config', 'list']);
 * ```
 */
export function createConfigCommand(): Command {
  const config = new Command('config')
    .description(
      'View and manage RLM configuration\n\n' +
        'Configuration is loaded from .rlmrc.yaml, .rlmrc.json, or rlm.config.js\n' +
        'files in the current directory or parent directories.\n\n' +
        'Examples:\n' +
        '  $ rlm config list\n' +
        '  $ rlm config show local\n' +
        '  $ rlm config path'
    );

  // config list - show all available profiles
  config
    .command('list')
    .description(
      'List available configuration profiles\n\n' +
        'Shows all named profiles in the configuration file.'
    )
    .option('-c, --config <path>', 'Path to a specific config file to load')
    .action(async (options: { config?: string }) => {
      try {
        const resolvedConfig = await loadConfig(options.config);
        const configPath = await getConfigPath(options.config);

        console.log('RLM Configuration Profiles');
        console.log('===========================');
        if (configPath) {
          console.log(`Config file: ${configPath}`);
        } else {
          console.log('Config file: (using defaults)');
        }
        console.log();

        if (!resolvedConfig.profiles || Object.keys(resolvedConfig.profiles).length === 0) {
          console.log('No profiles defined. Using flat configuration:');
          console.log(`  Provider: ${resolvedConfig.provider}`);
          console.log(`  Model: ${resolvedConfig.model}`);
          if (resolvedConfig.subcallModel) {
            console.log(`  Subcall Model: ${resolvedConfig.subcallModel}`);
          }
        } else {
          console.log('Available profiles:');
          for (const [name, profile] of Object.entries(resolvedConfig.profiles)) {
            const isDefault = resolvedConfig.default === name;
            const marker = isDefault ? ' (default)' : '';
            const extendsInfo = profile.extends ? ` → extends: ${profile.extends}` : '';
            console.log(`  • ${name}${marker}${extendsInfo}`);
            if (profile.provider) console.log(`      provider: ${profile.provider}`);
            if (profile.model) console.log(`      model: ${profile.model}`);
            if (profile.subcallProvider) console.log(`      subcallProvider: ${profile.subcallProvider}`);
            if (profile.subcallModel) console.log(`      subcallModel: ${profile.subcallModel}`);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      }
    });

  // config show [profile] - show resolved configuration
  config
    .command('show')
    .description(
      'Show resolved configuration as YAML\n\n' +
        'Displays the full configuration with all defaults merged.\n' +
        'If a profile name is given, resolves that profile first.'
    )
    .argument('[profile]', 'Profile name to resolve (uses default if not specified)')
    .option('-c, --config <path>', 'Path to a specific config file to load')
    .action(async (profile: string | undefined, options: { config?: string }) => {
      try {
        const loadedConfig = await loadConfig(options.config);
        const resolved = resolveProfile(loadedConfig, profile);
        const yaml = yamlStringify(resolved);
        console.log(yaml);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Error: ${error.message}`);
        }
        process.exit(1);
      }
    });

  // config path - show config file path
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
