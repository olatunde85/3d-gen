/**
 * Swimwear: a string bikini. Triangle cups on a halter string tied behind the neck and a band
 * round the back; a string bottom (front triangle, cheeky back) on side strings tied at the hips.
 * Cups and panels are fitted shells; strings are cords laid over the body surface.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import { clamp, hplane, isTrunk, mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, gridOutline, liftGrid, OUTWARD, RadialCaster } from './project';
import { cord, ellipsoid, frameOf, hullRing, merge, v3 } from './ring';
import { makePattern } from './textures';

/** Shiny swim fabric (metallic for foil). */
function swimMat(g: GCtx, name: string, st: GarmentStyle): Material {
  const tex = g.texture(`${st.pattern}_${st.color}_${st.color2}`, () => makePattern(st.pattern, st.color, st.color2));
  const foil = st.pattern === 'foil';
  return mat(name, tex, { roughness: foil ? 0.32 : 0.45, metalness: foil ? 0.7 : 0 });
}

const stringMat = (st: GarmentStyle): Material => mat('Bikini strings', null, { color: st.color, roughness: 0.35, metalness: st.pattern === 'foil' ? 0.6 : 0 });

/** Trunk and neck vertices with their normals: the skin strings are laid on. */
interface Skin {
  p: Vec3[];
  n: Vec3[];
}

function skinOf(b: Body, test: (v: VInfo) => boolean): Skin {
  const p: Vec3[] = [], n: Vec3[] = [];
  for (let v = 0; v < b.info.length; v++) {
    if (b.regions[v] === 255 || !test(b.info[v])) continue;
    p.push(b.p(v));
    n.push([b.normals[v * 3], b.normals[v * 3 + 1], b.normals[v * 3 + 2]]);
  }
  return { p, n };
}

const upperSkin = (b: Body) => skinOf(b, (v) => isTrunk(v) || v.region === REGION.neck || (v.region === REGION.upperarm && v.t < 0.1));

/**
 * Lay a string on the skin like a cord under tension: smooth it, then set every point `offset`
 * off the skin along the nearest vertex's normal; repeat. Each point only snaps to skin facing the
 * same way as where it started (front or back), so a string can't slip over a shoulder to the
 * other side. Ends stay where they are.
 */
function layOn(skin: Skin, line: Vec3[], offset: number, passes = 6): Vec3[] {
  // Which side each point starts on, from the skin under it.
  const nearest = (p: Vec3, side: number) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < skin.p.length; i++) {
      if (side && Math.sign(skin.n[i][2]) !== side && Math.abs(skin.n[i][2]) > 0.15) continue;
      const q = skin.p[i];
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      if (d < bd) [bd, best] = [d, i];
    }
    return best;
  };
  const sides = line.map((p) => {
    const i = nearest(p, 0);
    return i < 0 || Math.abs(skin.n[i][2]) < 0.15 ? 0 : Math.sign(skin.n[i][2]);
  });
  const snap = (p: Vec3, side: number): Vec3 => {
    const i = nearest(p, side);
    if (i < 0) return p;
    const n = v3.norm(skin.n[i]);
    return v3.madd(p, n, offset - v3.dot(v3.sub(p, skin.p[i]), n));
  };
  let l = line.map((p) => [...p] as Vec3);
  for (let it = 0; it < passes; it++)
    l = l.map((p, i) => (i === 0 || i === l.length - 1 ? p : snap(v3.scale(v3.add(v3.add(l[i - 1], l[i + 1]), v3.scale(p, 2)), 0.25), sides[i])));
  return l;
}

/** Smooth polyline through key points (Catmull-Rom), `n` points per span. */
function spline(keys: Vec3[], n = 10): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)) as Vec3);
    }
  }
  out.push(keys[keys.length - 1]);
  return out;
}

/**
 * Skin lookup for strings over the chest, shoulders and neck: weights come from points pulled in
 * toward the midline, so the strings follow the chest and neck rather than the arms (otherwise a
 * lowered arm drags them down the back).
 */
