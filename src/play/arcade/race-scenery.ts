/**
 * Race scenery by theme. The land is one height-field mesh with painted colours (snow on peaks, rock on cliffs, sand
 * at the shore) that meets the road at its own height and rises or falls away from it, so mountain roads get cliffs
 * and cuttings for free. Props are batched per kind and stand on the land; water, waterfalls and neon move with time.
 */
import * as T from 'three';
import { landHeight, roadHeight, TRACK_GROUNDS, type Track, type TrackTheme } from './track';
import { canvasTexture, painted, box, rng, waterMaterial, type Horizon, type Part } from './scenery';
import * as P from './props';
import { minibusGeometry, tricycleGeometry, umbrellaGeometry, UMBRELLA_COLORS } from './market';
import { glowMaterial, poolTexture } from './weather';

export interface RaceTheme {
  sky: string; zenith: string; ground: string; wall: string; accent: string; fog: [number, number]; silhouette: Horizon; tint: string;
  /** Neon streets are always seen at night. */
  night?: boolean; road: 'asphalt' | 'dirt' | 'wet' | 'pale';
}
export const RACE_THEMES: Record<TrackTheme, RaceTheme> = {
  city: { sky: '#aebfca', zenith: '#5d8ccc', ground: '#6f7b6c', wall: '#d9d6cc', accent: '#c4413a', fog: [90, 420], silhouette: 'skyline', tint: '#56606c', road: 'asphalt' },
  desert: { sky: '#e5cfa8', zenith: '#6f9bd0', ground: '#d2ad73', wall: '#e8e1cf', accent: '#d36b2b', fog: [110, 520], silhouette: 'mesas', tint: '#a56a42', road: 'asphalt' },
  harbour: { sky: '#b5c6cf', zenith: '#5a8cc4', ground: '#7f8a86', wall: '#e3e5df', accent: '#2c6f9e', fog: [90, 420], silhouette: 'hills', tint: '#56656a', road: 'asphalt' },
  forest: { sky: '#bccbbd', zenith: '#6a97c4', ground: '#4f6b43', wall: '#ece7da', accent: '#3f8a55', fog: [70, 360], silhouette: 'pines', tint: '#2f4a33', road: 'asphalt' },
  snow: { sky: '#d3dfea', zenith: '#5b8fcf', ground: '#eef3f8', wall: '#f2f5f8', accent: '#2f78c4', fog: [80, 430], silhouette: 'peaks', tint: '#5f7189', road: 'pale' },
  beach: { sky: '#cbe8f2', zenith: '#2f86d8', ground: '#e8d3a2', wall: '#f3ead8', accent: '#2f9fd8', fog: [120, 600], silhouette: 'palms', tint: '#3d6a5a', road: 'asphalt' },
  neon: { sky: '#2a1840', zenith: '#06040e', ground: '#1e2128', wall: '#2a2d36', accent: '#ff3fa4', fog: [60, 340], silhouette: 'skyline', tint: '#120c1e', night: true, road: 'wet' },
  jungle: { sky: '#bfd2b8', zenith: '#6e9fc4', ground: '#35602d', wall: '#8a6a45', accent: '#e0a73a', fog: [55, 290], silhouette: 'canopy', tint: '#24452a', road: 'dirt' },
  lagoon: { sky: '#d8ddd6', zenith: '#6c9ccb', ground: '#7b8a62', wall: '#e8e2d2', accent: '#2f9e60', fog: [100, 480], silhouette: 'skyline', tint: '#5c6670', road: 'asphalt' },
  mountain: { sky: '#c6d6e3', zenith: '#4a82c4', ground: '#5f7d45', wall: '#c9cdd1', accent: '#d8473d', fog: [140, 640], silhouette: 'peaks', tint: '#56657a', road: 'asphalt' },
  stadium: { sky: '#bccdda', zenith: '#5a8fd0', ground: '#4f7d3a', wall: '#1d1d1f', accent: '#d8473d', fog: [120, 520], silhouette: 'hills', tint: '#4c5a50', road: 'asphalt' },
};

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a)));return t * t * (3 - 2 * t); };

