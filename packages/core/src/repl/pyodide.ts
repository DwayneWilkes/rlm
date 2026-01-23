/**
 * @fileoverview Pyodide-based Python execution sandbox implementations.
 *
 * This module provides two sandbox implementations:
 * - WorkerPyodideSandbox: Runs in a Worker thread with true interrupt support
 * - DirectPyodideSandbox: Runs in main thread (fallback when workers unavailable)
 *
 * @module @rlm/core/repl/pyodide
 */

import { loadPyodide, type PyodideInterface } from "pyodide";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { REPLConfig, CodeExecution } from "../types/index.js";
import type { Sandbox, SandboxBridges } from "./sandbox.js";
import type { WorkerMessage, WorkerResponse } from "./pyodide-worker.js";
import { PYTHON_SETUP } from "./python-setup.js";

const DEFAULT_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/";

/**
 * Allowlist of trusted Pyodide CDN domains.
 * Only URLs from these domains are allowed for security.
 */
const ALLOWED_PYODIDE_DOMAINS = [
  "cdn.jsdelivr.net",
  "files.pythonhosted.org",
];

/**
 * Validate that a Pyodide indexURL is from a trusted source.
 * Throws an error if the URL is invalid or from an untrusted source.
 *
 * @param url - The URL to validate
 * @throws Error if URL is invalid or from untrusted source
 */
export function validatePyodideURL(url: string): void {
	// Only allow https URLs
	if (!url.startsWith("https://")) {
		throw new Error(
			`Invalid Pyodide URL: only HTTPS URLs are allowed. Got: ${url.slice(0, 50)}...`,
		);
	}

	try {
		const parsed = new URL(url);

		// Check against allowlist
		if (!ALLOWED_PYODIDE_DOMAINS.includes(parsed.hostname)) {
			throw new Error(
				`Untrusted Pyodide URL domain: ${parsed.hostname}. ` +
					`Allowed domains: ${ALLOWED_PYODIDE_DOMAINS.join(", ")}`,
			);
		}

		// Ensure path contains 'pyodide' to prevent using arbitrary CDN paths
		if (!parsed.pathname.toLowerCase().includes("pyodide")) {
			throw new Error(
				`Invalid Pyodide URL path: URL must contain 'pyodide' in the path. Got: ${parsed.pathname}`,
			);
		}
	} catch (err) {
		if (
			err instanceof Error &&
			err.message.startsWith("Invalid Pyodide URL")
		) {
			throw err;
		}
		if (
			err instanceof Error &&
			err.message.startsWith("Untrusted Pyodide URL")
		) {
			throw err;
		}
		throw new Error(`Invalid Pyodide URL format: ${url.slice(0, 100)}`);
	}
}

/**
 * Get the Pyodide index URL from config.
 * Validates the URL against the allowlist before returning.
 *
 * @throws Error if URL is from untrusted source
 */
function getIndexURL(config: REPLConfig): string {
	if (!config.indexURL) {
		return DEFAULT_INDEX_URL;
	}

	let url: string;
	if (typeof config.indexURL === "string") {
		url = config.indexURL;
	} else {
		// Return first URL from array (fallbacks would be handled at a higher level)
		url = config.indexURL[0] ?? DEFAULT_INDEX_URL;
	}

	// Validate URL against allowlist (skip validation for default URL)
	if (url !== DEFAULT_INDEX_URL) {
		validatePyodideURL(url);
	}

	return url;
}

/**
 * Worker-based Pyodide sandbox with true interrupt support.
 *
 * This implementation runs Pyodide in a Worker thread, enabling:
 * - True execution interruption via SharedArrayBuffer + setInterruptBuffer()
 * - Complete memory cleanup via worker.terminate()
 * - Non-blocking execution (doesn't freeze main thread)
 */
