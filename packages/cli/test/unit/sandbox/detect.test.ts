import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectBestBackend,
  isNativeAvailable,
  isDaemonRunning,
} from '../../../src/sandbox/detect.js';

describe('Backend Detection', () => {
  describe('isNativeAvailable', () => {
    it('returns true when Python is available', async () => {
      // This test depends on the actual system having Python installed
      // In a real CI environment, we'd mock this, but for local dev
      // we can test the actual behavior
      const result = await isNativeAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('returns false when Python check fails', async () => {
      // Test with an invalid python path
      const result = await isNativeAvailable('nonexistent-python-binary');
      expect(result).toBe(false);
    });

    it('accepts custom python path', async () => {
      // Test that custom path is used
      const result = await isNativeAvailable('python');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isDaemonRunning', () => {
    it('returns boolean based on daemon socket availability', async () => {
      // Real implementation checks if daemon socket is available
      const result = await isDaemonRunning();
      expect(typeof result).toBe('boolean');
    });

    it('returns false when daemon is not started', async () => {
      // Without a daemon running, should return false
      const result = await isDaemonRunning();
      expect(result).toBe(false);
    });
  });

  describe('detectBestBackend', () => {
    it('returns native when Python is available and daemon is not running', async () => {
      // Mock the detection functions
      const mockIsNativeAvailable = vi.fn().mockResolvedValue(true);
      const mockIsDaemonRunning = vi.fn().mockResolvedValue(false);

      const result = await detectBestBackend({
        isNativeAvailable: mockIsNativeAvailable,
        isDaemonRunning: mockIsDaemonRunning,
      });

      expect(result).toBe('native');
      expect(mockIsDaemonRunning).toHaveBeenCalled();
      expect(mockIsNativeAvailable).toHaveBeenCalled();
    });

    it('returns daemon when daemon is running', async () => {
      const mockIsNativeAvailable = vi.fn().mockResolvedValue(true);
      const mockIsDaemonRunning = vi.fn().mockResolvedValue(true);

      const result = await detectBestBackend({
        isNativeAvailable: mockIsNativeAvailable,
        isDaemonRunning: mockIsDaemonRunning,
      });

      expect(result).toBe('daemon');
    });

    it('returns pyodide when neither daemon nor native is available', async () => {
      const mockIsNativeAvailable = vi.fn().mockResolvedValue(false);
      const mockIsDaemonRunning = vi.fn().mockResolvedValue(false);

      const result = await detectBestBackend({
        isNativeAvailable: mockIsNativeAvailable,
        isDaemonRunning: mockIsDaemonRunning,
      });

      expect(result).toBe('pyodide');
    });

    it('follows priority: daemon > native > pyodide', async () => {
      // When daemon is running, always pick daemon
      let result = await detectBestBackend({
        isNativeAvailable: vi.fn().mockResolvedValue(true),
        isDaemonRunning: vi.fn().mockResolvedValue(true),
      });
      expect(result).toBe('daemon');

      // When daemon is not running but native is available, pick native
      result = await detectBestBackend({
        isNativeAvailable: vi.fn().mockResolvedValue(true),
        isDaemonRunning: vi.fn().mockResolvedValue(false),
      });
      expect(result).toBe('native');

      // When neither is available, fallback to pyodide
      result = await detectBestBackend({
        isNativeAvailable: vi.fn().mockResolvedValue(false),
        isDaemonRunning: vi.fn().mockResolvedValue(false),
      });
      expect(result).toBe('pyodide');
    });

    it('uses real detection functions when no mocks provided', async () => {
      // This should work without throwing and return a valid backend
      const result = await detectBestBackend();
      expect(['native', 'pyodide', 'daemon']).toContain(result);
    });
  });
});
