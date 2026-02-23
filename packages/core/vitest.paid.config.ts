/**
 * Vitest config for paid tests (tests that hit real APIs and cost money).
 *
 * Run with: pnpm test:paid
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 60000, // 60 seconds for API calls
    hookTimeout: 30000,
    // Only include paid tests
    include: ['**/*.paid.test.ts'],
  },
});
