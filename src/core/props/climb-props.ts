/**
 * Preview scenery for the climbing clips: a ladder, a vault obstacle and a ledge wall, built to the dimensions the
 * clips are authored against (scaled to the character). Games supply their own; the builder and Studio show these.
 */
import * as T from 'three';
import { LADDER, LEDGE, VAULT } from '../anim/clips/climbing';

const wood = () => new T.MeshStandardMaterial({ name: 'Ladder aluminium', color: '#b9bec4', roughness: 0.35, metalness: 0.7 });
const concrete = () => new T.MeshStandardMaterial({ name: 'Concrete', color: '#8e8a82', roughness: 0.92 });

function box(size: [number, number, number], at: [number, number, number], mat: T.Material) {
  const m = new T.Mesh(new T.BoxGeometry(...size), mat);
  m.position.set(...at); m.castShadow = m.receiveShadow = true;
  return m;
}

/** Scenery for a climbing clip, in the character's starting frame (metres), or undefined for other clips. */
export function climbScenery(clipId: string, scale: number): T.Group | undefined {
  const g = new T.Group(), s = scale;
  if (clipId === 'ladder_up' || clipId === 'ladder_down') {
    // Tall enough to stay in view while the rungs scroll past an in-place climber.
    const mat = wood(), height = 6, half = (LADDER.width / 2 + 0.03) * s;
    for (const x of [-half, half]) g.add(box([0.035 * s, height * s, 0.06 * s], [x, (height / 2 - 0.6) * s, LADDER.plane * s], mat));
    for (let y = LADDER.first - 2 * LADDER.rung; y < height - 0.6; y += LADDER.rung) {
      const rung = new T.Mesh(new T.CylinderGeometry(0.016 * s, 0.016 * s, 2 * half, 12), mat);
      rung.rotation.z = Math.PI / 2; rung.position.set(0, y * s, LADDER.plane * s); rung.castShadow = true;
      g.add(rung);
    }
    g.userData.repeat = LADDER.rung * s;
  } else if (clipId === 'vault_over') {
    g.add(box([1.4 * s, VAULT.height * s, VAULT.depth * s], [0, (VAULT.height / 2) * s, (VAULT.near + VAULT.depth / 2) * s], concrete()));
  } else if (clipId === 'ledge_hang' || clipId === 'ledge_climb_up') {
    const depth = 1.2;
    g.add(box([3 * s, LEDGE.top * s, depth * s], [0, (LEDGE.top / 2) * s, (LEDGE.face + depth / 2) * s], concrete()));
  } else return undefined;
  return g;
}

/**
 * Where the scenery sits at clip time `t`. With root motion the body travels and the scenery stays put; played in
 * place, the scenery moves the other way so every hand and foot stays on it. A ladder wraps every rung spacing.
 */
export function placeClimbScenery(g: T.Group, travel: [number, number, number] | undefined, t: number, scale: number, rootMotion: boolean) {
  const off = rootMotion || !travel ? [0, 0, 0] : travel.map((v) => -v * t * scale);
  const repeat = g.userData.repeat as number | undefined;
  if (repeat) off[1] = ((off[1] % repeat) + repeat) % repeat - repeat;
  g.position.set(off[0], off[1], off[2]);
}
