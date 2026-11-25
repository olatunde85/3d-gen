/**
 * Builds the browser library: dist/index.js, with three.js left to the app (a peer dependency) and the generator
 * running in a worker that is bundled with everything it needs and inlined, so no bundler setup is required.
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { catalog } from './catalog-plugin.ts';

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  // Files the library loads (its model worker) are found beside index.js, wherever it is served from.
  base: './',
  plugins: [catalog()],
  // One file: the worker starts from a blob address, which can't load parts of itself from beside it (such as the
  // model readers, which the generator loads only when a model is converted).
  worker: { format: 'es', rollupOptions: { output: { inlineDynamicImports: true } } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    lib: { entry: resolve(import.meta.dirname, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
  },
});
