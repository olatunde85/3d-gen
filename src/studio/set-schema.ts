/**
 * The JSON schema of a set file's details (its GLB's extras.ara_set; published at /schemas/studio-set.v1.json), from
 * the same rules Studio checks set files by (set-files.ts).
 */
import { SET_ID } from './catalog';
import { CATEGORIES, FAMILIES, MOODS } from './set-files';

export function setSchema() {
  const number = { type: 'number' }, colour = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
  const text = (max: number, description?: string) => ({ type: 'string', minLength: 1, maxLength: max, ...(description ? { description } : {}) });
  const image = (description: string) => ({ type: 'integer', minimum: 0, description });
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Ara Studio set, version 1',
    description: 'The details of an Ara Studio set file: a GLB whose extras.ara_set holds this. Coordinates are glTF\'s (Y up, the front toward +Z), in metres.',
    type: 'object', required: ['kind', 'version', 'id', 'name', 'subtitle', 'author', 'license', 'release', 'category', 'family', 'mood', 'lightmaps', 'room', 'seats', 'light'],
    properties: {
      kind: { const: 'ara-studio-set' }, version: { const: 1 },
      id: { type: 'string', pattern: SET_ID.source, description: '<author>/<set>, in lower case: the ID films use.' },
      name: text(60, 'As Studio lists the set.'), subtitle: text(200, 'One line about the set.'),
      author: text(60), license: text(100, 'An SPDX licence ID (such as CC-BY-4.0) or a short licence name.'),
      release: { type: 'string', pattern: '^\\d{1,4}(\\.\\d{1,4}){0,2}$', description: 'This version of the set, such as 1.2.' },
      category: { enum: [...CATEGORIES] }, family: { enum: [...FAMILIES], description: 'The kind of place.' }, mood: { enum: [...MOODS], description: 'The time of day.' },
      staging: text(2000, 'Where things are, for Assist.'),
      lightmaps: { type: 'object', minProperties: 1, description: 'By name (each mesh names its lightmap in its extras as ara_lightmap).',
        additionalProperties: { type: 'object', required: ['image', 'scale'], properties: { image: image('An index into the GLB\'s images.'), scale: { type: 'number', exclusiveMinimum: 0, description: 'What the lightmap\'s values were divided by.' } } } },
      preview: image('The set\'s picture: an index into the GLB\'s images.'),
      room: { type: 'array', minItems: 4, maxItems: 4, items: number, description: 'The floor: [minX, minZ, maxX, maxZ].' },
      seats: { type: 'array', maxItems: 64, items: { type: 'object', required: ['x', 'y', 'z', 'yaw'], properties: { x: number, y: { type: 'number', description: 'The seat\'s height.' }, z: number, yaw: { type: 'number', description: 'Degrees; 0 faces +Z.' } } } },
      light: { type: 'object', required: ['sun', 'fill', 'exposure', 'background'], description: 'The light on the cast, matched to the bake.', properties: {
        sun: { type: 'object', required: ['direction', 'color', 'intensity'], properties: { direction: { type: 'array', minItems: 3, maxItems: 3, items: number, description: 'The direction the sunlight travels.' }, color: colour, intensity: number } },
        fill: { type: 'object', required: ['color', 'intensity'], properties: { color: colour, intensity: number } },
        exposure: number, background: colour,
      } },
    },
  };
}
