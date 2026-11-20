/** Shoulder tabs shared by procedural and fitted uniform shirts. */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm } from './body';
import { mat, Z, type GarmentDef, type GCtx, type GPart } from './kit';
import { frameOf, merge, roundedBox, v3 } from './ring';

export function uniformEpaulettes(g: GCtx, shirt: PolyMesh, color: string): GPart[] {
  const b = g.body, P = shirt.positions;
  const topAt = (x: number): Vec3 | null => {
    let top: Vec3 | null = null;
    for (let i = 0; i < P.length; i += 3) {
      const p: Vec3 = [P[i], P[i + 1], P[i + 2]];
      if (Math.abs(p[0] - x) < cm(1.2) && Math.abs(p[2] - b.L.torsoZ) < cm(6) && (!top || p[1] > top[1])) top = p;
    }
    return top;
  };
  const tabs: PolyMesh[] = [];
  for (const side of [1, -1]) {
    const a = topAt(0.45 * b.L.shoulderX * side), c = topAt(0.88 * b.L.shoulderX * side);
    if (!a || !c) continue;
    const along = v3.norm(v3.sub(c, a));
    let up = v3.norm(v3.cross(Z, along));
    if (up[1] < 0) up = v3.scale(up, -1);
    const mid = v3.add(v3.scale(v3.add(a, c), 0.5), v3.scale(up, cm(0.3)));
    tabs.push(roundedBox(frameOf(mid, up, along), [cm(2.2), v3.len(v3.sub(c, a)) / 2, cm(0.25)], 0.5));
  }
  const mesh = merge(tabs);
  return mesh ? [{ mesh, material: mat('Epaulettes', null, { color, roughness: 0.5, metalness: 0.3 }) }] : [];
}

/** Wear the same tabs over another shirt, with their own editable colour. */
export const EPAULETTE_ACCENT: GarmentDef = {
  id: 'epaulette_accent', label: 'Shoulder epaulettes', slot: 'acc',
  patterns: ['solid'], color: '#137e86', color2: '#137e86', colorLabels: ['Epaulettes', 'Accent'],
  build: (g, st) => g.topParts?.[0] ? uniformEpaulettes(g, g.topParts[0].mesh, st.color) : [],
};
