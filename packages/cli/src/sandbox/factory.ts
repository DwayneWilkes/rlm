/**
 * @fileoverview Sandbox factory for creating backend-specific sandbox instances.
 *
 * This module provides a unified factory function for creating sandboxes
 * based on the selected backend type.
 *
 * @module @rlm/cli/sandbox/factory
 */

import {
  createSandbox as createPyodideSandbox,
  NativePythonSandbox,
  type Sandbox,
  type SandboxBridges,
  type REPLConfig,
} from '@rlm/core';
import type { SandboxBackend } from '../types/index.js';

/**
 * Configuration for createSandbox factory.
 */
export interface CreateSandboxConfig {
  /** Backend type to use */
  backend: SandboxBackend;
  /** Execution timeout per code block (ms) */
  timeout: number;
  /** Max output length before truncation */
  maxOutputLength: number;
  /** Path to Python executable (for native backend) */
  pythonPath?: string;
  /** Whether to use worker isolation (for pyodide backend) */
  useWorker?: boolean;
  /** Pyodide CDN URL (for pyodide backend) */
  indexURL?: string | string[];
}

/**
 * Create a sandbox instance based on the specified backend.
 *
 * @param config - Sandbox configuration including backend type
 * @param bridges - Callbacks for LLM/RLM queries from Python
 * @returns A Sandbox instance
 * @throws Error if backend is 'daemon' (not yet implemented)
 *
 * @example
 * ```typescript
 * import { createSandbox } from '@rlm/cli';
 *
 * const sandbox = createSandbox(
 *   { backend: 'native', timeout: 30000, maxOutputLength: 50000 },
 *   {
 *     onLLMQuery: async (prompt) => llm.complete(prompt),
 *     onRLMQuery: async (task, ctx) => rlm.execute(task, ctx),
 *   }
 * );
 * ```
 */
export function createSandbox(
  config: CreateSandboxConfig,
  bridges: SandboxBridges
): Sandbox {
  const replConfig: REPLConfig = {
    timeout: config.timeout,
    maxOutputLength: config.maxOutputLength,
    useWorker: config.useWorker,
    indexURL: config.indexURL,
  };

  switch (config.backend) {
    case 'native':
      return new NativePythonSandbox(replConfig, bridges, config.pythonPath);

    case 'pyodide':
      return createPyodideSandbox(replConfig, bridges);

    case 'daemon':
      throw new Error('Daemon backend is not yet implemented');

    default: {
      // Exhaustive check - TypeScript will error if a case is missing
      const _exhaustive: never = config.backend;
      throw new Error(`Unknown backend: ${_exhaustive}`);
    }
  }
}
