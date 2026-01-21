/**
 * @fileoverview Tests for PID file management.
 * @module @rlm/cli/daemon/pid.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writePID, readPID, cleanupPID, isProcessRunning } from './pid.js';

describe('PID File Management', () => {
  let testDir: string;
  let testPidPath: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = path.join(os.tmpdir(), `rlm-pid-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testDir, { recursive: true });
    testPidPath = path.join(testDir, 'test.pid');
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writePID', () => {
    it('should write current process PID to file', () => {
      writePID(testPidPath);

      expect(fs.existsSync(testPidPath)).toBe(true);
      const content = fs.readFileSync(testPidPath, 'utf-8');
      expect(parseInt(content.trim(), 10)).toBe(process.pid);
    });

    it('should overwrite existing PID file', () => {
      fs.writeFileSync(testPidPath, '12345');

      writePID(testPidPath);

      const content = fs.readFileSync(testPidPath, 'utf-8');
      expect(parseInt(content.trim(), 10)).toBe(process.pid);
    });

    it('should create parent directories if they do not exist', () => {
      const nestedPath = path.join(testDir, 'nested', 'dirs', 'test.pid');

      writePID(nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('readPID', () => {
    it('should return null if PID file does not exist', () => {
      const result = readPID(testPidPath);

      expect(result).toBeNull();
    });

    it('should return PID from existing file', () => {
      fs.writeFileSync(testPidPath, '12345\n');

      const result = readPID(testPidPath);

      expect(result).toBe(12345);
    });

    it('should return null if PID file contains invalid content', () => {
      fs.writeFileSync(testPidPath, 'not-a-number');

      const result = readPID(testPidPath);

      expect(result).toBeNull();
    });

    it('should handle empty PID file', () => {
      fs.writeFileSync(testPidPath, '');

      const result = readPID(testPidPath);

      expect(result).toBeNull();
    });
  });

  describe('cleanupPID', () => {
    it('should remove PID file', () => {
      fs.writeFileSync(testPidPath, '12345');

      cleanupPID(testPidPath);

      expect(fs.existsSync(testPidPath)).toBe(false);
    });

    it('should not throw if PID file does not exist', () => {
      expect(() => cleanupPID(testPidPath)).not.toThrow();
    });
  });

  describe('isProcessRunning', () => {
    it('should return true for current process', () => {
      const result = isProcessRunning(process.pid);

      expect(result).toBe(true);
    });

    it('should return false for non-existent PID', () => {
      // Use a very high PID that is unlikely to exist
      const result = isProcessRunning(999999999);

      expect(result).toBe(false);
    });

    it('should return false for negative PID', () => {
      const result = isProcessRunning(-1);

      expect(result).toBe(false);
    });

    it('should return false for zero PID', () => {
      const result = isProcessRunning(0);

      expect(result).toBe(false);
    });
  });
});
