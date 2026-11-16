/**
 * Builds the embed: dist/embed.js, the <ara-character> element with three.js and the library bundled in, so a page
 * needs only one script tag.
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { catalog } from './catalog-plugin';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [catalog()],
  worker: { format: 'es' },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    lib: { entry: resolve(import.meta.dirname, 'src/embed.ts'), formats: ['es'], fileName: () => 'embed.js' },
  },
});
