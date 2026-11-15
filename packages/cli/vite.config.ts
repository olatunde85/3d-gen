/** Bundles the CLI and the generator code it shares with the website into one dependency-free file for Node. */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: resolve(import.meta.dirname, 'src/cli.ts'),
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    target: 'node20',
    minify: true,
    rollupOptions: { output: { entryFileNames: 'cli.js', banner: '#!/usr/bin/env node', codeSplitting: false } },
  },
});
