/**
 * @fileoverview Tests for DaemonServer.
 * @module @rlm/cli/daemon/server.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { DaemonServer } from './server.js';
import { WorkerPool } from './pool.js';

// Mock WorkerPool
vi.mock('./pool.js', () => {
  const mockSandbox = {
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({
      code: 'print(1)',
      stdout: '1\n',
      stderr: '',
      duration: 10,
    }),
    getVariable: vi.fn().mockResolvedValue(42),
    cancel: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  return {
    WorkerPool: vi.fn().mockImplementation(() => ({
      acquire: vi.fn().mockResolvedValue(mockSandbox),
      release: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockReturnValue({ total: 2, available: 2, inUse: 0 }),
    })),
  };
});

describe('DaemonServer', () => {
  let server: DaemonServer;
  let pool: WorkerPool;
  let testSocketPath: string;
  let testDir: string;

  beforeEach(() => {
    pool = new WorkerPool(2);
    // Use named pipe on Windows, Unix socket elsewhere
    if (os.platform() === 'win32') {
      // Named pipe format: \\.\pipe\<name>
      const uniqueName = `rlm-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      testSocketPath = `\\\\.\\pipe\\${uniqueName}`;
      testDir = ''; // No directory needed for named pipes
    } else {
      testDir = path.join(os.tmpdir(), `rlm-server-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(testDir, { recursive: true });
      testSocketPath = path.join(testDir, 'test.sock');
    }
    server = new DaemonServer(pool, testSocketPath);
  });

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
    // Only clean up directory on non-Windows (named pipes don't need cleanup)
    if (testDir) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('constructor', () => {
    it('should create server with pool and socket path', () => {
      expect(server).toBeDefined();
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('start', () => {
    it('should start listening on socket path', async () => {
      await server.start();

      expect(server.isRunning()).toBe(true);
    });

    it('should throw if already running', async () => {
      await server.start();

      await expect(server.start()).rejects.toThrow('Server is already running');
    });

    it('should remove existing socket file before starting', async () => {
      // Skip this test on Windows - named pipes don't need file cleanup
      if (os.platform() === 'win32') {
        await server.start();
        expect(server.isRunning()).toBe(true);
        return;
      }

      // Create a dummy socket file
      fs.writeFileSync(testSocketPath, '');

      await server.start();

      expect(server.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop the server', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      await server.stop();

      expect(server.isRunning()).toBe(false);
    });

    it('should be idempotent', async () => {
      await server.start();
      await server.stop();
      await server.stop();

      expect(server.isRunning()).toBe(false);
    });
  });

  describe('JSON-RPC protocol', () => {
    it('should handle execute request', async () => {
      await server.start();

      const response = await sendRequest(testSocketPath, {
        jsonrpc: '2.0',
        id: 1,
        method: 'execute',
        params: { code: 'print(1)' },
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toMatchObject({
        stdout: '1\n',
        stderr: '',
      });
    });

    it('should handle initialize request', async () => {
      await server.start();

      const response = await sendRequest(testSocketPath, {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: { context: 'test context' },
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(2);
      expect(response.result).toEqual({ success: true });
    });

    it('should handle getVariable request', async () => {
      await server.start();

      const response = await sendRequest(testSocketPath, {
        jsonrpc: '2.0',
        id: 3,
        method: 'getVariable',
        params: { name: 'result' },
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(3);
      expect(response.result).toEqual({ value: 42 });
    });

    it('should return error for unknown method', async () => {
      await server.start();

      const response = await sendRequest(testSocketPath, {
        jsonrpc: '2.0',
        id: 4,
        method: 'unknownMethod',
        params: {},
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(4);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain('Method not found');
    });

    it('should return error for invalid JSON', async () => {
      await server.start();

      const response = await sendRawRequest(testSocketPath, 'invalid json');

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32700);
      expect(response.error.message).toContain('Parse error');
    });

    it('should handle stats request', async () => {
      await server.start();

      const response = await sendRequest(testSocketPath, {
        jsonrpc: '2.0',
        id: 5,
        method: 'stats',
        params: {},
      });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(5);
      expect(response.result).toEqual({
        total: 2,
        available: 2,
        inUse: 0,
      });
    });
  });
});

/**
 * Send a JSON-RPC request to the server.
 */
async function sendRequest(socketPath: string, request: object): Promise<any> {
  return sendRawRequest(socketPath, JSON.stringify(request));
}

/**
 * Send a raw string request to the server.
 */
function sendRawRequest(socketPath: string, data: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(data + '\n');
    });

    let response = '';
    client.on('data', (chunk) => {
      response += chunk.toString();
      // Check for complete response (newline-delimited)
      if (response.includes('\n')) {
        client.end();
      }
    });

    client.on('end', () => {
      try {
        resolve(JSON.parse(response.trim()));
      } catch (err) {
        reject(new Error(`Failed to parse response: ${response}`));
      }
    });

    client.on('error', reject);

    // Timeout after 5 seconds
    setTimeout(() => {
      client.destroy();
      reject(new Error('Request timed out'));
    }, 5000);
  });
}
