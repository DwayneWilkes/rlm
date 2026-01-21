/**
 * @fileoverview Path validation utilities for secure file access.
 *
 * Provides validation to prevent path traversal attacks and
 * access to sensitive system files.
 *
 * @module @rlm/cli/utils/path-validation
 */

import path from 'node:path';
import fs from 'node:fs';

/**
 * Sensitive file patterns that should trigger a warning.
 * These files may contain secrets or credentials.
 */
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\..+$/i,
  /credentials\.json$/i,
  /secrets\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa$/i,
  /id_ed25519$/i,
  /\.ssh\/config$/i,
  /\.npmrc$/i,
  /\.pypirc$/i,
  /\.netrc$/i,
  /\.aws\/credentials$/i,
  /\.docker\/config\.json$/i,
];

/**
 * Sensitive directory paths (partial matches - Unix style).
 */
const SENSITIVE_DIRECTORIES_UNIX = [
  '/.ssh/',
  '/.gnupg/',
  '/.aws/',
  '/.docker/',
  '/private/',
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
];

/**
 * Sensitive directory paths (Windows style).
 */
const SENSITIVE_DIRECTORIES_WINDOWS = [
  '\\.ssh\\',
  '\\.gnupg\\',
  '\\.aws\\',
  '\\.docker\\',
];

/**
 * Result of path validation.
 */
export interface PathValidationResult {
  /** Whether the path is allowed */
  valid: boolean;
  /** The resolved absolute path */
  resolvedPath: string;
  /** Warning message if the file is potentially sensitive */
  warning?: string;
  /** Error message if the path is blocked */
  error?: string;
}

/**
 * Validate a file path for safe reading.
 *
 * Checks for:
 * - Path traversal attempts
 * - Access to sensitive system files
 * - Potentially sensitive user files (warning only)
 *
 * @param filePath - The path to validate
 * @param basePath - Base path to resolve relative paths against (defaults to cwd)
 * @returns Validation result with resolved path and any warnings/errors
 *
 * @example
 * ```typescript
 * const result = validateFilePath('./document.txt');
 * if (!result.valid) {
 *   console.error(result.error);
 * } else if (result.warning) {
 *   console.warn(result.warning);
 * }
 * ```
 */
export function validateFilePath(
  filePath: string,
  basePath: string = process.cwd()
): PathValidationResult {
  // Normalize and resolve the path
  const normalizedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(normalizedBase, filePath);
  const normalizedPath = path.normalize(resolvedPath);

  // Check for path traversal (resolved path should be under base or be an absolute path the user explicitly specified)
  const isAbsoluteInput = path.isAbsolute(filePath);

  // For Windows, normalize drive letters
  const normalizedResolved = normalizedPath.toLowerCase();

  // Check against sensitive directories (Unix-style paths - forward slashes)
  const forwardSlashPath = normalizedResolved.replace(/\\/g, '/');
  for (const sensitiveDir of SENSITIVE_DIRECTORIES_UNIX) {
    if (forwardSlashPath.includes(sensitiveDir.toLowerCase())) {
      return {
        valid: false,
        resolvedPath,
        error: `Access denied: "${filePath}" is in a restricted system directory`,
      };
    }
  }

  // Check against sensitive directories (Windows-style paths - backslashes)
  for (const sensitiveDir of SENSITIVE_DIRECTORIES_WINDOWS) {
    if (normalizedResolved.includes(sensitiveDir.toLowerCase())) {
      return {
        valid: false,
        resolvedPath,
        error: `Access denied: "${filePath}" is in a restricted system directory`,
      };
    }
  }

  // Check against sensitive file patterns
  const fileName = path.basename(resolvedPath);
  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(resolvedPath)) {
      return {
        valid: true,
        resolvedPath,
        warning:
          `Warning: "${filePath}" may contain sensitive data (credentials, keys). ` +
          `Make sure you trust this file before loading it as context.`,
      };
    }
  }

  // If relative path resolved outside base directory, warn but allow
  if (!isAbsoluteInput && !resolvedPath.startsWith(normalizedBase)) {
    return {
      valid: true,
      resolvedPath,
      warning:
        `Warning: "${filePath}" resolves outside the current directory. ` +
        `Resolved to: ${resolvedPath}`,
    };
  }

  return {
    valid: true,
    resolvedPath,
  };
}

/**
 * Validate a file path and throw if blocked.
 *
 * @param filePath - The path to validate
 * @param basePath - Base path to resolve relative paths against
 * @throws Error if path is blocked
 * @returns The resolved path and optional warning
 */
export function validateFilePathOrThrow(
  filePath: string,
  basePath: string = process.cwd()
): { resolvedPath: string; warning?: string } {
  const result = validateFilePath(filePath, basePath);

  if (!result.valid) {
    throw new Error(result.error);
  }

  return {
    resolvedPath: result.resolvedPath,
    warning: result.warning,
  };
}
