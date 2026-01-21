/**
 * @fileoverview Tests for the CLI bin entry point.
 *
 * Following TDD: These tests verify the bin/rlm.ts entry point exists and works.
 */

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('bin/rlm entry point', () => {
  it('should have a rlm.ts file in the bin directory', () => {
    const binPath = resolve(__dirname, 'rlm.ts');
    expect(existsSync(binPath)).toBe(true);
  });

  it('should have correct shebang and imports', () => {
    const binPath = resolve(__dirname, 'rlm.ts');
    const content = readFileSync(binPath, 'utf-8');

    // Verify the file has the correct shebang
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);

    // Verify it imports createCLI
    expect(content).toContain("import { createCLI } from '../src/commands/cli.js'");

    // Verify it calls cli.parse
    expect(content).toContain('cli.parse(process.argv)');
  });

  it('should have createCLI available for import', async () => {
    // Test that the command module is properly set up
    const { createCLI } = await import('../src/commands/cli.js');
    expect(createCLI).toBeDefined();
    expect(typeof createCLI).toBe('function');
  });
});
