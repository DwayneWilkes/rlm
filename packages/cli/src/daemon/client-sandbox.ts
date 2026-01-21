/**
 * @fileoverview Daemon Client Sandbox implementation.
 *
 * A Sandbox implementation that communicates with a daemon process for
 * Python code execution. Provides the same interface as other sandbox
 * implementations but delegates execution to a persistent daemon.
 *
 * @module @rlm/cli/daemon/client-sandbox
 */

import * as net from 'node:net';
import type { Sandbox, SandboxBridges, CodeExecution } from '@rlm/core';
import { readToken, getDefaultTokenPath } from './auth.js';

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
 * Execute result from daemon.
 */
interface DaemonExecuteResult {
  stdout: string;
  stderr: string;
  error?: string | null;
  duration: number;
}

/**
 * Get variable result from daemon.
 */
interface DaemonGetVariableResult {
  found: boolean;
  value: unknown;
}

/**
 * Pending request tracking.
 */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Daemon Client Sandbox.
 *
 * Implements the Sandbox interface by communicating with a daemon process
 * over Unix sockets or Windows named pipes. This provides faster startup
 * times for repeated executions by reusing a persistent Python process.
 *
 * @example
 * ```typescript
 * const sandbox = new DaemonClientSandbox('/tmp/rlm-daemon.sock', {
 *   onLLMQuery: async (prompt) => llm.complete(prompt),
 *   onRLMQuery: async (task, ctx) => rlm.execute(task, ctx),
 * });
 *
 * await sandbox.initialize('my context');
 * const result = await sandbox.execute('print(len(context))');
 * await sandbox.destroy();
 * ```
 */
export class DaemonClientSandbox implements Sandbox {
  private socketPath: string;
  private bridges: SandboxBridges;
  private authToken: string | null;
  private socket: net.Socket | null = null;
  private initialized = false;
  private destroyed = false;
  private authenticated = false;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private buffer = '';

  /**
   * Create a new DaemonClientSandbox.
   *
   * @param socketPath - Path to the daemon socket
   * @param bridges - Callbacks for LLM interactions
   * @param authToken - Optional auth token (auto-reads from default path if not provided)
   */
  constructor(socketPath: string, bridges: SandboxBridges, authToken?: string) {
    this.socketPath = socketPath;
    this.bridges = bridges;
    // Auto-read token from default path if not provided
    this.authToken = authToken ?? readToken(getDefaultTokenPath());
  }

  /**
   * Initialize the sandbox by connecting to daemon and setting context.
   *
   * @param context - The context string to inject into Python environment
   */
  async initialize(context: string): Promise<void> {
    if (this.destroyed) {
      throw new Error('Sandbox has been destroyed');
    }

    // Connect to daemon
    await this.connect();

    // Authenticate if token is available
    if (this.authToken && !this.authenticated) {
      await this.authenticate();
    }

    // Send initialize request
    await this.sendRequest('initialize', { context });
    this.initialized = true;
  }

  /**
   * Authenticate with the daemon using the configured token.
   *
   * @throws Error if authentication fails
   */
  private async authenticate(): Promise<void> {
    if (!this.authToken) {
      throw new Error('No auth token configured');
    }

    const result = await this.sendRequest('auth', { token: this.authToken });
    if (!(result as { authenticated?: boolean })?.authenticated) {
      throw new Error('Daemon authentication failed');
    }
    this.authenticated = true;
  }

  /**
   * Execute Python code in the daemon sandbox.
   *
   * @param code - The Python code to execute
   * @returns CodeExecution result with stdout, stderr, error, and duration
   */
  async execute(code: string): Promise<CodeExecution> {
    if (!this.initialized || this.destroyed) {
      throw new Error('Sandbox not initialized or has been destroyed');
    }

    const result = (await this.sendRequest('execute', { code })) as DaemonExecuteResult;

    return {
      code,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error ?? undefined,
      duration: result.duration ?? 0,
    };
  }

  /**
   * Get a variable's value from the Python environment.
   *
   * @param name - The variable name to retrieve
   * @returns The variable's value, or undefined if not found
   */
  async getVariable(name: string): Promise<unknown> {
    if (!this.initialized || this.destroyed) {
      throw new Error('Sandbox not initialized or has been destroyed');
    }

    const result = (await this.sendRequest('get_variable', { name })) as DaemonGetVariableResult;

    if (!result.found) {
      return undefined;
    }

    return result.value;
  }

  /**
   * Cancel any currently running execution.
   */
  async cancel(): Promise<void> {
    if (!this.socket || this.destroyed) {
      return;
    }

    try {
      await this.sendRequest('cancel');
    } catch {
      // Ignore errors during cancel
    }
  }

  /**
   * Clean up sandbox resources and disconnect from daemon.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.initialized = false;
    this.authenticated = false;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Sandbox destroyed'));
    }
    this.pendingRequests.clear();

    // Disconnect
    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket!.once('close', resolve);
        this.socket!.destroy();
      });
      this.socket = null;
    }
  }

  /**
   * Connect to the daemon socket.
   */
  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.socketPath);

      const timeoutHandle = setTimeout(() => {
        this.socket?.destroy();
        this.socket = null;
        reject(new Error('Connection timeout'));
      }, 5000);

      this.socket.on('connect', () => {
        clearTimeout(timeoutHandle);
        resolve();
      });

      this.socket.on('error', (err) => {
        clearTimeout(timeoutHandle);
        this.socket = null;
        reject(err);
      });

      this.socket.on('close', () => {
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
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
   * Handle incoming data from the socket.
   */
  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as JsonRpcRequest | JsonRpcResponse;

        // Check if this is a bridge callback request from daemon
        if ('method' in message && message.method?.startsWith('bridge:')) {
          this.handleBridgeRequest(message as JsonRpcRequest);
        } else {
          // This is a response to our request
          this.handleResponse(message as JsonRpcResponse);
        }
      } catch {
        // Invalid JSON - ignore
      }
    }
  }

  /**
   * Handle a JSON-RPC response from daemon.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle a bridge callback request from daemon.
   */
  private async handleBridgeRequest(request: JsonRpcRequest): Promise<void> {
    let result: string;
    let error: string | undefined;

    try {
      if (request.method === 'bridge:llm') {
        const prompt = (request.params?.prompt as string) ?? '';
        result = await this.bridges.onLLMQuery(prompt);
      } else if (request.method === 'bridge:rlm') {
        const task = (request.params?.task as string) ?? '';
        const context = request.params?.context as string | undefined;
        result = await this.bridges.onRLMQuery(task, context);
      } else {
        throw new Error(`Unknown bridge method: ${request.method}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      result = '';
    }

    // Send response back to daemon
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: error ? undefined : result,
      error: error ? { code: -32000, message: error } : undefined,
    };

    this.socket?.write(JSON.stringify(response) + '\n');
  }

  /**
   * Send a JSON-RPC request to the daemon.
   */
  private sendRequest(
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      this.socket.write(JSON.stringify(request) + '\n', (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }
}
