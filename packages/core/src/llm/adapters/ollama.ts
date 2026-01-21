/**
 * @fileoverview Ollama adapter for local LLM inference.
 *
 * Ollama runs LLMs locally, so all completions have zero cost.
 * This adapter communicates with Ollama's HTTP API.
 *
 * @module @rlm/core/llm/adapters/ollama
 */

import type { LLMAdapter, LLMRequest, LLMResponse } from '../../types.js';

/**
 * Default allowed hostnames for Ollama connections.
 * These are considered safe for local LLM inference.
 */
const ALLOWED_OLLAMA_HOSTS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
];

/**
 * Blocked IP ranges that should never be accessed via SSRF.
 * These include cloud metadata endpoints and other sensitive internal IPs.
 */
const BLOCKED_IP_PATTERNS = [
  /^169\.254\./,       // Link-local / AWS metadata
  /^192\.0\.0\./,      // IETF protocol assignments
  /^100\.64\./,        // Carrier-grade NAT
  /^0\.0\.0\.0/,       // Unspecified address
];

/**
 * Specific blocked hostnames (cloud metadata endpoints).
 */
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254', // AWS/GCP metadata
];

/**
 * Validate that a URL is safe for Ollama connection.
 * Prevents SSRF attacks by restricting allowed hosts.
 *
 * @param urlString - The URL to validate
 * @throws Error if URL is potentially dangerous
 */
function validateOllamaUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error(`Invalid Ollama URL: ${urlString.slice(0, 100)}`);
  }

  // Only allow http/https protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `Invalid Ollama URL protocol: ${url.protocol}. Only http/https allowed.`
    );
  }

  const hostname = url.hostname.toLowerCase();

  // Check for blocked hostnames (metadata endpoints)
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new Error(
      `Blocked Ollama URL: ${hostname} is a restricted address (cloud metadata endpoint)`
    );
  }

  // Check for blocked IP patterns
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(
        `Blocked Ollama URL: ${hostname} is in a restricted IP range`
      );
    }
  }

  // For non-localhost addresses, warn but allow (user may have custom setup)
  // The main protection is blocking dangerous IPs, not restricting to localhost only
  if (!ALLOWED_OLLAMA_HOSTS.includes(hostname)) {
    // Check if it's a private network IP (these are generally OK for local Ollama)
    const isPrivateNetwork =
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname);

    if (!isPrivateNetwork) {
      // Non-private, non-localhost - this could be risky
      // We allow it but could add a warning in the future
      // For maximum security, uncomment to block:
      // throw new Error(
      //   `Ollama URL ${hostname} is not a localhost or private network address. ` +
      //   `Only localhost and private network addresses are allowed.`
      // );
    }
  }
}

/**
 * Configuration for the Ollama adapter.
 */
export interface OllamaConfig {
  /** Base URL for the Ollama API (default: 'http://localhost:11434') */
  baseUrl?: string;
  /**
   * Skip URL validation (not recommended).
   * Only set to true if you understand the SSRF risks.
   */
  skipUrlValidation?: boolean;
}

/**
 * Ollama API chat response structure.
 */
interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Adapter for Ollama local LLM inference.
 *
 * @example
 * ```typescript
 * const adapter = new OllamaAdapter();
 * const response = await adapter.complete({
 *   model: 'llama3.2',
 *   systemPrompt: 'You are helpful',
 *   userPrompt: 'Say hello',
 * });
 * console.log(response.cost); // Always 0 for local models
 * ```
 */
export class OllamaAdapter implements LLMAdapter {
  private baseUrl: string;

  /**
   * Create a new Ollama adapter.
   *
   * @param config - Optional configuration (uses defaults if not provided)
   * @throws Error if baseUrl is invalid or potentially dangerous
   */
  constructor(config: OllamaConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';

    // Validate URL to prevent SSRF attacks
    if (!config.skipUrlValidation) {
      validateOllamaUrl(this.baseUrl);
    }
  }

  /**
   * Complete a chat request using Ollama.
   *
   * @param request - The LLM request to complete
   * @returns The LLM response with content, token counts, and cost (always 0)
   * @throws Error if the Ollama API returns an error
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        stream: false,
        options: {
          num_predict: request.maxTokens ?? 4096,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data: OllamaChatResponse = await response.json();

    return {
      content: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      cost: 0, // Local models are free
    };
  }
}
