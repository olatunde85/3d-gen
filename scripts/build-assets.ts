/**
 * Converts the CC0 MakeHuman data into compact web asset packs in public/assets.
 *
 *   npm run setup-assets   (downloads the source data, then runs this)
 *   npm run build-assets   (just this step)
 *
 * Inputs:
 *   vendor/mh/makehuman/data  - base mesh, morph targets, skeleton, slider defs (makehuman repo)
 *   vendor/sys                - skins, hair, clothes, eyes... (makehuman_system_assets_cc0.zip)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import type { AssetMaterial, BaseMeta, Catalog, CatalogItem, ProxyKind, ProxyMeta, Slider, SliderGroup, TargetsMeta } from '../src/core/assets';
import { encodePack } from '../src/core/pack';
import { REGION } from '../src/core/garments/body';
import { addRacerCasualShirtTexture, addSportsuitRacerVariant } from './sportsuit-racer-variant';

const ROOT = join(import.meta.dirname, '..');
const MH = join(ROOT, 'vendor/mh/makehuman/data');
const SYS = join(ROOT, 'vendor/sys');
const OUT = join(ROOT, 'public/assets');

const log = (...a: unknown[]) => console.log(...a);
const kb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// --- Parsers -----------------------------------------------------------------

interface Obj {
  v: number[];
  vt: number[];
  faces: { v: number[]; t: number[]; group: string }[];
}

function parseObj(path: string): Obj {
  const o: Obj = { v: [], vt: [], faces: [] };
  let group = '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    switch (p[0]) {
      case 'v': o.v.push(+p[1], +p[2], +p[3]); break;
      case 'vt': o.vt.push(+p[1], +p[2]); break;
      case 'g': group = p[1] ?? ''; break;
      case 'f': {
        const v: number[] = [], t: number[] = [];
        for (const c of p.slice(1)) {
          const [a, b] = c.split('/');
          v.push(+a - 1);
          t.push(b ? +b - 1 : +a - 1);
        }
        o.faces.push({ v, t, group });
      }
    }
  }
  return o;
}

interface Proxy {
  props: Record<string, string>;
  tags: string[];
  scale: ([number, number, number] | null)[];
  refs: number[];
  weights: number[];
  offsets: number[];
  deleteVerts: number[];
}

function parseProxy(path: string): Proxy {
  const px: Proxy = { props: {}, tags: [], scale: [null, null, null], refs: [], weights: [], offsets: [], deleteVerts: [] };
  let mode: 'head' | 'verts' | 'delete' = 'head'; // header keys may appear between sections
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = line.split(/\s+/);
    if (/^[a-z_]+$/i.test(p[0]) && Number.isNaN(+p[0])) {
      const key = p[0];
      if (key === 'verts') { mode = 'verts'; if (+p[1] !== 0) throw new Error(`${path}: verts offset ${p[1]}`); continue; }
      if (key === 'delete_verts') { mode = 'delete'; continue; }
      if (key === 'tag') px.tags.push(p.slice(1).join(' '));
      else if (key === 'x_scale' || key === 'y_scale' || key === 'z_scale')
        px.scale['xyz'.indexOf(key[0])] = [+p[1], +p[2], +p[3]];
      else px.props[key] = p.slice(1).join(' ');
      continue;
    }
    if (mode === 'verts') {
      if (p.length === 1) {
        px.refs.push(+p[0], +p[0], +p[0]);
        px.weights.push(1, 0, 0);
        px.offsets.push(0, 0, 0);
      } else {
        px.refs.push(+p[0], +p[1], +p[2]);
        px.weights.push(+p[3], +p[4], +p[5]);
        px.offsets.push(+p[6], +p[7], +p[8]);
      }
    } else if (mode === 'delete') {
      for (let i = 0; i < p.length; i++) {
        if (p[i + 1] === '-') {
          for (let k = +p[i]; k <= +p[i + 2]; k++) px.deleteVerts.push(k);
          i += 2;
        } else px.deleteVerts.push(+p[i]);
      }
    }
  }
  return px;
}

function parseMhmat(path: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const i = line.indexOf(' ');
    if (i > 0) m[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return m;
}

// --- Textures ----------------------------------------------------------------

const texCache = new Map<string, string>();
let texBytes = 0;

async function texture(src: string, name: string, kind: 'color' | 'normal', max = 2048): Promise<string> {
  const cached = texCache.get(src + kind);
  if (cached) return cached;
  const img = sharp(src);
  const { isOpaque } = await img.stats();
  const meta = await img.metadata();
  const size = Math.min(max, meta.width ?? max);
  let file: string;
  let pipeline = sharp(src).resize(size, size, { fit: 'fill' });
  if (kind === 'color' && !isOpaque) {
    file = `${name}.png`;
    // 256-colour palette PNG with alpha: a standard PNG every engine reads, ~70% smaller for
    // hair, eyes and lashes, and visually identical (they're mostly shades of one colour).
    pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 100, colours: 256, effort: 10, dither: 1 });
  } else {
    file = `${name}.jpg`;
    pipeline = pipeline.removeAlpha().jpeg({ quality: kind === 'normal' ? 92 : 87, mozjpeg: true });
  }
  await pipeline.toFile(join(OUT, 'textures', file));
  texBytes += statSync(join(OUT, 'textures', file)).size;
  texCache.set(src + kind, file);
  return file;
}

function hex(rgb: string | undefined): string {
  if (!rgb) return '#ffffff';
  return '#' + rgb.split(/\s+/).slice(0, 3).map((x) => Math.round(Math.min(1, Math.max(0, +x)) * 255).toString(16).padStart(2, '0')).join('');
}

const ROUGHNESS: Partial<Record<ProxyKind | 'skin', number>> = {
  skin: 0.55, eyes: 0.08, hair: 0.65, eyebrows: 0.8, eyelashes: 0.8, outfit: 0.85, shoes: 0.55, hat: 0.75, body: 0.55,
};

async function material(mhmatPath: string, id: string, kind: ProxyKind | 'skin'): Promise<AssetMaterial> {
  const m = parseMhmat(mhmatPath);
  const dir = dirname(mhmatPath);
  const mat: AssetMaterial = {
    name: m.name ?? id,
    color: hex(m.diffuseColor),
    roughness: ROUGHNESS[kind] ?? 0.7,
    metalness: 0,
    alpha: 'opaque',
    doubleSided: m.backfaceCull?.toLowerCase() === 'false',
  };
  if (m.diffuseTexture) {
    const src = join(dir, m.diffuseTexture);
    if (existsSync(src)) {
      mat.diffuse = await texture(src, `${kind}_${id}`, 'color', kind === 'eyes' ? 1024 : 2048);
      if (mat.diffuse.endsWith('.png') && kind !== 'eyes') mat.alpha = 'mask';
    }
  }
  if (m.normalmapTexture) {
    const src = join(dir, m.normalmapTexture);
    if (existsSync(src)) mat.normal = await texture(src, `${kind}_${id}_normal`, 'normal', 2048);
  }
  return mat;
}

/**
 * Darken an eye texture's iris: coloured (saturated) pixels go to a deep warm brown, the white
 * sclera stays, and the blend follows saturation so edges and veins stay soft.
 */