export class WorkerPyodideSandbox implements Sandbox {
	private worker: Worker | null = null;
	private interruptBuffer: Int32Array | null = null;
	private sharedBuffer: SharedArrayBuffer | null = null;
	private config: REPLConfig;
	private bridges: SandboxBridges;
	private initialized: boolean = false;
	private pendingRequests = new Map<
		string,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void }
	>();

	constructor(config: REPLConfig, bridges: SandboxBridges) {
		this.config = config;
		this.bridges = bridges;
	}

	async initialize(context: string): Promise<void> {
		// Create shared interrupt buffer (4 bytes for Int32)
		this.sharedBuffer = new SharedArrayBuffer(4);
		this.interruptBuffer = new Int32Array(this.sharedBuffer);

		// Get path to worker script
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		const workerPath = join(__dirname, "pyodide-worker.js");

		// Spawn worker
		this.worker = new Worker(workerPath);

		// Setup message handlers
		this.worker.on("message", (msg: WorkerResponse) => {
			this.handleWorkerMessage(msg);
		});

		this.worker.on("error", (err) => {
			// Reject all pending requests
			for (const pending of this.pendingRequests.values()) {
				pending.reject(err);
			}
			this.pendingRequests.clear();
		});

		// Wait for ready signal
		await new Promise<void>((resolve, reject) => {
			const readyHandler = (msg: WorkerResponse) => {
				if (msg.type === "ready") {
					this.initialized = true;
					resolve();
				} else if (msg.type === "error") {
					reject(new Error(msg.message));
				}
			};

			// Add temporary handler for init
			const originalHandler = this.handleWorkerMessage.bind(this);
			this.handleWorkerMessage = (msg: WorkerResponse) => {
				readyHandler(msg);
				originalHandler(msg);
			};

			// Send init message
			this.worker!.postMessage({
				type: "init",
				indexURL: getIndexURL(this.config),
				context,
				interruptBuffer: this.sharedBuffer!,
			} satisfies WorkerMessage);
		});
	}

	private handleWorkerMessage(msg: WorkerResponse): void {
		switch (msg.type) {
			case "stdout":
				this.config.onStdout?.(msg.line);
				break;

			case "stderr":
				this.config.onStderr?.(msg.line);
				break;

			case "result": {
				const pending = this.pendingRequests.get(msg.id);
				if (pending) {
					this.pendingRequests.delete(msg.id);
					if (msg.success) {
						pending.resolve({
							stdout: this.truncate(msg.stdout),
							stderr: msg.stderr,
							duration: msg.duration,
						});
					} else {
						pending.resolve({
							stdout: "",
							stderr: "",
							error: msg.error,
							duration: msg.duration,
						});
					}
				}
				break;
			}

			case "variable": {
				const pending = this.pendingRequests.get(msg.id);
				if (pending) {
					this.pendingRequests.delete(msg.id);
					pending.resolve(msg.value);
				}
				break;
			}

			case "bridge:llm": {
				// Handle LLM bridge call from worker
				this.bridges
					.onLLMQuery(msg.prompt)
					.then((result) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							result,
						});
					})
					.catch((error: Error) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							error: error.message,
						});
					});
				break;
			}

			case "bridge:rlm": {
				// Handle RLM bridge call from worker
				this.bridges
					.onRLMQuery(msg.task, msg.context)
					.then((result) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							result,
						});
					})
					.catch((error: Error) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							error: error.message,
						});
					});
				break;
			}

			case "bridge:batch_llm": {
				// Handle batch LLM bridge call from worker
				// Process all prompts in parallel
				Promise.all(
					msg.prompts.map(async (prompt: string) => {
						try {
							return await this.bridges.onLLMQuery(prompt);
						} catch (err) {
							const errorMessage = err instanceof Error ? err.message : String(err);
							return `[Error: ${errorMessage}]`;
						}
					})
				)
					.then((results) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							result: results,
						});
					})
					.catch((error: Error) => {
						this.worker?.postMessage({
							type: "bridge:response",
							id: msg.id,
							error: error.message,
						});
					});
				break;
			}

			case "bridge:batch_rlm": {
				// Handle batch RLM bridge call from worker
				if (!this.bridges.onBatchRLMQuery) {
					// Fallback: execute sequentially using onRLMQuery
					Promise.all(
						msg.tasks.map(async (task: { task: string; context?: string }) => {
							try {
								return await this.bridges.onRLMQuery(task.task, task.context);
							} catch (err) {
								const errorMessage = err instanceof Error ? err.message : String(err);
								return `[Error: ${errorMessage}]`;
							}
						})
					)
						.then((results) => {
							this.worker?.postMessage({
								type: "bridge:response",
								id: msg.id,
								result: results,
							});
						})
						.catch((error: Error) => {
							this.worker?.postMessage({
								type: "bridge:response",
								id: msg.id,
								error: error.message,
							});
						});
				} else {
					// Use the dedicated batch handler
					this.bridges.onBatchRLMQuery(msg.tasks)
						.then((results) => {
							this.worker?.postMessage({
								type: "bridge:response",
								id: msg.id,
								result: results,
							});
						})
						.catch((error: Error) => {
							this.worker?.postMessage({
								type: "bridge:response",
								id: msg.id,
								error: error.message,
							});
						});
				}
				break;
			}

			case "error":
				console.error("Worker error:", msg.message);
				break;

			case "ready":
				// Handled during initialization
				break;
		}
	}

	async execute(code: string): Promise<CodeExecution> {
		if (!this.worker || !this.initialized) {
			throw new Error("Sandbox not initialized");
		}

		const id = this.generateId();
		const startTime = Date.now();

		// Setup timeout that writes interrupt signal
		const timeoutId = setTimeout(() => {
			if (this.interruptBuffer) {
				// Write SIGINT (2) to interrupt buffer
				Atomics.store(this.interruptBuffer, 0, 2);
			}
		}, this.config.timeout);

		try {
			const result = await new Promise<{
				stdout: string;
				stderr: string;
				error?: string;
				duration: number;
			}>((resolve, reject) => {
				this.pendingRequests.set(id, {
					resolve: resolve as (value: unknown) => void,
					reject,
				});

				this.worker!.postMessage({
					type: "execute",
					id,
					code,
				} satisfies WorkerMessage);
			});

			return {
				code,
				stdout: result.stdout,
				stderr: result.stderr,
				error: result.error,
				duration: result.duration,
			};
		} finally {
			clearTimeout(timeoutId);
			// Reset interrupt buffer
			if (this.interruptBuffer) {
				Atomics.store(this.interruptBuffer, 0, 0);
			}
		}
	}

	async getVariable(name: string): Promise<unknown> {
		if (!this.worker || !this.initialized) {
			throw new Error("Sandbox not initialized");
		}

		const id = this.generateId();

		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });

			this.worker!.postMessage({
				type: "getVariable",
				id,
				name,
			} satisfies WorkerMessage);
		});
	}

	async cancel(): Promise<void> {
		if (this.interruptBuffer) {
			// Write SIGINT (2) to interrupt buffer to trigger KeyboardInterrupt
			Atomics.store(this.interruptBuffer, 0, 2);
		}
	}

	async destroy(): Promise<void> {
		if (this.worker) {
			// Terminate worker completely (frees WASM memory)
			await this.worker.terminate();
			this.worker = null;
		}
		this.interruptBuffer = null;
		this.sharedBuffer = null;
		this.initialized = false;
		this.pendingRequests.clear();
	}

	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}

	private truncate(output: string): string {
		if (output.length <= this.config.maxOutputLength) {
			return output;
		}
		const omittedCount = output.length - this.config.maxOutputLength;
		return (
			output.slice(0, this.config.maxOutputLength) +
			`\n... [truncated, ${omittedCount} chars omitted]`
		);
	}
}

