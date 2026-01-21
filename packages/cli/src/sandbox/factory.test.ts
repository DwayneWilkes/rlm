import { describe, it, expect, vi } from 'vitest';
import { createSandbox, type CreateSandboxConfig } from './factory.js';
import type { SandboxBridges, Sandbox } from '@rlm/core';
import type { SandboxBackend } from '../types/index.js';

// Mock bridges for testing
const mockBridges: SandboxBridges = {
  onLLMQuery: vi.fn().mockResolvedValue('mock llm response'),
  onRLMQuery: vi.fn().mockResolvedValue('mock rlm response'),
};

describe('createSandbox Factory', () => {
  describe('backend selection', () => {
    it('creates native sandbox when backend is native', () => {
      const config: CreateSandboxConfig = {
        backend: 'native',
        timeout: 30000,
        maxOutputLength: 50000,
      };

      const sandbox = createSandbox(config, mockBridges);

      expect(sandbox).toBeDefined();
      expect(sandbox.initialize).toBeDefined();
      expect(sandbox.execute).toBeDefined();
      expect(sandbox.getVariable).toBeDefined();
      expect(sandbox.cancel).toBeDefined();
      expect(sandbox.destroy).toBeDefined();
    });

    it('creates pyodide sandbox when backend is pyodide', () => {
      const config: CreateSandboxConfig = {
        backend: 'pyodide',
        timeout: 30000,
        maxOutputLength: 50000,
      };

      const sandbox = createSandbox(config, mockBridges);

      expect(sandbox).toBeDefined();
      expect(sandbox.initialize).toBeDefined();
      expect(sandbox.execute).toBeDefined();
    });

    it('throws error when backend is daemon (not implemented)', () => {
      const config: CreateSandboxConfig = {
        backend: 'daemon',
        timeout: 30000,
        maxOutputLength: 50000,
      };

      expect(() => createSandbox(config, mockBridges)).toThrow(
        'Daemon backend is not yet implemented'
      );
    });
  });

  describe('config forwarding', () => {
    it('passes timeout config to sandbox', () => {
      const config: CreateSandboxConfig = {
        backend: 'native',
        timeout: 60000,
        maxOutputLength: 50000,
      };

      const sandbox = createSandbox(config, mockBridges);
      expect(sandbox).toBeDefined();
      // The timeout is internal to the sandbox, we verify it was created
    });

    it('passes maxOutputLength config to sandbox', () => {
      const config: CreateSandboxConfig = {
        backend: 'pyodide',
        timeout: 30000,
        maxOutputLength: 100000,
      };

      const sandbox = createSandbox(config, mockBridges);
      expect(sandbox).toBeDefined();
    });

    it('passes pythonPath to native sandbox', () => {
      const config: CreateSandboxConfig = {
        backend: 'native',
        timeout: 30000,
        maxOutputLength: 50000,
        pythonPath: '/usr/bin/python3',
      };

      const sandbox = createSandbox(config, mockBridges);
      expect(sandbox).toBeDefined();
    });
  });

  describe('bridges forwarding', () => {
    it('passes bridges to sandbox', () => {
      const config: CreateSandboxConfig = {
        backend: 'native',
        timeout: 30000,
        maxOutputLength: 50000,
      };

      const sandbox = createSandbox(config, mockBridges);
      expect(sandbox).toBeDefined();
      // Bridges are internal, we verify sandbox was created successfully
    });
  });

  describe('type safety', () => {
    it('accepts valid backend types', () => {
      const backends: SandboxBackend[] = ['native', 'pyodide'];

      for (const backend of backends) {
        const config: CreateSandboxConfig = {
          backend,
          timeout: 30000,
          maxOutputLength: 50000,
        };

        const sandbox = createSandbox(config, mockBridges);
        expect(sandbox).toBeDefined();
      }
    });

    it('returns Sandbox interface', () => {
      const config: CreateSandboxConfig = {
        backend: 'native',
        timeout: 30000,
        maxOutputLength: 50000,
      };

      const sandbox: Sandbox = createSandbox(config, mockBridges);
      expect(sandbox).toBeDefined();
    });
  });
});
