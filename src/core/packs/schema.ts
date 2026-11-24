/**
 * JSON schemas for packs (published at /schemas/pack.v1.json) and for the pack.json that `ara3d pack build` reads
 * (/schemas/pack-source.v1.json), so editors check them as they're written.
 */
import { MOCAP_BONES } from '../anim/mocap';
import { ITEM_ID, MAX_ANIMATION_SECONDS, MAX_PACK_ANIMATIONS, PACK_CATEGORIES, PACK_ID, PACK_KIND, PACK_VERSION } from './format';

const details = {
  id: { type: 'string', pattern: PACK_ID.source, description: 'The pack\'s ID: its animations are named "<id>/<animation>".' },
  name: { type: 'string', minLength: 1, maxLength: 60 },
  author: { type: 'string', maxLength: 100 },
  license: { type: 'string', maxLength: 60, description: 'An SPDX licence ID (such as CC-BY-4.0) or a short licence name.' },
  homepage: { type: 'string', maxLength: 500, pattern: '^https?://' },
  description: { type: 'string', maxLength: 500 },
};
const category = { enum: [...PACK_CATEGORIES], description: 'The group the animation joins in Ara.' };

export function packSchema() {
  const vec = (n: number) => ({ type: 'array', minItems: n, maxItems: n, items: { type: 'number' } });
  const bones = { type: 'object', propertyNames: { enum: [...MOCAP_BONES] } };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://ara3dgen.com/schemas/pack.v1.json', title: 'Ara content pack, version 1',
    description: 'Written by ara3d pack build. Holds data only; every app checks it before use.',
    type: 'object', additionalProperties: false, required: ['kind', 'version', 'id', 'name', 'animations'],
    properties: {
      $schema: { type: 'string' }, kind: { const: PACK_KIND }, version: { const: PACK_VERSION }, ...details,
      animations: { type: 'array', minItems: 1, maxItems: MAX_PACK_ANIMATIONS, items: {
        type: 'object', additionalProperties: false, required: ['id', 'name', 'category', 'motion'],
        properties: {
          id: { type: 'string', pattern: ITEM_ID.source }, name: { type: 'string', minLength: 1, maxLength: 60 }, category,
          motion: { type: 'object', description: 'Retargeted motion: per frame, each bone\'s rotation (int16 quaternions) and the hips position, base64.',
            required: ['duration', 'loop', 'frames', 'bones', 'rot', 'hips', 'dir', 'bias'],
            properties: {
              duration: { type: 'number', exclusiveMinimum: 0, maximum: MAX_ANIMATION_SECONDS }, loop: { type: 'boolean' }, travel: vec(3),
              frames: { type: 'integer', minimum: 2 }, bones: { type: 'array', items: { enum: [...MOCAP_BONES] }, uniqueItems: true },
              rot: { type: 'string', contentEncoding: 'base64' }, hips: { type: 'string', contentEncoding: 'base64' },
              dir: { ...bones, additionalProperties: vec(3) }, bias: { ...bones, additionalProperties: vec(4) },
              hands: { const: 'fist' }, ground: { type: 'boolean' },
              anchor: { type: 'object', required: ['rot', 'hips', 'key'], properties: { rot: { type: 'array', items: { type: 'number' } }, hips: vec(3), key: { type: 'string' } } },
            } },
        } } },
    },
  };
}

export function packSourceSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'https://ara3dgen.com/schemas/pack-source.v1.json', title: 'Ara pack source (pack.json)',
    description: 'The animation files of a pack and how to use them. ara3d pack new writes one; ara3d pack build reads it.',
    type: 'object', additionalProperties: false, required: ['id', 'name', 'animations'],
    properties: {
      $schema: { type: 'string' }, ...details,
      animations: { type: 'array', minItems: 1, maxItems: MAX_PACK_ANIMATIONS, items: {
        type: 'object', additionalProperties: false, required: ['file'],
        properties: {
          file: { type: 'string', pattern: '\\.(fbx|glb|gltf|bvh)$', description: 'The file, next to pack.json: FBX (Mixamo and most tools), glTF/GLB or BVH.' },
          clip: { type: 'string', description: 'Which animation in the file, by name (default: the first).' },
          id: { type: 'string', pattern: ITEM_ID.source, description: 'Default: from the file name.' },
          name: { type: 'string', minLength: 1, maxLength: 60 }, category,
          loop: { type: 'boolean', description: 'Default: when its last pose matches its first.' },
          start: { type: 'number', minimum: 0, description: 'Seconds into the recording to start.' },
          end: { type: 'number', exclusiveMinimum: 0, description: 'Seconds into the recording to end.' },
          fps: { type: 'integer', minimum: 24, maximum: 60, description: 'Frames a second to keep (default: the file\'s own rate).' },
          hands: { const: 'fist', description: 'Closed fists when the recording has no fingers.' },
          ground: { type: 'boolean', description: 'Keep the lowest foot on the floor every frame (seated and lying clips).' },
          mirror: { type: 'boolean', description: 'BVH only: mirrored left to right.' },
          armSpread: { type: 'number', minimum: -20, maximum: 20, description: 'Degrees to turn the arms out from the body.' },
          legSpread: { type: 'number', minimum: -10, maximum: 15, description: 'Degrees to turn the legs out (default 0; 4 for CMU recordings).' },
          bones: { type: 'object', additionalProperties: { enum: [...MOCAP_BONES] }, description: 'Source joint name -> Ara (Mixamo) bone name, for skeletons Ara doesn\'t recognise.' },
        } } },
    },
  };
}
