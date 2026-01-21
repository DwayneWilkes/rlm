import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'bin/rlm.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
});
