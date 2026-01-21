/**
 * @fileoverview Run command for RLM CLI.
 *
 * Executes RLM tasks with configuration, sandbox, and output formatting.
 *
 * @module commands/run
 */

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { RLM } from '@rlm/core';
import { loadConfig, mergeConfig, type Config } from '../config/index.js';
import { detectBestBackend } from '../sandbox/index.js';
import { createFormatter, type OutputFormat } from '../output/index.js';

/**
 * Options for the run command.
 */
interface RunOptions {
  context?: string;
  config?: string;
  format?: OutputFormat;
  backend?: 'native' | 'pyodide' | 'daemon';
}

/**
 * Create the run command for executing RLM tasks.
 *
 * @returns Command instance for task execution
 *
 * @example
 * ```typescript
 * const program = new Command();
 * program.addCommand(createRunCommand());
 * program.parse(['run', 'Analyze this code', '--format', 'json']);
 * ```
 */
export function createRunCommand(): Command {
  return new Command('run')
    .description(
      'Execute an RLM task\n\n' +
        'Runs the specified task using an LLM with Python REPL capabilities.\n' +
        'The task will be decomposed and executed iteratively until completion.\n\n' +
        'Examples:\n' +
        '  $ rlm run "Analyze the code structure"\n' +
        '  $ rlm run "Summarize" --context document.txt\n' +
        '  $ rlm run "Generate report" --format json\n' +
        '  $ rlm run "Quick analysis" --backend native'
    )
    .argument('<task>', 'The task description to execute (quoted string)')
    .option('-x, --context <file>', 'Path to context file to include with the task')
    .option('-c, --config <file>', 'Path to custom config file (.rlmrc.yaml)')
    .option(
      '-f, --format <format>',
      'Output format: text (human-readable), json, or yaml',
      'text'
    )
    .option(
      '-b, --backend <backend>',
      'Sandbox backend: native (Python), pyodide (WASM), or daemon'
    )
    .action(async (task: string, options: RunOptions) => {
      try {
        // Load config from file
        const fileConfig = await loadConfig(options.config);

        // Build CLI overrides
        const cliOverrides: Partial<Config> = {
          output: {
            format: options.format ?? fileConfig.output.format,
          },
          repl: {
            ...fileConfig.repl,
            backend: options.backend ?? fileConfig.repl.backend,
          },
        };

        // Merge configs
        const config = mergeConfig(fileConfig, cliOverrides);

        // Resolve backend if 'auto'
        let backend = config.repl.backend;
        if (backend === 'auto') {
          backend = await detectBestBackend();
        }

        // Read context from file if provided
        let context = '';
        if (options.context) {
          context = await readFile(options.context, 'utf-8');
        }

        // Create formatter
        const formatter = createFormatter(config.output.format);

        // Create RLM instance
        const rlm = new RLM({
          provider: config.provider,
          model: config.model,
          defaultBudget: {
            maxCost: config.budget.maxCost,
            maxIterations: config.budget.maxIterations,
            maxDepth: config.budget.maxDepth,
            maxTime: config.budget.maxTime,
          },
          repl: {
            timeout: config.repl.timeout,
            maxOutputLength: 50000,
          },
        });

        // Execute the task
        const result = await rlm.execute({
          task,
          context,
        });

        // Output the result
        const output = formatter.format(result);
        console.log(output);

        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);
      } catch (error) {
        const formatter = createFormatter(options.format ?? 'text');
        if (error instanceof Error) {
          console.error(formatter.formatError(error));
        } else {
          console.error(`Unexpected error: ${error}`);
        }
        process.exit(1);
      }
    });
}