/** The land mesh and a height lookup for placing things on it. */
export function raceTerrain(track: Track) {
  const theme = track.theme, ground = TRACK_GROUNDS[theme], xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z), margin = Math.min(560, RACE_THEMES[theme].fog[1] * 0.95);
  const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin, minZ = Math.min(...zs) - margin, maxZ = Math.max(...zs) + margin, cell = 6.5;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  // Bucket the centre line so each vertex only checks nearby samples.
  const B = 32, buckets = new Map<string, number[]>();
  track.samples.forEach((s, i) => { const k = `${Math.floor(s.x / B)},${Math.floor(s.z / B)}`;(buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i); });
  const bridged = (s: number) => track.bridges.some(([a, b]) => (a < b ? s > a && s < b : s > a || s < b));
  const edge = track.width / 2 + ground.verge + 1.6, reach = theme === 'lagoon' ? 70 : theme === 'mountain' ? 22 : 30;
  const heights = new Float32Array((nx + 1) * (nz + 1)), blend = new Float32Array((nx + 1) * (nz + 1));
  const natural = (x: number, z: number) => theme === 'lagoon' ? -4.5 + 2 * (landHeight('city', x, z) / 8 + 0.45) : landHeight(theme, x, z);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = minX + i * cell, z = minZ + j * cell, bx = Math.floor(x / B), bz = Math.floor(z / B);let best = -1, bestD = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of buckets.get(`${bx + a},${bz + b}`) ?? []) { const s = track.samples[k], d = (s.x - x) ** 2 + (s.z - z) ** 2;if (d < bestD) { bestD = d;best = k; } }
    const land = natural(x, z), d = Math.sqrt(bestD);let h = land, w = 1;
    if (best >= 0) {
      // The lagoon's islands sit level with the road, then fall to the lagoon bed; bridges leave the water open.
      const s = track.samples[best], road = s.y - 0.18;
      if (theme !== 'lagoon') { w = smooth(edge, edge + reach, d);h = road + (land - road) * w; }
      else if (!bridged(s.s)) { w = smooth(edge + reach * 0.55, edge + reach, d);h = road + (land - road) * w; }
    }
    heights[j * (nx + 1) + i] = h;blend[j * (nx + 1) + i] = w;
  }
  const heightAt = (x: number, z: number) => {
    const fx = Math.max(0, Math.min(nx - 0.001, (x - minX) / cell)), fz = Math.max(0, Math.min(nz - 0.001, (z - minZ) / cell)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * (nx + 1) + i;
    return heights[k] * (1 - u) * (1 - v) + heights[k + 1] * u * (1 - v) + heights[k + nx + 1] * (1 - u) * v + heights[k + nx + 2] * u * v;
  };
  const geometry = new T.PlaneGeometry(nx * cell, nz * cell, nx, nz).rotateX(-Math.PI / 2).translate(minX + (nx * cell) / 2, 0, minZ + (nz * cell) / 2);
  const pos = geometry.getAttribute('position') as T.BufferAttribute;
  // PlaneGeometry rows run from -z to +z after the rotation, matching the grid order.
  for (let k = 0; k < pos.count; k++) { const i = Math.round((pos.getX(k) - minX) / cell), j = Math.round((pos.getZ(k) - minZ) / cell);pos.setY(k, heights[j * (nx + 1) + i]); }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal') as T.BufferAttribute, colors = new Float32Array(pos.count * 3), c = new T.Color(), r = rng(11);
  const pal = (hex: string) => new T.Color(hex), base = pal(RACE_THEMES[theme].ground), rockC = pal(theme === 'snow' ? '#6c7686' : theme === 'desert' ? '#b78756' : '#6f6b62'), snowC = pal('#eef3f8'), sand = pal('#e6d09c'), wet = pal('#c2a576'), mud = pal('#6b5236'), grass = pal('#6f9a4c');
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k), ny = normal.getY(k), i = Math.round((pos.getX(k) - minX) / cell), j = Math.round((pos.getZ(k) - minZ) / cell), w = blend[j * (nx + 1) + i];c.copy(base);
    if (theme === 'mountain') { c.copy(grass).lerp(pal('#4d6b3a'), r() * 0.5);if (y > 38) c.lerp(snowC, smooth(38, 52, y)); }
    if (theme === 'beach') { c.copy(sand);if (y > 2.5) c.lerp(grass, smooth(2.5, 5, y));if (y < (ground.water ?? 0) + 0.6) c.lerp(wet, 0.7); }
    if (theme === 'jungle' && w < 0.35) c.lerp(mud, 0.55 * (1 - w / 0.35));
    if (theme === 'lagoon') { if (y < -1.4) c.copy(wet).multiplyScalar(0.8);else if (w < 0.6) c.lerp(pal('#8f8a7c'), 0.6); }
    if (theme === 'snow' && w < 0.25) c.lerp(pal('#dfe7ef'), 0.6);
    if (theme === 'neon' || theme === 'city') { if (w < 0.6) c.lerp(pal(theme === 'neon' ? '#2a2d34' : '#8c8f88'), 0.5); }
    if (theme === 'desert') c.lerp(pal('#e3c08a'), fbmLite(pos.getX(k), pos.getZ(k)));
    // Steep ground shows rock; mountains keep their snow above the rock line.
    if (ny < 0.86) c.lerp(rockC, smooth(0.86, 0.66, ny) * (theme === 'beach' || theme === 'stadium' ? 0.3 : 0.95));
    const shade = 0.94 + r() * 0.1;c.multiplyScalar(shade).toArray(colors, k * 3);
  }
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  return { geometry, heightAt };
}
const fbmLite = (x: number, z: number) => 0.5 + 0.5 * Math.sin(x * 0.03 + Math.sin(z * 0.02) * 2) * Math.cos(z * 0.025);

