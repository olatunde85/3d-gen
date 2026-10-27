/**
 * Builds a complete character: morphed body + fitted proxies (eyes, brows,
 * lashes, hair, clothes, shoes, hat) + skeleton, as one multi-material mesh.
 */
import type { AssetLibrary, AssetMaterial, CatalogItem, ProxyMeta, Slider } from './assets';
import { compact, subdivide, vertexNormals, type PolyMesh } from './geometry';
import { archFeet, buildGarments, dressing } from './garments';
import type { Vec3 } from './math';
import { applyTPose, baseSkin, placeBones, quatOf, skeletonDefs, skinFromRefs, skinPart, VertexGrid, type Rig } from './rig/rig';
import { socketBone, type HandJoints } from './rig/socket';
import { buildWeapon, type WeaponId, type WeaponPart } from './props/weapons';
import { Animator } from './anim/evaluate';
import { qrot, type Q } from './anim/quat';
import type { Skin } from './geometry';
import { MeshAssembler, pickGroups, type Material, type MeshData } from './mesh';
import { applyTargets, targetWeights } from './morph';
import type { Pack } from './pack';
import { ageToYears, type HumanParams } from './params';
import { buildLooks } from './looks';
import { calibrateBlinks, EXPRESSION_WEIGHTS, faceDeltas, faceShapeDelta, faceShapeNames, sealLips, weightsArray } from './face';

export interface Character {
  params: HumanParams;
  mesh: MeshData;
  /** Skeleton + bind pose (absent when rigging is off). */
  rig?: Rig;
  /** Held weapon: its parts in the weapon frame and the weapon -> WeaponR socket rotation. */
  weapon?: { id: WeaponId; rot: Q; parts: WeaponPart[] };
  /** Standing height in metres (body, without hair/hat). */
  height: number;
  /** Facial blend shapes in the mesh (names and the expression's resting weights), if exported. */
  face?: { names: string[]; defaults: number[] };
}

/** MakeHuman units are decimetres. */
const DM = 0.1;

const sliderCache = new WeakMap<AssetLibrary, Map<string, Slider>>();
function slidersOf(lib: AssetLibrary) {
  let m = sliderCache.get(lib);
  if (!m) sliderCache.set(lib, (m = new Map(lib.catalog.sliders.flatMap((g) => g.sliders.map((s) => [s.id, s] as const)))));
  return m;
}

/** Pick the skin texture closest to the character's ethnicity, sex and age. */
export function autoSkin(p: HumanParams, skins: CatalogItem[]): CatalogItem {
  const race = p.african >= p.asian && p.african >= p.caucasian ? 'african' : p.asian >= p.caucasian ? 'asian' : 'caucasian';
  const sex = p.gender >= 0.5 ? 'male' : 'female';
  const y = ageToYears(p.age);
  const ages = ['young', 'middleage', 'old'];
  const age = y < 38 ? 0 : y < 60 ? 1 : 2;
  let best = skins[0], bestScore = -Infinity;
  for (const s of skins) {
    const m = /^(young|middleage|old)_(african|asian|caucasian)_(male|female)(\d*)$/.exec(s.id);
    if (!m) continue;
    const score = (m[2] === race ? 8 : 0) + (m[3] === sex ? 4 : 0) - Math.abs(ages.indexOf(m[1]) - age) - (m[4] ? 0.1 : 0);
    if (score > bestScore) [best, bestScore] = [s, score];
  }
  return best;
}

function fit(proxy: Pack<ProxyMeta>, coords: Float32Array): Float32Array {
  const { refs, weights, offsets } = proxy.arrays as { refs: Uint32Array; weights: Float32Array; offsets: Float32Array };
  const sc = proxy.meta.scale.map((s, axis) =>
    s ? Math.abs(coords[s[0] * 3 + axis] - coords[s[1] * 3 + axis]) / s[2] : 1,
  );
  const n = proxy.meta.vertexCount;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = refs[i * 3] * 3, b = refs[i * 3 + 1] * 3, c = refs[i * 3 + 2] * 3;
    const wa = weights[i * 3], wb = weights[i * 3 + 1], wc = weights[i * 3 + 2];
    for (let d = 0; d < 3; d++)
      out[i * 3 + d] = wa * coords[a + d] + wb * coords[b + d] + wc * coords[c + d] + offsets[i * 3 + d] * sc[d];
  }
  return out;
}

