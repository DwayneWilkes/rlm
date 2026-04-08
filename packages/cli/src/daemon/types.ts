/**
 * @fileoverview Shared types and utilities for daemon IPC communication.
 *
 * Provides canonical JSON-RPC types, error codes, and newline-delimited
 * JSON parsing used by both server and client implementations.
 *
 * @module @rlm/cli/daemon/types
 */

/**
 * JSON-RPC 2.0 request interface.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 response interface.
 */
export interface JsonRpcResponse {
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
 * Pending request tracking for IPC clients.
 *
 * Used by both IPCClient and DaemonClientSandbox to correlate
 * requests with their responses.
 */
export interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  /** Optional timeout handle (used by IPCClient for per-request timeouts) */
  timeoutHandle?: ReturnType<typeof setTimeout>;
}

/**
 * JSON-RPC standard error codes.
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32000,
} as const;

/**
 * Newline-delimited JSON parser.
 *
 * Buffers incoming data and emits complete JSON lines. Handles partial
 * messages across data chunks, which is essential for stream-based IPC.
 *
 * @example
 * ```typescript
 * const parser = new NdjsonParser();
 * socket.on('data', (data) => {
 *   for (const line of parser.push(data.toString())) {
 *     const message = JSON.parse(line);
 *     // handle message
 *   }
 * });
 * ```
 */
export class NdjsonParser {
  private buffer = '';

  /**
   * Push new data into the parser and extract complete lines.
   *
   * @param data - Raw string data from socket
   * @returns Array of complete, non-empty lines ready for JSON.parse
   */
  push(data: string): string[] {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim() !== '');
  }

  /**
   * Reset the parser buffer.
   */
  reset(): void {
    this.buffer = '';
  }
}
