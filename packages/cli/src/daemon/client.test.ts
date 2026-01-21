/**
 * @fileoverview Tests for IPC Client.
 *
 * Tests JSON-RPC communication over Unix socket/named pipe,
 * including connection, request/response handling, reconnection, and timeouts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import { IPCClient } from './client.js';

describe('IPCClient', () => {
  let testSocketPath: string;
  let server: net.Server | null = null;
  let client: IPCClient | null = null;
  const serverConnections: net.Socket[] = [];

  beforeEach(() => {
    // Use a unique test socket path
    if (process.platform === 'win32') {
      testSocketPath = `\\\\.\\pipe\\rlm-client-test-${process.pid}-${Date.now()}`;
    } else {
      testSocketPath = `/tmp/rlm-client-test-${process.pid}-${Date.now()}.sock`;
    }
  });

  afterEach(async () => {
    // Disconnect client first
    if (client) {
      await client.disconnect();
      client = null;
    }

    // Clean up server connections
    serverConnections.forEach((s) => s.destroy());
    serverConnections.length = 0;

    // Close server
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }

    // Clean up socket file on Unix
    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(testSocketPath);
      } catch {
        // Ignore if doesn't exist
      }
    }
  });

  describe('constructor', () => {
    it('creates client with socket path', () => {
      client = new IPCClient(testSocketPath);
      expect(client).toBeInstanceOf(IPCClient);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('connects to daemon socket', async () => {
      // Create mock server
      server = net.createServer((socket) => {
        serverConnections.push(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('throws when daemon is not running', async () => {
      client = new IPCClient(testSocketPath);

      await expect(client.connect()).rejects.toThrow();
      expect(client.isConnected()).toBe(false);
    });

    it('does nothing if already connected', async () => {
      let connectionCount = 0;
      server = net.createServer((socket) => {
        connectionCount++;
        serverConnections.push(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();
      // Wait a moment to ensure connection is registered
      await new Promise((r) => setTimeout(r, 10));

      await client.connect(); // Second connect should be no-op

      expect(client.isConnected()).toBe(true);
      expect(connectionCount).toBe(1); // Only one connection
    });
  });

  describe('disconnect', () => {
    it('disconnects from daemon', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('does nothing if not connected', async () => {
      client = new IPCClient(testSocketPath);
      await client.disconnect(); // Should not throw
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('request', () => {
    it('sends JSON-RPC request and receives response', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { echo: request.params.message },
          };
          socket.write(JSON.stringify(response) + '\n');
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      const result = await client.request('echo', { message: 'hello' });
      expect(result).toEqual({ echo: 'hello' });
    });

    it('handles JSON-RPC error responses', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32600, message: 'Invalid Request' },
          };
          socket.write(JSON.stringify(response) + '\n');
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      await expect(client.request('invalid')).rejects.toThrow('Invalid Request');
    });

    it('times out on slow response', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
        // Never respond
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath, { requestTimeout: 100 });
      await client.connect();

      await expect(client.request('slow')).rejects.toThrow(/timeout/i);
    });

    it('throws when not connected', async () => {
      client = new IPCClient(testSocketPath);

      await expect(client.request('test')).rejects.toThrow(/not connected/i);
    });

    it('handles multiple concurrent requests', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const request = JSON.parse(line);
            // Simulate varying response times
            setTimeout(() => {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { id: request.id, value: request.params?.value },
              };
              socket.write(JSON.stringify(response) + '\n');
            }, Math.random() * 10);
          }
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      // Send multiple requests concurrently
      const results = await Promise.all([
        client.request('test', { value: 1 }),
        client.request('test', { value: 2 }),
        client.request('test', { value: 3 }),
      ]);

      expect(results).toHaveLength(3);
      expect(results.map((r: unknown) => (r as { value: number }).value).sort()).toEqual([1, 2, 3]);
    });

    it('reconnects automatically after disconnect', async () => {
      let connectionCount = 0;
      server = net.createServer((socket) => {
        connectionCount++;
        serverConnections.push(socket);
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: { connectionCount },
          };
          socket.write(JSON.stringify(response) + '\n');
        });
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath, { autoReconnect: true });
      await client.connect();

      // First request
      const result1 = await client.request('test');
      expect((result1 as { connectionCount: number }).connectionCount).toBe(1);

      // Simulate server-side disconnect
      serverConnections[0].destroy();

      // Wait a bit for disconnect to be detected
      await new Promise((r) => setTimeout(r, 50));

      // Next request should trigger reconnect
      const result2 = await client.request('test');
      expect((result2 as { connectionCount: number }).connectionCount).toBe(2);
    });
  });

  describe('isConnected', () => {
    it('returns false before connect', () => {
      client = new IPCClient(testSocketPath);
      expect(client.isConnected()).toBe(false);
    });

    it('returns true after connect', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('returns false after disconnect', async () => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      client = new IPCClient(testSocketPath);
      await client.connect();
      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });
});
