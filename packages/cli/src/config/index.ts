/**
 * Configuration module for RLM CLI.
 *
 * @module config
 */

export {
  ConfigSchema,
  parseConfig,
  type Config,
  type Provider,
  type Backend,
  type OutputFormat,
  type BudgetConfig,
  type ReplConfig,
  type OutputConfig,
} from './schema.js';

export { loadConfig, mergeConfig, getConfigPath } from './loader.js';
