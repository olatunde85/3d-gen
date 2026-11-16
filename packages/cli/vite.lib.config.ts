/**
 * Builds the browser library: dist/index.js, with three.js left to the app (a peer dependency) and the generator
 * running in a worker that is bundled with everything it needs and inlined, so no bundler setup is required.
 */
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { PRESETS } from '../../src/core/params';
import { CLIPS } from '../../src/core/anim/clips';
import { animationGroup } from '../../src/core/anim/groups';
import { WEAPONS } from '../../src/core/props/weapons';
import { CARRIED } from '../../src/core/props/carry';
import { VEHICLE_CHOICES } from '../../src/core/props/vehicles';
import { EXPRESSION_WEIGHTS, EXPRESSIONS, FACE_SHAPE_NAMES } from '../../src/core/face';

/** The names the main thread lists (presets, clips, props, face expressions), computed here so the page doesn't load the generator. */
function catalog(): Plugin {
  const data = {
    presets: Object.keys(PRESETS),
    animations: CLIPS.map((c) => ({ id: c.id, name: c.name, group: animationGroup(c), category: c.category, loop: c.loop })),
    expressions: Object.fromEntries(EXPRESSIONS.map((e) => [e, EXPRESSION_WEIGHTS[e]])),
    faceShapes: FACE_SHAPE_NAMES,
    props: { weapons: WEAPONS.filter((w) => w !== 'none'), carried: CARRIED.filter((c) => c !== 'none'), vehicles: VEHICLE_CHOICES.filter((v) => v !== 'none') },
  };
  return { name: 'ara-catalog', resolveId: (id) => (id === 'virtual:ara-catalog' ? '\0ara-catalog' : undefined), load: (id) => (id === '\0ara-catalog' ? `export default ${JSON.stringify(data)};` : undefined) };
}

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
