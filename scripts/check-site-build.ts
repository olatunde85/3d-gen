/**
 * Refuses a deploy whose dist/ is missing part of the site: run by `npm run deploy:site` after the full build, so a
 * plain `npx vite build` (which leaves out the docs and the published schemas) can never go to production.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
const needed = [
  'index.html', 'app/index.html', 'characters/index.html', 'studio/index.html', 'play/index.html', 'developers/index.html',
  'docs/index.html', 'docs/characters/index.html', 'docs/search.json', 'schemas/character.v1.json', 'schemas/studio-film.v2.json',
  'schemas/play-game.v2.json', 'play-runtime/runtime.json', 'media/ara-studio-reel.mp4', 'sitemap.xml', '_headers',
];
const missing = needed.filter((f) => !existsSync(join(dist, f)));
if (missing.length) {
  console.error(`dist/ is incomplete, not deploying. Missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`dist/ complete (${needed.length} key files checked)`);