async function darkenIris(src: string, file: string, dir: 'textures' | 'thumbs', k = 0.42): Promise<string> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], bl = data[i + 2];
    const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
    const sat = max ? (max - min) / max : 0;
    const iris = Math.min(1, Math.max(0, (sat - 0.18) / 0.3)); // 0 = sclera, 1 = iris
    // Darker by `k`, and a little less red than MakeHuman's brown.
    const t = [r * k + 6, g * k + 4, bl * k * 0.95 + 2];
    data[i] = Math.round(r + (t[0] - r) * iris);
    data[i + 1] = Math.round(g + (t[1] - g) * iris);
    data[i + 2] = Math.round(bl + (t[2] - bl) * iris);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(join(OUT, dir, file));
  return file;
}

async function thumb(src: string, name: string): Promise<string | undefined> {
  if (!existsSync(src)) return undefined;
  const file = `${name}.png`;
  try {
    await sharp(src).resize(96, 96, { fit: 'cover' }).png().toFile(join(OUT, 'thumbs', file));
    return `thumbs/${file}`;
  } catch {
    return undefined;
  }
}

// --- Base mesh, skeleton, targets -------------------------------------------

function buildBase() {
  const obj = parseObj(join(MH, '3dobjs/base.obj'));
  const body = obj.faces.filter((f) => f.group === 'body');
  if (body.some((f) => f.v.length !== 4)) throw new Error('base body is expected to be all quads');
  const skel = JSON.parse(readFileSync(join(MH, 'rigs/default.mhskel'), 'utf8'));
  const meta: BaseMeta = {
    vertexCount: obj.v.length / 3,
    faceCount: body.length,
    joints: skel.joints,
    bones: Object.entries(skel.bones as Record<string, { parent: string | null; head: string; tail: string }>).map(
      ([name, b]) => ({ name, parent: b.parent, head: b.head, tail: b.tail }),
    ),
  };
  // Body region per vertex, from the dominant skinning bone (255 = helper geometry).
  const regionOf = (bone: string) =>
    /^neck/.test(bone) ? REGION.neck
    : /^(spine|breast|clavicle)/.test(bone) ? REGION.torso
    : /^(root|pelvis)/.test(bone) ? REGION.hips
    : /^(shoulder|upperarm)/.test(bone) ? REGION.upperarm
    : /^lowerarm/.test(bone) ? REGION.lowerarm
    : /^(wrist|finger|metacarpal)/.test(bone) ? REGION.hand
    : /^upperleg/.test(bone) ? REGION.upperleg
    : /^lowerleg/.test(bone) ? REGION.lowerleg
    : /^(foot|toe)/.test(bone) ? REGION.foot
    : REGION.head;
  const weights = JSON.parse(readFileSync(join(MH, 'rigs/default_weights.mhw'), 'utf8')).weights as Record<string, [number, number][]>;
  const best = new Float32Array(meta.vertexCount);
  const regions = new Uint8Array(meta.vertexCount).fill(255);
  for (const [bone, list] of Object.entries(weights))
    for (const [v, w] of list)
      if (w > best[v]) {
        best[v] = w;
        regions[v] = regionOf(bone);
      }
  // Skin weights, CSR by vertex: wOff[v]..wOff[v+1] index into wBone (bone index in meta.bones) / wVal.
  const boneIndex = new Map(meta.bones.map((b, i) => [b.name, i]));
  const perVert: [number, number][][] = Array.from({ length: meta.vertexCount }, () => []);
  for (const [bone, list] of Object.entries(weights)) for (const [v, w] of list) perVert[v].push([boneIndex.get(bone)!, w]);
  const wOff = new Uint32Array(meta.vertexCount + 1);
  const wBone: number[] = [], wVal: number[] = [];
  perVert.forEach((l, v) => {
    wOff[v] = wBone.length;
    for (const [b, w] of l) {
      wBone.push(b);
      wVal.push(w);
    }
  });
  wOff[meta.vertexCount] = wBone.length;
  // Only vertices used by body faces count as "body" for garment fitting.
  const used = new Uint8Array(meta.vertexCount);
  for (const f of body) for (const v of f.v) used[v] = 1;
  for (let v = 0; v < meta.vertexCount; v++) if (!used[v]) regions[v] = 255;
  const data = encodePack(meta, {
    wOff,
    wBone: Uint8Array.from(wBone),
    wVal: Float32Array.from(wVal),
    regions,
    positions: Float32Array.from(obj.v),
    faceVerts: Uint32Array.from(body.flatMap((f) => f.v)),
    faceUVs: Uint32Array.from(body.flatMap((f) => f.t)),
    uvs: Float32Array.from(obj.vt),
  });
  writeFileSync(join(OUT, 'base.pack'), data);
  log(`base.pack: ${meta.vertexCount} verts, ${meta.faceCount} body quads, ${meta.bones.length} bones (${kb(data.length)})`);
  return meta;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function buildSliders(available: Set<string>): { groups: SliderGroup[]; targets: Set<string> } {
  const defs = JSON.parse(readFileSync(join(MH, 'modifiers/modeling_sliders.json'), 'utf8')) as Record<
    string,
    { sortOrder: number; modifiers: Record<string, { mod: string; label?: string }[]> }
  >;
  const used = new Set<string>();
  const groups: SliderGroup[] = [];
  const emitted = new Set<string>();
  const pretty = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
  const SKIP = /genital|penis|bulge|testicle|nipple|pelvis-tone/i;
  for (const [category, cat] of Object.entries(defs).sort((a, b) => a[1].sortOrder - b[1].sortOrder)) {
    for (const [group, mods] of Object.entries(cat.modifiers)) {
      const sliders: Slider[] = [];
      const seen = new Set<string>();
      for (const m of mods) {
        const [dir, spec] = m.mod.split('/');
        if (!spec || !spec.includes('-') || SKIP.test(spec) || dir === 'macrodetails') continue;
        // "head-fat-decr|incr" -> name "head-fat", lo "decr", hi "incr". "head-oval" -> unipolar.
        let name = spec, lo: string | null = null, hi: string | null = null;
        if (spec.includes('|')) {
          const [left, right] = spec.split('|');
          const cut = left.lastIndexOf('-');
          name = left.slice(0, cut);
          lo = left.slice(cut + 1);
          hi = right;
        }
        const range = lo ? `${lo}|${hi}` : '';
        const key = (n: string, side: string | null) => (side ? `${dir}/${n}-${side}` : `${dir}/${n}`);
        const pair = (n: string): [string | null, string | null] =>
          range ? [key(n, lo), key(n, hi)] : [null, key(n, null)];
        const pairs: [string | null, string | null][] = [pair(name)];
        let id = name;
        let label = m.label ?? pretty(name.replace(new RegExp(`^${dir}-`), ''));
        // Merge left/right twins into one symmetric slider.
        const twin = name.startsWith('r-') ? 'l-' + name.slice(2) : name.startsWith('l-') ? 'r-' + name.slice(2) : null;
        if (twin) {
          const base = name.slice(2);
          if (seen.has(base)) continue;
          seen.add(base);
          id = base;
          pairs.push(pair(twin));
          label = (m.label ?? pretty(base.replace(new RegExp(`^${dir.replace(/s$/, '')}-?`), ''))).replace(/^(Right|Left) /i, '');
        }
        if (seen.has(id + range) && !twin) continue;
        seen.add(id + range);
        const flat = pairs.flat().filter((x): x is string => !!x);
        const missing = flat.filter((t) => !available.has(t));
        if (missing.length) {
          log(`  skip slider ${dir}/${id}: missing ${missing.join(', ')}`);
          continue;
        }
        // Multi-axis sliders (e.g. "torso-trans" up/down, in/out, forward/backward) share a name: keep ids unique.
        let sid = `${dir}/${id}`;
        if (emitted.has(sid) && range) sid = `${sid}:${range}`;
        if (emitted.has(sid)) continue; // left/right twins merged into one symmetric slider already
        emitted.add(sid);
        flat.forEach((t) => used.add(t));
        sliders.push({ id: sid, label: label + (sid.includes(':') ? ` (${lo}/${hi})` : ''), targets: pairs, bipolar: !!range });
      }
      if (sliders.length) groups.push({ category, group, sliders });
    }
  }
  return { groups, targets: used };
}

function buildTargets(extra: Set<string>) {
  const all = walk(join(MH, 'targets')).filter((p) => p.endsWith('.target'));
  const byKey = new Map(all.map((p) => [relative(join(MH, 'targets'), p).replace(/\.target$/, ''), p]));
  const wanted = [...byKey.keys()].filter(
    (k) => ((k.startsWith('macrodetails/') || /^breast\/(fe)?male-/.test(k)) && !k.includes('-baby')) || k.startsWith('expression/units/') || extra.has(k),
  );
  // Format 2: MakeHuman targets have three decimals, so values are stored exactly as integer
  // thousandths, delta-coded along each target (neighbouring vertices move alike) and split into
  // low/high byte planes: about 45% smaller than plain 16-bit values after gzip, and lossless.
  const meta: TargetsMeta = { format: 2, targets: {} };
  const idx: number[] = [];
  const d: number[][] = [[], [], []];
  for (const key of wanted.sort()) {
    const rows: number[][] = [];
    for (const line of readFileSync(byKey.get(key)!, 'utf8').split('\n')) {
      if (!line || line[0] === '#') continue;
      const p = line.trim().split(/\s+/).map(Number);
      if (p.length >= 4) rows.push(p);
    }
    rows.sort((a, b) => a[0] - b[0]);
    let max = 0;
    for (const r of rows) max = Math.max(max, Math.abs(r[1]), Math.abs(r[2]), Math.abs(r[3]));
    const s = Math.max(0.001, max / 32767);
    const start = idx.length;
    let prev = 0;
    const last = [0, 0, 0];
    for (const r of rows) {
      const q = [1, 2, 3].map((k) => Math.round(r[k] / s));
      if (!q[0] && !q[1] && !q[2]) continue;
      idx.push(r[0] - prev);
      prev = r[0];
      for (let k = 0; k < 3; k++) {
        d[k].push((q[k] - last[k]) & 0xffff);
        last[k] = q[k];
      }
    }
    meta.targets[key] = [start, idx.length - start, s];
  }
  const planes = (a: number[], hi: boolean) => Uint8Array.from(a, (v) => (hi ? v >> 8 : v & 255));
  const data = encodePack(meta, {
    idx: Uint16Array.from(idx),
    xlo: planes(d[0], false), xhi: planes(d[0], true),
    ylo: planes(d[1], false), yhi: planes(d[1], true),
    zlo: planes(d[2], false), zhi: planes(d[2], true),
  });
  writeFileSync(join(OUT, 'targets.pack'), data);
  log(`targets.pack: ${wanted.length} targets, ${idx.length} deltas (${kb(data.length)})`);
  return new Set(byKey.keys());
}

// --- Proxy assets ------------------------------------------------------------

async function buildProxy(file: string, kind: ProxyKind, id: string, withMaterial = true): Promise<CatalogItem> {
  const px = parseProxy(file);
  const dir = dirname(file);
  const obj = parseObj(join(dir, px.props.obj_file));
  const n = obj.v.length / 3;
  if (px.refs.length / 3 !== n) throw new Error(`${file}: ${px.refs.length / 3} refs vs ${n} obj verts`);
  const mat = withMaterial && px.props.material ? await material(join(dir, px.props.material), id, kind) : undefined;
  const meta: ProxyMeta = { id, kind, zDepth: +(px.props.z_depth ?? 50), scale: px.scale, material: mat, vertexCount: n };
  const rel = `proxies/${kind}_${id}.pack`;
  writeFileSync(
    join(OUT, rel),
    encodePack(meta, {
      refs: Uint32Array.from(px.refs),
      weights: Float32Array.from(px.weights),
      offsets: Float32Array.from(px.offsets),
      faceSizes: Uint8Array.from(obj.faces.map((f) => f.v.length)),
      faceVerts: Uint32Array.from(obj.faces.flatMap((f) => f.v)),
      faceUVs: Uint32Array.from(obj.faces.flatMap((f) => f.t)),
      uvs: Float32Array.from(obj.vt),
      deleteVerts: Uint32Array.from(px.deleteVerts),
    }),
  );
  const t = readdirSync(dir).find((f) => f.endsWith('.thumb'));
  return {
    id,
    name: px.props.name ?? id,
    tags: px.tags.filter((x) => !x.startsWith('MakeHuman')),
    file: rel,
    material: mat,
    thumb: t ? await thumb(join(dir, t), `${kind}_${id}`) : undefined,
  };
}

const pretty = (id: string) =>
  id.replace(/_/g, ' ').replace(/(\d+)$/, ' $1').replace(/\s+/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());

async function proxiesIn(folder: string, kind: ProxyKind, ext = '.mhclo', filter: (id: string) => boolean = () => true) {
  const items: CatalogItem[] = [];
  for (const id of readdirSync(join(SYS, folder)).sort()) {
    const d = join(SYS, folder, id);
    if (!statSync(d).isDirectory() || !filter(id)) continue;
    const f = readdirSync(d).find((x) => x.endsWith(ext));
    if (!f) continue;
    const item = await buildProxy(join(d, f), kind, id);
    item.name = pretty(id);
    items.push(item);
  }
  return items;
}

// --- Main --------------------------------------------------------------------

async function main() {
  if (!existsSync(MH) || !existsSync(SYS)) throw new Error('Source data missing. Run `npm run setup-assets` first.');
  rmSync(OUT, { recursive: true, force: true });
  for (const d of ['', 'textures', 'thumbs', 'proxies']) mkdirSync(join(OUT, d), { recursive: true });

  buildBase();
  const available = new Set(
    walk(join(MH, 'targets')).filter((p) => p.endsWith('.target')).map((p) => relative(join(MH, 'targets'), p).replace(/\.target$/, '')),
  );
  const sliders = buildSliders(available);
  buildTargets(sliders.targets);

  const skins: CatalogItem[] = [];
  for (const id of readdirSync(join(SYS, 'skins')).sort()) {
    const d = join(SYS, 'skins', id);
    if (!statSync(d).isDirectory() || id === 'toon01' || id.includes('special_suit')) continue;
    const mf = readdirSync(d).find((f) => f.endsWith('.mhmat'));
    if (!mf) continue;
    const t = readdirSync(d).find((f) => f.endsWith('.thumb'));
    skins.push({
      id, name: pretty(id), tags: id.split('_'), material: await material(join(d, mf), id, 'skin'),
      thumb: t ? await thumb(join(d, t), `skin_${id}`) : undefined,
    });
  }
  log(`skins: ${skins.length}`);

  const eyes: CatalogItem[] = [];
  const eyeDir = join(SYS, 'eyes/materials');
  for (const f of readdirSync(eyeDir).filter((x) => x.endsWith('.mhmat')).sort()) {
    const id = basename(f, '.mhmat');
    eyes.push({
      id, name: pretty(id), tags: [], material: await material(join(eyeDir, f), id, 'eyes'),
      thumb: await thumb(join(eyeDir, `${id}.thumb`), `eyes_${id}`),
    });
  }
  // Dark brown and near-black brown (the most common eye colours, missing from MakeHuman's set):
  // its brown, darkened.
  const brown = eyes.find((e) => e.id === 'brown');
  if (brown?.material?.diffuse) {
    let at = eyes.indexOf(brown) + 1;
    for (const [id, name, k] of [['darkbrown', 'Dark brown', 0.42], ['blackbrown', 'Black-brown', 0.2]] as const) {
      const diffuse = await darkenIris(join(OUT, 'textures', brown.material.diffuse), `eyes_${id}.png`, 'textures', k);
      const thumb = brown.thumb ? await darkenIris(join(OUT, brown.thumb), `eyes_${id}.png`, 'thumbs', k) : undefined;
      eyes.splice(at++, 0, { id, name, tags: [], material: { ...brown.material, diffuse }, thumb: thumb && `thumbs/${thumb}` });
    }
  }
  const eyeMesh = await buildProxy(join(SYS, 'eyes/high-poly/high-poly.mhclo'), 'eyes', 'high-poly', false);
  const teeth = await proxiesIn('teeth', 'teeth');
  const tongue = await buildProxy(join(SYS, 'tongue/tongue01/tongue01.mhclo'), 'tongue', 'tongue01');
  await buildProxy(join(SYS, 'eyes/low-poly/low-poly.mhclo'), 'eyes', 'low-poly', false);

  const clothes = await proxiesIn('clothes', 'outfit');
  const isTag = (c: CatalogItem, t: string) => c.tags.some((x) => x.toLowerCase() === t);
  // Re-file shoes and hats under their own kinds so the builder can treat them separately.
  const reKind = async (items: CatalogItem[], kind: ProxyKind) => {
    const out: CatalogItem[] = [];
    for (const c of items) {
      const f = readdirSync(join(SYS, 'clothes', c.id)).find((x) => x.endsWith('.mhclo'))!;
      rmSync(join(OUT, c.file!));
      const item = await buildProxy(join(SYS, 'clothes', c.id, f), kind, c.id);
      item.name = pretty(c.id);
      out.push(item);
    }
    return out;
  };
  const shoes = await reKind(clothes.filter((c) => isTag(c, 'shoes')), 'shoes');
  const hats = await reKind(clothes.filter((c) => isTag(c, 'hats')), 'hat');
  const outfits = clothes.filter((c) => !isTag(c, 'shoes') && !isTag(c, 'hats'));
  await addSportsuitRacerVariant(OUT, outfits);
  await addRacerCasualShirtTexture(OUT, outfits);

  const catalog: Catalog = {
    skins,
    eyes,
    eyebrows: await proxiesIn('eyebrows', 'eyebrows'),
    eyelashes: await proxiesIn('eyelashes', 'eyelashes'),
    hair: await proxiesIn('hair', 'hair'),
    outfits,
    shoes,
    hats,
    bodies: await proxiesIn('proxymeshes', 'body', '.proxy'),
    eyeMesh: eyeMesh.file!,
    teeth,
    tongue,
    sliders: sliders.groups,
  };
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog));
  copyFileSync(join(ROOT, 'scripts/ASSETS_LICENSE.txt'), join(OUT, 'LICENSE.txt'));
  log(
    `catalog: ${outfits.length} outfits, ${shoes.length} shoes, ${hats.length} hats, ${catalog.hair.length} hair, ` +
      `${catalog.eyebrows.length} eyebrows, ${catalog.eyelashes.length} eyelashes, ${eyes.length} eye colours, ` +
      `${catalog.bodies.length} body LODs, ${sliders.groups.reduce((n, g) => n + g.sliders.length, 0)} sliders`,
  );
  log(`textures: ${texCache.size} files, ${kb(texBytes)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
