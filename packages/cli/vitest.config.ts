import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000, // 30 seconds max per test
    hookTimeout: 30000, // 30 seconds max for beforeEach/afterEach
    // Exclude tests that cost money (hit real APIs) from default runs
    // Run them explicitly with: pnpm test:paid
    exclude: [
      '**/node_modules/**',
      '**/*.paid.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@rlm/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
