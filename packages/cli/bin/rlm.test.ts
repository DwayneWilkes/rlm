/**
 * @fileoverview Tests for the CLI bin entry point.
 *
 * Following TDD: These tests verify the bin/rlm.ts entry point exists and works.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('bin/rlm entry point', () => {
  it('should have a rlm.ts file in the bin directory', () => {
    const binPath = resolve(__dirname, 'rlm.ts');
    expect(existsSync(binPath)).toBe(true);
  });

  it('should be able to import the entry point', async () => {
    // Dynamically import the entry point to verify it's valid
    const entryModule = await import('./rlm.js');
    // The module should export nothing (it runs on import or has side effects)
    // or it can export the main function for testing
    expect(entryModule).toBeDefined();
  });
});