function trunkLookup(b: Body, m: PolyMesh): Float32Array {
  const P = m.positions, out = new Float32Array(P.length);
  const lim = 0.5 * b.L.shoulderX;
  for (let i = 0; i < P.length; i += 3) {
    out[i] = clamp(P[i], -lim, lim);
    out[i + 1] = P[i + 1];
    out[i + 2] = P[i + 2];
  }
  return out;
}

/** A small bow: two loops and two hanging ends, at p facing out. */
function bow(p: Vec3, out: Vec3, r: number): PolyMesh {
  const f = frameOf(p, out, [0, 1, 0]);
  const loop = (s: number) => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(v3.add(p, v3.add(v3.scale(f.x, s * (r * 1.1 + Math.cos(a) * r * 1.1)), v3.add(v3.scale(f.y, Math.sin(a) * r * 0.55), v3.scale(f.z, cm(0.15))))));
    }
    return cord(pts, cm(0.11), true, 5);
  };
  const end = (s: number) => cord(spline([p, v3.add(p, v3.add(v3.scale(f.x, s * r * 0.6), v3.add(v3.scale(f.y, -r * 2.6), v3.scale(f.z, cm(0.2))))), v3.add(p, v3.add(v3.scale(f.x, s * r * 0.9), v3.scale(f.y, -r * 4.5)))], 6), cm(0.1), false, 5);
  return merge([loop(1), loop(-1), end(1), end(-1), ellipsoid(frameOf(v3.madd(p, out, cm(0.15)), out, [0, 1, 0]), [cm(0.35), cm(0.3), cm(0.2)], [0.5, 0.5], 8, 4)])!;
}

// --- Top ----------------------------------------------------------------------------------

interface Cup {
  side: number;
  /** Front-view nipple position (x as a distance from the midline). */
  nipple: [number, number];
  /** Front-view triangle (x, y): inner base, outer base, apex. */
  inner: [number, number];
  outer: [number, number];
  apex: [number, number];
}

function cups(b: Body): Cup[] {
  return [1, -1].map((s) => {
    const n = b.joint(`breast${s > 0 ? '.L' : '.R'}____tail`);
    const nx = Math.abs(n[0]), ny = n[1];
    return {
      side: s,
      nipple: [nx, ny],
      inner: [Math.max(cm(1.2), nx - cm(10)), ny - cm(7.5)],
      outer: [nx + cm(7.5), ny - cm(6.5)],
      apex: [nx - cm(1.5), ny + cm(11)],
    };
  });
}

/**
 * Upper-body faces for casting the cups onto: the trunk plus the neck and shoulder regions (the
 * base mesh's weight-based regions label parts of the upper chest as neck or upper arm).
 */
const chestFaces = (g: GCtx) => (f: number) => {
  const v = g.body.info[g.faceVerts[f * 4]];
  return isTrunk(v) || v.region === REGION.neck || (v.region === REGION.upperarm && v.t < 0.12);
};

/**
 * Size a cup's triangle to its breast. Rays are cast from the front along the nipple's height:
 * outward until the surface faces sideways (the breast's outer side), inward to the cleavage.
 */
function fitCup(cast: Caster, c: Cup): void {
  const [nx, ny] = c.nipple;
  const s = c.side;
  const nip = cast.hit(s * nx, ny);
  if (!nip) return;
  let outer = nx;
  for (let x = nx; x < nx + cm(25); x += cm(0.4)) {
    const h = cast.hit(s * x, ny);
    if (!h || h.n[2] < 0.25) break;
    outer = x;
  }
  let inner = nx, minZ = nip.p[2];
  for (let x = nx; x > cm(0.5); x -= cm(0.4)) {
    const h = cast.hit(s * x, ny);
    if (!h) break;
    if (h.p[2] <= minZ) {
      minZ = h.p[2];
      inner = x;
    }
  }
  // Half-width: the breast's reach from the nipple, outward or to the cleavage.
  const half = clamp(Math.max(outer - nx, nx - inner), cm(6), cm(11));
  // The base runs under the breast from the cleavage to its outer side; the apex sits above the nipple.
  c.inner = [Math.max(cm(1.2), Math.min(inner, nx - half * 0.8)), ny - half * 0.75];
  // The outer corner must still land on the front of the body at the base's height (lower down,
  // under the breast, the side turns away sooner).
  const baseY = ny - half * 0.65;
  let reach = nx;
  for (let x = nx; x < nx + half; x += cm(0.4)) {
    const h = cast.hit(s * x, baseY);
    // Stop where the surface turns sideways (under a full breast it faces down, which is fine).
    if (!h || Math.abs(h.n[0]) > 0.8) break;
    reach = x;
  }
  // Never less than 6.5 cm past the nipple, so it is always covered.
  c.outer = [Math.max(nx + cm(6.5), Math.min(outer, nx + half, reach)), baseY];
  // Apex straight above the nipple: the outer side then stays well outside it.
  c.apex = [nx - half * 0.05, ny + half * 1.25];
}

