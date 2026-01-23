/**
 * @fileoverview Run command for RLM CLI.
 *
 * Executes RLM tasks with configuration, sandbox, and output formatting.
 *
 * @module commands/run
 */

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { RLM, type SandboxFactory } from '@rlm/core';
import { PDFParse } from 'pdf-parse';
import { loadConfig, mergeConfig, resolveProfile, type Config } from '../config/index.js';
import { detectBestBackend, createSandbox } from '../sandbox/index.js';
import { createFormatter, type OutputFormat } from '../output/index.js';
import { validateFilePathOrThrow } from '../utils/index.js';
import type { SandboxBackend } from '../types/index.js';

/**
 * Options for the run command.
 */
interface RunOptions {
  context?: string;
  config?: string;
  profile?: string;
  format?: OutputFormat;
  backend?: 'native' | 'pyodide' | 'daemon';
  maxIterations?: number;
  maxCost?: number;
  maxDepth?: number;
  maxTime?: number;
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
    .option('-p, --profile <name>', 'Configuration profile to use (or set RLM_PROFILE env var)')
    .option(
      '-f, --format <format>',
      'Output format: text (human-readable), json, or yaml',
      'text'
    )
    .option(
      '-b, --backend <backend>',
      'Sandbox backend: native (Python), pyodide (WASM), or daemon'
    )
    .option(
      '-i, --max-iterations <n>',
      'Maximum number of iterations (default: 30)',
      (v) => parseInt(v, 10)
    )
    .option('--max-cost <n>', 'Maximum cost in dollars (default: 5.0)', parseFloat)
    .option(
      '--max-depth <n>',
      'Maximum recursion depth (default: 2)',
      (v) => parseInt(v, 10)
    )
    .option(
      '--max-time <ms>',
      'Maximum execution time in milliseconds (default: 300000)',
      (v) => parseInt(v, 10)
    )
    .action(async (task: string, options: RunOptions) => {
      try {
        // Load config from file
        const fileConfig = await loadConfig(options.config);

        // Resolve profile: CLI option > env var > config default
        const profileName = options.profile ?? process.env.RLM_PROFILE;
        const resolvedConfig = resolveProfile(fileConfig, profileName);

        // Build CLI overrides
        const cliOverrides: Partial<Config> = {
          output: {
            format: options.format ?? resolvedConfig.output.format,
          },
          repl: {
            ...resolvedConfig.repl,
            backend: options.backend ?? resolvedConfig.repl.backend,
          },
          budget: {
            maxCost: options.maxCost ?? resolvedConfig.budget.maxCost,
            maxIterations: options.maxIterations ?? resolvedConfig.budget.maxIterations,
            maxDepth: options.maxDepth ?? resolvedConfig.budget.maxDepth,
            maxTime: options.maxTime ?? resolvedConfig.budget.maxTime,
          },
        };

        // Merge configs (CLI flags take precedence over resolved profile)
        const config = mergeConfig(resolvedConfig, cliOverrides);

        // Resolve backend if 'auto'
        let backend = config.repl.backend;
        if (backend === 'auto') {
          backend = await detectBestBackend();
        }

        // Read context from file if provided
        let context = '';
        if (options.context) {
          // Validate the path for security
          const { resolvedPath, warning } = validateFilePathOrThrow(options.context);
          if (warning) {
            console.warn(warning);
          }

          // Handle different file types
          const ext = resolvedPath.toLowerCase().split('.').pop();
          if (ext === 'pdf') {
            // Extract text from PDF
            console.error('[rlm] Extracting text from PDF...');
            const dataBuffer = await readFile(resolvedPath);
            const parser = new PDFParse({ data: dataBuffer });
            const textResult = await parser.getText();
            context = textResult.pages.map((p: { text: string }) => p.text).join('\n\n');
            console.error(`[rlm] Extracted ${textResult.pages.length} pages`);
            await parser.destroy();
          } else {
            context = await readFile(resolvedPath, 'utf-8');
          }
        }

        // Create formatter
        const formatter = createFormatter(config.output.format);

        // Build sandbox factory that uses the resolved backend
        const resolvedBackend = backend as SandboxBackend;
        const sandboxFactory: SandboxFactory = (replConfig, bridges) =>
          createSandbox(
            {
              backend: resolvedBackend,
              timeout: replConfig.timeout,
              maxOutputLength: replConfig.maxOutputLength,
              useWorker: replConfig.useWorker,
              indexURL: replConfig.indexURL,
            },
            bridges
          );

        // Create RLM instance with injected sandboxFactory
        const rlm = new RLM({
          provider: config.provider,
          model: config.model,
          subcallModel: config.subcallModel,
          sandboxFactory,
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

        // Show progress
        console.error(`[rlm] Executing task with ${config.provider}/${config.model}...`);
        if (context) {
          console.error(`[rlm] Context: ${context.length.toLocaleString()} characters`);
        }

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
