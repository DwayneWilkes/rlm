/**
 * @fileoverview Daemon detection utilities.
 *
 * Provides platform-specific socket path generation and daemon availability checks.
 * Supports Unix sockets on Linux/macOS and named pipes on Windows.
 *
 * @module @rlm/cli/daemon/detect
 */

import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Daemon ping response containing status information.
 */
export interface DaemonInfo {
  /** Daemon uptime in milliseconds */
  uptime: number;
  /** Number of active worker processes */
  workers: number;
}

/**
 * Get the platform-specific socket path for the daemon.
 *
 * On Unix platforms (Linux, macOS), returns a path in /tmp or os.tmpdir()
 * with the user's UID for isolation between users.
 *
 * On Windows, returns a named pipe path.
 *
 * @returns The socket path for the current platform
 *
 * @example
 * ```typescript
 * const socketPath = getSocketPath();
 * // Linux: '/tmp/rlm-daemon-1000.sock'
 * // Windows: '\\\\.\\pipe\\rlm-daemon-username'
 * ```
 */
export function getSocketPath(): string {
  const platform = process.platform;

  if (platform === 'win32') {
    // Windows uses named pipes
    const username = os.userInfo().username;
    return `\\\\.\\pipe\\rlm-daemon-${username}`;
  }

  // Unix platforms use socket files
  const uid = process.getuid?.() ?? 'default';
  const tmpDir = platform === 'linux' ? '/tmp' : os.tmpdir();
  return path.join(tmpDir, `rlm-daemon-${uid}.sock`);
}

/**
 * Check if the daemon is running by attempting to connect to its socket.
 *
 * @param socketPath - Optional custom socket path (defaults to getSocketPath())
 * @returns True if daemon is running and accepting connections
 *
 * @example
 * ```typescript
 * if (await isDaemonRunning()) {
 *   console.log('Daemon is available');
 * }
 * ```
 */
export async function isDaemonRunning(socketPath?: string): Promise<boolean> {
  const target = socketPath ?? getSocketPath();

  return new Promise((resolve) => {
    const socket = net.createConnection(target);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    // Short timeout for connection check
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Ping the daemon to get status information.
 *
 * Sends a JSON-RPC ping request and returns daemon status.
 *
 * @param socketPath - Optional custom socket path (defaults to getSocketPath())
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Daemon info if running and responsive, null otherwise
 *
 * @example
 * ```typescript
 * const info = await pingDaemon();
 * if (info) {
 *   console.log(`Daemon uptime: ${info.uptime}ms, workers: ${info.workers}`);
 * }
 * ```
 */
export async function pingDaemon(
  socketPath?: string,
  timeout = 5000
): Promise<DaemonInfo | null> {
  const target = socketPath ?? getSocketPath();

  return new Promise((resolve) => {
    const socket = net.createConnection(target);
    let buffer = '';
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(null);
      }
    };

    const timeoutHandle = setTimeout(cleanup, timeout);

    socket.on('connect', () => {
      // Send JSON-RPC ping request
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
      };
      socket.write(JSON.stringify(request) + '\n');
    });

    socket.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const response = JSON.parse(line);
          if (response.result && typeof response.result.uptime === 'number') {
            clearTimeout(timeoutHandle);
            resolved = true;
            socket.destroy();
            resolve({
              uptime: response.result.uptime,
              workers: response.result.workers ?? 0,
            });
            return;
          }
        } catch {
          // Invalid JSON, continue waiting or timeout
        }
      }
    });

    socket.on('error', cleanup);
    socket.on('close', cleanup);
  });
}
