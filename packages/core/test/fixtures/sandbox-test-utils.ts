/**
 * Shared test utilities for sandbox tests.
 *
 * Provides helpers to reduce boilerplate in sandbox test files.
 */

import { vi } from 'vitest';
import type { REPLConfig } from '../../src/types/index.js';
import type { Sandbox, SandboxBridges } from '../../src/repl/sandbox.js';

export const DEFAULT_CONFIG: REPLConfig = {
  timeout: 5000,
  maxOutputLength: 1000,
};

export function createMockBridges(): SandboxBridges {
  return {
    onLLMQuery: vi.fn().mockResolvedValue('LLM response'),
    onRLMQuery: vi.fn().mockResolvedValue('RLM response'),
  };
}

/**
 * Helper to run a test with a temporary sandbox.
 *
 * Creates a sandbox, initializes it with context, runs the test function,
 * then destroys the sandbox. This reduces boilerplate in tests that need
 * custom context or config.
 *
 * @example
 * ```ts
 * await withSandbox('test context', async (sandbox) => {
 *   const result = await sandbox.execute('print(context)');
 *   expect(result.stdout).toContain('test');
 * });
 * ```
 */
export async function withSandbox(
  createSandbox: (config: REPLConfig, bridges: SandboxBridges) => Sandbox,
  context: string,
  testFn: (sandbox: Sandbox) => Promise<void>,
  config: REPLConfig = DEFAULT_CONFIG,
  bridges: SandboxBridges = createMockBridges(),
): Promise<void> {
  const sandbox = createSandbox(config, bridges);
  try {
    await sandbox.initialize(context);
    await testFn(sandbox);
  } finally {
    await sandbox.destroy();
  }
}

/**
 * Helper to create a sandbox factory with curried config.
 * Useful for creating multiple sandboxes with the same settings.
 */
export function createSandboxFactory(
  createSandbox: (config: REPLConfig, bridges: SandboxBridges) => Sandbox,
  defaultConfig: REPLConfig = DEFAULT_CONFIG,
) {
  return (context: string, testFn: (sandbox: Sandbox) => Promise<void>, config?: REPLConfig) =>
    withSandbox(createSandbox, context, testFn, config ?? defaultConfig);
}
