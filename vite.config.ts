import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { studioLicenses } from './scripts/build-studio-licenses.ts';

export default defineConfig({
  // Set BASE_PATH (e.g. /3d-gen/) when hosting under a sub-path, such as GitHub Pages.
  base: process.env.BASE_PATH ?? '/',
  worker: { format: 'es' },
  plugins: [studioLicenses()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        // Landing page at the site root; the generator app at /app/.
        main: resolve(import.meta.dirname, 'index.html'),
        app: resolve(import.meta.dirname, 'app/index.html'),
        studio: resolve(import.meta.dirname, 'studio/index.html'),
        // Engine-side GLB check page: only built for `npm run test:gltf`, not for the public site.
        ...(process.env.STUDIO_AUDIO_CHECK?{studioAudioCheck:resolve(import.meta.dirname,'studio-audio-check.html')} : {}),
        ...(process.env.GLTF_CHECK ? { gltfCheck: resolve(import.meta.dirname, 'gltf-check.html') } : {}),
      },
    },
  },
});
