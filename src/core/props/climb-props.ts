/**
 * Climbing props: a ladder, a vault obstacle and a ledge wall, built to the dimensions the clips are authored against
 * (scaled to the character). The clips play the same with or without them; the builder and Studio can show them and
 * the export can include them as separate prop files.
 */
import * as T from 'three';
import { LADDER, LEDGE, VAULT, climbPropFor, type ClimbProp } from '../anim/clips/climbing';
import type { Material, MeshData } from '../mesh';

export { CLIMB_PROP_LABELS, climbPropFor, type ClimbProp } from '../anim/clips/climbing';

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
export function climbPropModel(prop: ClimbProp, scale: number, preview = true): T.Group {
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
  } else {
    const depth = 1.2;
    g.add(box([3 * s, LEDGE.top * s, depth * s], [0, (LEDGE.top / 2) * s, (LEDGE.face + depth / 2) * s], concrete()));
  }
  return g;
}

/** Preview prop for a climbing clip, or undefined for other clips. */
export function climbScenery(clipId: string, scale: number): T.Group | undefined {
  const prop = climbPropFor(clipId);
  return prop && climbPropModel(prop, scale);
}

/**
 * Where the prop sits at clip time `t`. With root motion the body travels and the prop stays put; played in
 * place, the prop moves the other way so every hand and foot stays on it. A ladder wraps every rung spacing.
 */
export function placeClimbScenery(g: T.Group, travel: [number, number, number] | undefined, t: number, scale: number, rootMotion: boolean) {
  const off = rootMotion || !travel ? [0, 0, 0] : travel.map((v) => -v * t * scale);
  const repeat = g.userData.repeat as number | undefined;
  if (repeat) off[1] = ((off[1] % repeat) + repeat) % repeat - repeat;
  g.position.set(off[0], off[1], off[2]);
}

/** The prop as a static export mesh, origin at the character's starting position. */
export function climbPropMesh(prop: ClimbProp, scale: number): MeshData {
  const g = climbPropModel(prop, scale, false);
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
