/**
 * @fileoverview Native Python subprocess sandbox using JSON-RPC over stdio.
 *
 * This sandbox spawns a native Python process and communicates via JSON-RPC
 * for high-performance code execution (4-10x faster than Pyodide).
 *
 * @module @rlm/core/repl/native-python
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { REPLConfig, CodeExecution } from '../types/index.js';
import type { Sandbox, SandboxBridges } from './sandbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the Python runner script location.
 * Looks in package directory under python/rlm_sandbox.py
 */
function findPythonScript(): string {
  // In built distribution, the script is in packages/core/python/
  // From src/repl/, go up two levels to packages/core/
  return join(__dirname, '..', '..', 'python', 'rlm_sandbox.py');
}

/**
 * JSON-RPC request interface.
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response interface.
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Native Python subprocess sandbox.
 *
 * Provides a high-performance Python execution environment by spawning
 * a native Python subprocess and communicating via JSON-RPC over stdio.
 *
 * Features:
 * - Fast startup (~50ms vs ~300ms for Pyodide)
 * - Full Python standard library
 * - Bridge callbacks for llm_query/rlm_query
 * - Timeout support via process termination
 *
 * @example
 * ```typescript
 * const sandbox = new NativePythonSandbox(config, bridges);
 * await sandbox.initialize('My context');
 * const result = await sandbox.execute('print(len(context))');
 * await sandbox.destroy();
 * ```
 */
