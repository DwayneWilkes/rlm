import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@rlm/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
