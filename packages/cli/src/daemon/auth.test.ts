/**
 * @fileoverview Tests for daemon authentication utilities.
 * @module @rlm/cli/daemon/auth.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateToken,
  writeToken,
  readToken,
  cleanupToken,
  validateToken,
  getDefaultTokenPath,
} from './auth.js';

describe('Daemon Authentication', () => {
  let testDir: string;
  let testTokenPath: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = path.join(
      os.tmpdir(),
      `rlm-auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(testDir, { recursive: true });
    testTokenPath = path.join(testDir, 'test.token');
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getDefaultTokenPath', () => {
    it('should return a platform-specific path', () => {
      const tokenPath = getDefaultTokenPath();

      expect(tokenPath).toBeTruthy();
      expect(typeof tokenPath).toBe('string');

      if (os.platform() === 'win32') {
        expect(tokenPath).toContain('rlm');
        expect(tokenPath).toContain('daemon.token');
      } else {
        expect(tokenPath).toContain('/tmp/');
        expect(tokenPath).toContain('.token');
      }
    });
  });

  describe('generateToken', () => {
    it('should generate a 64-character hex token', () => {
      const token = generateToken();

      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens on each call', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      const token3 = generateToken();

      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });
  });

  describe('writeToken', () => {
    it('should write token to file', () => {
      const token = generateToken();

      writeToken(testTokenPath, token);

      expect(fs.existsSync(testTokenPath)).toBe(true);
      const content = fs.readFileSync(testTokenPath, 'utf-8').trim();
      expect(content).toBe(token);
    });

    it('should create parent directories if they do not exist', () => {
      const nestedPath = path.join(testDir, 'nested', 'dirs', 'test.token');
      const token = generateToken();

      writeToken(nestedPath, token);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it('should overwrite existing token file', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      writeToken(testTokenPath, token1);
      writeToken(testTokenPath, token2);

      const content = fs.readFileSync(testTokenPath, 'utf-8').trim();
      expect(content).toBe(token2);
    });
  });

  describe('readToken', () => {
    it('should return null if token file does not exist', () => {
      const result = readToken(testTokenPath);

      expect(result).toBeNull();
    });

    it('should return token from existing file', () => {
      const token = generateToken();
      fs.writeFileSync(testTokenPath, token + '\n');

      const result = readToken(testTokenPath);

      expect(result).toBe(token);
    });

    it('should return null if token is invalid length', () => {
      fs.writeFileSync(testTokenPath, 'too-short\n');

      const result = readToken(testTokenPath);

      expect(result).toBeNull();
    });

    it('should return null for empty file', () => {
      fs.writeFileSync(testTokenPath, '');

      const result = readToken(testTokenPath);

      expect(result).toBeNull();
    });

    it('should trim whitespace from token', () => {
      const token = generateToken();
      fs.writeFileSync(testTokenPath, `  ${token}  \n`);

      const result = readToken(testTokenPath);

      expect(result).toBe(token);
    });
  });

  describe('cleanupToken', () => {
    it('should remove token file', () => {
      const token = generateToken();
      writeToken(testTokenPath, token);

      cleanupToken(testTokenPath);

      expect(fs.existsSync(testTokenPath)).toBe(false);
    });

    it('should not throw if token file does not exist', () => {
      expect(() => cleanupToken(testTokenPath)).not.toThrow();
    });
  });

  describe('validateToken', () => {
    it('should return true for matching tokens', () => {
      const token = generateToken();

      expect(validateToken(token, token)).toBe(true);
    });

    it('should return false for non-matching tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();

      expect(validateToken(token1, token2)).toBe(false);
    });

    it('should return false for different length tokens', () => {
      const token = generateToken();
      const shortToken = token.slice(0, 32);

      expect(validateToken(shortToken, token)).toBe(false);
      expect(validateToken(token, shortToken)).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      const token = generateToken();

      expect(validateToken(null as unknown as string, token)).toBe(false);
      expect(validateToken(undefined as unknown as string, token)).toBe(false);
      expect(validateToken(123 as unknown as string, token)).toBe(false);
      expect(validateToken(token, null as unknown as string)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const upperToken = token.toUpperCase();

      expect(validateToken(token, upperToken)).toBe(false);
    });

    it('should use constant-time comparison', () => {
      // This test verifies the comparison doesn't short-circuit
      // by checking that single character differences are handled the same way
      const token = generateToken();
      const almostMatch = token.slice(0, -1) + (token[63] === '0' ? '1' : '0');
      const totallyDifferent = generateToken();

      // Both should return false - we can't easily test timing,
      // but we can verify the function behaves correctly
      expect(validateToken(almostMatch, token)).toBe(false);
      expect(validateToken(totallyDifferent, token)).toBe(false);
    });
  });

  describe('Integration: write and read token', () => {
    it('should be able to write and read back a token', () => {
      const token = generateToken();

      writeToken(testTokenPath, token);
      const readBack = readToken(testTokenPath);

      expect(readBack).toBe(token);
      expect(validateToken(readBack!, token)).toBe(true);
    });
  });
});