/** Blend-shape offsets for a fitted proxy (eyebrows and eyelashes follow the face), or undefined if untouched. */
function proxyMorphs(proxy: Pack<ProxyMeta>, coords: Float32Array, base: Float32Array, deltas?: Float32Array[]): Float32Array[] | undefined {
  if (!deltas) return undefined;
  const refs = proxy.arrays.refs as Uint32Array;
  let any = false;
  const out = deltas.map((d) => {
    let touched = false;
    for (let i = 0; i < refs.length && !touched; i++) touched = d[refs[i] * 3] !== 0 || d[refs[i] * 3 + 1] !== 0 || d[refs[i] * 3 + 2] !== 0;
    if (!touched) return new Float32Array(base.length);
    any = true;
    const moved = Float32Array.from(coords);
    for (let i = 0; i < moved.length; i++) moved[i] += d[i];
    const f = fit(proxy, moved);
    for (let i = 0; i < f.length; i++) f[i] -= base[i];
    return f;
  });
  return any ? out : undefined;
}

function proxyMesh(proxy: Pack<ProxyMeta>, coords: Float32Array, skin?: Skin, deltas?: Float32Array[]): PolyMesh {
  const a = proxy.arrays as Record<string, Uint8Array & Uint32Array & Float32Array>;
  const positions = fit(proxy, coords);
  return {
    positions, faceSizes: a.faceSizes, faceVerts: a.faceVerts, faceUVs: a.faceUVs, uvs: a.uvs,
    skin: skin && skinFromRefs(a.refs, a.weights, skin),
    morphs: proxyMorphs(proxy, coords, positions, deltas),
  };
}

/**
 * Teeth and tongue: the upper teeth are fixed to the skull, while the lower teeth and the tongue
 * ride on the jaw. Their only face shape is `jawOpen`, a rotation about the jaw hinge matching
 * how far the chin swings (fitting them to the face shapes would also stretch them, moving the
 * upper teeth). Skinned to Head / Jaw so they also follow an animated jaw bone.
 */
function mouthPart(
  proxy: Pack<ProxyMeta>, coords: Float32Array, kind: 'teeth' | 'tongue',
  jaw: { pivot: Vec3; chin: Vec3; chinDeltas: Vec3[] } | undefined,
  bones?: { head: number; jaw: number },
): PolyMesh {
  const a = proxy.arrays as { faceSizes: Uint8Array; faceVerts: Uint32Array; faceUVs: Uint32Array; uvs: Float32Array };
  const positions = fit(proxy, coords);
  const n = positions.length / 3;
  // Which vertices belong to the lower jaw.
  const lower = new Uint8Array(n);
  if (kind === 'tongue') lower.fill(1);
  else {
    // Separate pieces (each tooth, the gums); teeth split at the biggest height gap between them.
    const par = Int32Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
    for (let f = 0, c = 0; f < a.faceSizes.length; c += a.faceSizes[f], f++)
      for (let k = 1; k < a.faceSizes[f]; k++) par[find(a.faceVerts[c + k])] = find(a.faceVerts[c]);
    const comps = new Map<number, number[]>();
    for (let i = 0; i < n; i++) (comps.get(find(i)) ?? comps.set(find(i), []).get(find(i))!).push(i);
    const big = Math.max(...[...comps.values()].map((v) => v.length));
    const cy = (vs: number[]) => vs.reduce((s, v) => s + positions[v * 3 + 1], 0) / vs.length;
    const teeth = [...comps.values()].filter((v) => v.length < big).map(cy).sort((x, y) => x - y);
    let split = cy([...Array(n).keys()]), gap = -1;
    for (let i = 1; i < teeth.length; i++) if (teeth[i] - teeth[i - 1] > gap) [gap, split] = [teeth[i] - teeth[i - 1], (teeth[i] + teeth[i - 1]) / 2];
    for (const vs of comps.values()) {
      if (vs.length < big) {
        const below = cy(vs) < split;
        for (const v of vs) lower[v] = below ? 1 : 0;
      } else for (const v of vs) lower[v] = positions[v * 3 + 1] < split ? 1 : 0; // gums, vertex by vertex
    }
  }
  let morphs: Float32Array[] | undefined;
  if (jaw?.chinDeltas.length) {
    morphs = jaw.chinDeltas.map((chinDelta) => {
      const d = new Float32Array(n * 3);
      // Each shape's jaw rotation: about the lateral (X) axis through the hinge, moving the chin by
      // the shape's chin offset (lip-only shapes barely move it, so the teeth stay put).
      const r0 = [jaw.chin[1] - jaw.pivot[1], jaw.chin[2] - jaw.pivot[2]];
      const r1 = [r0[0] + chinDelta[1], r0[1] + chinDelta[2]];
      const ang = Math.atan2(r0[0] * r1[1] - r0[1] * r1[0], r0[0] * r1[0] + r0[1] * r1[1]);
      if (Math.abs(ang) < 0.005) return d; // under 0.3 degrees
      const cs = Math.cos(ang), sn = Math.sin(ang);
      for (let v = 0; v < n; v++) {
        if (!lower[v]) continue;
        const y = positions[v * 3 + 1] - jaw.pivot[1], z = positions[v * 3 + 2] - jaw.pivot[2];
        d[v * 3 + 1] = y * cs - z * sn - y;
        d[v * 3 + 2] = y * sn + z * cs - z;
      }
      return d;
    });
  }
  let skin: Skin | undefined;
  if (bones) {
    const j = new Uint16Array(n * 4), w = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) {
      j[v * 4] = lower[v] ? bones.jaw : bones.head;
      w[v * 4] = 1;
    }
    skin = { j, w };
  }
  return { positions, faceSizes: a.faceSizes, faceVerts: a.faceVerts, faceUVs: a.faceUVs, uvs: a.uvs, skin, morphs };
}

