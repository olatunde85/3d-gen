import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { studioLicenses } from './scripts/build-studio-licenses.ts';
import { playRuntime } from './scripts/build-play-runtime.ts';
import { catalog } from './packages/cli/catalog-plugin.ts';

export default defineConfig({
  // Set BASE_PATH (e.g. /3d-gen/) when hosting under a sub-path, such as GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  worker: { format: 'es' },
  // The importers (packs and characters) load these model readers on demand in workers. Bundled up front, the dev
  // server never re-bundles mid-session, which would leave open pages with outdated copies ("Importing a module
  // script failed").
  optimizeDeps: { include: ['three/examples/jsm/loaders/FBXLoader.js', 'three/examples/jsm/loaders/GLTFLoader.js'] },
  plugins: [studioLicenses(),playRuntime(),catalog()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        // Landing page at the site root; the generator app at /app/.
        main: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
        studio: resolve(import.meta.dirname, 'studio/index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
        educate: resolve(import.meta.dirname, 'educate/index.html'),
        terms: resolve(import.meta.dirname, 'terms/index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
        developers: resolve(import.meta.dirname, 'developers/index.html'),
        characters: resolve(import.meta.dirname, 'characters/index.html'),
        // Engine-side GLB check page: only built for `npm run test:gltf`, not for the public site.
        ...(process.env.STUDIO_AUDIO_CHECK?{studioAudioCheck:resolve(import.meta.dirname,'studio-audio-check.html')} : {}),
        ...(process.env.GLTF_CHECK ? { gltfCheck: resolve(import.meta.dirname, 'gltf-check.html') } : {}),
      },
    },
  },
});