/**
 * Direct Pyodide sandbox running in main thread.
 *
 * Fallback implementation when Worker support is unavailable.
 * Limitations:
 * - Timeout uses Promise.race (doesn't actually stop execution)
 * - Memory may not be fully released on destroy()
 * - Long execution blocks main thread
 */
export class DirectPyodideSandbox implements Sandbox {
	private pyodide: PyodideInterface | null = null;
	private config: REPLConfig;
	private bridges: SandboxBridges;
	private context: string = "";
	private initialized: boolean = false;

	constructor(config: REPLConfig, bridges: SandboxBridges) {
		this.config = config;
		this.bridges = bridges;
	}

	async initialize(context: string): Promise<void> {
		this.context = context;

		this.pyodide = await loadPyodide({
			indexURL: getIndexURL(this.config),
		});

		// Inject context as a Python variable
		this.pyodide.globals.set("context", context);

		// Inject bridge functions
		this.pyodide.globals.set(
			"__llm_query_bridge__",
			this.bridges.onLLMQuery,
		);
		this.pyodide.globals.set(
			"__rlm_query_bridge__",
			this.bridges.onRLMQuery,
		);
		this.pyodide.globals.set(
			"__batch_llm_query_bridge__",
			async (prompts: string[]): Promise<string[]> => {
				if (prompts.length === 0) return [];
				// Process all prompts in parallel
				return Promise.all(
					prompts.map(async (prompt) => {
						try {
							return await this.bridges.onLLMQuery(prompt);
						} catch (err) {
							const errorMessage = err instanceof Error ? err.message : String(err);
							return `[Error: ${errorMessage}]`;
						}
					})
				);
			},
		);
		this.pyodide.globals.set(
			"__batch_rlm_query_bridge__",
			async (tasks: Array<{ task: string; context?: string }>): Promise<string[]> => {
				if (tasks.length === 0) return [];
				// Use dedicated batch handler if available, otherwise fallback
				if (this.bridges.onBatchRLMQuery) {
					return this.bridges.onBatchRLMQuery(tasks);
				}
				// Fallback: execute using onRLMQuery (sequentially via Promise.all)
				return Promise.all(
					tasks.map(async (task) => {
						try {
							return await this.bridges.onRLMQuery(task.task, task.context);
						} catch (err) {
							const errorMessage = err instanceof Error ? err.message : String(err);
							return `[Error: ${errorMessage}]`;
						}
					})
				);
			},
		);
		this.pyodide.globals.set("__context_ref__", context);

		// Set up Python helpers
		await this.pyodide.runPythonAsync(PYTHON_SETUP);

		this.initialized = true;
	}