/** Pick spots beside the road, clear of it, standing on land. */
function spotsFor(track: Track, heightAt: (x: number, z: number) => number, count: number, near: number, far: number, radius: number, seed: number, ok: (y: number) => boolean = () => true) {
  const r = rng(seed), out: { x: number; z: number; y: number; yaw: number; s: number; side: number; off: number }[] = [], clearance = track.width / 2 + track.ground.verge + 2.5;
  for (let tries = 0; tries < count * 6 && out.length < count; tries++) {
    const s = track.samples[Math.floor(r() * track.samples.length)], side = r() < 0.5 ? -1 : 1, off = clearance + near + r() * (far - near), x = s.x + s.tz * side * off, z = s.z - s.tx * side * off;
    if (!track.samples.every((q, i) => i % 3 || Math.hypot(q.x - x, q.z - z) > clearance + radius)) continue;
    if (track.shortcuts.some((c) => c.samples.some((p) => Math.hypot(p.x - x, p.z - z) < c.width / 2 + radius + 2))) continue;
    const y = heightAt(x, z);if (!ok(y)) continue;
    // Facing the road: +Z of the prop points back toward the centre line.
    out.push({ x, z, y, yaw: Math.atan2(-s.tz * side, s.tx * side), s: s.s, side, off });
  }
  return out;
}

