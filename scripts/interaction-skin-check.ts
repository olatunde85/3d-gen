/** Check the skinned hand surfaces against the skinned legs, beyond the joint-only IK checks. */
import { Triangle, Vector3 } from 'three';
import { Animator } from '../src/core/anim/evaluate';
import { clipById } from '../src/core/anim/clips';
import { qconj, qmul, qrot, type Q } from '../src/core/anim/quat';
import { quatOf, type Rig } from '../src/core/rig/rig';
import type { MeshData } from '../src/core/mesh';
import type { Vec3 } from '../src/core/math';

export function checkInteractionSkin(rig: Rig, mesh: MeshData, label: string, fail: (s: string) => void) {
  if (!mesh.joints || !mesh.weights) throw Error('Skin checks require a skinned mesh');
  const B = rig.bones, J = mesh.joints, W = mesh.weights;
  const A = new Animator(rig);
  const scale = Math.max(...B.flatMap((b) => [b.head[1], b.tail[1]])) / 1.8;
  const isLeg = (j: number) => /^(Left|Right)(UpLeg|Leg)$|^(upperleg|lowerleg|knee)/.test(B[j].name);
  const isHand = (j: number) => /^(Left|Right)Hand|^(wrist|finger|metacarpal)/.test(B[j].name);
  const weight = (v: number, pred: (j: number) => boolean) => [0, 1, 2, 3].reduce((s, k) => s + (pred(J[v * 4 + k]) ? W[v * 4 + k] : 0), 0);
  const skin = mesh.groups.find((g) => mesh.materials[g.material].name === 'Skin')!;
  const handVerts = [...new Set(skin.indices)].filter((v) => weight(v, isHand) > 0.8);
  // Uniformly sample across both hands, including fingers, without depending on mesh resolution.
  const step = Math.max(1, Math.floor(handVerts.length / 64));
  const witnesses = handVerts.filter((_, i) => i % step === 0);
  const legs: number[][] = [];
  for (let i = 0; i < skin.indices.length; i += 3) {
    const tri = Array.from(skin.indices.slice(i, i + 3));
    if (tri.every((v) => weight(v, isLeg) > 0.5)) legs.push(tri);
  }
  if (!witnesses.length || !legs.length) throw Error(`${label}: contact check has no hand or leg skin`);
  const inv = B.map((b) => qconj(quatOf(b.rot)));
  for (const [id, times] of [['pick_up', [0.8, 0.95, 1.1, 1.5, 1.9, 2.1]], ['open_door', [0.8, 1.2, 1.8, 2.1]]] as const) {
    for (const t of times) {
      const frame = A.frame(clipById.get(id)!, t), ps = A.positions(frame), world: Q[] = [];
      B.forEach((b, i) => world[i] = b.parent < 0 ? frame.rot[i] : qmul(world[b.parent], frame.rot[i]));
      const rot = world.map((q, i) => qmul(q, inv[i]));
      const cache = new Map<number, Vector3>();
      const vertex = (v: number) => {
        let p = cache.get(v);
        if (p) return p;
        const rest: Vec3 = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
        const out = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const j = J[v * 4 + k], w = W[v * 4 + k];
          if (!w) continue;
          const local = rest.map((x, d) => x - B[j].head[d]) as Vec3;
          const q = qrot(rot[j], local);
          for (let d = 0; d < 3; d++) out[d] += (q[d] + ps[j][d]) * w;
        }
        p = new Vector3(...out); cache.set(v, p); return p;
      };
      const triangles = legs.map(([a, b, c]) => new Triangle(vertex(a), vertex(b), vertex(c)));
      const closest = new Vector3(), normal = new Vector3(), delta = new Vector3();
      let penetration = 0;
      for (const v of witnesses) {
        const p = vertex(v);
        let near = Infinity, signed = 0;
        for (const tri of triangles) {
          tri.closestPointToPoint(p, closest);
          const d = p.distanceTo(closest);
          if (d >= near) continue;
          near = d;
          signed = delta.subVectors(p, closest).dot(tri.getNormal(normal));
        }
        // The nearest outward-facing leg surface is behind an embedded hand point.
        // Ignore distant points where the open boundary at the hip isn't a closed volume.
        if (near < 0.08 * scale && signed < -0.006 * scale) penetration = Math.max(penetration, -signed / scale);
      }
      if (penetration) fail(`${label}: ${id} hand skin penetrates a leg by ${(penetration * 1000).toFixed(1)}mm at ${t}s`);
    }
  }
}