	async execute(code: string): Promise<CodeExecution> {
		if (!this.pyodide || !this.initialized) {
			throw new Error("Sandbox not initialized");
		}

		const startTime = Date.now();

		try {
			// Capture stdout/stderr
			await this.pyodide.runPythonAsync(`
import sys
from io import StringIO
__stdout__ = StringIO()
__stderr__ = StringIO()
__old_stdout__ = sys.stdout
__old_stderr__ = sys.stderr
sys.stdout = __stdout__
sys.stderr = __stderr__
`);

			// Execute with timeout
			await Promise.race([
				this.pyodide.runPythonAsync(code),
				this.timeout(this.config.timeout),
			]);

			// Get captured output
			const stdout = (await this.pyodide.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
__stdout__.getvalue()
`)) as string;

			const stderr = (await this.pyodide.runPythonAsync(
				`__stderr__.getvalue()`,
			)) as string;

			// Truncate if needed
			const truncatedStdout = this.truncate(stdout);

			return {
				code,
				stdout: truncatedStdout,
				stderr,
				duration: Date.now() - startTime,
			};
		} catch (err) {
			// Restore stdout/stderr on error
			try {
				await this.pyodide!.runPythonAsync(`
sys.stdout = __old_stdout__
sys.stderr = __old_stderr__
`);
			} catch {
				/* ignore restoration errors */
			}

			return {
				code,
				stdout: "",
				stderr: "",
				error: err instanceof Error ? err.message : String(err),
				duration: Date.now() - startTime,
			};
		}
	}

	async getVariable(name: string): Promise<unknown> {
		if (!this.pyodide || !this.initialized) {
			throw new Error("Sandbox not initialized");
		}

		try {
			const value = this.pyodide.globals.get(name);
			if (value === undefined) {
				return undefined;
			}
			// Convert Python objects to JS
			if (typeof value?.toJs === "function") {
				return value.toJs();
			}
			return value;
		} catch {
			return undefined;
		}
	}

	async cancel(): Promise<void> {
		// No-op in direct mode - timeout will eventually kill execution
		// True cancellation requires worker isolation
	}

	async destroy(): Promise<void> {
		if (this.pyodide) {
			// Note: Pyodide doesn't have a formal destroy method
			// Setting to null releases the reference for GC
			this.pyodide = null;
		}
		this.initialized = false;
	}

	private timeout(ms: number): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(
				() => reject(new Error(`Execution timeout (${ms}ms)`)),
				ms,
			);
		});
	}

	private truncate(output: string): string {
		if (output.length <= this.config.maxOutputLength) {
			return output;
		}
		const omittedCount = output.length - this.config.maxOutputLength;
		return (
			output.slice(0, this.config.maxOutputLength) +
			`\n... [truncated, ${omittedCount} chars omitted]`
		);
	}
}

/**
 * Detect if worker support with SharedArrayBuffer is available.
 */
export function detectWorkerSupport(): boolean {
	// Check for SharedArrayBuffer (required for interrupt)
	if (typeof SharedArrayBuffer === "undefined") {
		return false;
	}

	// Check for Worker support (Node.js worker_threads)
	try {
		// In Node.js, we use worker_threads
		// The import at the top will fail if not available
		return true;
	} catch {
		return false;
	}
}

/**
 * Legacy export for backwards compatibility.
 * Uses DirectPyodideSandbox (same as original implementation).
 */
export const PyodideSandbox = DirectPyodideSandbox;
