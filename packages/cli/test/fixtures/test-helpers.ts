/**
 * Shared test helpers for daemon tests.
 *
 * Provides cross-platform socket path generation and cleanup,
 * and common mock patterns for IPC testing.
 */

import * as net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Creates a unique socket path that works on both Windows (named pipes)
 * and Unix-like systems (socket files).
 */
export function createTestSocketPath(prefix = 'rlm-test'): string {
  const uniqueId = `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (process.platform === 'win32') {
    // Named pipe format on Windows
    return `\\\\.\\pipe\\${uniqueId}`;
  } else {
    // Unix socket file
    return `/tmp/${uniqueId}.sock`;
  }
}

/**
 * Creates a unique socket path with a temp directory (for server tests).
 * Returns both the socket path and directory path.
 */
export function createTestSocketPathWithDir(prefix = 'rlm-server-test'): {
  socketPath: string;
  dir: string;
} {
  if (process.platform === 'win32') {
    const uniqueId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      socketPath: `\\\\.\\pipe\\${uniqueId}`,
      dir: '', // No directory needed for named pipes
    };
  } else {
    const uniqueId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dir = path.join(os.tmpdir(), uniqueId);
    fs.mkdirSync(dir, { recursive: true });
    return {
      socketPath: path.join(dir, 'test.sock'),
      dir,
    };
  }
}

/**
 * Cleans up a socket path, handling platform differences.
 * Safe to call even if the socket doesn't exist.
 */
export function cleanupSocketPath(socketPath: string): void {
  // Named pipes on Windows don't need cleanup
  if (process.platform === 'win32') {
    return;
  }

  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Cleans up a directory (for server test cleanup).
 * Safe to call even if the directory doesn't exist.
 */
export function cleanupTestDir(dir: string): void {
  if (!dir) return;

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates a mock IPC server for testing.
 *
 * @param socketPath - Path to listen on
 * @param handler - Function to handle incoming requests
 * @returns Object with server, connections array, and cleanup function
 */
export async function createMockServer(
  socketPath: string,
  handler: (request: { id: number; method: string; params?: Record<string, unknown> }) => unknown
): Promise<{
  server: net.Server;
  connections: net.Socket[];
  cleanup: () => Promise<void>;
}> {
  const connections: net.Socket[] = [];

  const server = net.createServer((socket) => {
    connections.push(socket);
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const request = JSON.parse(line);
          const result = await handler(request);
          const response = {
            jsonrpc: '2.0',
            id: request.id,
            result,
          };
          socket.write(JSON.stringify(response) + '\n');
        } catch (err) {
          const response = {
            jsonrpc: '2.0',
            id: 0,
            error: {
              code: -32000,
              message: err instanceof Error ? err.message : String(err),
            },
          };
          socket.write(JSON.stringify(response) + '\n');
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(socketPath, resolve);
  });

  const cleanup = async (): Promise<void> => {
    connections.forEach((s) => s.destroy());
    connections.length = 0;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    cleanupSocketPath(socketPath);
  };

  return { server, connections, cleanup };
}
