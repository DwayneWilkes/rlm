/**
 * @fileoverview Backend detection utilities for sandbox selection.
 *
 * Provides functions to detect which sandbox backends are available
 * on the current system.
 *
 * @module @rlm/cli/sandbox/detect
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { SandboxBackend } from '../types/index.js';
import { isDaemonRunning as checkDaemonSocket } from '../daemon/detect.js';

const execAsync = promisify(exec);

/**
 * Check if native Python is available on the system.
 *
 * Runs `python --version` to verify Python is installed and accessible.
 *
 * @param pythonPath - Path to Python executable (default: 'python')
 * @returns Promise resolving to true if Python is available
 *
 * @example
 * ```typescript
 * if (await isNativeAvailable()) {
 *   console.log('Native Python backend available');
 * }
 * ```
 */
export async function isNativeAvailable(pythonPath = 'python'): Promise<boolean> {
  try {
    await execAsync(`${pythonPath} --version`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the sandbox daemon is running.
 *
 * Delegates to the daemon detection module which checks if the daemon
 * socket is available and responding.
 *
 * @returns Promise resolving to true if daemon is running
 *
 * @example
 * ```typescript
 * if (await isDaemonRunning()) {
 *   console.log('Using daemon backend for best performance');
 * }
 * ```
 */
export async function isDaemonRunning(): Promise<boolean> {
  return checkDaemonSocket();
}

/**
 * Options for detectBestBackend with optional dependency injection for testing.
 */
export interface DetectOptions {
  /** Override isNativeAvailable check (for testing) */
  isNativeAvailable?: () => Promise<boolean>;
  /** Override isDaemonRunning check (for testing) */
  isDaemonRunning?: () => Promise<boolean>;
  /** Path to Python executable */
  pythonPath?: string;
}

/**
 * Detect the best available sandbox backend.
 *
 * Priority order:
 * 1. daemon - fastest, shares state across executions
 * 2. native - fast, requires Python installed
 * 3. pyodide - portable, no Python required
 *
 * @param options - Detection options for testing/customization
 * @returns Promise resolving to the best available backend
 *
 * @example
 * ```typescript
 * const backend = await detectBestBackend();
 * console.log(`Using ${backend} backend`);
 * ```
 */
export async function detectBestBackend(
  options: DetectOptions = {}
): Promise<SandboxBackend> {
  const {
    isNativeAvailable: checkNative = () => isNativeAvailable(options.pythonPath),
    isDaemonRunning: checkDaemon = isDaemonRunning,
  } = options;

  // Priority 1: Check if daemon is running
  if (await checkDaemon()) {
    return 'daemon';
  }

  // Priority 2: Check if native Python is available
  if (await checkNative()) {
    return 'native';
  }

  // Priority 3: Fallback to Pyodide (always available)
  return 'pyodide';
}
