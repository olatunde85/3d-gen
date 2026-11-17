/**
 * Checks the web copy of the character data (scripts/build-web-assets.ts): characters built from it, loading only the
 * body shapes they need, come out identical to characters built from the full data, vertex for vertex and in every
 * face shape.
 *   npm run test:web-assets
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AssetLibrary } from '../src/core/assets';
import { buildHuman } from '../src/core/human';
import { neededTargets } from '../src/core/morph';
import { DEFAULT_PARAMS, PRESETS, randomParams, type HumanParams } from '../src/core/params';

const assets = resolve(import.meta.dirname, '../public/assets');
if (!existsSync(join(assets, 'web/index.json'))) throw Error('Build the web data first: npx tsx scripts/build-web-assets.ts');
const source = { read: async (p: string) => new Uint8Array(await readFile(join(assets, p))) };
const full = await new AssetLibrary(source).init(), web = await new AssetLibrary(source).initWeb();
const cases: HumanParams[] = [...['The Bride', 'The Soldier', 'The Covert Spy', 'The Zulu Warrior', 'Teen'].map((n) => ({ ...DEFAULT_PARAMS, ...PRESETS[n], name: n })), ...[7, 42, 99, 1234].map((s) => randomParams(s, full.catalog))];
for (const p of cases) {
  await web.loadTargets(neededTargets(web, p));
  const a = await buildHuman(full, p), b = await buildHuman(web, p);
  const pa = a.mesh.positions as Float32Array, pb = b.mesh.positions as Float32Array;
  let d = pa.length === pb.length ? 0 : Infinity;
  for (let i = 0; i < pa.length && d < Infinity; i++) d = Math.max(d, Math.abs(pa[i] - pb[i]));
  const ma = a.mesh.morphs?.deltas, mb = b.mesh.morphs?.deltas;
  let dm = 0;
  if (ma && mb) for (let k = 0; k < ma.length; k++) { const x = ma[k], y = mb[k];for (let i = 0; i < x.length; i++) dm = Math.max(dm, Math.abs(x[i] - y[i])); }
  assert.equal(d, 0, `${p.name}: the body differs by ${d}`);assert.equal(dm, 0, `${p.name}: a face shape differs by ${dm}`);
  console.log(`OK ${p.name}: ${pa.length / 3} vertices and ${ma?.length ?? 0} face shapes identical`);
}
console.log(`Web data checks passed: ${cases.length} characters identical, from ${Object.keys(web.targets.meta.targets).length} of ${Object.keys(full.targets.meta.targets).length} targets.`);
