/** The fitted, full-length T-shirt from MakeHuman's female casualsuit 01. */
import { cm, REGION } from './body';
import { isTrunk, mat, shell, torsoY, type GarmentDef, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCovers } from './outfit-cut';
import { tuckInto } from './shirts';

function racerCasualShirt(g: GCtx): GPart[] {
  const o = g.outfits?.female_casualsuit01;
  if (!o) return [];
  const src = { ...o.mesh, ref: Int32Array.from(o.ref) };
  // Two upper atlas islands are the front and back; the two small right-side
  // islands are the sleeves. The four lower islands belong to the jeans.
  let shirt = keepIslands(src, i => i.v0 > 0.57 ||
    (i.u0 > 0.72 && i.v0 > 0.15 && i.v1 < 0.43));
  if (g.layered.bottom && g.worn?.length) shirt = tuckInto(g, shirt);
  const fabric = mat('Racer casual shirt', null, {
    map: 'outfit_female_casualsuit01_racer.jpg', normalMap: o.normalMap,
    roughness: 0.8, doubleSided: true,
  });
  // The fitted source can expose body quads beside the armholes and just below
  // the jacket hem. Continue the same cloth through those small openings.
  const lining = shell(g, {
    covers: v => (isTrunk(v) && v.tt > 0.36 && v.tt < 0.9 &&
      Math.abs(v.theta) > 0.34 && Math.abs(v.theta) < 2.72) ||
      (v.region === REGION.upperarm && v.t < 0.62),
    offset: cm(0.18), tile: 0.2, relax: 3, noRim: true,
  });
  const liningMesh = lining && (() => {
    const P = lining.mesh.positions, uvs = new Float32Array(P.length / 3 * 2);
    const y0 = torsoY(g.body, 0.7);
    for (let v = 0; v < P.length / 3; v++) {
      // Map the lining to a plain fabric swatch on the shirt's own atlas. The
      // source texture and normal map then shade it exactly like the shirt.
      uvs[v * 2] = Math.max(0.14, Math.min(0.4, 0.27 + P[v * 3] * 0.05));
      uvs[v * 2 + 1] = Math.max(0.64, Math.min(0.9, 0.75 + (P[v * 3 + 1] - y0) * 0.075));
    }
    return { ...lining.mesh, uvs, faceUVs: Uint32Array.from(lining.mesh.faceVerts) };
  })();
  return [
    ...(lining && liningMesh ? [{ mesh: liningMesh,
      material: { ...fabric, name: 'Racer shirt underarm lining' },
      hides: lining.covered, smooth: true }] : []),
    {
    mesh: shirt,
    material: fabric,
    hides: outfitCovers(g, o, shirt, [REGION.torso, REGION.neck, REGION.upperarm]),
    smooth: true,
    },
  ];
}

export const RACER_CASUAL_SHIRT: GarmentDef = {
  id: 'racer_casual_shirt', label: 'Charcoal and red racer T-shirt', slot: 'top',
  patterns: ['solid'], color: '#323336', color2: '#cd2736',
  setOnly: true, preserveUnderJacket: true, fromOutfit: 'female_casualsuit01', build: racerCasualShirt,
};