/**
 * A cup laid onto the bust: rows from the base (along the underbust) up to a narrow top at the
 * apex. Each point of the front-view triangle is projected radially from a point inside the chest
 * behind the nipple, so the cup wraps round the breast's side without notches.
 */
/** Where a cup's rays start: inside the chest, behind and a little inward of the nipple. */
const cupOrigin = (c: Cup, centreZ: number): Vec3 => [c.side * c.nipple[0] * 0.7, c.nipple[1] - cm(1), centreZ];

/** Inside a cup's front-view triangle by at least `margin`. */
function inTriangle(c: Cup, x: number, y: number, margin: number): boolean {
  const tri = [c.inner, c.outer, c.apex];
  // Signed distances to each edge, positive inside (the triangle winds either way).
  let sign = 0;
  for (let k = 0; k < 3; k++) {
    const [ax, ay] = tri[k], [bx, by] = tri[(k + 1) % 3];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const d = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / len;
    if (!sign) sign = Math.sign(((bx - ax) * (tri[(k + 2) % 3][1] - ay) - (by - ay) * (tri[(k + 2) % 3][0] - ax))) || 1;
    if (d * sign < margin) return false;
  }
  return true;
}

function cupGrid(cast: RadialCaster, c: Cup, centreZ: number, nipZ: number, under: Set<number>, rows = 24, cols = 22): Vec3[][] | null {
  const o = cupOrigin(c, centreZ);
  const grid: Vec3[][] = [];
  for (let i = 0; i < rows; i++) {
    // Stop just short of the apex: a narrow top where the halter string attaches.
    const v = (i / (rows - 1)) * 0.95;
    const row: Vec3[] = [];
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1);
      const bx = c.inner[0] + (c.outer[0] - c.inner[0]) * u, by = c.inner[1] + (c.outer[1] - c.inner[1]) * u;
      // Slightly convex sides (a cup, not a flat triangle).
      const bulge = cm(0.8) * Math.sin(Math.PI * v) * (u - 0.5) * 2;
      const x = c.side * (bx + (c.apex[0] - bx) * v + bulge), y = by + (c.apex[1] - by) * v;
      const h = cast.hit(o, v3.norm([x - o[0], y - o[1], nipZ - o[2]]));
      if (!h) return null;
      // Faces well inside the cup (two rows / columns in from its edges) may hide their skin.
      if (i >= 2 && i < rows - 2 && j >= 2 && j < cols - 2) under.add(h.face);
      row.push(h.p);
    }
    grid.push(row);
  }
  return grid;
}

/** Body faces whose four corners all pass `inside` (skin hidden only where the cloth surely covers it). */
function fullyCovered(g: GCtx, inside: (v: VInfo, p: Vec3) => boolean): Uint8Array {
  const b = g.body, fv = g.faceVerts, out = new Uint8Array(fv.length / 4);
  for (let f = 0; f < out.length; f++) {
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      const v = fv[f * 4 + k];
      ok = b.regions[v] !== 255 && inside(b.info[v], b.p(v));
    }
    out[f] = ok ? 1 : 0;
  }
  return out;
}

