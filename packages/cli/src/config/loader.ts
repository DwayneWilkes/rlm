/**
 * Configuration loader using cosmiconfig for file discovery and Zod for validation.
 *
 * @module config/loader
 */

import { cosmiconfig } from 'cosmiconfig';
import { ConfigSchema, parseConfig, type Config } from './schema.js';
import { logger } from '../utils/logger.js';

/**
 * Search places for cosmiconfig to look for configuration files.
 */
const SEARCH_PLACES = [
  '.rlmrc',
  '.rlmrc.json',
  '.rlmrc.yaml',
  '.rlmrc.yml',
  '.rlmrc.js',
  '.rlmrc.cjs',
  '.config/rlm/config.yaml',
  '.config/rlm/config.yml',
  '.config/rlm/config.json',
  'rlm.config.js',
  'rlm.config.cjs',
];

/**
 * Create a cosmiconfig explorer for RLM configuration.
 */
function createExplorer() {
  return cosmiconfig('rlm', {
    searchPlaces: SEARCH_PLACES,
  });
}

/**
 * Deep merge two objects, with source taking precedence.
 *
 * @param target - Base object
 * @param source - Object to merge (takes precedence)
 * @returns Merged object
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const sourceValue = source[key as keyof typeof source];
    const targetValue = target[key as keyof T];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // Recursively merge objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      );
    } else if (sourceValue !== undefined) {
      // Override with source value
      result[key] = sourceValue;
    }
  }

  return result as T;
}

/**
 * Load configuration from file or defaults.
 *
 * @param configPath - Explicit config file path (optional)
 * @param searchFrom - Directory to search from (optional, defaults to cwd)
 * @returns Validated configuration
 */
export async function loadConfig(
  configPath?: string,
  searchFrom?: string
): Promise<Config> {
  const explorer = createExplorer();

  logger.debug(`Loading config${configPath ? ` from: ${configPath}` : '...'}`);

  try {
    const result = configPath
      ? await explorer.load(configPath)
      : await explorer.search(searchFrom);

    if (result && !result.isEmpty) {
      logger.debug(`Config loaded from: ${result.filepath}`);

      // Warn about JS config files - they execute arbitrary code
      if (result.filepath.endsWith('.js') || result.filepath.endsWith('.cjs')) {
        logger.warn(
          `Loading config from JavaScript file: ${result.filepath}\n` +
            `  This is executing JavaScript code from this file.\n` +
            `  Only use .js config files from sources you trust.`
        );
      }

      return parseConfig(result.config);
    }

    logger.debug('No config file found, using defaults');
    return parseConfig({});
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to load config: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get the path to the active configuration file, if any.
 *
 * @param configPath - Explicit config file path (optional)
 * @param searchFrom - Directory to search from (optional)
 * @returns Path to config file, or null if none found
 */
export async function getConfigPath(
  configPath?: string,
  searchFrom?: string
): Promise<string | null> {
  if (configPath) {
    return configPath;
  }

  const explorer = createExplorer();

  try {
    const result = await explorer.search(searchFrom);
    return result && !result.isEmpty ? result.filepath : null;
  } catch {
    return null;
  }
}

/**
 * Merge file configuration with CLI flag overrides.
 *
 * CLI flags take precedence over file configuration.
 * Missing values are filled with defaults from the schema.
 *
 * @param fileConfig - Configuration loaded from file
 * @param cliFlags - Configuration from CLI flags
 * @returns Merged and validated configuration
 */
export function mergeConfig(
  fileConfig: Partial<Config>,
  cliFlags: Partial<Config>
): Config {
  logger.debug('Merging file config with CLI flags');

  // Start with an empty object and merge in order of precedence
  const merged = deepMerge(
    deepMerge({} as Config, fileConfig as Config),
    cliFlags as Config
  );

  // Validate and apply defaults
  const result = ConfigSchema.parse(merged);

  logger.debug(
    `Merged config: provider=${result.provider}, backend=${result.repl.backend}`
  );

  return result;
}

/**
 * Re-export types and utilities for convenience.
 */
export { ConfigSchema, type Config } from './schema.js';