export class RaceScenery {
  heightAt: (x: number, z: number) => number;
  private flows: ((time: number) => void)[] = [];
  constructor(private track: Track, private scene: T.Scene, private disposables: { dispose(): void }[], private night: boolean) {
    const terrain = raceTerrain(track);this.heightAt = terrain.heightAt;
    const land = new T.Mesh(terrain.geometry, this.own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));land.receiveShadow = true;scene.add(land);this.disposables.push(terrain.geometry);
    const water = track.ground.water;
    if (water !== undefined || track.theme === 'harbour') {
      const w = waterMaterial(track.theme === 'beach' ? '#2a8fb0' : track.theme === 'lagoon' ? '#4d6f68' : track.theme === 'jungle' ? '#3d6b58' : '#4b6f86');this.disposables.push(w);this.flows.push(w.flow);
      const mesh = new T.Mesh(new T.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), w.material);mesh.position.y = water ?? -0.6;mesh.receiveShadow = true;scene.add(mesh);this.disposables.push(mesh.geometry);
    }
    this.props();
  }
  private own<M extends T.Material>(m: M) { this.disposables.push(m);return m; }
  update(time: number) { for (const f of this.flows) f(time); }
  private batch(geometry: T.BufferGeometry, material: T.Material, list: { x: number; y: number; z: number; yaw?: number; scale?: number | [number, number, number]; color?: T.Color }[], shadow = true) {
    if (!list.length) { geometry.dispose();return; }
    const mesh = new T.InstancedMesh(geometry, material, list.length), o = new T.Object3D();
    list.forEach((p, i) => { o.position.set(p.x, p.y, p.z);o.rotation.set(0, p.yaw ?? 0, 0);const k = p.scale ?? 1;if (Array.isArray(k)) o.scale.set(...k);else o.scale.setScalar(k);o.updateMatrix();mesh.setMatrixAt(i, o.matrix);if (p.color) mesh.setColorAt(i, p.color); });
    mesh.castShadow = shadow;mesh.receiveShadow = false;this.scene.add(mesh);this.disposables.push(geometry);return mesh;
  }
  /** Facades with window cells; lit windows glow at night. */
  private towerMaterial(lit: boolean, seed: number) {
    const r = rng(seed), map = canvasTexture(256, 256, (c) => {
      c.fillStyle = '#9aa0a6';c.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = '#5f6a75';c.fillRect(x * 32 + 5, y * 32 + 6, 22, 18);c.fillStyle = 'rgba(255,255,255,0.12)';c.fillRect(x * 32 + 5, y * 32 + 6, 22, 4); }
    });
    const emissiveMap = lit ? canvasTexture(256, 256, (c) => { c.fillStyle = '#000';c.fillRect(0, 0, 256, 256);for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (r() < 0.42) { c.fillStyle = r() < 0.75 ? '#ffcf8a' : r() < 0.5 ? '#8fe3ff' : '#ff9ad5';c.fillRect(x * 32 + 5, y * 32 + 6, 22, 18); } }) : undefined;
    this.disposables.push(map, ...(emissiveMap ? [emissiveMap] : []));
    return this.own(new T.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0.1, ...(emissiveMap ? { emissiveMap, emissive: '#ffffff', emissiveIntensity: 1.1 } : {}) }));
  }
  /** A box whose side UVs repeat one window cell per 4 m by 3.5 m. */
  private towerGeometry(w: number, h: number, d: number) {
    const g = new T.BoxGeometry(w, h, d).translate(0, h / 2, 0), uv = g.getAttribute('uv') as T.BufferAttribute;
    const dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k;uv.setXY(i, (uv.getX(i) * dims[f][0]) / 24, (uv.getY(i) * dims[f][1]) / 26); }
    return g;
  }
  private props() {
    const t = this.track, theme = t.theme, at = this.heightAt, paint = this.own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })), tint = (k: number, seed = 0) => new T.Color().setScalar(1 - k / 2 + rng(seed + 1)() * k);
    const land = (min = (t.ground.water ?? -100) + 0.4) => (y: number) => y > min;
    const many = (make: (seed: number) => T.BufferGeometry, variants: number, spots: ReturnType<typeof spotsFor>, scale: (i: number) => number = () => 1, material: T.Material = paint) => {
      for (let v = 0; v < variants; v++) this.batch(make(v + 1), material, spots.filter((_, i) => i % variants === v).map((p, i) => ({ ...p, yaw: p.yaw + i * 1.7, scale: scale(i), color: tint(0.16, i) })));
    };
    const r = rng(theme.length * 31);
    if (theme === 'city') this.batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.own(new T.MeshStandardMaterial({ roughness: 0.9 })), spotsFor(t, at, 220, 5, 70, 5, 3).map((p) => ({ ...p, y: p.y - 0.2, scale: [8 + r() * 10, 8 + r() * 38, 8 + r() * 10] as [number, number, number], color: new T.Color().setHSL(0.08, 0.06, 0.55 + r() * 0.15) })));
    if (theme === 'harbour') this.batch(box(2.6, 2.6, 6.1, 0, 1.3, 0), this.own(new T.MeshStandardMaterial({ roughness: 0.8 })), spotsFor(t, at, 200, 5, 70, 3, 4).map((p, i) => ({ ...p, y: p.y + (i % 3) * 2.6 * (r() > 0.5 ? 1 : 0), color: new T.Color().setHSL(r(), 0.45, 0.42) })));
    if (theme === 'desert') { many((s) => P.rock(s, '#b07b4c'), 3, spotsFor(t, at, 120, 5, 80, 4, 5), () => 2 + r() * 4);many(() => painted([[box(0.6, 3.6, 0.6, 0, 1.8, 0), '#4f7a46'], [box(0.4, 1.4, 0.4, 0.55, 2.1, 0), '#4f7a46'], [box(0.4, 1.0, 0.4, -0.5, 2.6, 0), '#4f7a46']]), 1, spotsFor(t, at, 70, 3, 60, 1, 6), () => 0.8 + r() * 0.6); }
    if (theme === 'forest') { many((s) => P.pineTree(false, s), 3, spotsFor(t, at, 260, 3, 75, 2, 7), () => 0.9 + r() * 0.7);many((s) => P.bush('#3b6e34', s), 2, spotsFor(t, at, 80, 1, 20, 1, 8)); }
    if (theme === 'snow') {
      many((s) => P.pineTree(true, s), 3, spotsFor(t, at, 280, 3, 90, 2, 9), () => 0.9 + r() * 0.8);many((s) => P.rock(s, '#6c7686', true), 3, spotsFor(t, at, 60, 4, 70, 3, 10), () => 1.4 + r() * 2.5);
      // Snowbanks line the verges.
      this.edgeRow(P.snowdrift(), paint, 6, t.width / 2 + t.ground.verge + 2.6, () => [3 + r() * 1.5, 1.6 + r() * 0.8, 2.4]);
    }
    if (theme === 'mountain') {
      const pines = spotsFor(t, at, 320, 3, 120, 2, 11);many((s) => P.pineTree(false, s), 2, pines.filter((p) => p.y < 36), () => 0.9 + r() * 0.8);many((s) => P.pineTree(true, s), 2, pines.filter((p) => p.y >= 36), () => 0.8 + r() * 0.6);
      many((s) => P.rock(s, '#8a8780'), 3, spotsFor(t, at, 40, 6, 70, 3, 12), () => 1.2 + r() * 2);
    }
    if (theme === 'beach') {
      const shore = (t.ground.water ?? 0) + 0.25;
      many((s) => P.palmTree(s), 3, spotsFor(t, at, 170, 2, 80, 2, 13, land(shore + 0.2)), () => 0.85 + r() * 0.4);
      const sand = spotsFor(t, at, 60, 4, 90, 3, 14, (y) => y > shore && y < shore + 1.6);
      this.batch(P.beachUmbrella(), paint, sand.filter((_, i) => i % 3 === 0).map((p, i) => ({ ...p, color: new T.Color(UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]).lerp(new T.Color('#ffffff'), 0.25) })));
      this.batch(P.lifeguardTower(), paint, sand.filter((_, i) => i % 9 === 1));this.batch(P.surfboard('#2f9fd8'), paint, sand.filter((_, i) => i % 3 === 2).map((p, i) => ({ ...p, color: new T.Color(['#ffffff', '#f2b81c', '#d8473d'][i % 3]) })));
      this.batch(P.beachHut(), paint, spotsFor(t, at, 12, 6, 40, 5, 15, land(shore + 0.6)).map((p, i) => ({ ...p, color: new T.Color(['#f3e3b4', '#cfe8f0', '#f6d0c4'][i % 3]) })));
      many((s) => P.rock(s, '#8a8170'), 2, spotsFor(t, at, 30, 10, 120, 3, 16, (y) => y < shore + 0.4), () => 1.5 + r() * 3);
    }
    if (theme === 'jungle') {
      many((s) => P.jungleTree(s), 3, spotsFor(t, at, 210, 3, 85, 3, 17, land()), () => 0.85 + r() * 0.5);many((s) => P.palmTree(s), 2, spotsFor(t, at, 60, 2, 50, 2, 18, land()), () => 0.8 + r() * 0.3);
      many((s) => P.fern(s), 3, spotsFor(t, at, 240, 0, 22, 1, 19, land()), () => 0.9 + r() * 0.8);many((s) => P.bush('#2f6a2c', s), 2, spotsFor(t, at, 90, 1, 30, 1, 20, land()), () => 1 + r());
      many((s) => P.ruinPillar(s), 2, spotsFor(t, at, 16, 2, 25, 2, 21, land()));
      this.waterfalls(spotsFor(t, at, 2, 28, 40, 16, 22, land()), paint);
    }
    if (theme === 'neon') this.neonCity(paint);
    if (theme === 'lagoon') this.lagoonCity(paint);
    if (theme === 'stadium') this.arena(paint);
    if (t.bridges.length) this.bridges();
    if (t.patches.length) this.patches();
  }
  /** One prop repeated beside the road on both sides at a fixed spacing. */
  private edgeRow(geometry: T.BufferGeometry, material: T.Material, every: number, lateral: number, scale: () => [number, number, number] = () => [1, 1, 1], skip = (_s: number) => false) {
    const t = this.track, list: Parameters<RaceScenery['batch']>[2] = [], step = Math.max(1, Math.round(every / t.spacing));
    for (let k = 0; k < t.samples.length; k += step) for (const side of [-1, 1]) {
      const s = t.samples[k];if (skip(s.s)) continue;const x = s.x + s.tz * side * lateral, z = s.z - s.tx * side * lateral;
      if (t.shortcuts.some((c) => c.samples.some((p) => Math.hypot(p.x - x, p.z - z) < c.width / 2 + 2))) continue;
      if (!t.samples.every((q, i) => i % 2 || Math.hypot(q.x - x, q.z - z) > lateral - 1)) continue;
      list.push({ x, z, y: s.y, yaw: Math.atan2(s.tx, s.tz), scale: scale() });
    }
    return this.batch(geometry, material, list);
  }
  private waterfalls(spots: ReturnType<typeof spotsFor>, paint: T.Material) {
    if (!spots.length) return;
    const streaks = canvasTexture(64, 256, (c) => { c.fillStyle = 'rgba(220,240,255,0.55)';c.fillRect(0, 0, 64, 256);for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;c.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 20 + Math.random() * 60); } });
    streaks.repeat.set(3, 1);const fall = this.own(new T.MeshBasicMaterial({ map: streaks, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));this.disposables.push(streaks);this.flows.push((time) => { streaks.offset.y = time * 1.6; });
    const cliff = painted([[box(26, 18, 7, 0, 9, -3.5), '#6c7064'], [box(9, 20, 6, -9, 10, -4.5), '#5f6a52'], [box(9, 16, 6, 9, 8, -4), '#626a58'], [box(26, 1.4, 7.4, 0, 18.3, -3.5), '#2f6a2c'], [box(6, 4, 3, -11, 2, 0.5), '#5c6650'], [box(5, 3, 3, 11, 1.5, 0.3), '#5c6650']] as Part[]);
    this.batch(cliff, paint, spots.map((p) => ({ ...p, y: p.y - 1 })));
    const sheet = new T.PlaneGeometry(7, 17).translate(0, 8.5, 0.05);this.batch(sheet, fall, spots.map((p) => ({ ...p, y: p.y - 0.6 })), false);
    const pool = waterMaterial('#5d8f86', 4);this.disposables.push(pool);this.flows.push(pool.flow);
    this.batch(new T.CircleGeometry(6, 24).rotateX(-Math.PI / 2), pool.material, spots.map((p) => ({ x: p.x + Math.sin(p.yaw) * 4, y: p.y + 0.15, z: p.z + Math.cos(p.yaw) * 4 })), false);
    const glow = poolTexture(), mist = this.own(glowMaterial(glow, '#ffffff', 0.35));this.disposables.push(glow);mist.blending = T.NormalBlending;mist.side = T.DoubleSide;
    this.batch(new T.PlaneGeometry(14, 8).translate(0, 3, 0), mist, spots.map((p) => ({ x: p.x + Math.sin(p.yaw) * 2.5, y: p.y, z: p.z + Math.cos(p.yaw) * 2.5, yaw: p.yaw })), false);
  }
  /** Towers with lit windows, glowing signs and their colour spilled on the wet road. */
  private neonCity(paint: T.Material) {
    const t = this.track, at = this.heightAt, r = rng(41), lit = this.towerMaterial(true, 5);
    const blocks = spotsFor(t, at, 150, 3, 70, 8, 23), strips: Parameters<RaceScenery['batch']>[2] = [], colours = ['#ff3fa4', '#3ff0ff', '#ffe23f', '#7a5cff', '#3fff8a', '#ff6a3f'];
    [[14, 30, 14], [10, 55, 12], [18, 22, 16]].forEach(([w, h, d], type) => {
      const mine = blocks.filter((_, i) => i % 3 === type).map((p) => ({ ...p, y: p.y - 0.3, scale: [1, 0.7 + r() * 0.9, 1] as [number, number, number], color: new T.Color().setHSL(0.68 + r() * 0.1, 0.1, 0.32 + r() * 0.12) }));
      this.batch(this.towerGeometry(w, h, d), lit, mine);
      // A neon strip runs up one front corner of every other tower.
      for (const p of mine.filter((_, i) => i % 2 === 0)) { const lx = (w / 2 + 0.15) * (r() < 0.5 ? -1 : 1), lz = d / 2 + 0.15;strips.push({ x: p.x + lx * Math.cos(p.yaw) + lz * Math.sin(p.yaw), y: p.y, z: p.z - lx * Math.sin(p.yaw) + lz * Math.cos(p.yaw), scale: [1, h * p.scale[1], 1], color: new T.Color(colours[Math.floor(r() * colours.length)]) }); }
    });
    const words = ['HOTEL', 'NOODLES', 'OPEN 24H', 'ARCADE', 'KARAOKE', 'RAMEN'];
    const front = spotsFor(t, at, 70, 0, 6, 1.5, 24), pools: Parameters<RaceScenery['batch']>[2] = [];
    words.forEach((word, n) => {
      const map = canvasTexture(256, 96, (c) => { c.clearRect(0, 0, 256, 96);c.strokeStyle = colours[n];c.lineWidth = 5;c.shadowColor = colours[n];c.shadowBlur = 14;c.strokeRect(8, 8, 240, 80);c.font = 'bold 44px system-ui,sans-serif';c.textAlign = 'center';c.fillStyle = '#ffffff';c.fillText(word, 128, 64);c.fillStyle = colours[n];c.globalAlpha = 0.6;c.fillText(word, 128, 64); }, false);
      const material = this.own(new T.MeshBasicMaterial({ map, transparent: true, toneMapped: false, side: T.DoubleSide, depthWrite: false }));this.disposables.push(map);
      const mine = front.filter((_, i) => i % words.length === n);
      this.batch(new T.PlaneGeometry(4.4, 1.65).translate(0, 5.5, 0), material, mine.map((p) => ({ ...p, scale: 1 + r() * 0.5 })), false);
      for (const p of mine) { const s = t.samples[Math.round(p.s / t.spacing) % t.samples.length], lateral = (t.width / 2 - 1.5) * p.side;pools.push({ x: s.x + s.tz * lateral, y: s.y + 0.05, z: s.z - s.tx * lateral, color: new T.Color(colours[n]) }); }
    });
    this.batch(new T.BoxGeometry(0.4, 1, 0.4).translate(0, 0.5, 0), paint, front.map((p) => ({ ...p, scale: [1, 4.8, 1] as [number, number, number], color: new T.Color('#2a2d36') })));
    // Coloured light spilled on the wet road under each sign.
    const glow = poolTexture(), spill = this.own(glowMaterial(glow, '#ffffff', 0.55));this.disposables.push(glow);this.batch(new T.PlaneGeometry(7, 11).rotateX(-Math.PI / 2), spill, pools, false);
    this.batch(new T.BoxGeometry(0.3, 1, 0.3).translate(0, 0.5, 0), this.own(new T.MeshBasicMaterial({ toneMapped: false })), strips, false);
  }
  /** Islands of a busy city: towers, parked minibuses and tricycles, roadside stalls. */
  private lagoonCity(paint: T.Material) {
    const t = this.track, at = this.heightAt, r = rng(43), day = this.towerMaterial(this.night, 9), onLand = (y: number) => y > -0.6;
    const blocks = spotsFor(t, at, 90, 16, 64, 8, 25, onLand);
    for (const [w, h, d] of [[12, 22, 12], [9, 44, 10], [16, 14, 14]] as const) this.batch(this.towerGeometry(w, h, d), day, blocks.filter((_, i) => i % 3 === [12, 9, 16].indexOf(w)).map((p) => ({ ...p, y: p.y - 0.3, scale: [1, 0.7 + r() * 0.8, 1] as [number, number, number], color: new T.Color(['#e9e2cf', '#d9e6ea', '#f0d9b8', '#cfd8c4', '#e6cfc8'][Math.floor(r() * 5)]) })));
    const kerb = spotsFor(t, at, 110, 0, 7, 2, 26, onLand), painted = this.own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.batch(minibusGeometry(), painted, kerb.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, yaw: p.yaw + Math.PI / 2 + (r() - 0.5) * 0.3 })));
    this.batch(tricycleGeometry(), painted, kerb.filter((_, i) => i % 3 === 1).map((p) => ({ ...p, yaw: p.yaw + Math.PI / 2 + (r() - 0.5) * 0.6 })));
    const stalls = kerb.filter((_, i) => i % 3 === 2);
    this.batch(box(1.6, 0.9, 1.1, 0, 0.45, 0), paint, stalls.map((p) => ({ ...p, color: new T.Color('#a8835a') })));
    this.batch(umbrellaGeometry(), this.own(new T.MeshStandardMaterial({ roughness: 0.8 })), stalls.map((p, i) => ({ ...p, color: new T.Color(UMBRELLA_COLORS[i % UMBRELLA_COLORS.length]) })));
    this.batch(P.billboard(), paint, spotsFor(t, at, 8, 6, 20, 4, 27, onLand).map((p, i) => ({ ...p, color: new T.Color(['#f2b81c', '#2f9e60', '#d8473d', '#2f78c4'][i % 4]) })));
    this.batch(P.palmTree(3), paint, spotsFor(t, at, 40, 2, 40, 2, 28, onLand), true);
  }
  /** Grandstands packed with a crowd, floodlights and tyre stacks around a tight circuit. */
  private arena(paint: T.Material) {
    const t = this.track, r = rng(47), stands: Parameters<RaceScenery['batch']>[2] = [], crowd: Parameters<RaceScenery['batch']>[2] = [];
    const lateral = t.width / 2 + 7, step = Math.round(26 / t.spacing);
    for (let k = 0; k < t.samples.length; k += step) for (const side of [-1, 1]) {
      const s = t.samples[k], x = s.x + s.tz * side * lateral, z = s.z - s.tx * side * lateral;
      if (!t.samples.every((q, i) => i % 2 || Math.hypot(q.x - x, q.z - z) > lateral - 0.5)) continue;
      const yaw = Math.atan2(s.tx, s.tz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);stands.push({ x, y: 0, z, yaw });
      // Spectators sit on each tier, in the stand's own frame: along its length, stepping back with each row.
      for (let tier = 0; tier < 6; tier++) for (let n = 0; n < 34; n++) if (r() < 0.82) {
        const along = -10 + n * 0.6 + (r() - 0.5) * 0.2, back = -tier * 1.1 + 0.1;
        crowd.push({ x: x + along * Math.cos(yaw) + back * Math.sin(yaw), y: 0.58 + tier * 0.55, z: z - along * Math.sin(yaw) + back * Math.cos(yaw), yaw, color: new T.Color().setHSL(r(), 0.55, 0.35 + r() * 0.3) });
      }
    }
    this.batch(P.grandstand(21), paint, stands);
    this.batch(painted([[box(0.42, 0.55, 0.3, 0, 0.27, 0), '#ffffff'], [box(0.3, 0.26, 0.26, 0, 0.68, 0), '#e8c2a0']]), paint, crowd, false);
    this.edgeRow(P.tyreStack(), paint, 3.2, t.width / 2 + 1.6);
    this.batch(P.floodlight(), paint, spotsFor(t, this.heightAt, 8, 14, 30, 3, 29));
    this.batch(P.billboard(), paint, spotsFor(t, this.heightAt, 6, 3, 10, 4, 30).map((p, i) => ({ ...p, color: new T.Color(['#d8473d', '#f2b81c', '#2f78c4'][i % 3]) })));
  }
  /** Bridge girders and piers under the bridged spans; railings come from the circuit walls. */
  private bridges() {
    const t = this.track, piers: Parameters<RaceScenery['batch']>[2] = [], step = Math.round(16 / t.spacing);
    for (const [a, b] of t.bridges) {
      const span = (b - a + t.length) % t.length;
      for (let d = 0; d <= span; d += t.spacing * step) { const s = (a + d) % t.length, p = t.samples[Math.round(s / t.spacing) % t.samples.length];for (const side of [-1, 1]) piers.push({ x: p.x + p.tz * side * t.width * 0.32, y: -6, z: p.z - p.tx * side * t.width * 0.32, scale: [1, 6, 1] }); }
      const samples = Array.from({ length: Math.round(span / t.spacing) + 1 }, (_, i) => t.samples[(Math.round(a / t.spacing) + i) % t.samples.length]);
      const deck = this.own(new T.MeshStandardMaterial({ color: '#b8b2a4', roughness: 0.85 }));
      for (const side of [-1, 1]) { const g = girder(samples, side * (t.width / 2 + 1.2), -1.4, 0.1);this.disposables.push(g);this.scene.add(new T.Mesh(g, deck)); }
    }
    this.batch(new T.CylinderGeometry(0.9, 1.1, 1, 10).translate(0, 0.5, 0), this.own(new T.MeshStandardMaterial({ color: '#a7a194', roughness: 0.9 })), piers);
  }
  /** Ice or mud patches on the road surface. */
  private patches() {
    const t = this.track, ice = t.patches[0].kind === 'ice', map = canvasTexture(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 10, 64, 64, 62);g.addColorStop(0, ice ? 'rgba(220,242,255,0.95)' : 'rgba(84,58,34,0.95)');g.addColorStop(0.75, ice ? 'rgba(190,226,245,0.8)' : 'rgba(96,68,40,0.85)');g.addColorStop(1, 'rgba(0,0,0,0)');c.fillStyle = g;c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 40; i++) { c.strokeStyle = ice ? 'rgba(255,255,255,0.7)' : 'rgba(50,34,20,0.6)';c.lineWidth = 1 + Math.random() * 2;c.beginPath();const a = Math.random() * 6.28, d = Math.random() * 40;c.moveTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);c.lineTo(64 + Math.cos(a) * (d + 14), 64 + Math.sin(a) * (d + 8));c.stroke(); }
    }, false);
    this.disposables.push(map);
    const material = this.own(new T.MeshStandardMaterial({ map, transparent: true, roughness: ice ? 0.05 : 0.95, metalness: ice ? 0.3 : 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.batch(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, t.patches.map((p) => { const q = t.samples[Math.round(p.s / t.spacing) % t.samples.length];return { x: q.x + q.tz * p.lateral, y: roadHeight(t, p.s).y + 0.045, z: q.z - q.tx * p.lateral, yaw: p.s, scale: [p.r * 2.4, 1, p.r * 2.6] as [number, number, number] }; }), false);
  }
}

/** A vertical strip hanging under the road edge, for bridge girders. */
function girder(samples: Track['samples'], lateral: number, bottom: number, top: number) {
  const n = samples.length, pos = new Float32Array(n * 6), index: number[] = [];
  samples.forEach((s, k) => { const x = s.x + s.tz * lateral, z = s.z - s.tx * lateral;pos.set([x, s.y + bottom, z, x, s.y + top, z], k * 6);if (k < n - 1) { const a = k * 2;index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
  const g = new T.BufferGeometry();g.setAttribute('position', new T.BufferAttribute(pos, 3));g.setIndex(index);g.computeVertexNormals();return g;
}