function bikiniTop(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = swimMat(g, 'Bikini top', st);
  const cs = cups(b);
  const cast = new Caster(b, g.faceVerts, chestFaces(g), 'front');
  // Fit each cup to the breast under it: march out from the nipple to where the breast's side turns
  // away (the outer edge) and in to the cleavage, then size the triangle around those.
  for (const c of cs) fitCup(cast, c);
  const radial = new RadialCaster(b, g.faceVerts, chestFaces(g));
  const under = new Set<number>();
  const centreZ = b.L.torsoZ - cm(2);
  const nipZ = cs.map((c) => cast.hit(c.side * c.nipple[0], c.nipple[1])?.p[2]);
  const grids = cs.map((c, k) => (nipZ[k] !== undefined ? cupGrid(radial, c, centreZ, nipZ[k]!, under) : null));
  // Skin is hidden only where the cup surely covers it: faces under its interior whose corners all
  // project (radially, as the cup was cast) to 1.2 cm or more inside its triangle.
  const insideCup = (p: Vec3) =>
    cs.some((c, k) => {
      if (nipZ[k] === undefined || Math.sign(p[0]) !== c.side) return false;
      const o = cupOrigin(c, centreZ);
      const t = (nipZ[k]! - o[2]) / (p[2] - o[2] || 1e-9);
      if (t <= 0) return false;
      const x = Math.abs(o[0] + (p[0] - o[0]) * t), y = o[1] + (p[1] - o[1]) * t;
      return inTriangle(c, x, y, cm(1.2));
    });
  const hides = new Uint8Array(g.faceVerts.length / 4);
  for (const f of under) {
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) ok = insideCup(b.p(g.faceVerts[f * 4 + k]));
    if (ok) hides[f] = 1;
  }
  const parts: GPart[] = [];
  const lifted = grids.map((gr) => (gr ? liftGrid(gr, cm(0.35), OUTWARD.front, 3) : null));
  const cupMeshes = lifted.filter((x): x is Vec3[][] => !!x);
  if (cupMeshes.length) {
    parts.push({ mesh: merge(cupMeshes.map((gr) => gridMesh(gr, 0.12)))!, material: { ...m, doubleSided: true }, hides });
    // Piping along the cups' edges, on the fabric.
    parts.push({ mesh: merge(cupMeshes.map((gr) => cord(gridOutline(gr).map((p) => v3.madd(p, OUTWARD.front, cm(0.06))), cm(0.1), true, 5)))!, material: stringMat(st) });
  }
  const skin = upperSkin(b);
  const strings: PolyMesh[] = [];
  // Back band: from one cup's outer corner, round the back at the same height, to the other's.
  const corners = grids.map((gr) => (gr ? gr[0][gr[0].length - 1] : null));
  if (corners[0] && corners[1]) {
    const bandY = (corners[0][1] + corners[1][1]) / 2;
    const back = hullRing(points(b, isTrunk), hplane(b, bandY), { slab: cm(1.2), samples: 64, offset: cm(0.3), arc: [Math.PI - 1.6, Math.PI + 1.6] });
    if (back) {
      // Ring runs from the character's left side round the back to the right: join it to the matching corners.
      const [l, r] = back[0][0] > 0 ? [corners[0], corners[1]] : [corners[1], corners[0]];
      strings.push(cord(layOn(skin, spline([l, ...back.filter((_, i) => i % 4 === 0), r], 4), cm(0.3)), cm(0.14), false, 6));
    }
  }
  // Centre: a short string between the cups' inner corners, lying on the sternum.
  const far = b.L.torsoZ + 9;
  const ic = lifted.map((gr) => (gr ? gr[0][0] : null));
  if (ic[0] && ic[1]) {
    const mid = dropOnto(b, skin, [[0, (ic[0][1] + ic[1][1]) / 2 + cm(0.3), far]])[0];
    strings.push(cord(layOn(skin, spline([ic[0], mid, ic[1]], 6), cm(0.3), 2), cm(0.12), false, 5));
  }
  // Halter: from each apex up over the trapezius to a bow at the back of the neck.
  const neck = b.joint('neck01____head');
  const tie: Vec3 = [0, neck[1] + cm(1.5), neck[2] - cm(5.5)];
  for (const [ci, c] of cs.entries()) {
    const s = c.side;
    // Start at the cup's actual tip (the middle of its top row) so the string meets it.
    const gr = lifted[ci];
    const tip: Vec3 | null = gr ? gr[gr.length - 1][Math.floor(gr[0].length / 2)] : null;
    const keys: Vec3[] = [
      tip ?? [s * c.apex[0], c.apex[1], far],
      [s * (c.apex[0] - cm(1.5)), c.apex[1] + cm(6), far],
      [s * cm(5.5), neck[1] - cm(1), neck[2]],
      [s * cm(4.5), neck[1] + cm(1.5), neck[2] - cm(4)],
      [s * cm(1.2), tie[1], tie[2]],
    ];
    // The front stretch is laid onto the chest; the rest is pushed out over the neck and shoulders.
    const laid = layOn(skin, spline(dropOnto(b, skin, keys), 12), cm(0.3), 10);
    strings.push(cord(laid, cm(0.13), false, 6));
  }
  const halter = merge([...strings, bow(layOn(skin, [tie, tie, tie], cm(0.3), 1)[1], [0, 0.3, -1], cm(1.6))])!;
  parts.push({ mesh: halter, material: stringMat(st), skinAt: trunkLookup(b, halter) });
  return parts;
}

