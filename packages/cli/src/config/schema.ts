/**
 * Configuration schema for RLM CLI using Zod validation.
 *
 * @module config/schema
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';

/**
 * LLM provider options.
 */
export const ProviderSchema = z.enum(['anthropic', 'openai', 'ollama', 'claude-code']);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Sandbox backend options.
 */
export const BackendSchema = z.enum(['auto', 'native', 'daemon', 'pyodide']);
export type Backend = z.infer<typeof BackendSchema>;

/**
 * Output format options.
 */
export const OutputFormatSchema = z.enum(['text', 'json', 'yaml']);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/**
 * Budget configuration schema.
 */
export const BudgetConfigSchema = z
  .object({
    /** Maximum cost in dollars */
    maxCost: z.number().positive().default(5.0),
    /** Maximum number of iterations */
    maxIterations: z.number().int().positive().default(30),
    /** Maximum recursion depth */
    maxDepth: z.number().int().nonnegative().default(2),
    /** Maximum execution time in milliseconds */
    maxTime: z.number().positive().default(300000),
  })
  .default({});

export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

/**
 * REPL configuration schema.
 */
export const ReplConfigSchema = z
  .object({
    /** Sandbox backend to use */
    backend: BackendSchema.default('auto'),
    /** Execution timeout in milliseconds */
    timeout: z.number().positive().default(30000),
  })
  .default({});

export type ReplConfig = z.infer<typeof ReplConfigSchema>;

/**
 * Output configuration schema.
 */
export const OutputConfigSchema = z
  .object({
    /** Output format */
    format: OutputFormatSchema.default('text'),
  })
  .default({});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;

/**
 * Profile configuration schema (used within profiles object).
 * All fields are optional since profiles can extend other profiles.
 */
export const ProfileSchema = z.object({
  /** Extend another profile by name */
  extends: z.string().optional(),
  /** LLM provider to use */
  provider: ProviderSchema.optional(),
  /** Model name for the provider */
  model: z.string().optional(),
  /** Provider for subcalls (defaults to main provider) */
  subcallProvider: ProviderSchema.optional(),
  /** Model for subcalls (defaults to main model) */
  subcallModel: z.string().optional(),
  /** Model-specific prompt hints for optimal RLM execution */
  promptHints: z.array(z.string()).optional(),
  /** Budget limits */
  budget: BudgetConfigSchema.optional(),
  /** REPL/sandbox settings */
  repl: ReplConfigSchema.optional(),
  /** Output settings */
  output: OutputConfigSchema.optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Complete RLM CLI configuration schema.
 *
 * Supports two formats:
 * 1. Flat config (backward compatible)
 * 2. Profiles-based config with named profiles and extends
 *
 * @example Flat config
 * ```yaml
 * provider: ollama
 * model: llama3.2
 * budget:
 *   maxCost: 5.0
 * ```
 *
 * @example Profiles config
 * ```yaml
 * profiles:
 *   local:
 *     provider: ollama
 *     model: qwen2.5-coder:14b
 *   cloud:
 *     provider: anthropic
 *     model: claude-sonnet-4-5
 *   research:
 *     extends: cloud
 *     model: claude-opus-4-5
 * default: local
 * ```
 */
export const ConfigSchema = z
  .object({
    /** LLM provider to use */
    provider: ProviderSchema.default('ollama'),
    /** Model name for the provider */
    model: z.string().default('llama3.2'),
    /** Provider for subcalls (defaults to main provider) */
    subcallProvider: ProviderSchema.optional(),
    /** Model for subcalls (llm_query, sub-RLMs) - defaults to main model */
    subcallModel: z.string().optional(),
    /** Model-specific prompt hints for optimal RLM execution */
    promptHints: z.array(z.string()).optional(),
    /** Budget limits */
    budget: BudgetConfigSchema,
    /** REPL/sandbox settings */
    repl: ReplConfigSchema,
    /** Output settings */
    output: OutputConfigSchema,
    /** Named configuration profiles */
    profiles: z.record(z.string(), ProfileSchema).optional(),
    /** Default profile to use when none specified */
    default: z.string().optional(),
  })
  .default({});

/**
 * Inferred configuration type from schema.
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration, logging any validation errors.
 *
 * @param data - Raw configuration data
 * @returns Validated configuration with defaults applied
 * @throws {z.ZodError} If validation fails
 */
export function parseConfig(data: unknown): Config {
  logger.debug('Parsing configuration...');
  try {
    const config = ConfigSchema.parse(data);
    logger.debug(`Config parsed: provider=${config.provider}, model=${config.model}`);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(`Config validation failed: ${error.message}`);
    }
    throw error;
  }
}
