/** The names the main thread lists (presets, clips, props, face expressions), computed at build time so the page doesn't load the generator. */
import { PRESETS } from '../../src/core/params';
import { CLIPS } from '../../src/core/anim/clips';
import { animationGroup } from '../../src/core/anim/groups';
import { WEAPONS } from '../../src/core/props/weapons';
import { CARRIED } from '../../src/core/props/carry';
import { VEHICLE_CHOICES, VEHICLE_CLIP } from '../../src/core/props/vehicles';
import { EXPRESSION_WEIGHTS, EXPRESSIONS, FACE_SHAPE_NAMES } from '../../src/core/face';

export const data = {
  presets: Object.keys(PRESETS),
  animations: CLIPS.map((c) => ({ id: c.id, name: c.name, group: animationGroup(c), category: c.category, loop: c.loop })),
  expressions: Object.fromEntries(EXPRESSIONS.map((e) => [e, EXPRESSION_WEIGHTS[e]])),
  faceShapes: FACE_SHAPE_NAMES,
  rides: VEHICLE_CLIP,
  // Which presets are women, for the matching loading figure.
  women: Object.entries(PRESETS).filter(([, p]) => (p.gender ?? 1) < 0.5).map(([name]) => name),
  props: { weapons: WEAPONS.filter((w) => w !== 'none'), carried: CARRIED.filter((c) => c !== 'none'), vehicles: VEHICLE_CHOICES.filter((v) => v !== 'none') },
};
