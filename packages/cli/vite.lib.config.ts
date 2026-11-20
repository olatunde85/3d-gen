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
  plugins: [catalog()],
  worker: { format: 'es' },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    lib: { entry: resolve(import.meta.dirname, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
  },
});
