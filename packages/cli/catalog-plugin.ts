/** Lists the ara3d library offers without loading the generator; used by the library build and the website. */
import type { Plugin } from 'vite';
import { PRESETS } from '../../src/core/params';
import { CLIPS } from '../../src/core/anim/clips';
import { animationGroup } from '../../src/core/anim/groups';
import { WEAPONS } from '../../src/core/props/weapons';
import { CARRIED } from '../../src/core/props/carry';
import { VEHICLE_CHOICES, VEHICLE_CLIP } from '../../src/core/props/vehicles';
import { EXPRESSION_WEIGHTS, EXPRESSIONS, FACE_SHAPE_NAMES } from '../../src/core/face';

/** The names the main thread lists (presets, clips, props, face expressions), computed here so the page doesn't load the generator. */
export function catalog(): Plugin {
  const data = {
    presets: Object.keys(PRESETS),
    animations: CLIPS.map((c) => ({ id: c.id, name: c.name, group: animationGroup(c), category: c.category, loop: c.loop })),
    expressions: Object.fromEntries(EXPRESSIONS.map((e) => [e, EXPRESSION_WEIGHTS[e]])),
    faceShapes: FACE_SHAPE_NAMES,
    rides: VEHICLE_CLIP,
    props: { weapons: WEAPONS.filter((w) => w !== 'none'), carried: CARRIED.filter((c) => c !== 'none'), vehicles: VEHICLE_CHOICES.filter((v) => v !== 'none') },
  };
  return { name: 'ara-catalog', resolveId: (id) => (id === 'virtual:ara-catalog' ? '\0ara-catalog' : undefined), load: (id) => (id === '\0ara-catalog' ? `export default ${JSON.stringify(data)};` : undefined) };
}

