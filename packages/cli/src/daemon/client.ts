/**
 * @fileoverview IPC Client for daemon communication.
 *
 * Provides JSON-RPC communication over Unix sockets or Windows named pipes.
 * Handles connection management, request/response correlation, timeouts,
 * and automatic reconnection.
 *
 * @module @rlm/cli/daemon/client
 */

import * as net from 'node:net';

/**
 * JSON-RPC request interface.
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response interface.
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * IPC Client configuration options.
 */
export interface IPCClientOptions {
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  /** Auto-reconnect on disconnect (default: false) */
  autoReconnect?: boolean;
  /** Connection timeout in milliseconds (default: 5000) */
  connectTimeout?: number;
}

/**
 * Pending request tracking.
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

/**
 * IPC Client for communicating with the daemon over Unix socket or named pipe.
 *
 * Uses JSON-RPC 2.0 protocol for request/response communication.
 * Supports automatic reconnection and request timeout handling.
 *
 * @example
 * ```typescript
 * const client = new IPCClient('/tmp/rlm-daemon.sock');
 * await client.connect();
 *
 * const result = await client.request('execute', { code: 'print(1+1)' });
 * console.log(result);
 *
 * await client.disconnect();
 * ```
 */
export class IPCClient {
  private socketPath: string;
  private options: Required<IPCClientOptions>;
  private socket: net.Socket | null = null;
  private connected = false;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private buffer = '';

  /**
   * Create a new IPC Client.
   *
   * @param socketPath - Path to the daemon socket
   * @param options - Client configuration options
   */
  constructor(socketPath: string, options: IPCClientOptions = {}) {
    this.socketPath = socketPath;
    this.options = {
      requestTimeout: options.requestTimeout ?? 30000,
      autoReconnect: options.autoReconnect ?? false,
      connectTimeout: options.connectTimeout ?? 5000,
    };
  }

  /**
   * Connect to the daemon.
   *
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      const timeoutHandle = setTimeout(() => {
        this.socket?.destroy();
        this.socket = null;
        reject(new Error(`Connection timeout after ${this.options.connectTimeout}ms`));
      }, this.options.connectTimeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutHandle);
        this.connected = true;
        resolve();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeoutHandle);
        this.connected = false;
        this.socket = null;
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeoutHandle);
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });

      this.socket.on('data', (data: Buffer) => {
        this.handleData(data.toString());
      });
    });
  }

  /**
   * Disconnect from the daemon.
   */
  async disconnect(): Promise<void> {
    if (!this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket!.once('close', () => {
        this.socket = null;
        this.connected = false;
        resolve();
      });
      this.socket!.destroy();
    });
  }

  /**
   * Send a JSON-RPC request to the daemon.
   *
   * @param method - RPC method name
   * @param params - Optional method parameters
   * @returns The result from the daemon
   * @throws Error on timeout, connection error, or RPC error
   */
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    // Auto-reconnect if needed
    if (!this.connected && this.options.autoReconnect) {
      try {
        await this.connect();
      } catch {
        throw new Error('Not connected and auto-reconnect failed');
      }
    }

    if (!this.connected || !this.socket) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${this.options.requestTimeout}ms`));
      }, this.options.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeoutHandle });

      this.socket!.write(JSON.stringify(request) + '\n', (err) => {
        if (err) {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Check if the client is currently connected.
   *
   * @returns True if connected to daemon
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Handle incoming data from the socket.
   */
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as JsonRpcResponse;
        this.handleResponse(response);
      } catch {
        // Invalid JSON - ignore
      }
    }
  }

  /**
   * Handle a JSON-RPC response.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutHandle);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }
}