/**
 * Bring points that start far in front of the body back onto its front surface (along -Z).
 */
function dropOnto(b: Body, skin: Skin, line: Vec3[]): Vec3[] {
  return line.map((p) => {
    if (p[2] < b.L.torsoZ + 5) return p;
    let z = -Infinity;
    for (const q of skin.p) if (Math.abs(q[0] - p[0]) < cm(1.2) && Math.abs(q[1] - p[1]) < cm(1.2)) z = Math.max(z, q[2]);
    return [p[0], p[1], z > -Infinity ? z + cm(0.45) : b.L.torsoZ];
  });
}

// --- Bottom -------------------------------------------------------------------------------

function bikiniBottom(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = { ...swimMat(g, 'Bikini bottom', st), doubleSided: true };
  const hip = b.L.hipY;
  // The lowest point of the trunk between the legs.
  let crotch = Infinity;
  for (let v = 0; v < b.info.length; v++) if (isTrunk(b.info[v]) && Math.abs(b.coords[v * 3]) < cm(1.5)) crotch = Math.min(crotch, b.coords[v * 3 + 1]);
  const yLow = crotch + cm(3); // where the front and back panels turn under into the gusset
  const ySide = hip + cm(13), yFront = hip + cm(7.5), yBack = hip + cm(9.5);
  // Half-widths up each panel (v: 0 at the gusset, 1 at the top): a front triangle and a cheeky back.
  const hwFront = (v: number) => cm(1.8) + cm(9.5) * v ** 1.25;
  const hwBack = (v: number) => cm(2) + cm(11) * v ** 0.7;
  const topFront = (u: number) => yFront + cm(1.2) * u * u, topBack = (u: number) => yBack + cm(1.8) * u * u;
  const keep = (f: number) => {
    const v = b.info[g.faceVerts[f * 4]];
    return isTrunk(v) || (v.region === REGION.upperleg && v.t < 0.15);
  };
  const ROWS = 16, COLS = 15;
  const panelGrid = (dir: 'front' | 'back'): Vec3[][] | null => {
    const cast = new Caster(b, g.faceVerts, keep, dir);
    const grid: Vec3[][] = [];
    for (let i = 0; i < ROWS; i++) {
      const v = i / (ROWS - 1);
      const row: Vec3[] = [];
      for (let j = 0; j < COLS; j++) {
        const u = (j / (COLS - 1)) * 2 - 1;
        const x = u * (dir === 'front' ? hwFront(v) : hwBack(v));
        const y = yLow + ((dir === 'front' ? topFront(u) : topBack(u)) - yLow) * v;
        const h = cast.hit(x, y);
        if (!h) return null;
        row.push(h.p);
      }
      grid.push(row);
    }
    return grid;
  };
  const front = panelGrid('front'), back = panelGrid('back');
  const parts: GPart[] = [];
  if (front && back) {
    // Gusset: from the front panel's bottom row under to the back's, laid on from below.
    const under = new Caster(b, g.faceVerts, keep, 'below');
    const K = 8;
    const gusset: Vec3[][] = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      gusset.push(front[0].map((fp, j) => {
        const bp = back[0][j];
        if (k === 0) return fp;
        if (k === K) return bp;
        const x = fp[0] + (bp[0] - fp[0]) * t, z = fp[2] + (bp[2] - fp[2]) * t;
        const h = under.hit(x, z);
        return h ? h.p : [x, fp[1] + (bp[1] - fp[1]) * t, z];
      }));
    }
    const lf = liftGrid(front, cm(0.3), OUTWARD.front), lb = liftGrid(back, cm(0.3), OUTWARD.back);
    const meshes = [gridMesh(lf, 0.12), gridMesh(lb, 0.12), gridMesh(liftGrid(gusset, cm(0.3), OUTWARD.below, 1), 0.12)];
    const inside = (v: VInfo, p: Vec3) => {
      if (!(isTrunk(v) || (v.region === REGION.upperleg && v.t < 0.15))) return false;
      const isBack = p[2] < b.L.torsoZ - cm(1);
      if (p[1] < yLow) return Math.abs(p[0]) < cm(1);
      const top = isBack ? yBack : yFront;
      const vv = clamp((p[1] - yLow) / (top - yLow), 0, 1);
      return p[1] < top - cm(1) && Math.abs(p[0]) < (isBack ? hwBack(vv) : hwFront(vv)) - cm(1);
    };
    parts.push({ mesh: merge(meshes)!, material: m, hides: fullyCovered(g, inside) });
    // Piping round the leg openings and the top edges.
    const pipe = (gr: Vec3[][], out: Vec3) => cord(gridOutline(gr).map((p) => v3.madd(p, out, cm(0.06))), cm(0.1), true, 5);
    parts.push({ mesh: merge([pipe(lf, OUTWARD.front), pipe(lb, OUTWARD.back)])!, material: stringMat(st) });
    // Side strings: from each front top corner over the hip bone to the back top corner, with a bow.
    const pts = points(b, isTrunk);
    const hipSkin = skinOf(b, isTrunk);
    const strings: PolyMesh[] = [];
    for (const s of [1, -1]) {
      const fc = front[ROWS - 1][s > 0 ? COLS - 1 : 0], bc = back[ROWS - 1][s > 0 ? COLS - 1 : 0];
      const ring = hullRing(pts, hplane(b, ySide), { slab: cm(1.5), samples: 128, offset: cm(0.3) });
      let side: Vec3 = [s * 9, ySide, b.L.torsoZ];
      if (ring) {
        side = ring[0];
        for (const q of ring) if (q[0] * s > side[0] * s) side = q;
      }
      const path = layOn(hipSkin, spline([fc, v3.lerp(fc, side, 0.55), side, v3.lerp(bc, side, 0.55), bc], 10), cm(0.3));
      strings.push(cord(path, cm(0.14), false, 6), bow(side, [s, 0, 0.15], cm(1.5)));
    }
    parts.push({ mesh: merge(strings)!, material: stringMat(st) });
  }
  return parts;
}

export const SWIMWEAR: GarmentDef[] = [
  { id: 'bikini_top', label: 'Bikini top (triangle)', slot: 'top', patterns: ['foil', 'solid', 'ankara', 'leopard'], color: '#c9963a', color2: '#fff1c4', build: bikiniTop },
  { id: 'bikini_bottom', label: 'Bikini bottom (string)', slot: 'bottom', patterns: ['foil', 'solid', 'ankara', 'leopard'], color: '#c9963a', color2: '#fff1c4', build: bikiniBottom },
];
