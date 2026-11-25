/**
 * Writes Ara's JSON schemas to dist/schemas/, served at ara3dgen.com/schemas/. They are generated from the same
 * catalogues as the apps, so every ID and range matches the version being deployed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { packSchema, packSourceSchema } from '../src/core/packs/schema';
import { join, resolve } from 'node:path';
import { characterSchema } from '../src/app/character-assist';
import { assistSchema } from '../src/studio/assist';
import { playSchema } from '../src/play/schema';
import { setSchema } from '../src/studio/set-schema';
import { nodeLibrary } from './node-assets';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'dist/schemas'), site = 'https://ara3dgen.com/schemas/';
const { catalog } = await nodeLibrary();
const schemas = [
  { file: 'character.v1.json', title: 'Ara character', description: 'A character: a preset and/or appearance parameters (kind "ara-character", version 1).', schema: characterSchema(catalog) },
  { file: 'studio-film.v2.json', title: 'Ara 3D Studio film', description: 'A Studio film: set, cast, timeline, dialogue, sound and music (version 2).', schema: assistSchema(catalog) },
  { file: 'pack.v1.json', title: 'Ara content pack', description: 'A content pack: animations made in other tools, retargeted onto Ara\'s rig (written by ara3d pack build).', schema: packSchema() },
  { file: 'pack-source.v1.json', title: 'Ara pack source', description: 'A pack.json: the animation files ara3d pack build turns into a content pack.', schema: packSourceSchema() },
  { file: 'studio-set.v1.json', title: 'Ara Studio set', description: 'The details of a Studio set file (a GLB\'s extras.ara_set): ID, credits, room, seats, light and lightmaps (version 1).', schema: setSchema() },
  { file: 'play-game.v2.json', title: 'Ara Play game', description: 'An Ara Play game: mode, missions, cast, city, story and chapters (kind "ara-play", version 2).', schema: playSchema(catalog) },
];
mkdirSync(out, { recursive: true });
for (const s of schemas) writeFileSync(join(out, s.file), JSON.stringify({ $id: site + s.file, ...s.schema }, null, 2) + '\n');
writeFileSync(join(out, 'index.json'), JSON.stringify({ schemas: schemas.map(({ file, title, description }) => ({ title, description, url: site + file })) }, null, 2) + '\n');
console.log(`schemas: ${schemas.length} -> dist/schemas/`);
