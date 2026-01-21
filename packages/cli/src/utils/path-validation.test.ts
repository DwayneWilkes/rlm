/**
 * @fileoverview Tests for path validation utilities.
 * @module @rlm/cli/utils/path-validation.test
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { validateFilePath, validateFilePathOrThrow } from './path-validation.js';

describe('Path Validation', () => {
  const testBase = process.cwd();

  describe('validateFilePath', () => {
    describe('valid paths', () => {
      it('should accept relative paths within base directory', () => {
        const result = validateFilePath('./document.txt', testBase);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept nested relative paths', () => {
        const result = validateFilePath('./src/file.ts', testBase);
        expect(result.valid).toBe(true);
      });

      it('should accept absolute paths', () => {
        const absolutePath = path.join(testBase, 'test.txt');
        const result = validateFilePath(absolutePath, testBase);
        expect(result.valid).toBe(true);
      });
    });

    describe('blocked paths', () => {
      it('should block /etc/passwd', () => {
        const result = validateFilePath('/etc/passwd', testBase);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('restricted system directory');
      });

      it('should block /etc/shadow', () => {
        const result = validateFilePath('/etc/shadow', testBase);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('restricted system directory');
      });

      it('should block .ssh directory files', () => {
        const result = validateFilePath('/home/user/.ssh/id_rsa', testBase);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('restricted system directory');
      });

      it('should block .aws credentials', () => {
        const result = validateFilePath('/home/user/.aws/credentials', testBase);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('restricted system directory');
      });
    });

    describe('sensitive file warnings', () => {
      it('should warn about .env files', () => {
        const result = validateFilePath('./.env', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });

      it('should warn about .env.local files', () => {
        const result = validateFilePath('./.env.local', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });

      it('should warn about credentials.json', () => {
        const result = validateFilePath('./credentials.json', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });

      it('should warn about secrets.json', () => {
        const result = validateFilePath('./secrets.json', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });

      it('should warn about .pem files', () => {
        const result = validateFilePath('./key.pem', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });

      it('should warn about .key files', () => {
        const result = validateFilePath('./private.key', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('sensitive data');
      });
    });

    describe('path traversal warnings', () => {
      it('should warn when relative path resolves outside base', () => {
        const result = validateFilePath('../outside.txt', testBase);
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('resolves outside');
      });

      it('should warn on deep path traversal', () => {
        const result = validateFilePath('../../../../../../etc/hosts', testBase);
        // Should be blocked if it hits a sensitive directory
        // or warned if it goes outside base
        expect(result.warning || result.error).toBeDefined();
      });
    });
  });

  describe('validateFilePathOrThrow', () => {
    it('should return resolved path for valid paths', () => {
      const result = validateFilePathOrThrow('./test.txt', testBase);
      expect(result.resolvedPath).toBe(path.resolve(testBase, './test.txt'));
    });

    it('should throw for blocked paths', () => {
      expect(() => validateFilePathOrThrow('/etc/passwd', testBase)).toThrow(
        /restricted system directory/
      );
    });

    it('should return warning for sensitive files', () => {
      const result = validateFilePathOrThrow('./.env', testBase);
      expect(result.warning).toContain('sensitive data');
    });
  });
});