function toMaterial(m: AssetMaterial, overrides: Partial<Material> = {}): Material {
  return {
    name: m.name, color: m.color, roughness: m.roughness, metalness: m.metalness,
    map: m.diffuse, normalMap: m.normal, alpha: m.alpha, doubleSided: m.doubleSided, ...overrides,
  };
}

/** Multiply two sRGB hex colours. */
function tint(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round((((pa >> s) & 255) * ((pb >> s) & 255)) / 255);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

export interface BuildOptions {
  /** Called as the build moves through its stages (for progress UI). */
  onStage?: (stage: string) => void;
}

export async function buildHuman(lib: AssetLibrary, p: HumanParams, opts: BuildOptions = {}): Promise<Character> {
  const stage = opts.onStage ?? (() => {});
  const cat = lib.catalog;
  const find = (items: CatalogItem[], id: string) => (id === 'none' ? undefined : items.find((i) => i.id === id));
  const outfit = find(cat.outfits, p.outfit);
  const hat = find(cat.hats, p.hat);
  const hair = find(cat.hair, p.hair);
  const brows = find(cat.eyebrows, p.eyebrows);
  const lashes = find(cat.eyelashes, p.eyelashes);
  // Dark and black-brown are built with the assets; older asset builds fall back to brown.
  const eyeMat = find(cat.eyes, p.eyes) ?? (/^(dark|black)brown$/.test(p.eyes) ? find(cat.eyes, 'brown') : undefined) ?? cat.eyes[0];
  const skin = p.skin === 'auto' ? autoSkin(p, cat.skins) : find(cat.skins, p.skin) ?? autoSkin(p, cat.skins);
  const low = p.detail === 'low';
  const bodyLod = low ? cat.bodies.find((b) => b.id === (p.gender >= 0.5 ? 'male1591' : 'female1605')) : undefined;
  // Procedural footwear: combat boots reuse the boots asset plus generated shafts.
  const shoesItem = p.shoes === 'combat_boots' ? find(cat.shoes, 'shoes03') : find(cat.shoes, p.shoes);
  const pieces = dressing(p);

  stage('Loading assets');
  const load = (item?: CatalogItem) => (item?.file ? lib.proxy(item.file) : Promise.resolve(undefined));
  const teethItem = find(cat.teeth ?? [], p.teeth ?? 'teeth_base');
  const tongueItem = p.tongue !== false && teethItem ? cat.tongue : undefined;
  const [pOutfit, pShoes, pHat, pHair, pBrows, pLashes, pEyes, pBody, pTeeth, pTongue] = await Promise.all([
    load(outfit), load(shoesItem), load(hat), load(hair), load(brows), load(lashes),
    lib.proxy(low ? cat.eyeMesh.replace('high-poly', 'low-poly') : cat.eyeMesh), load(bodyLod), load(teethItem), load(tongueItem),
  ]);

  stage('Shaping body');
  const coords = applyTargets(lib, targetWeights(p, slidersOf(lib)));
  if (pTeeth) {
    // Lips that rest slightly apart are closed, so a neutral face doesn't show the teeth.
    const ta = pTeeth.arrays as { faceSizes: Uint8Array; faceVerts: Uint32Array };
    const tris: number[] = [];
    for (let f = 0, c = 0; f < ta.faceSizes.length; c += ta.faceSizes[f], f++)
      for (let k = 1; k < ta.faceSizes[f] - 1; k++) tris.push(ta.faceVerts[c], ta.faceVerts[c + k], ta.faceVerts[c + k + 1]);
    sealLips(coords, () => faceShapeDelta(lib, p, 'mouthUpperUp'), (c) => fit(pTeeth, c), Uint32Array.from(tris), lib.base.arrays.faceVerts as Uint32Array);
  }
  // Facial blend shapes (base-mesh offsets). Without them, the expression is baked into the face.
  const shapeNames = faceShapeNames(p.speechShapes !== false);
  const exprWeights = weightsArray(EXPRESSION_WEIGHTS[p.expression] ?? {}, shapeNames);
  let faceD: Float32Array[] | undefined = p.faceShapes || exprWeights.some((w) => w) ? faceDeltas(lib, p, shapeNames) : undefined;
  if (faceD) {
    const ea = pEyes.arrays as Record<string, Uint8Array & Uint32Array>;
    calibrateBlinks(faceD, coords, lib.base.arrays.faceVerts as Uint32Array, { positions: fit(pEyes, coords), faceSizes: ea.faceSizes, faceVerts: ea.faceVerts });
  }
  if (faceD && !p.faceShapes) {
    faceD.forEach((d, s) => {
      if (exprWeights[s]) for (let i = 0; i < coords.length; i++) coords[i] += d[i] * exprWeights[s];
    });
    faceD = undefined;
  }
  // High heels arch the feet in the mesh itself, so the skeleton and every clip keep the pose.
  if (p.shoes === 'heels') archFeet(coords, lib.base.arrays.regions as Uint8Array, lib.base.meta.joints);
  const fv = lib.base.arrays.faceVerts as Uint32Array;
  // Rigging: target skeleton and per-base-vertex weights; every part derives its weights from these.
  const rigged = p.rig !== 'none';
  const defs = rigged ? skeletonDefs(lib, { type: p.rig, face: p.faceBones }) : [];
  const bskin = rigged ? baseSkin(lib, defs) : undefined;
  const regions = lib.base.arrays.regions as Uint8Array;
  let grid: VertexGrid | undefined;
  const skinOf = (m: PolyMesh, k = 6): PolyMesh => {
    if (!bskin || m.skin) return m;
    grid ??= new VertexGrid(coords, (v) => regions[v] !== 255);
    return { ...m, skin: skinPart(m, bskin, grid, k) };
  };
  const fullBody: PolyMesh = {
    skin: bskin,
    morphs: faceD,
    positions: coords,
    faceSizes: new Uint8Array(fv.length / 4).fill(4),
    faceVerts: fv,
    faceUVs: lib.base.arrays.faceUVs as Uint32Array,
    uvs: lib.base.arrays.uvs as Float32Array,
  };

  // --- Procedural garments ---
  stage('Fitting clothes');
  const bodyNormals = vertexNormals(fullBody);
  const gparts = buildGarments(lib, coords, bodyNormals, fv, pieces);

  // --- Body (hide skin that clothes cover, to avoid poke-through) ---
  // Asset proxies hide any face touching one of their deleted vertices (MakeHuman behaviour);
  // fitted garments hide faces they fully cover.
  const assetDel = new Uint8Array(lib.base.meta.vertexCount);
  for (const px of [pOutfit, pShoes, pHat]) if (px) for (const v of px.arrays.deleteVerts as Uint32Array) assetDel[v] = 1;
  const coveredFaces = new Uint8Array(fv.length / 4);
  for (const g of gparts) if (g.hides) for (let f = 0; f < coveredFaces.length; f++) coveredFaces[f] |= g.hides[f];
  let body: PolyMesh = pBody
    ? proxyMesh(pBody, coords, bskin, faceD)
    : compact(fullBody, (f, c) => !(assetDel[c[0]] | assetDel[c[1]] | assetDel[c[2]] | assetDel[c[3]]) && !coveredFaces[f]);
  const hd = p.detail === 'high';
  if (hd) body = subdivide(body);

  // --- Tattoos, procedural hair, beards, earrings ---
  const hiddenFaces = new Uint8Array(coveredFaces.length);
  for (let f = 0; f < hiddenFaces.length; f++)
    hiddenFaces[f] = coveredFaces[f] | assetDel[fv[f * 4]] | assetDel[fv[f * 4 + 1]] | assetDel[fv[f * 4 + 2]] | assetDel[fv[f * 4 + 3]];
  const neckIdx = lib.base.meta.joints['neck01____head'];
  const neckY = neckIdx.reduce((s, v) => s + coords[v * 3 + 1], 0) / neckIdx.length;
  // A head tie covers the hair, procedural styles included.
  const looksP = gparts.some((g) => g.hidesHair) ? { ...p, hair: 'none' } : p;
  const looks = await buildLooks(lib, { p: looksP, coords, normals: bodyNormals, fullBody, hidden: hiddenFaces, neckY, low, onStage: stage });
  // Hair and earrings follow the skull only; beards also the jaw and neck.
  const skinTo = (m: PolyMesh, mask: (v: number) => boolean): PolyMesh =>
    bskin ? { ...m, skin: skinPart(m, bskin, new VertexGrid(coords, mask), 4) } : m;
  const skull = (v: number) => regions[v] === 0 && coords[v * 3 + 1] > neckY + 1.0;
  const face = (v: number) => regions[v] === 0 || regions[v] === 1;

  const parts: [PolyMesh, Material][] = [];
  // MakeHuman gives some skins a 50% grey diffuse colour (young African, old male), meant for its
  // own lit-sphere shader; as a multiplier it darkens the painted texture to about a fifth, so
  // the texture is used as painted.
  const skinBase = skin.material!.color.toLowerCase() === '#808080' ? '#ffffff' : skin.material!.color;
  parts.push([body, { ...toMaterial(skin.material!), name: 'Skin', color: tint(skinBase, p.skinTint), roughness: 0.55 }]);
  if (looks.overlay) parts.push([hd ? subdivide(looks.overlay[0]) : looks.overlay[0], looks.overlay[1]]);
  parts.push([proxyMesh(pEyes, coords, bskin, faceD), { ...toMaterial(eyeMat.material!), name: 'Eyes', alpha: 'mask' }]);
  if (pBrows && brows) parts.push([proxyMesh(pBrows, coords, bskin, faceD), { ...toMaterial(brows.material!), name: 'Eyebrows' }]);
  if (pLashes && lashes) parts.push([proxyMesh(pLashes, coords, bskin, faceD), { ...toMaterial(lashes.material!), name: 'Eyelashes' }]);
  // Mouth interior: hidden behind the lips until the mouth opens.
  const jawJoint = (name: string): Vec3 => {
    const idx = lib.base.meta.joints[name];
    const s: Vec3 = [0, 0, 0];
    for (const v of idx) for (let k = 0; k < 3; k++) s[k] += coords[v * 3 + k] / idx.length;
    return s;
  };
  let jawInfo: { pivot: Vec3; chin: Vec3; chinDeltas: Vec3[] } | undefined;
  if (faceD) {
    const chinIdx = lib.base.meta.joints['jaw____tail'];
    const chinDeltas = faceD.map((d) => {
      const cd: Vec3 = [0, 0, 0];
      for (const v of chinIdx) for (let k = 0; k < 3; k++) cd[k] += d[v * 3 + k] / chinIdx.length;
      return cd;
    });
    jawInfo = { pivot: jawJoint('jaw____head'), chin: jawJoint('jaw____tail'), chinDeltas };
  }
  const headBone = defs.findIndex((d) => d.name === 'Head' || d.name === 'head');
  const jawBone = defs.findIndex((d) => d.name === 'Jaw' || d.name === 'jaw');
  const mouthBones = rigged && headBone >= 0 ? { head: headBone, jaw: jawBone >= 0 ? jawBone : headBone } : undefined;
  if (pTeeth && teethItem)
    parts.push([mouthPart(pTeeth, coords, 'teeth', jawInfo, mouthBones), { ...toMaterial(teethItem.material!), name: 'Teeth', color: '#f4efe6', roughness: 0.3, alpha: 'opaque' }]);
  if (pTongue && tongueItem)
    parts.push([mouthPart(pTongue, coords, 'tongue', jawInfo, mouthBones), { ...toMaterial(tongueItem.material!), name: 'Tongue', roughness: 0.4, alpha: 'opaque' }]);
  const groundParts: PolyMesh[] = [];
  if (pShoes && shoesItem) {
    const m = proxyMesh(pShoes, coords, bskin, faceD);
    parts.push([hd ? subdivide(m) : m, { ...toMaterial(shoesItem.material!), name: 'Shoes' }]);
    groundParts.push(m);
  }
  if (pOutfit && outfit) {
    const m = proxyMesh(pOutfit, coords, bskin, faceD);
    const mat = toMaterial(outfit.material!);
    parts.push([hd ? subdivide(m) : m, { ...mat, name: 'Outfit', color: tint(mat.color, p.outfitTint) }]);
  }
  for (const g of gparts) {
    const m = g.skinAt ? { ...skinOf({ ...g.mesh, positions: g.skinAt }, 8), positions: g.mesh.positions } : skinOf(g.mesh, g.smooth ? 4 : 8);
    parts.push([hd && g.smooth ? subdivide(m) : m, g.material]);
    if (g.ground) groundParts.push(g.mesh);
  }
  const hatMesh = pHat ? proxyMesh(pHat, coords, bskin, faceD) : undefined;
  // Lowest point of anything covering the crown: hair above it is trimmed.
  let brim = Infinity;
  for (const m of [hatMesh, ...gparts.filter((g) => g.headwear).map((g) => g.mesh)])
    if (m) for (let i = 1; i < m.positions.length; i += 3) brim = Math.min(brim, m.positions[i]);
  if (pHair && hair && !gparts.some((g) => g.hidesHair)) {
    const mat = toMaterial(hair.material!);
    let m = proxyMesh(pHair, coords, bskin, faceD);
    if (brim < Infinity) {
      const P = m.positions;
      m = compact(m, (_, c) => c.reduce((s, v) => s + P[v * 3 + 1], 0) / c.length < brim + 0.05);
    }
    parts.push([m, { ...mat, name: 'Hair', color: tint(mat.color, p.hairTint), doubleSided: true }]);
  }
  for (const [hm, mat] of looks.hair) {
    let m = hm;
    if (brim < Infinity) {
      const P = m.positions;
      m = compact(m, (_, c) => c.reduce((s, v) => s + P[v * 3 + 1], 0) / c.length < brim + 0.05);
    }
    if (m.faceSizes.length) parts.push([skinTo(m, skull), mat]);
  }
  for (const [m, mat] of looks.beard) parts.push([skinTo(m, face), mat]);
  for (const [m, mat] of looks.jewelry) parts.push([skinTo(m, face), mat]);
  if (hatMesh && hat) parts.push([hatMesh, { ...toMaterial(hat.material!), name: 'Hat' }]);

  // --- To metres, feet on the ground ---
  let minY = Infinity, maxBodyY = -Infinity;
  for (const m of [body, ...groundParts]) for (let i = 1; i < m.positions.length; i += 3) minY = Math.min(minY, m.positions[i]);
  for (let i = 1; i < body.positions.length; i += 3) maxBodyY = Math.max(maxBodyY, body.positions[i]);
  const xf = (src: Float32Array) => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      out[i] = src[i] * DM;
      out[i + 1] = (src[i + 1] - minY) * DM;
      out[i + 2] = src[i + 2] * DM;
    }
    return out;
  };
  // Parts that track a base-mesh vertex (beards, procedural hair, garments) inherit its face offsets.
  const withMorphs = (m: PolyMesh): Float32Array[] | undefined => {
    if (m.morphs || !faceD || !m.ref) return m.morphs;
    const ref = m.ref;
    return faceD.map((d) => {
      const out = new Float32Array(ref.length * 3);
      for (let i = 0; i < ref.length; i++) if (ref[i] >= 0) out.set(d.subarray(ref[i] * 3, ref[i] * 3 + 3), i * 3);
      return out;
    });
  };
  const out = parts.map(([m, mat]): [PolyMesh, Material] => [{ ...m, positions: xf(m.positions), morphs: withMorphs(m)?.map((d) => d.map((x) => x * DM)) }, mat]);

  // --- Rig: bones placed on the morphed joints; optional T-pose re-posing ---
  let rig: Rig | undefined;
  let weapon: Character['weapon'];
  if (rigged) {
    stage('Rigging');
    const joint = (name: string): Vec3 => {
      const idx = lib.base.meta.joints[name];
      const s: Vec3 = [0, 0, 0];
      for (const v of idx) for (let d = 0; d < 3; d++) s[d] += coords[v * 3 + d];
      return [(s[0] / idx.length) * DM, (s[1] / idx.length - minY) * DM, (s[2] / idx.length) * DM];
    };
    let bones = placeBones(defs, joint);
    const handIdx = bones.findIndex((b) => b.name === (p.rig === 'full' ? 'wrist.R' : 'RightHand'));
    let hand: HandJoints = {
      wrist: joint('wrist.R____head'), index: joint('finger2-1.R____head'), middle: joint('finger3-1.R____head'),
      pinky: joint('finger5-1.R____head'), thumbTip: joint('finger1-3.R____tail'),
    };
    if (p.restPose === 'T') {
      const posed = applyTPose(bones, out.map(([m]) => m));
      bones = posed.bones;
      hand = Object.fromEntries(Object.entries(hand).map(([k, v]) => [k, posed.move(handIdx, v)])) as unknown as HandJoints;
    }
    const sizeK = ((maxBodyY - minY) * DM) / 1.8;
    bones.push(socketBone(hand, handIdx, sizeK));
    rig = { type: p.rig, restPose: p.restPose, bones };

    // Weapon: modelled in its own frame, mapped onto the socket and fitted to its reference pose.
    if (p.weapon && p.weapon !== 'none') {
      const socket = bones.length - 1;
      let fitRot: Q = [0, 0, 0, 1];
      let supportZ = 0.3;
      const ref = p.weapon === 'rifle' ? 'rifle_aim' : p.weapon === 'pistol' ? 'pistol_aim' : null;
      if (ref) {
        const a = new Animator(rig);
        // The same fit the animations use, so the support hand lands on the handguard.
        const f = a.fitFor(ref === 'rifle_aim' ? 'rifle' : 'pistol');
        fitRot = f.rot;
        supportZ = f.supportZ;
      }
      const parts = buildWeapon(p.weapon, { supportZ });
      weapon = { id: p.weapon, rot: fitRot, parts };
      const sb = bones[socket];
      const sq = quatOf(sb.rot);
      for (const wp of parts) {
        const P = wp.mesh.positions;
        const positions = new Float32Array(P.length);
        for (let i = 0; i < P.length; i += 3) {
          const local = qrot(fitRot, [P[i], P[i + 1], P[i + 2]]);
          const w = qrot(sq, local);
          positions[i] = sb.head[0] + w[0];
          positions[i + 1] = sb.head[1] + w[1];
          positions[i + 2] = sb.head[2] + w[2];
        }
        const n = P.length / 3;
        const j = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) {
          j[v * 4] = socket;
          wts[v * 4] = 1;
        }
        out.push([{ ...wp.mesh, positions, skin: { j, w: wts } }, wp.material]);
      }
    }
  }

  stage('Assembling mesh');
  const faceInfo = faceD ? { names: shapeNames, defaults: exprWeights } : undefined;
  const asm = new MeshAssembler(faceInfo);
  for (const [m, mat] of out) asm.add(m, mat);
  return { params: p, mesh: asm.build(), rig, weapon, height: (maxBodyY - minY) * DM, face: faceInfo };
}

/** Texture files referenced by a mesh. */
export function textureFiles(mesh: MeshData): string[] {
  return [...new Set(mesh.materials.flatMap((m) => [m.map, m.normalMap].filter((x): x is string => !!x)))];
}

/** The character without its held weapon (the weapon parts are the last mesh groups). */
export function meshWithoutWeapon(ch: Character): MeshData {
  const n = ch.weapon?.parts.length ?? 0;
  return n ? pickGroups(ch.mesh, (g) => g < ch.mesh.groups.length - n) : ch.mesh;
}

/** The held weapon as a standalone prop in WeaponR socket space: attach it to that bone with zero offset. */
export function weaponPropMesh(ch: Character): MeshData | undefined {
  if (!ch.weapon) return undefined;
  const asm = new MeshAssembler();
  for (const wp of ch.weapon.parts) {
    const P = wp.mesh.positions, positions = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) positions.set(qrot(ch.weapon.rot, [P[i], P[i + 1], P[i + 2]]), i);
    asm.add({ ...wp.mesh, positions, skin: undefined }, wp.material);
  }
  return asm.build();
}
