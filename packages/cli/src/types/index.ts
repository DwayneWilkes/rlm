/**
 * @fileoverview Type definitions for @rlm/cli sandbox backend selection.
 *
 * @module @rlm/cli/types
 */

/**
 * Available sandbox backend types.
 *
 * - 'native': Uses native Python subprocess (fastest, requires Python installed)
 * - 'pyodide': Uses Pyodide WASM runtime (portable, no Python required)
 * - 'daemon': Uses a long-running daemon process (not yet implemented)
 */
export type SandboxBackend = 'native' | 'pyodide' | 'daemon';
