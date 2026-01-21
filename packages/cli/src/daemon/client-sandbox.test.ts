/**
 * @fileoverview Tests for DaemonClientSandbox.
 *
 * Tests the Sandbox implementation that communicates with a daemon
 * for Python code execution via IPC.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import type { SandboxBridges, CodeExecution } from '@rlm/core';
import { DaemonClientSandbox } from './client-sandbox.js';

describe('DaemonClientSandbox', () => {
  let testSocketPath: string;
  let server: net.Server | null = null;
  let sandbox: DaemonClientSandbox | null = null;
  const serverConnections: net.Socket[] = [];
  let mockBridges: SandboxBridges;

  beforeEach(() => {
    // Use a unique test socket path
    if (process.platform === 'win32') {
      testSocketPath = `\\\\.\\pipe\\rlm-sandbox-test-${process.pid}-${Date.now()}`;
    } else {
      testSocketPath = `/tmp/rlm-sandbox-test-${process.pid}-${Date.now()}.sock`;
    }

    // Create mock bridges
    mockBridges = {
      onLLMQuery: vi.fn().mockResolvedValue('LLM response'),
      onRLMQuery: vi.fn().mockResolvedValue('RLM response'),
    };
  });

  afterEach(async () => {
    // Destroy sandbox first
    if (sandbox) {
      await sandbox.destroy();
      sandbox = null;
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

    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock daemon server.
   * Automatically handles 'auth' requests with success.
   */
  function createMockDaemon(
    handler: (request: {
      id: number;
      method: string;
      params?: Record<string, unknown>;
    }) => unknown
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      server = net.createServer((socket) => {
        serverConnections.push(socket);
        let buffer = '';

        socket.on('data', async (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const request = JSON.parse(line);

              // Auto-handle auth requests
              if (request.method === 'auth') {
                const response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { authenticated: true },
                };
                socket.write(JSON.stringify(response) + '\n');
                continue;
              }

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

      server.on('error', reject);
      server.listen(testSocketPath, resolve);
    });
  }

  describe('constructor', () => {
    it('creates sandbox with socket path and bridges', () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      expect(sandbox).toBeInstanceOf(DaemonClientSandbox);
    });
  });

  describe('initialize', () => {
    it('connects to daemon and sends initialize request', async () => {
      const requests: Array<{ method: string; params?: Record<string, unknown> }> = [];

      await createMockDaemon((request) => {
        requests.push({ method: request.method, params: request.params });
        if (request.method === 'initialize') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test context');

      expect(requests.length).toBeGreaterThan(0);
      expect(requests.some((r) => r.method === 'initialize')).toBe(true);
      expect(requests.find((r) => r.method === 'initialize')?.params?.context).toBe(
        'test context'
      );
    });

    it('throws when daemon is not running', async () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);

      await expect(sandbox.initialize('test')).rejects.toThrow();
    });

    it('throws when daemon returns error', async () => {
      // Create a custom server that sends an error response
      await new Promise<void>((resolve, reject) => {
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

              if (request.method === 'auth') {
                // Handle auth request
                const response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { authenticated: true },
                };
                socket.write(JSON.stringify(response) + '\n');
              } else if (request.method === 'initialize') {
                // Send error response
                const response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  error: { code: -32000, message: 'Initialization failed' },
                };
                socket.write(JSON.stringify(response) + '\n');
              }
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);

      await expect(sandbox.initialize('test')).rejects.toThrow('Initialization failed');
    });
  });

  describe('execute', () => {
    it('executes Python code via daemon', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        if (request.method === 'execute') {
          return {
            stdout: 'Hello, World!\n',
            stderr: '',
            error: null,
            duration: 5,
          };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test context');

      const result = await sandbox.execute('print("Hello, World!")');

      expect(result.code).toBe('print("Hello, World!")');
      expect(result.stdout).toBe('Hello, World!\n');
      expect(result.stderr).toBe('');
      expect(result.error).toBeUndefined();
      expect(result.duration).toBe(5);
    });

    it('returns error in result when code fails', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        if (request.method === 'execute') {
          return {
            stdout: '',
            stderr: 'Traceback...',
            error: 'NameError: name x is not defined',
            duration: 2,
          };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test context');

      const result = await sandbox.execute('print(x)');

      expect(result.error).toBe('NameError: name x is not defined');
      expect(result.stderr).toBe('Traceback...');
    });

    it('throws when not initialized', async () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);

      await expect(sandbox.execute('print(1)')).rejects.toThrow(/not initialized/i);
    });
  });

  describe('getVariable', () => {
    it('retrieves variable value from daemon', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        if (request.method === 'get_variable') {
          if (request.params?.name === 'x') {
            return { found: true, value: 42 };
          }
          return { found: false, value: null };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      const value = await sandbox.getVariable('x');
      expect(value).toBe(42);
    });

    it('returns undefined for non-existent variable', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        if (request.method === 'get_variable') {
          return { found: false, value: null };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      const value = await sandbox.getVariable('nonexistent');
      expect(value).toBeUndefined();
    });

    it('throws when not initialized', async () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);

      await expect(sandbox.getVariable('x')).rejects.toThrow(/not initialized/i);
    });
  });

  describe('cancel', () => {
    it('sends cancel request to daemon', async () => {
      const requests: string[] = [];

      await createMockDaemon((request) => {
        requests.push(request.method);
        if (request.method === 'initialize') {
          return { success: true };
        }
        if (request.method === 'cancel') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');
      await sandbox.cancel();

      expect(requests).toContain('cancel');
    });

    it('does not throw when not initialized', async () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);

      await expect(sandbox.cancel()).resolves.not.toThrow();
    });
  });

  describe('destroy', () => {
    it('disconnects from daemon', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');
      await sandbox.destroy();

      // Subsequent operations should fail
      await expect(sandbox.execute('print(1)')).rejects.toThrow();
    });

    it('can be called multiple times safely', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      await sandbox.destroy();
      await sandbox.destroy();
      await sandbox.destroy();

      // Should not throw
    });
  });

  describe('sendRequest error handling', () => {
    it('throws when sendRequest called without connection', async () => {
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      // Don't initialize - try to execute directly
      await expect(sandbox.execute('print(1)')).rejects.toThrow(/not initialized/i);
    });

    it('throws when initialize called after destroy', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');
      await sandbox.destroy();

      await expect(sandbox.initialize('test again')).rejects.toThrow(/destroyed/i);
    });

    it('rejects pending requests when destroy is called', async () => {
      await new Promise<void>((resolve, reject) => {
        server = net.createServer((socket) => {
          serverConnections.push(socket);
          // Handle auth but never respond to execute
          socket.on('data', (data) => {
            const buffer = data.toString();
            const lines = buffer.split('\n').filter(l => l.trim());
            for (const line of lines) {
              const request = JSON.parse(line);
              if (request.method === 'auth') {
                socket.write(JSON.stringify({
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { authenticated: true },
                }) + '\n');
              } else if (request.method === 'initialize') {
                socket.write(JSON.stringify({
                  jsonrpc: '2.0',
                  id: request.id,
                  result: { success: true },
                }) + '\n');
              }
              // Don't respond to execute - let it hang
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      // Start an execute that will never get a response - catch the rejection
      const executePromise = sandbox.execute('print(1)').catch((err) => {
        // Expected - the destroy will reject this
        return err;
      });

      // Give time for request to be sent
      await new Promise(r => setTimeout(r, 50));

      // Destroy should reject the pending request
      await sandbox.destroy();

      // Verify the execute promise was rejected
      const result = await executePromise;
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toMatch(/destroyed|closed/i);
    });
  });

  describe('connection close handling', () => {
    it('updates state when daemon closes connection', async () => {
      await createMockDaemon((request) => {
        if (request.method === 'initialize') {
          return { success: true };
        }
        return null;
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      // After destroy, execute should fail
      await sandbox.destroy();
      await expect(sandbox.execute('test')).rejects.toThrow(/destroyed/i);
    });
  });

  describe('invalid JSON handling', () => {
    it('ignores invalid JSON from daemon', async () => {
      await new Promise<void>((resolve, reject) => {
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

              if (request.method === 'auth') {
                // Send invalid JSON first, then valid response
                socket.write('not valid json\n');
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { authenticated: true } }) + '\n'
                );
              } else if (request.method === 'initialize') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { success: true } }) + '\n'
                );
              }
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      // Should handle invalid JSON gracefully and still initialize
      await sandbox.initialize('test');
    });
  });

  describe('authentication', () => {
    it('throws when authenticate fails on daemon with invalid token', async () => {
      await new Promise<void>((resolve, reject) => {
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

              if (request.method === 'auth') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { authenticated: false } }) + '\n'
                );
              }
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      // Create sandbox with explicit bad token
      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges, 'bad-token');
      await expect(sandbox.initialize('test')).rejects.toThrow(/authentication failed/i);
    });
  });

  describe('bridge callbacks', () => {
    it('handles llm_query bridge callback from daemon', async () => {
      let bridgeRequestHandler: ((req: unknown) => void) | null = null;

      await new Promise<void>((resolve, reject) => {
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

              if (request.method === 'auth') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { authenticated: true } }) +
                    '\n'
                );
              } else if (request.method === 'initialize') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { success: true } }) +
                    '\n'
                );
              } else if (request.method === 'execute') {
                // Simulate daemon calling back for llm_query
                const bridgeRequest = {
                  jsonrpc: '2.0',
                  id: 1000,
                  method: 'bridge:llm',
                  params: { prompt: 'test prompt' },
                };
                socket.write(JSON.stringify(bridgeRequest) + '\n');

                // Store handler to complete after bridge callback
                bridgeRequestHandler = (bridgeResponse: unknown) => {
                  // After bridge response, send execute result
                  socket.write(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: request.id,
                      result: {
                        stdout: 'done\n',
                        stderr: '',
                        error: null,
                        duration: 10,
                      },
                    }) + '\n'
                  );
                };
              } else if (!request.method) {
                // This is a response to our bridge request
                bridgeRequestHandler?.(request);
              }
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      await sandbox.execute('llm_query("test prompt")');

      expect(mockBridges.onLLMQuery).toHaveBeenCalledWith('test prompt');
    });

    it('handles rlm_query bridge callback from daemon', async () => {
      let bridgeRequestHandler: ((req: unknown) => void) | null = null;

      await new Promise<void>((resolve, reject) => {
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

              if (request.method === 'auth') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { authenticated: true } }) +
                    '\n'
                );
              } else if (request.method === 'initialize') {
                socket.write(
                  JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { success: true } }) +
                    '\n'
                );
              } else if (request.method === 'execute') {
                // Simulate daemon calling back for rlm_query
                const bridgeRequest = {
                  jsonrpc: '2.0',
                  id: 1001,
                  method: 'bridge:rlm',
                  params: { task: 'subtask', context: 'sub context' },
                };
                socket.write(JSON.stringify(bridgeRequest) + '\n');

                bridgeRequestHandler = () => {
                  socket.write(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: request.id,
                      result: {
                        stdout: 'done\n',
                        stderr: '',
                        error: null,
                        duration: 10,
                      },
                    }) + '\n'
                  );
                };
              } else if (!request.method) {
                bridgeRequestHandler?.(request);
              }
            }
          });
        });

        server.on('error', reject);
        server.listen(testSocketPath, resolve);
      });

      sandbox = new DaemonClientSandbox(testSocketPath, mockBridges);
      await sandbox.initialize('test');

      await sandbox.execute('rlm_query("subtask", "sub context")');

      expect(mockBridges.onRLMQuery).toHaveBeenCalledWith('subtask', 'sub context');
    });
  });
});
