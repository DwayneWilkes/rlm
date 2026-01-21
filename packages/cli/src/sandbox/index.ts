/**
 * @fileoverview Sandbox backend selection and factory module.
 *
 * This module provides utilities for selecting and creating sandbox backends
 * for Python code execution in the RLM CLI.
 *
 * @module @rlm/cli/sandbox
 *
 * @example
 * ```typescript
 * import {
 *   createSandbox,
 *   detectBestBackend,
 *   isNativeAvailable,
 * } from '@rlm/cli';
 *
 * // Auto-detect best backend
 * const backend = await detectBestBackend();
 *
 * // Create sandbox with detected backend
 * const sandbox = createSandbox(
 *   { backend, timeout: 30000, maxOutputLength: 50000 },
 *   { onLLMQuery: ..., onRLMQuery: ... }
 * );
 * ```
 */

// Factory
export { createSandbox, type CreateSandboxConfig } from './factory.js';

// Detection utilities
export {
  detectBestBackend,
  isNativeAvailable,
  isDaemonRunning,
  type DetectOptions,
} from './detect.js';
