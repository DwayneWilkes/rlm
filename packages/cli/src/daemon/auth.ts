/**
 * @fileoverview Authentication utilities for daemon process.
 *
 * Provides token-based authentication for daemon IPC connections.
 * Tokens are cryptographically random and stored with restrictive permissions.
 *
 * @module @rlm/cli/daemon/auth
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Length of authentication tokens in bytes (will be hex-encoded to 64 chars).
 */
const TOKEN_BYTES = 32;

/**
 * Get the default token file path for the current user.
 *
 * @returns Path to the token file
 */
export function getDefaultTokenPath(): string {
  if (os.platform() === 'win32') {
    const appData = process.env.LOCALAPPDATA ?? os.homedir();
    return path.join(appData, 'rlm', 'daemon.token');
  }
  const uid = process.getuid?.() ?? 'default';
  return `/tmp/rlm-daemon-${uid}.token`;
}

/**
 * Generate a cryptographically secure random token.
 *
 * @returns Hex-encoded random token
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Write an authentication token to a file with restrictive permissions.
 *
 * On Unix systems, the file is created with mode 0600 (owner read/write only).
 * On Windows, inherits parent directory permissions.
 *
 * @param tokenPath - Path to the token file
 * @param token - The authentication token to write
 */
export function writeToken(tokenPath: string, token: string): void {
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // Write with restrictive permissions (0600 on Unix)
  fs.writeFileSync(tokenPath, token + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Read an authentication token from a file.
 *
 * @param tokenPath - Path to the token file
 * @returns The token string, or null if file doesn't exist or is invalid
 */
export function readToken(tokenPath: string): string | null {
  try {
    const content = fs.readFileSync(tokenPath, 'utf-8').trim();
    if (!content || content.length !== TOKEN_BYTES * 2) {
      return null;
    }
    return content;
  } catch {
    return null;
  }
}

/**
 * Remove the token file.
 *
 * Does not throw if the file doesn't exist.
 *
 * @param tokenPath - Path to the token file
 */
export function cleanupToken(tokenPath: string): void {
  try {
    fs.unlinkSync(tokenPath);
  } catch {
    // Ignore errors - file may not exist
  }
}

/**
 * Validate a token against the expected value using constant-time comparison.
 *
 * Uses a timing-safe comparison to prevent timing attacks.
 *
 * @param provided - Token provided by client
 * @param expected - Expected token value
 * @returns True if tokens match
 */
export function validateToken(provided: string, expected: string): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (provided.length !== expected.length) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
