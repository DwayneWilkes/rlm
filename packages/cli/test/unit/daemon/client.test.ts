/**
 * @fileoverview Tests for IPC Client.
 *
 * Tests JSON-RPC communication over Unix socket/named pipe,
 * including connection, request/response handling, reconnection, and timeouts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import { IPCClient } from '../../../src/daemon/client.js';
import { createTestSocketPath, cleanupSocketPath } from '../../fixtures/test-helpers.js';

describe('IPCClient', () => {
  let testSocketPath: string;
  let server: net.Server | null = null;
  let client: IPCClient | null = null;
  const serverConnections: net.Socket[] = [];

  // Helper to create and start a mock server
  async function startMockServer(
    onConnection?: (socket: net.Socket) => void
  ): Promise<void> {
    server = net.createServer((socket) => {
      serverConnections.push(socket);
      onConnection?.(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server!.on('error', reject);
      server!.listen(testSocketPath, resolve);
    });
  }

  // Helper to create echo server that responds to JSON-RPC requests
  async function startEchoServer(
    handler: (request: { id: number; method: string; params?: Record<string, unknown> }) => unknown
  ): Promise<void> {
    await startMockServer((socket) => {
      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const request = JSON.parse(line);
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            result: handler(request),
          };
          socket.write(JSON.stringify(response) + '\n');
        }
      });
    });
  }

  beforeEach(() => {
    testSocketPath = createTestSocketPath('rlm-client-test');
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
      client = null;
    }

    serverConnections.forEach((s) => s.destroy());
    serverConnections.length = 0;

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }

    cleanupSocketPath(testSocketPath);
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
      await startMockServer();

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
      await startMockServer(() => {
        connectionCount++;
      });

      client = new IPCClient(testSocketPath);
      await client.connect();
      await new Promise((r) => setTimeout(r, 10));

      await client.connect(); // Second connect should be no-op

      expect(client.isConnected()).toBe(true);
      expect(connectionCount).toBe(1);
    });
  });

  describe('disconnect', () => {
    it('disconnects from daemon', async () => {
      await startMockServer();

      client = new IPCClient(testSocketPath);
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('does nothing if not connected', async () => {
      client = new IPCClient(testSocketPath);
      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('request', () => {
    it('sends JSON-RPC request and receives response', async () => {
      await startEchoServer((req) => ({ echo: req.params?.message }));

      client = new IPCClient(testSocketPath);
      await client.connect();

      const result = await client.request('echo', { message: 'hello' });
      expect(result).toEqual({ echo: 'hello' });
    });

    it('handles JSON-RPC error responses', async () => {
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            error: { code: -32600, message: 'Invalid Request' },
          }) + '\n');
        });
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      await expect(client.request('invalid')).rejects.toThrow('Invalid Request');
    });

    it('times out on slow response', async () => {
      await startMockServer(); // Never respond

      client = new IPCClient(testSocketPath, { requestTimeout: 100 });
      await client.connect();

      await expect(client.request('slow')).rejects.toThrow(/timeout/i);
    });

    it('throws when not connected', async () => {
      client = new IPCClient(testSocketPath);

      await expect(client.request('test')).rejects.toThrow(/not connected/i);
    });

    it('handles multiple concurrent requests', async () => {
      await startMockServer((socket) => {
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
              socket.write(JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result: { id: request.id, value: request.params?.value },
              }) + '\n');
            }, Math.random() * 10);
          }
        });
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

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
      await startMockServer((socket) => {
        connectionCount++;
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { connectionCount },
          }) + '\n');
        });
      });

      client = new IPCClient(testSocketPath, { autoReconnect: true });
      await client.connect();

      const result1 = await client.request('test');
      expect((result1 as { connectionCount: number }).connectionCount).toBe(1);

      // Simulate server-side disconnect
      serverConnections[0].destroy();
      await new Promise((r) => setTimeout(r, 50));

      const result2 = await client.request('test');
      expect((result2 as { connectionCount: number }).connectionCount).toBe(2);
    });
  });

  describe('connection timeout', () => {
    it('times out if server never accepts connection', async () => {
      client = new IPCClient(testSocketPath, { connectTimeout: 50 });

      await expect(client.connect()).rejects.toThrow(/timeout|ENOENT|ECONNREFUSED/i);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('invalid JSON handling', () => {
    it('ignores invalid JSON responses from server', async () => {
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          socket.write('not valid json\n');
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { success: true },
          }) + '\n');
        });
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      const result = await client.request('test');
      expect(result).toEqual({ success: true });
    });
  });

  describe('response with no pending request', () => {
    it('ignores responses with unknown request IDs', async () => {
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: 99999,
            result: { wrong: true },
          }) + '\n');
          socket.write(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { correct: true },
          }) + '\n');
        });
      });

      client = new IPCClient(testSocketPath);
      await client.connect();

      const result = await client.request('test');
      expect(result).toEqual({ correct: true });
    });
  });

  describe('authentication', () => {
    it('authenticates automatically when token is provided', async () => {
      const authRequests: Array<{ token?: string }> = [];
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          if (request.method === 'auth') {
            authRequests.push(request.params);
            socket.write(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { authenticated: true },
            }) + '\n');
          } else {
            socket.write(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { success: true },
            }) + '\n');
          }
        });
      });

      client = new IPCClient(testSocketPath, { authToken: 'test-token-123' });
      await client.connect();

      expect(authRequests).toHaveLength(1);
      expect(authRequests[0]?.token).toBe('test-token-123');
    });

    it('throws when authentication fails', async () => {
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          if (request.method === 'auth') {
            socket.write(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { authenticated: false },
            }) + '\n');
          }
        });
      });

      client = new IPCClient(testSocketPath, { authToken: 'wrong-token' });
      await expect(client.connect()).rejects.toThrow(/authentication failed/i);
    });

    it('throws when authenticate() called without token', async () => {
      await startMockServer();

      client = new IPCClient(testSocketPath);
      await client.connect();

      const clientAny = client as unknown as { authenticate: () => Promise<void> };
      await expect(clientAny.authenticate()).rejects.toThrow(/no auth token/i);
    });

    it('skips authentication if already authenticated', async () => {
      let authCount = 0;
      await startMockServer((socket) => {
        socket.on('data', (data) => {
          const request = JSON.parse(data.toString().trim());
          if (request.method === 'auth') {
            authCount++;
            socket.write(JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { authenticated: true },
            }) + '\n');
          }
        });
      });

      client = new IPCClient(testSocketPath, { authToken: 'test-token' });
      await client.connect();

      const clientAny = client as unknown as { authenticate: () => Promise<void> };
      await clientAny.authenticate();

      expect(authCount).toBe(1);
    });
  });

  describe('auto-reconnect failure', () => {
    it('throws when auto-reconnect fails', async () => {
      await startEchoServer(() => ({ success: true }));

      client = new IPCClient(testSocketPath, { autoReconnect: true, connectTimeout: 500 });
      await client.connect();

      await new Promise((r) => setTimeout(r, 50));

      if (serverConnections[0]) {
        serverConnections[0].destroy();
      }
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;

      await new Promise((r) => setTimeout(r, 100));

      await expect(client.request('test')).rejects.toThrow(/not connected|auto-reconnect failed|ENOENT|ECONNREFUSED/i);
    }, 10000);
  });

  describe('isConnected', () => {
    it('returns false before connect', () => {
      client = new IPCClient(testSocketPath);
      expect(client.isConnected()).toBe(false);
    });

    it('returns true after connect', async () => {
      await startMockServer();

      client = new IPCClient(testSocketPath);
      await client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it('returns false after disconnect', async () => {
      await startMockServer();

      client = new IPCClient(testSocketPath);
      await client.connect();
      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });
});
