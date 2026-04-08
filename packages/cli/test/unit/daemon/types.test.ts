/**
 * @fileoverview Tests for shared daemon types and utilities.
 *
 * Tests the NdjsonParser, shared types, and JSON-RPC error codes.
 */

import { describe, it, expect } from 'vitest';
import {
  NdjsonParser,
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type PendingRequest,
} from '../../../src/daemon/types.js';

describe('NdjsonParser', () => {
  it('parses a single complete line', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('{"hello":"world"}\n');
    expect(lines).toEqual(['{"hello":"world"}']);
  });

  it('parses multiple complete lines in one chunk', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('{"a":1}\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('buffers partial lines across chunks', () => {
    const parser = new NdjsonParser();

    const lines1 = parser.push('{"partial":');
    expect(lines1).toEqual([]);

    const lines2 = parser.push('"value"}\n');
    expect(lines2).toEqual(['{"partial":"value"}']);
  });

  it('handles data split across many chunks', () => {
    const parser = new NdjsonParser();

    expect(parser.push('{')).toEqual([]);
    expect(parser.push('"k"')).toEqual([]);
    expect(parser.push(':')).toEqual([]);
    expect(parser.push('"v"')).toEqual([]);
    expect(parser.push('}\n')).toEqual(['{"k":"v"}']);
  });

  it('skips empty lines', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('{"a":1}\n\n\n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('skips whitespace-only lines', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('{"a":1}\n   \n{"b":2}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('returns empty array when no complete lines', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('incomplete');
    expect(lines).toEqual([]);
  });

  it('preserves trailing partial data for next push', () => {
    const parser = new NdjsonParser();

    parser.push('{"a":1}\n{"partial":');
    const lines = parser.push('"done"}\n');
    expect(lines).toEqual(['{"partial":"done"}']);
  });

  it('resets the buffer', () => {
    const parser = new NdjsonParser();
    parser.push('partial data');
    parser.reset();

    const lines = parser.push('{"clean":true}\n');
    expect(lines).toEqual(['{"clean":true}']);
  });

  it('handles empty string input', () => {
    const parser = new NdjsonParser();
    const lines = parser.push('');
    expect(lines).toEqual([]);
  });
});

describe('JSON_RPC_ERRORS', () => {
  it('has standard JSON-RPC error codes', () => {
    expect(JSON_RPC_ERRORS.PARSE_ERROR).toBe(-32700);
    expect(JSON_RPC_ERRORS.INVALID_REQUEST).toBe(-32600);
    expect(JSON_RPC_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
    expect(JSON_RPC_ERRORS.INVALID_PARAMS).toBe(-32602);
    expect(JSON_RPC_ERRORS.INTERNAL_ERROR).toBe(-32603);
    expect(JSON_RPC_ERRORS.UNAUTHORIZED).toBe(-32000);
  });
});

describe('Type compatibility', () => {
  it('JsonRpcRequest supports string, number, and null ids', () => {
    const req1: JsonRpcRequest = { jsonrpc: '2.0', id: 1, method: 'test' };
    const req2: JsonRpcRequest = { jsonrpc: '2.0', id: 'abc', method: 'test' };
    const req3: JsonRpcRequest = { jsonrpc: '2.0', id: null, method: 'test' };

    expect(req1.id).toBe(1);
    expect(req2.id).toBe('abc');
    expect(req3.id).toBeNull();
  });

  it('JsonRpcResponse supports result and error fields', () => {
    const successResp: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' },
    };
    const errorResp: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32600, message: 'Invalid Request' },
    };

    expect(successResp.result).toEqual({ data: 'test' });
    expect(errorResp.error?.code).toBe(-32600);
  });

  it('PendingRequest has optional timeoutHandle', () => {
    const withTimeout: PendingRequest = {
      resolve: () => {},
      reject: () => {},
      timeoutHandle: setTimeout(() => {}, 0),
    };
    const withoutTimeout: PendingRequest = {
      resolve: () => {},
      reject: () => {},
    };

    expect(withTimeout.timeoutHandle).toBeDefined();
    expect(withoutTimeout.timeoutHandle).toBeUndefined();

    clearTimeout(withTimeout.timeoutHandle);
  });
});
