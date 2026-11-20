/**
 * Stage props: a ladder, a vault obstacle, a ledge wall and low cover, built to the dimensions the clips are authored
 * against (scaled to the character). The clips play the same with or without them; the builder and Studio can show
 * them and the export can include them as separate prop files.
 */
import * as T from 'three';
import { LADDER, LEDGE, VAULT } from '../anim/clips/climbing';
import { COVER, TAKE_COVER_STEP } from '../anim/clips/cover';
import { FOOTBALL_RADIUS, footballAt, stagePropFor, type StageProp } from '../anim/stage';
import type { Material, MeshData } from '../mesh';

export { STAGE_PROP_LABELS, stagePropFor, type StageProp } from '../anim/stage';

const metal = () => new T.MeshStandardMaterial({ name: 'Ladder aluminium', color: '#b9bec4', roughness: 0.35, metalness: 0.7 });
const concrete = () => new T.MeshStandardMaterial({ name: 'Concrete', color: '#8e8a82', roughness: 0.92 });

function box(size: [number, number, number], at: [number, number, number], mat: T.Material) {
  const m = new T.Mesh(new T.BoxGeometry(...size), mat);
  m.position.set(...at); m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * The prop in the character's starting frame (metres). The preview ladder reaches below the floor so its rungs can
 * scroll past a character climbing in place; the exported ladder stands on the floor.
 */
export function stagePropModel(prop: StageProp, scale: number, preview = true, ahead = 0): T.Group {
  const g = new T.Group(), s = scale;
  if (prop === 'ladder') {
    const mat = metal(), bottom = preview ? -0.6 : 0, height = preview ? 6 : 4, half = (LADDER.width / 2 + 0.03) * s;
    for (const x of [-half, half]) g.add(box([0.035 * s, height * s, 0.06 * s], [x, (bottom + height / 2) * s, LADDER.plane * s], mat));
    for (let y = LADDER.first - (preview ? 2 : 1) * LADDER.rung; y < bottom + height - 0.1; y += LADDER.rung) {
      const rung = new T.Mesh(new T.CylinderGeometry(0.016 * s, 0.016 * s, 2 * half, 12), mat);
      rung.rotation.z = Math.PI / 2; rung.position.set(0, y * s, LADDER.plane * s); rung.castShadow = true;
      g.add(rung);
    }
    g.userData.repeat = LADDER.rung * s;
  } else if (prop === 'obstacle') {
    g.add(box([1.4 * s, VAULT.height * s, VAULT.depth * s], [0, (VAULT.height / 2) * s, (VAULT.near + VAULT.depth / 2) * s], concrete()));
  } else if (prop === 'football') {
    // White leather with the twelve dark pentagon patches of a classic ball.
    const ball = new T.Group(), r = FOOTBALL_RADIUS * s;
    const white = new T.MeshStandardMaterial({ name: 'Football leather', color: '#f4f3ee', roughness: 0.55 }), dark = new T.MeshStandardMaterial({ name: 'Football patches', color: '#1d1f22', roughness: 0.6 });
    const shell = new T.Mesh(new T.SphereGeometry(r, 24, 16), white);shell.castShadow = true;ball.add(shell);
    const ico = new T.IcosahedronGeometry(1, 0), p = ico.getAttribute('position'), seen = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      const n = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize(), key = n.toArray().map((x) => x.toFixed(3)).join();
      if (seen.has(key)) continue;seen.add(key);
      const patch = new T.Mesh(new T.CircleGeometry(r * 0.36, 5), dark);
      patch.position.copy(n.clone().multiplyScalar(r * 1.004));patch.lookAt(n.clone().multiplyScalar(2 * r));ball.add(patch);
    }
    ico.dispose();ball.name = 'football';ball.position.set(0, r, 0.4 * s);g.add(ball);g.userData.ball = ball;
  } else if (prop === 'cover') {
    g.add(box([COVER.width * s, COVER.height * s, COVER.depth * s], [0, (COVER.height / 2) * s, (COVER.near + ahead + COVER.depth / 2) * s], concrete()));
  } else {
    const depth = 1.2;
    g.add(box([3 * s, LEDGE.top * s, depth * s], [0, (LEDGE.top / 2) * s, (LEDGE.face + depth / 2) * s], concrete()));
  }
  return g;
}

/** Preview prop for a clip, or undefined for clips without one. */
export function stageScenery(clipId: string, scale: number, mirror = false): T.Group | undefined {
  const prop = stagePropFor(clipId);
  // Take cover steps up to the wall, so from where it starts the wall is a step further away.
  const g = prop && stagePropModel(prop, scale, true, clipId === 'take_cover' ? TAKE_COVER_STEP : 0);
  if (g?.userData.ball) g.userData.path = (t: number) => { const at = footballAt(clipId, t);return at && mirror ? [-at[0], at[1], at[2]] : at; };
  return g;
}

/**
 * Where the prop sits at clip time `t`. With root motion the body travels and the prop stays put; played in
 * place, the prop moves the other way so every hand and foot stays on it. A ladder wraps every rung spacing.
 */
export function placeStageProp(g: T.Group, travel: [number, number, number] | undefined, t: number, scale: number, rootMotion: boolean) {
  const off = rootMotion || !travel ? [0, 0, 0] : travel.map((v) => -v * t * scale);
  const repeat = g.userData.repeat as number | undefined;
  if (repeat) off[1] = ((off[1] % repeat) + repeat) % repeat - repeat;
  g.position.set(off[0], off[1], off[2]);
  placeBall(g, t, scale);
}

/** Move a football prop along its clip's path (measured from where the clip started). */
export function placeBall(g: T.Group, t: number, scale: number) {
  const ball = g.userData.ball as T.Object3D | undefined, at = (g.userData.path as ((t: number) => [number, number, number] | undefined) | undefined)?.(t);
  if (ball) { ball.visible = !!at; if (at) { ball.position.set(at[0] * scale, at[1] * scale, at[2] * scale); ball.rotation.x = at[2] * 6; } }
}

/** The prop as a static export mesh, origin at the character's position (for cover, where Cover idle plays). */
export function stagePropMesh(prop: StageProp, scale: number): MeshData {
  const g = stagePropModel(prop, scale, false);
  g.updateMatrixWorld(true);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], materials: Material[] = [];
  const groups = new Map<T.Material, { material: number; indices: number[] }>();
  g.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const geo = (o.geometry as T.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), U = geo.getAttribute('uv'), offset = positions.length / 3;
    const mat = o.material as T.MeshStandardMaterial;
    let group = groups.get(mat);
    if (!group) {
      group = { material: materials.length, indices: [] };
      groups.set(mat, group);
      materials.push({ name: mat.name, color: '#' + mat.color.getHexString(), roughness: mat.roughness, metalness: mat.metalness, alpha: 'opaque', doubleSided: false });
    }
    for (let i = 0; i < P.count; i++) { positions.push(P.getX(i), P.getY(i), P.getZ(i)); normals.push(N.getX(i), N.getY(i), N.getZ(i)); uvs.push(U.getX(i), U.getY(i)); }
    for (let i = 0; i < geo.index!.count; i++) group.indices.push(offset + geo.index!.getX(i));
    geo.dispose();
  });
  g.traverse((o) => { if (o instanceof T.Mesh) { o.geometry.dispose(); (o.material as T.Material).dispose(); } });
  return {
    positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), materials,
    groups: [...groups.values()].map((x) => ({ material: x.material, indices: Uint32Array.from(x.indices), polyIndices: Uint32Array.from(x.indices), polySizes: new Uint8Array(x.indices.length / 3).fill(3) })),
  };
}