export class NativePythonSandbox implements Sandbox {
  private config: REPLConfig;
  private bridges: SandboxBridges;
  private process: ChildProcess | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timeoutHandle?: ReturnType<typeof setTimeout>;
  }> = new Map();
  private requestId = 0;
  private buffer = '';
  private destroyed = false;
  private pythonPath: string;

  /**
   * Create a new NativePythonSandbox.
   *
   * @param config - REPL configuration
   * @param bridges - Callbacks for LLM interactions
   * @param pythonPath - Path to Python executable (default: 'python')
   */
  constructor(
    config: REPLConfig,
    bridges: SandboxBridges,
    pythonPath = 'python'
  ) {
    this.config = config;
    this.bridges = bridges;
    this.pythonPath = pythonPath;
    console.debug('[NativePythonSandbox] Created with config:', {
      timeout: config.timeout,
      maxOutputLength: config.maxOutputLength,
      pythonPath,
    });
  }

  /**
   * Initialize the sandbox by spawning Python process and setting context.
   */
  async initialize(context: string): Promise<void> {
    console.debug('[NativePythonSandbox] Initializing with context length:', context.length);

    if (this.destroyed) {
      throw new Error('Sandbox has been destroyed');
    }

    if (this.process) {
      console.debug('[NativePythonSandbox] Reusing existing process');
    } else {
      await this.spawnProcess();
    }

    // Send initialize command
    const result = await this.sendRequest('initialize', { context });
    console.debug('[NativePythonSandbox] Initialize result:', result);
  }

  /**
   * Execute Python code in the sandbox.
   */
  async execute(code: string): Promise<CodeExecution> {
    console.debug('[NativePythonSandbox] Execute:', code.slice(0, 100) + (code.length > 100 ? '...' : ''));

    if (this.destroyed || !this.process) {
      throw new Error('Sandbox not initialized or has been destroyed');
    }

    const startTime = Date.now();

    try {
      const result = await this.sendRequest('execute', { code }, this.config.timeout) as {
        stdout: string;
        stderr: string;
        error?: string;
        duration: number;
      };

      return {
        code,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error,
        duration: result.duration ?? (Date.now() - startTime),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.debug('[NativePythonSandbox] Execute error:', errorMessage);

      return {
        code,
        stdout: '',
        stderr: '',
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Get a variable's value from the Python environment.
   */
  async getVariable(name: string): Promise<unknown> {
    console.debug('[NativePythonSandbox] Getting variable:', name);

    if (this.destroyed || !this.process) {
      throw new Error('Sandbox not initialized or has been destroyed');
    }

    try {
      const result = await this.sendRequest('get_variable', { name }) as {
        value: unknown;
        found: boolean;
      };

      if (!result.found) {
        return undefined;
      }

      return result.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Cancel any currently running execution.
   */
  async cancel(): Promise<void> {
    console.debug('[NativePythonSandbox] Cancel requested');

    if (this.process) {
      // Send interrupt signal
      this.process.kill('SIGINT');
    }
  }

  /**
   * Clean up sandbox resources.
   */
  async destroy(): Promise<void> {
    console.debug('[NativePythonSandbox] Destroying');

    this.destroyed = true;

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle);
      }
      pending.reject(new Error('Sandbox destroyed'));
    }
    this.pendingRequests.clear();

    // Kill process
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  /**
   * Spawn the Python subprocess.
   */
  private async spawnProcess(): Promise<void> {
    const scriptPath = findPythonScript();
    console.debug('[NativePythonSandbox] Spawning Python process:', this.pythonPath, scriptPath);

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.pythonPath, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });

        // Handle stdout (JSON-RPC responses)
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdout(data.toString());
        });

        // Handle stderr (logging/debug)
        this.process.stderr?.on('data', (data: Buffer) => {
          console.debug('[NativePythonSandbox:stderr]', data.toString().trim());
        });

        // Handle process exit
        this.process.on('close', (code) => {
          console.debug('[NativePythonSandbox] Process exited with code:', code);
          this.process = null;
        });

        this.process.on('error', (err) => {
          console.error('[NativePythonSandbox] Process error:', err.message);
          reject(err);
        });

        // Wait a short time for process to start
        setTimeout(resolve, 100);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming data from Python stdout.
   */
  private handleStdout(data: string): void {
    this.buffer += data;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as JsonRpcResponse | JsonRpcRequest;

        // Check if this is a request from Python (bridge callback)
        if ('method' in message && message.method?.startsWith('bridge:')) {
          this.handleBridgeRequest(message as JsonRpcRequest);
        } else {
          // This is a response to our request
          this.handleResponse(message as JsonRpcResponse);
        }
      } catch (err) {
        console.debug('[NativePythonSandbox] Failed to parse JSON:', line);
      }
    }
  }

  /**
   * Handle a response from Python.
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.debug('[NativePythonSandbox] Received response for unknown request:', response.id);
      return;
    }

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * Handle a bridge callback request from Python.
   */
  private async handleBridgeRequest(request: JsonRpcRequest): Promise<void> {
    console.debug('[NativePythonSandbox] Bridge request:', request.method, request.params);

    let result: string | string[];
    let error: string | undefined;

    try {
      if (request.method === 'bridge:llm') {
        const prompt = (request.params?.prompt as string) ?? '';
        result = await this.bridges.onLLMQuery(prompt);
      } else if (request.method === 'bridge:rlm') {
        const task = (request.params?.task as string) ?? '';
        // Context is optional - if not in params, pass undefined
        const context = 'context' in (request.params ?? {})
          ? (request.params?.context as string)
          : undefined;
        result = await this.bridges.onRLMQuery(task, context);
      } else if (request.method === 'bridge:batch_llm') {
        // Handle batch LLM queries in parallel
        const prompts = (request.params?.prompts as string[]) ?? [];
        result = await this.handleBatchLLM(prompts);
      } else {
        throw new Error(`Unknown bridge method: ${request.method}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      result = '';
    }

    // Send response back to Python
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: request.id,
      result: error ? undefined : result,
      error: error ? { code: -32000, message: error } : undefined,
    };

    this.writeToProcess(JSON.stringify(response) + '\n');
  }

  /**
   * Handle batch LLM queries in parallel using Promise.all.
   *
   * This processes multiple prompts concurrently, reducing wall-clock time
   * from N * LLM_latency to approximately max(LLM_latencies).
   *
   * @param prompts - Array of prompts to process
   * @returns Array of responses in the same order as prompts
   */
  private async handleBatchLLM(prompts: string[]): Promise<string[]> {
    if (prompts.length === 0) {
      return [];
    }

    console.debug('[NativePythonSandbox] Processing batch of', prompts.length, 'LLM queries in parallel');

    // Process all prompts in parallel
    const results = await Promise.all(
      prompts.map(async (prompt) => {
        try {
          return await this.bridges.onLLMQuery(prompt);
        } catch (err) {
          // Return error message instead of throwing
          const errorMessage = err instanceof Error ? err.message : String(err);
          return `[Error: ${errorMessage}]`;
        }
      })
    );

    console.debug('[NativePythonSandbox] Batch complete, got', results.length, 'responses');

    return results;
  }

  /**
   * Send a JSON-RPC request to the Python process.
   */
  private sendRequest(
    method: string,
    params?: Record<string, unknown>,
    timeout?: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Process not started'));
        return;
      }

      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      // Set up timeout if specified
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      if (timeout && timeout > 0) {
        timeoutHandle = setTimeout(() => {
          const pending = this.pendingRequests.get(id);
          if (pending) {
            this.pendingRequests.delete(id);
            pending.reject(new Error('Execution timeout'));

            // Kill and restart process on timeout
            this.process?.kill();
            this.process = null;
          }
        }, timeout);
      }

      this.pendingRequests.set(id, { resolve, reject, timeoutHandle });

      // Send request to Python
      this.writeToProcess(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Write data to the Python process stdin.
   */
  private writeToProcess(data: string): void {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(data);
    }
  }
}
