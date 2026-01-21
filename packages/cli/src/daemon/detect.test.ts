/**
 * @fileoverview Tests for daemon detection utilities.
 *
 * Tests platform-specific socket path generation, daemon running detection,
 * and daemon ping functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { getSocketPath, isDaemonRunning, pingDaemon } from './detect.js';

describe('Daemon Detection', () => {
  describe('getSocketPath', () => {
    it('returns a platform-appropriate path', () => {
      const socketPath = getSocketPath();

      if (process.platform === 'win32') {
        expect(socketPath).toMatch(/^\\\\.\\pipe\\rlm-daemon/);
      } else {
        expect(socketPath).toContain('rlm-daemon');
        expect(socketPath).toEndWith('.sock');
      }
    });

    it('includes user identifier for isolation', () => {
      const socketPath = getSocketPath();

      if (process.platform === 'win32') {
        // Windows uses username
        const username = os.userInfo().username;
        expect(socketPath).toContain(username);
      } else {
        // Unix uses uid
        const uid = process.getuid?.() ?? 'default';
        expect(socketPath).toContain(String(uid));
      }
    });

    it('returns consistent path on repeated calls', () => {
      const path1 = getSocketPath();
      const path2 = getSocketPath();

      expect(path1).toBe(path2);
    });
  });

  describe('isDaemonRunning', () => {
    let testSocketPath: string;
    let server: net.Server | null = null;

    beforeEach(() => {
      // Use a unique test socket path
      if (process.platform === 'win32') {
        testSocketPath = `\\\\.\\pipe\\rlm-test-${process.pid}-${Date.now()}`;
      } else {
        testSocketPath = `/tmp/rlm-test-${process.pid}-${Date.now()}.sock`;
      }
    });

    afterEach(async () => {
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

    it('returns true when daemon socket exists and responds', async () => {
      // Create a mock server
      server = net.createServer();

      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      const running = await isDaemonRunning(testSocketPath);
      expect(running).toBe(true);
    });

    it('returns false when daemon is not running', async () => {
      // Without a server, should return false
      const running = await isDaemonRunning(testSocketPath);
      expect(running).toBe(false);
    });

    it('returns false on connection error', async () => {
      // Test with non-existent socket
      const running = await isDaemonRunning('/tmp/nonexistent-rlm-socket-xyz.sock');
      expect(running).toBe(false);
    });
  });

  describe('pingDaemon', () => {
    let testSocketPath: string;
    let server: net.Server | null = null;

    beforeEach(() => {
      // Use a unique test socket path
      if (process.platform === 'win32') {
        testSocketPath = `\\\\.\\pipe\\rlm-ping-test-${process.pid}-${Date.now()}`;
      } else {
        testSocketPath = `/tmp/rlm-ping-test-${process.pid}-${Date.now()}.sock`;
      }
    });

    afterEach(async () => {
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

    it('returns daemon info when daemon is running', async () => {
      // Create a mock server that responds to auth and ping
      server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const request = JSON.parse(line);
            if (request.method === 'auth') {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { authenticated: true },
              };
              socket.write(JSON.stringify(response) + '\n');
            } else if (request.method === 'ping') {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { uptime: 12345, workers: 2 },
              };
              socket.write(JSON.stringify(response) + '\n');
            }
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      const info = await pingDaemon(testSocketPath);
      expect(info).not.toBeNull();
      expect(info?.uptime).toBe(12345);
      expect(info?.workers).toBe(2);
    });

    it('returns null when daemon is not running', async () => {
      const info = await pingDaemon('/tmp/nonexistent-socket-xyz.sock');
      expect(info).toBeNull();
    });

    it('returns null on timeout', async () => {
      const connections: net.Socket[] = [];

      // Create a server that never responds
      server = net.createServer((socket) => {
        connections.push(socket);
        // Don't respond to anything - just hold the connection
      });

      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      // Short timeout for test speed
      const info = await pingDaemon(testSocketPath, 100);
      expect(info).toBeNull();

      // Clean up server connections
      connections.forEach((s) => s.destroy());
    });

    it('returns null on invalid JSON response', async () => {
      // Create a server that responds with invalid JSON
      server = net.createServer((socket) => {
        socket.on('data', () => {
          socket.write('not valid json\n');
        });
      });

      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      const info = await pingDaemon(testSocketPath, 1000);
      expect(info).toBeNull();
    });

    it('handles response without workers field', async () => {
      server = net.createServer((socket) => {
        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const request = JSON.parse(line);
            if (request.method === 'auth') {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { authenticated: true },
              };
              socket.write(JSON.stringify(response) + '\n');
            } else if (request.method === 'ping') {
              const response = {
                jsonrpc: '2.0',
                id: request.id,
                result: { uptime: 5000 }, // No workers field
              };
              socket.write(JSON.stringify(response) + '\n');
            }
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        server!.on('error', reject);
        server!.listen(testSocketPath, resolve);
      });

      const info = await pingDaemon(testSocketPath);
      expect(info).not.toBeNull();
      expect(info?.uptime).toBe(5000);
      expect(info?.workers).toBe(0); // Defaults to 0
    });
  });
});
