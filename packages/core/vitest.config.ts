import { defineConfig } from 'vitest/config';

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
});
