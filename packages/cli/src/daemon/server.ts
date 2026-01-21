/**
 * @fileoverview IPC server for daemon process using JSON-RPC over Unix sockets/named pipes.
 *
 * Provides a JSON-RPC server that routes execution requests to a WorkerPool.
 *
 * @module @rlm/cli/daemon/server
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { WorkerPool } from './pool.js';

/**
 * JSON-RPC request interface.
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response interface.
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * JSON-RPC error codes.
 */
const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Get the default socket path for the current platform.
 *
 * Uses user-specific path for isolation between users.
 *
 * @returns Socket path for Unix or named pipe path for Windows
 */
export function getDefaultSocketPath(): string {
  if (os.platform() === 'win32') {
    const username = os.userInfo().username;
    return `\\\\.\\pipe\\rlm-daemon-${username}`;
  }
  const uid = process.getuid?.() ?? 'default';
  return `/tmp/rlm-daemon-${uid}.sock`;
}

/**
 * IPC server that handles JSON-RPC requests for RLM execution.
 *
 * Features:
 * - Unix socket on Linux/Mac
 * - Named pipe on Windows
 * - JSON-RPC 2.0 protocol
 * - Routes requests to WorkerPool
 *
 * @example
 * ```typescript
 * const pool = new WorkerPool(4);
 * const server = new DaemonServer(pool, '/tmp/rlm-daemon.sock');
 * await server.start();
 * // ... handle requests
 * await server.stop();
 * ```
 */
export class DaemonServer {
  private pool: WorkerPool;
  private socketPath: string;
  private server: net.Server | null = null;
  private running = false;
  private startTime: number = 0;

  /**
   * Create a new DaemonServer.
   *
   * @param pool - WorkerPool to route requests to
   * @param socketPath - Path for Unix socket or named pipe
   */
  constructor(pool: WorkerPool, socketPath: string) {
    this.pool = pool;
    this.socketPath = socketPath;
  }

  /**
   * Start the server.
   *
   * @throws If server is already running
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Server is already running');
    }

    // Clean up existing socket file
    this.cleanupSocket();

    // Create parent directory if needed (for non-Windows)
    if (os.platform() !== 'win32') {
      const dir = path.dirname(this.socketPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.running = false;
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.running = true;
        this.startTime = Date.now();
        resolve();
      });
    });
  }

  /**
   * Stop the server.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      this.running = false;
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.server = null;
        this.cleanupSocket();
        resolve();
      });
    });
  }

  /**
   * Check if the server is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Clean up the socket file.
   */
  private cleanupSocket(): void {
    // Named pipes on Windows don't need file cleanup
    if (os.platform() === 'win32') {
      return;
    }

    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Handle an incoming connection.
   */
  private handleConnection(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Process complete messages (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        const response = await this.handleMessage(line);
        socket.write(JSON.stringify(response) + '\n');
      }
    });

    socket.on('error', () => {
      // Client disconnected or error - ignore
    });
  }

  /**
   * Handle a JSON-RPC message.
   */
  private async handleMessage(message: string): Promise<JsonRpcResponse> {
    let request: JsonRpcRequest;

    // Parse the message
    try {
      request = JSON.parse(message);
    } catch {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: JSON_RPC_ERRORS.PARSE_ERROR,
          message: 'Parse error: Invalid JSON',
        },
      };
    }

    // Validate JSON-RPC format
    if (request.jsonrpc !== '2.0' || !request.method) {
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: JSON_RPC_ERRORS.INVALID_REQUEST,
          message: 'Invalid Request: Missing jsonrpc or method',
        },
      };
    }

    // Route to appropriate handler
    try {
      const result = await this.handleRequest(request);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Check if error has a custom code property
      const errorCode = (err as { code?: number }).code ?? JSON_RPC_ERRORS.INTERNAL_ERROR;
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Handle a validated JSON-RPC request.
   */
  private async handleRequest(request: JsonRpcRequest): Promise<unknown> {
    const { method, params } = request;

    switch (method) {
      case 'execute':
        return this.handleExecute(params);

      case 'initialize':
        return this.handleInitialize(params);

      case 'getVariable':
        return this.handleGetVariable(params);

      case 'stats':
        return this.handleStats();

      case 'ping':
        return this.handlePing();

      default:
        throw Object.assign(
          new Error(`Method not found: ${method}`),
          { code: JSON_RPC_ERRORS.METHOD_NOT_FOUND }
        );
    }
  }

  /**
   * Handle an execute request.
   */
  private async handleExecute(params?: Record<string, unknown>): Promise<unknown> {
    const code = params?.code as string;
    if (!code) {
      throw new Error('Missing required parameter: code');
    }

    const sandbox = await this.pool.acquire();
    try {
      const result = await sandbox.execute(code);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
        duration: result.duration,
      };
    } finally {
      this.pool.release(sandbox);
    }
  }

  /**
   * Handle an initialize request.
   */
  private async handleInitialize(params?: Record<string, unknown>): Promise<unknown> {
    const context = params?.context as string;
    if (context === undefined) {
      throw new Error('Missing required parameter: context');
    }

    const sandbox = await this.pool.acquire();
    try {
      await sandbox.initialize(context);
      return { success: true };
    } finally {
      this.pool.release(sandbox);
    }
  }

  /**
   * Handle a getVariable request.
   */
  private async handleGetVariable(params?: Record<string, unknown>): Promise<unknown> {
    const name = params?.name as string;
    if (!name) {
      throw new Error('Missing required parameter: name');
    }

    const sandbox = await this.pool.acquire();
    try {
      const value = await sandbox.getVariable(name);
      return { value };
    } finally {
      this.pool.release(sandbox);
    }
  }

  /**
   * Handle a stats request.
   */
  private handleStats(): unknown {
    return this.pool.getStats();
  }

  /**
   * Handle a ping request.
   * Returns uptime and worker count for status checks.
   */
  private handlePing(): unknown {
    const stats = this.pool.getStats();
    return {
      uptime: Date.now() - this.startTime,
      workers: stats.total,
    };
  }
}
