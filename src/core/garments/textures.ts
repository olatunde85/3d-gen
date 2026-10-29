/**
 * Procedural, seamlessly tiling textures for generated garments, encoded as
 * PNG so they flow through the same viewer/exporter path as asset textures.
 */
import { zlibSync } from 'fflate';

// --- PNG ---------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG scanlines (filter byte 0 + pixels), from RGBA input. */
function scanlines(w: number, h: number, rgba: Uint8Array, alpha: boolean): Uint8Array {
  const ch = alpha ? 4 : 3;
  const raw = new Uint8Array((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * ch + 1) + 1;
    if (alpha) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), o);
    else for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) raw[o + x * 3 + k] = rgba[(y * w + x) * 4 + k];
  }
  return raw;
}

function pngFile(w: number, h: number, alpha: boolean, idat: Uint8Array): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodePNG(w: number, h: number, rgba: Uint8Array, alpha: boolean, level: 1 | 3 | 6 | 9 = 6): Uint8Array {
  return pngFile(w, h, alpha, zlibSync(scanlines(w, h, rgba, alpha), { level }));
}

/** Same as encodePNG, using the platform's native zlib (CompressionStream) when available: several times faster on big images. */
export async function encodePNGAsync(w: number, h: number, rgba: Uint8Array, alpha: boolean): Promise<Uint8Array> {
  const raw = scanlines(w, h, rgba, alpha);
  if (typeof CompressionStream === 'undefined') return pngFile(w, h, alpha, zlibSync(raw, { level: 3 }));
  const z = await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return pngFile(w, h, alpha, new Uint8Array(z));
}

// --- Noise (periodic, so textures tile) ----------------------------------------

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const lattices = new Map<number, Float32Array>();
function lattice(period: number, seed: number): Float32Array {
  const key = period * 100003 + seed;
  let t = lattices.get(key);
  if (!t) {
    t = new Float32Array(period * period);
    for (let y = 0; y < period; y++) for (let x = 0; x < period; x++) t[y * period + x] = hash(x, y, seed);
    lattices.set(key, t);
  }
  return t;
}

/** Periodic value noise; u, v in [0,1), `period` lattice cells per tile. */
function pnoise(u: number, v: number, period: number, seed: number): number {
  const t = lattice(period, seed);
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y);
  let xf = x - xi, yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = t[y0 * period + x0] + (t[y0 * period + x1] - t[y0 * period + x0]) * xf;
  const b = t[y1 * period + x0] + (t[y1 * period + x1] - t[y1 * period + x0]) * xf;
  return a + (b - a) * yf;
}

function fbm(u: number, v: number, period: number, seed: number, oct = 4): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += pnoise(u, v, period << o, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

// --- Colour helpers ------------------------------------------------------------

export type RGB = [number, number, number];
export const rgb = (hex: string): RGB => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface TexOut {
  color: Uint8Array; // PNG
  normal?: Uint8Array; // PNG
  alpha: boolean;
}

/** Fill a texture from a per-pixel function returning colour, alpha (0..1) and height. */
export function render(size: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, wantAlpha: boolean, normalStrength = 0): TexOut {
  return renderRect(size, size, fn, wantAlpha, normalStrength);
}

// (makePattern shadows `render` with a tiling version.)
const renderTex = (...a: Parameters<typeof render>) => render(...a);

/** As render, for a w x h texture (u across, v down). */
export function renderRect(w: number, h: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, wantAlpha: boolean, normalStrength = 0): TexOut {
  const { px, height } = renderPixels(w, h, fn, !!normalStrength);
  return encodeTex(w, h, px, height, wantAlpha, normalStrength);
}

function renderPixels(w: number, h: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, wantHeight: boolean) {
  const px = new Uint8Array(w * h * 4);
  const height = wantHeight ? new Float32Array(w * h) : null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = fn((x + 0.5) / w, (y + 0.5) / h);
      const i = (y * w + x) * 4;
      px[i] = Math.max(0, Math.min(255, r.c[0]));
      px[i + 1] = Math.max(0, Math.min(255, r.c[1]));
      px[i + 2] = Math.max(0, Math.min(255, r.c[2]));
      px[i + 3] = Math.round(Math.max(0, Math.min(1, r.a ?? 1)) * 255);
      if (height) height[y * w + x] = r.h ?? 0;
    }
  return { px, height };
}

/**
 * A pattern tile repeated `n` times each way across a texture `n * tile` pixels square: the tile is
 * rendered once and copied (a garment's UV atlas spanning several tiles of cloth).
 */
function renderTiled(tile: number, n: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, wantAlpha: boolean, normalStrength = 0): TexOut {
  const t = renderPixels(tile, tile, fn, !!normalStrength), W = tile * n;
  const px = new Uint8Array(W * W * 4), height = t.height ? new Float32Array(W * W) : null;
  for (let y = 0; y < W; y++) {
    const ty = y % tile;
    for (let k = 0; k < n; k++) {
      px.set(t.px.subarray(ty * tile * 4, (ty + 1) * tile * 4), (y * W + k * tile) * 4);
      if (height) height.set(t.height!.subarray(ty * tile, (ty + 1) * tile), y * W + k * tile);
    }
  }
  return encodeTex(W, W, px, height, wantAlpha, normalStrength);
}

function encodeTex(w: number, h: number, px: Uint8Array, height: Float32Array | null, wantAlpha: boolean, normalStrength: number): TexOut {
  let normal: Uint8Array | undefined;
  if (height) {
    const np = new Uint8Array(w * h * 4);
    const H = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
        const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        np[i] = (-dx / l * 0.5 + 0.5) * 255;
        np[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        np[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        np[i + 3] = 255;
      }
    normal = encodePNG(w, h, np, false);
  }
  return { color: encodePNG(w, h, px, wantAlpha), normal, alpha: wantAlpha };
}

/** Fine woven-cloth relief, shared by fabric patterns. */
const weave = (u: number, v: number, f = 96) => {
  const a = Math.sin(u * Math.PI * 2 * f), b = Math.sin(v * Math.PI * 2 * f);
  return (a * 0.5 + 0.5) * (frac(v * f) < 0.5 ? 1 : 0.6) + (b * 0.5 + 0.5) * (frac(u * f) < 0.5 ? 0.6 : 1);
};

// --- Patterns ------------------------------------------------------------------

export type Pattern =
  | 'solid' | 'camo' | 'kente' | 'asooke' | 'ankara' | 'shuka' | 'leather' | 'hide' | 'leopard' | 'fur'
  | 'techwear' | 'molle' | 'tattered' | 'beadbands' | 'khaki' | 'adire' | 'adire_panel'
  | 'ankara_floral' | 'ankara_web' | 'lace' | 'damask' | 'pleated' | 'foil' | 'straw' | 'denim' | 'rib' | 'jersey' | 'nappa' | 'workwear'
  | 'tropical' | 'linen' | 'suiting' | 'patent';

export const PATTERNS: Pattern[] = [
  'solid', 'khaki', 'camo', 'kente', 'asooke', 'ankara', 'ankara_floral', 'ankara_web', 'adire', 'adire_panel', 'lace', 'damask', 'pleated', 'foil', 'denim', 'jersey', 'workwear', 'tropical', 'linen', 'suiting', 'nappa', 'patent',
  'shuka', 'leather', 'hide', 'leopard', 'techwear', 'tattered',
];

/** Nearest jittered cell centre on a periodic grid of g x g cells: [dx, dy, distance, cell hash]. */
function cellNearest(u: number, v: number, g: number, seed: number, jitter = 0.6, halfDrop = false): [number, number, number, number] {
  let best: [number, number, number, number] = [0, 0, 9, 0];
  const gx = Math.floor(u * g), gy = Math.floor(v * g);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy;
      const mx = ((cx % g) + g) % g, my = ((cy % g) + g) % g;
      const drop = halfDrop && mx % 2 ? 0.5 : 0;
      const px = (cx + 0.5 + jitter * (hash(mx, my, seed) - 0.5)) / g;
      const py = (cy + 0.5 + drop + jitter * (hash(mx, my, seed + 1) - 0.5)) / g;
      const d = Math.hypot(u - px, v - py) * g;
      if (d < best[2]) best = [(u - px) * g, (v - py) * g, d, hash(mx, my, seed + 2)];
    }
  return best;
}

const S = 512;

/**
 * A pattern texture. `repeat`: how many times the pattern tiles across the texture each way (for
 * an atlas whose UVs span a whole garment, such as a MakeHuman outfit's): one 256 px tile, copied.
 */
export function makePattern(p: Pattern, c1: string, c2: string, seed = 1, repeat = 1): TexOut {
  const A = rgb(c1), B = rgb(c2);
  const render = (size: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, alpha: boolean, normal = 0): TexOut =>
    repeat === 1 ? renderTex(size, fn, alpha, normal) : renderTiled(Math.round(Math.min(2048, size * 3) / repeat), repeat, fn, alpha, normal);
  switch (p) {
    case 'solid':
    case 'khaki':
      return render(S, (u, v) => {
        const n = fbm(u, v, 8, seed);
        const w = weave(u, v, p === 'khaki' ? 128 : 96);
        return { c: mul(A, 0.88 + 0.16 * n + 0.04 * w), h: w * 0.6 + n };
      }, false, 2.5);
    case 'camo': {
      const pal: RGB[] = [A, B, mixc(A, [40, 34, 24], 0.55), mixc(B, [200, 190, 150], 0.35)];
      return render(S, (u, v) => {
        const n1 = fbm(u, v, 4, seed, 3), n2 = fbm(u + 0.37, v + 0.11, 5, seed + 9, 3);
        const k = n1 > 0.58 ? 2 : n2 > 0.57 ? 3 : n1 < 0.42 ? 1 : 0;
        const w = weave(u, v, 128);
        return { c: mul(pal[k], 0.92 + 0.08 * w), h: w };
      }, false, 2);
    }
    case 'kente': {
      // Gold / green / red / black woven strips with alternating block motifs.
      const gold: RGB = [222, 170, 40], green = A, red = B, black: RGB = [25, 22, 20];
      return render(S, (u, v) => {
        const strip = Math.floor(u * 8), su = frac(u * 8);
        const block = Math.floor(v * 8), sv = frac(v * 8);
        let c: RGB;
        if (su < 0.06 || su > 0.94) c = black;
        else if ((strip + block) % 2 === 0) {
          // warp-faced stripes
          const k = Math.floor(su * 9);
          c = [gold, green, gold, red, gold, black, gold, green, gold][k];
        } else {
          // weft blocks: checks / zigzags
          const motif = (strip * 3 + block) % 3;
          if (motif === 0) c = (Math.floor(su * 6) + Math.floor(sv * 6)) % 2 ? gold : red;
          else if (motif === 1) c = Math.abs(frac(sv * 3 + Math.abs(su - 0.5)) - 0.5) < 0.18 ? black : gold;
          else c = sv < 0.25 || sv > 0.75 ? green : Math.floor(sv * 12) % 2 ? gold : black;
        }
        const w = weave(u, v, 160);
        return { c: mul(c, 0.85 + 0.15 * w), h: w };
      }, false, 3);
    }
    case 'asooke': {
      // Narrow-strip woven fabric: fine pinstripes with metallic threads.
      const metal: RGB = [210, 190, 140];
      return render(S, (u, v) => {
        const su = frac(u * 10);
        const pin = frac(u * 120) < 0.18;
        let c: RGB = su < 0.03 || su > 0.97 ? mul(A, 0.55) : pin ? B : A;
        if (Math.floor(v * 24) % 6 === 0 && frac(u * 40) < 0.5) c = metal;
        const w = weave(u, v, 140);
        return { c: mul(c, 0.82 + 0.18 * w), h: w * 1.2 };
      }, false, 3);
    }
    case 'ankara': {
      // Wax-print style: bold concentric circles on an offset grid with dots.
      const C: RGB = mixc(A, [250, 240, 220], 0.75), D: RGB = [20, 20, 30];
      return render(S, (u, v) => {
        const g = 4;
        const row = Math.floor(v * g);
        const x = frac(u * g + (row % 2) * 0.5), y = frac(v * g);
        const r = Math.hypot(x - 0.5, y - 0.5);
        let c: RGB = A;
        if (r < 0.42) {
          const ring = Math.floor(r * 14);
          c = [B, C, D, B, C, A][ring % 6];
        } else if (Math.hypot(frac(x * 2) - 0.5, frac(y * 2) - 0.5) < 0.12) c = C;
        const crackle = fbm(u, v, 32, seed, 2) > 0.62 ? 0.85 : 1;
        return { c: mul(c, crackle), h: weave(u, v, 128) * 0.5 };
      }, false, 1.5);
    }
    case 'shuka': {
      // Maasai shuka: red base with a dark check.
      const dark: RGB = mixc(B, [10, 10, 30], 0.3);
      return render(S, (u, v) => {
        const band = (t: number) => {
          const f = frac(t * 3);
          return f < 0.08 ? 1 : f > 0.2 && f < 0.24 ? 0.6 : f > 0.5 && f < 0.53 ? 0.4 : 0;
        };
        const a = band(u), b = band(v);
        let c = A;
        if (a || b) c = mixc(A, dark, Math.min(1, (a + b) * 0.7));
        const w = weave(u, v, 110);
        return { c: mul(c, 0.86 + 0.14 * w), h: w };
      }, false, 2.5);
    }
    case 'leather':
      return render(S, (u, v) => {
        const g = fbm(u, v, 64, seed, 3), b = fbm(u, v, 6, seed + 5, 3);
        const stitch = (frac(v * 8) < 0.012 && frac(u * 40) < 0.5) || (frac(u * 4) < 0.006 && frac(v * 40) < 0.5);
        const c = mul(A, (0.72 + 0.45 * b) * (0.92 + 0.12 * g) * (stitch ? 0.6 : 1));
        return { c, h: g * 0.8 + b * 0.5 + (stitch ? -0.6 : 0) };
      }, false, 2.5);
    case 'hide': {
      // Nguni cowhide: cream with irregular dark patches.
      const cream: RGB = [236, 226, 206];
      return render(S, (u, v) => {
        const n = fbm(u, v, 4, seed, 4);
        const hair = fbm(u * 3, v * 0.6, 48, seed + 3, 2);
        const c = n > 0.56 ? mixc(A, B, fbm(u, v, 8, seed + 1, 2)) : cream;
        return { c: mul(c, 0.85 + 0.25 * hair), h: hair };
      }, false, 1.5);
    }
    case 'leopard': {
      const base: RGB = [214, 160, 74], dark: RGB = [40, 28, 18];
      return render(S, (u, v) => {
        const g = 7;
        let best = 9, second = 9;
        const gx = Math.floor(u * g), gy = Math.floor(v * g);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const cx = gx + dx, cy = gy + dy;
            const mx = ((cx % g) + g) % g, my = ((cy % g) + g) % g;
            const px = (cx + 0.2 + 0.6 * hash(mx, my, seed)) / g, py = (cy + 0.2 + 0.6 * hash(mx, my, seed + 1)) / g;
            const d = Math.hypot(u - px, v - py) * g;
            if (d < best) [second, best] = [best, d];
            else if (d < second) second = d;
          }
        const ring = best > 0.18 && best < 0.32;
        const fur = fbm(u * 2, v * 0.5, 64, seed + 2, 2);
        const c = ring ? dark : best < 0.18 ? mixc(base, [160, 100, 40], 0.6) : base;
        return { c: mul(c, 0.85 + 0.25 * fur), h: fur };
      }, false, 1.2);
    }
    case 'fur':
      // Long strands with alpha: for fringes and tassels (v runs down the strands).
      return render(256, (u, v) => {
        const strand = pnoise(u, 0.5, 64, seed);
        const len = 0.65 + 0.35 * pnoise(u, 0.2, 32, seed + 4);
        const a = v < len ? 1 - Math.pow(v / len, 6) : 0;
        return { c: mul(A, 0.75 + 0.35 * strand), a: a * (0.55 + 0.6 * strand) };
      }, true);
    case 'techwear':
      return render(S, (u, v) => {
        const panel = frac(u * 3) < 0.008 || frac(v * 2.5) < 0.008;
        const n = fbm(u, v, 16, seed, 3);
        const w = weave(u, v, 200);
        return { c: mul(A, (0.9 + 0.15 * n) * (panel ? 0.55 : 1)), h: w * 0.4 + (panel ? -1 : 0) };
      }, false, 2.5);
    case 'molle':
      return render(S, (u, v) => {
        const row = frac(v * 10);
        const web = row > 0.15 && row < 0.45;
        const tack = web && frac(u * 12) < 0.08;
        const w = weave(u, v, 150);
        const c = mul(A, (web ? 0.82 : 1) * (tack ? 0.7 : 1) * (0.9 + 0.1 * w));
        return { c, h: (web ? 1 : 0) + w * 0.3 };
      }, false, 2);
    case 'tattered': {
      const dirt: RGB = [70, 55, 40];
      return render(S, (u, v) => {
        const n = fbm(u, v, 6, seed, 4);
        const holes = fbm(u, v, 10, seed + 7, 3);
        const w = weave(u, v, 96);
        const c = mixc(mul(A, 0.85 + 0.2 * w), dirt, Math.max(0, n - 0.45) * 1.6);
        return { c, a: holes > 0.68 ? 0 : 1, h: w + n };
      }, true, 2.5);
    }
    case 'adire':
    case 'adire_panel': {
      // Adire-style resist-dye swirls: contour lines of a domain-warped noise field.
      // c1 = cloth (indigo), c2 = line colour. The panel variant adds a dark framed border.
      const line = mixc(B, A, 0.25), deep = mul(A, 0.5);
      const F = (u: number, v: number) => {
        const wx = fbm(u, v, 3, seed + 11, 3), wy = fbm(u + 0.31, v + 0.17, 3, seed + 23, 3);
        return fbm(u + 0.6 * (wx - 0.5), v + 0.6 * (wy - 0.5), 5, seed + 5, 3) * 16;
      };
      const e = 1 / S;
      return render(S, (u, v) => {
        const f = F(u, v);
        const g = Math.hypot(F(u + e, v) - f, F(u, v + e) - f) / e || 1;
        // Distance (in UV units) to the nearest contour line: constant line width everywhere.
        const d = Math.abs(frac(f) - 0.5) / g;
        const lw = 0.0032;
        let c: RGB = d < lw ? mixc(line, [235, 245, 255], Math.max(0, 1 - d / lw) * 0.35) : d < lw * 2 ? deep : A;
        let h = d < lw ? 1 : d < lw * 2 ? -0.3 : 0;
        if (p === 'adire_panel') {
          const e = Math.min(u, 1 - u, 1 - v);
          if (e < 0.05) {
            // border: dark frame with a fine braid of light ticks
            c = e < 0.012 || e > 0.04 ? mul(A, 0.35) : frac((u + v) * 40) < 0.3 ? mixc(line, [200, 200, 200], 0.4) : mul(A, 0.5);
            h = e < 0.012 ? -0.5 : 0.4;
          }
        }
        const w = weave(u, v, 140);
        return { c: mul(c, 0.9 + 0.1 * w), h: h + w * 0.3 };
      }, false, 2.5);
    }
    case 'ankara_floral': {
      // Wax print: big open flowers (light, with fine radial lines) and leaves (c1) on a crackled light ground.
      const light: RGB = mixc(B, [255, 255, 255], 0.35), deep = mul(A, 0.7);
      return render(S, (u, v) => {
        const crack = Math.abs(fbm(u, v, 24, seed + 3, 3) - 0.5) < 0.018;
        let c: RGB = crack ? mixc(A, B, 0.45) : mixc(B, A, 0.12 + 0.12 * fbm(u, v, 16, seed + 4, 2));
        let h = 0;
        // Leaves: pointed lens shapes at random angles (each may reach into its neighbours' cells).
        const g = 5, gx = Math.floor(u * g), gy = Math.floor(v * g);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const mx = (((gx + dx) % g) + g) % g, my = (((gy + dy) % g) + g) % g;
            const lx = u * g - (gx + dx + 0.5 + 0.8 * (hash(mx, my, seed + 5) - 0.5));
            const ly = v * g - (gy + dy + 0.5 + 0.8 * (hash(mx, my, seed + 6) - 0.5));
            const ang = hash(mx, my, seed + 7) * Math.PI;
            const xr = lx * Math.cos(ang) + ly * Math.sin(ang), yr = -lx * Math.sin(ang) + ly * Math.cos(ang);
            if (Math.abs(xr) < 0.6 && Math.abs(yr) < 0.24 * (1 - (xr / 0.6) ** 2)) {
              c = Math.abs(yr) < 0.012 ? mul(A, 1.25) : mixc(A, deep, frac(xr * 5) < 0.5 ? 0.15 : 0);
              h = 0.5;
            }
          }
        const [fx, fy, fd] = cellNearest(u, v, 2, seed, 0.3, true);
        const th = Math.atan2(fy, fx);
        const petal = 0.33 * (0.72 + 0.28 * Math.abs(Math.cos(th * 4)));
        if (fd < petal) {
          const t = fd / petal;
          c = t < 0.17 ? (frac(fd * 60) < 0.5 ? deep : mixc(A, light, 0.5)) : frac((th / (2 * Math.PI)) * 96) < 0.28 && t > 0.22 ? mixc(A, light, 0.35) : mixc(light, A, Math.max(0, t - 0.5) * 0.9);
          if (t > 0.94) c = mixc(A, light, 0.3);
          h = 1;
        }
        const w = weave(u, v, 128);
        return { c: mul(c, 0.92 + 0.08 * w), h: h + w * 0.3 };
      }, false, 1.5);
    }
    case 'ankara_web': {
      // Wax print: radial "web" medallions with dark centres, on a crazy-paving ground (c1 ground, c2 lines).
      return render(S, (u, v) => {
        const [x, y, d] = cellNearest(u, v, 2, seed, 0.1, true);
        const th = Math.atan2(y, x);
        let line = false, dot = false;
        if (d < 0.46) {
          dot = d < 0.07;
          line = frac(d * 16) < 0.16 || (d > 0.08 && frac((th / (2 * Math.PI)) * 24) < 0.07);
        } else {
          const wu = u + 0.012 * Math.sin(v * Math.PI * 40), wv = v + 0.012 * Math.sin(u * Math.PI * 36);
          line = frac(wu * 20) < 0.09 || frac(wv * 20) < 0.09;
        }
        const ink = dot || line;
        const n = fbm(u, v, 16, seed + 2, 2);
        const w = weave(u, v, 128);
        return { c: mul(ink ? mixc(B, A, 0.08) : A, (0.9 + 0.12 * n) * (0.93 + 0.07 * w)), h: (ink ? 0.4 : 0) + w * 0.3 };
      }, false, 1.5);
    }
    case 'lace': {
      // Corded guipure lace: raised spirals and scrolls (cord) over a fine net, all in c1 over a slightly darker lining.
      const lining = mul(A, 0.62), cordC = mixc(A, [255, 255, 255], 0.2);
      return render(S, (u, v) => {
        const [x, y, d, hsh] = cellNearest(u, v, 4, seed, 0.7);
        const th = Math.atan2(y, x) * (hsh > 0.5 ? 1 : -1);
        let cordv = 0;
        if (d < 0.46) {
          // Archimedean spiral of cord.
          const s = frac(d * 9 - th / (2 * Math.PI));
          cordv = Math.max(0, 1 - Math.abs(s - 0.5) / 0.24);
          if (d > 0.4) cordv *= (0.46 - d) / 0.06;
        } else {
          // Scroll fill between spirals: warped contour lines.
          const f = fbm(u + 0.2 * fbm(u, v, 3, seed + 9, 2), v, 6, seed + 4, 3) * 14;
          cordv = Math.max(0, 1 - Math.abs(frac(f) - 0.5) / 0.18) * 0.9;
        }
        const net = Math.min(Math.abs(frac(u * 90 + v * 52) - 0.5), Math.abs(frac(u * 90 - v * 52) - 0.5)) < 0.12;
        const c = cordv > 0.3 ? mul(cordC, 0.85 + 0.2 * cordv) : net ? mul(A, 0.86) : lining;
        return { c, h: cordv * 1.4 + (net ? 0.25 : 0) };
      }, false, 3.5);
    }
    case 'damask': {
      // Stiff, shiny head-tie fabric (gele): tone-on-tone woven motifs with a fine diagonal twill.
      return render(S, (u, v) => {
        const [x, y, d] = cellNearest(u, v, 4, seed, 0, true);
        const th = Math.atan2(y, x);
        const motif = d < 0.4 && d > 0.12 && Math.abs(Math.cos(th * 3)) > 0.55 + d;
        const twill = frac((u + v) * 160) < 0.5 ? 1 : 0;
        const c = motif ? mixc(A, B, 0.5) : A;
        return { c: mul(c, 0.9 + 0.08 * twill), h: (motif ? 0.6 : 0) + twill * 0.2 };
      }, false, 2);
    }
    case 'pleated': {
      // Head-tie fabric pressed into fine horizontal pleats, with a soft sheen and a fine twill.
      return render(S, (u, v) => {
        const ridge = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 64);
        const twill = frac((u + v) * 180) < 0.5 ? 1 : 0;
        const n = fbm(u, v, 8, seed, 2);
        return { c: mul(mixc(A, B, 0.08 * n), 0.88 + 0.14 * ridge + 0.03 * twill), h: ridge * 1.0 + twill * 0.15 };
      }, false, 2.4);
    }
    case 'foil': {
      // Metallic foil swim fabric: satin sheen with soft crinkles (c1 base, c2 highlight); the
      // creases are mostly in the normals, so the colour stays even.
      return render(S, (u, v) => {
        const crumple = fbm(u, v, 5, seed, 4), fine = fbm(u * 2, v * 2, 20, seed + 3, 2);
        const sheen = Math.max(0, crumple - 0.55) * 1.6;
        return { c: mixc(mul(A, 0.97 + 0.05 * fine), B, Math.min(0.2, sheen * 0.3)), h: crumple * 0.8 + fine * 0.2 };
      }, false, 2.2);
    }
    case 'straw': {
      // Basket weave of flat straw strips (c1), darker gaps between them (c2).
      return render(S, (u, v) => {
        const n = 24, cu = u * n, cv = v * n;
        const iu = Math.floor(cu), iv = Math.floor(cv), fu = cu - iu, fv = cv - iv;
        // Over-under: alternate cells show the horizontal or the vertical strip on top.
        const horiz = (iu + iv) % 2 === 0;
        const across = horiz ? fv : fu, lengthwise = horiz ? fu : fv;
        const gap = Math.min(across, 1 - across) < 0.08;
        const fibre = 0.85 + 0.15 * Math.sin((horiz ? v : u) * Math.PI * 2 * n * 9 + hash(iu, iv, seed) * 6);
        const shade = 0.82 + 0.25 * Math.sin(lengthwise * Math.PI) * (0.8 + 0.2 * hash(iu, iv, seed + 1));
        return { c: gap ? B : mul(A, fibre * shade), h: gap ? 0 : 0.5 + 0.5 * Math.sin(lengthwise * Math.PI) };
      }, false, 3);
    }
    case 'denim': {
      // Indigo twill (c1) worn toward c2: diagonal twill ridges, vertical slub streaks and soft fading.
      return render(S, (u, v) => {
        const ridge = frac(u * 270 + v * 90) < 0.5 ? 1 : 0.72;
        const slub = pnoise(u, 0.5, 96, seed) * 0.7 + pnoise(u, 0.5, 192, seed + 2) * 0.3;
        const fade = Math.max(0, fbm(u, v, 3, seed + 4, 3) - 0.45) * 1.2;
        const c = mixc(A, B, Math.max(0, Math.min(0.5, fade * 0.5 + (slub - 0.5) * 0.18 + (1 - ridge) * 0.1)));
        return { c: mul(c, 0.86 + 0.18 * ridge), h: ridge * 0.8 + slub * 0.3 };
      }, false, 2.2);
    }
    case 'jersey': {
      // Cotton jersey: a very fine knit, nearly flat, with soft mottling.
      return render(S, (u, v) => {
        const knit = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 220) * Math.sin(v * Math.PI * 2 * 160);
        const n = fbm(u, v, 6, seed, 3);
        return { c: mul(A, 0.94 + 0.1 * n + 0.03 * knit), h: knit * 0.3 + n * 0.4 };
      }, false, 1.2);
    }
    case 'nappa': {
      // Smooth finished leather: an even colour with a very fine pebbled grain in the normals.
      return render(S, (u, v) => {
        const grain = fbm(u, v, 128, seed, 2), soft = fbm(u, v, 8, seed + 3, 2);
        return { c: mul(A, 0.98 + 0.03 * soft), h: grain * 0.12 + soft * 0.1 };
      }, false, 0.8);
    }
    case 'workwear': {
      // Worn cotton twill (c1) with grime (c2): faded patches, smudges, and darker grime gathered
      // in streaks, all over a fine diagonal twill.
      return render(S, (u, v) => {
        const twill = frac((u * 3 + v) * 140) < 0.5 ? 1 : 0.86;
        const fade = fbm(u, v, 4, seed + 1, 3);
        const smudge = Math.max(0, fbm(u, v, 6, seed + 5, 4) - 0.56) * 2.6;
        const streak = Math.max(0, pnoise(u * 0.3, v, 24, seed + 9) - 0.7) * 2;
        const speck = Math.max(0, fbm(u, v, 48, seed + 3, 2) - 0.72) * 2.5;
        const dirt = Math.min(0.6, smudge * 0.7 + streak * 0.45 + speck * 0.5);
        let c = mul(A, 0.86 + 0.22 * fade);
        c = mixc(c, mixc(A, [245, 230, 205], 0.3), Math.max(0, fade - 0.6) * 0.9);
        c = mixc(c, B, dirt);
        return { c: mul(c, twill), h: twill * 0.7 + fade * 0.3 };
      }, false, 2);
    }
    case 'tropical': {
      // Tropical print on a soft rayon ground (c1): broad leaves in teal and sage with a pale
      // midrib and side veins, and hibiscus flowers in c2 with a deep throat and a stamen.
      const leafCols: RGB[] = [[72, 146, 140], [128, 168, 128], [96, 158, 170], [160, 190, 150]];
      const pink = B, throat = mul(B, 0.62);
      return render(S, (u, v) => {
        let c: RGB = mul(A, 0.97 + 0.04 * fbm(u, v, 8, seed + 1, 2));
        let h = 0;
        // Leaves: two layers of lens shapes at random angles, reaching into neighbouring cells.
        for (const [g, sd, size] of [[3, 11, 0.62], [4, 23, 0.5]] as const) {
          const gx = Math.floor(u * g), gy = Math.floor(v * g);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const mx = (((gx + dx) % g) + g) % g, my = (((gy + dy) % g) + g) % g;
              if (hash(mx, my, sd + 9) < 0.15) continue;
              const lx = u * g - (gx + dx + 0.5 + 0.7 * (hash(mx, my, sd) - 0.5));
              const ly = v * g - (gy + dy + 0.5 + 0.7 * (hash(mx, my, sd + 1) - 0.5));
              const ang = hash(mx, my, sd + 2) * Math.PI * 2;
              const xr = lx * Math.cos(ang) + ly * Math.sin(ang), yr = -lx * Math.sin(ang) + ly * Math.cos(ang);
              const half = size * 0.36 * Math.sin(Math.PI * Math.min(1, Math.max(0, (xr + size) / (2 * size)))) ** 0.8;
              if (Math.abs(xr) < size && Math.abs(yr) < half) {
                const col = leafCols[Math.floor(hash(mx, my, sd + 3) * leafCols.length)];
                // Midrib, angled side veins, and a lighter edge.
                const vein = Math.abs(yr) < 0.012 || frac((xr - Math.abs(yr) * 1.4) * 9) < 0.06;
                const edge = Math.abs(yr) / half;
                c = vein ? mixc(col, A, 0.55) : mixc(mul(col, 0.88), col, edge);
                h = 0.4;
              }
            }
        }
        // Hibiscus: five rounded petals with a dark throat.
        const [fx, fy, fd, fh] = cellNearest(u, v, 3, seed + 31, 0.7, true);
        const th = Math.atan2(fy, fx) + fh * 6;
        const petal = 0.27 * (0.7 + 0.3 * Math.abs(Math.cos(th * 2.5)));
        if (fh > 0.25 && fd < petal) {
          const t = fd / petal;
          c = t < 0.28 ? mixc(throat, pink, t / 0.28) : mixc(pink, mixc(pink, [255, 255, 255], 0.35), (t - 0.28) * 0.9);
          if (frac((th / (2 * Math.PI)) * 40) < 0.1 && t > 0.3) c = mul(c, 0.93);
          h = 0.6;
        }
        // Stamen: a short spike from the centre.
        const sa = fh * 40, sxr = fx * Math.cos(sa) + fy * Math.sin(sa), syr = fy * Math.cos(sa) - fx * Math.sin(sa);
        if (fh > 0.25 && Math.abs(syr) < 0.008 && sxr > 0 && sxr < 0.17) c = [226, 196, 120];
        if (fh > 0.25 && Math.hypot(sxr - 0.17, syr) < 0.022) c = [214, 160, 70];
        const w = weave(u, v, 160);
        return { c: mul(c, 0.95 + 0.05 * w), h: h + w * 0.2 };
      }, false, 0.9);
    }
    case 'linen': {
      // Linen (c1): slubby threads (thicker and thinner runs both ways) and a soft, uneven weave.
      return render(S, (u, v) => {
        const su = pnoise(0.5, v, 128, seed) * 0.6 + pnoise(0.5, v, 256, seed + 1) * 0.4;
        const sv = pnoise(u, 0.5, 128, seed + 2) * 0.6 + pnoise(u, 0.5, 256, seed + 3) * 0.4;
        const w = weave(u, v, 110);
        const slub = (su - 0.5) * 0.02 + (sv - 0.5) * 0.015;
        const mottle = fbm(u, v, 6, seed + 4, 3) - 0.5;
        return { c: mul(mixc(A, B, Math.max(0, mottle) * 0.15), 0.97 + slub + 0.012 * w + mottle * 0.05), h: w * 0.2 + su * 0.2 + sv * 0.2 };
      }, false, 0.5);
    }
    case 'suiting': {
      // Fine worsted wool (c1): a tight twill and a faint heathered mix toward c2.
      return render(S, (u, v) => {
        const twill = frac((u * 2 + v) * 200) < 0.5 ? 1 : 0.9;
        const heather = fbm(u, v, 64, seed, 2);
        return { c: mul(mixc(A, B, (heather - 0.5) * 0.12 + 0.02), 0.93 + 0.08 * twill), h: twill * 0.5 + heather * 0.2 };
      }, false, 1);
    }
    case 'patent': {
      // Patent leather (c1): mirror smooth, with only the faintest grain.
      return render(S, (u, v) => ({ c: mul(A, 0.98 + 0.03 * fbm(u, v, 6, seed, 2)), h: fbm(u, v, 64, seed + 1, 2) * 0.03 }), false, 0.3);
    }
    case 'rib': {
      // Rib knit (necklines, cuffs): fine raised ribs across u in c1.
      return render(256, (u) => {
        const r = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 32);
        return { c: mul(A, 0.82 + 0.22 * r), h: r };
      }, false, 2.5);
    }
    case 'beadbands': {
      // Concentric bead rows along v; c1/c2 are ignored in favour of a Maasai palette.
      const pal: RGB[] = [[230, 30, 30], [245, 245, 240], [30, 80, 200], [250, 170, 20], [30, 140, 60], [245, 245, 240], [20, 20, 20]];
      return render(256, (u, v) => {
        const row = Math.floor(v * 14);
        const bu = frac(u * 64), bv = frac(v * 14);
        const bead = Math.hypot(bu - 0.5, (bv - 0.5) * 1.6);
        const c = pal[row % pal.length];
        return { c: mul(c, bead < 0.45 ? 1.05 - bead * 0.6 : 0.5), h: 1 - bead };
      }, false, 2);
    }
  }
}

/** Colour swatch strip for beads: N cells across u. */
export function palette(colors: string[]): TexOut {
  const n = colors.length;
  const px = new Uint8Array(n * 4 * 4 * 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < n * 4; x++) {
      const c = rgb(colors[Math.floor(x / 4)]);
      px.set([c[0], c[1], c[2], 255], (y * n * 4 + x) * 4);
    }
  return { color: encodePNG(n * 4, 4, px, false), alpha: false };
}

/** Feather card texture (alpha): white/black barred vane. */
export function featherTexture(c1: string, c2: string): TexOut {
  const A = rgb(c1), B = rgb(c2);
  return render(128, (u, v) => {
    const x = (u - 0.5) * 2;
    const width = Math.sin(Math.min(1, v * 1.05) * Math.PI) * 0.95 * (v < 0.15 ? v / 0.15 : 1);
    const inVane = Math.abs(x) < width;
    const shaft = Math.abs(x) < 0.04;
    const barb = 0.8 + 0.2 * Math.sin((v * 60 + Math.abs(x) * 18) * Math.PI);
    const tip = v > 0.7 ? B : A;
    return { c: shaft ? [235, 230, 220] : mul(tip, barb), a: inVane || shaft ? 1 : 0 };
  }, true);
}


/**
 * Unwrapped wash for one jeans leg (both legs share it): u runs round the leg (0.5 = front,
 * 0.75 = outer side, 0.25 = inseam, 0 / 1 = back), v from the crotch (0) down to the hem (1).
 * Indigo c1 worn toward c2 on the front of the thighs and knees, whiskers at the top, honeycomb
 * behind the knee, roped side seams with topstitching on the outer one, and a worn hem.
 */
export function jeansLegTexture(c1: string, c2: string, seed = 3): TexOut {
  const A = rgb(c1), B = rgb(c2), W = 768, H = 1280;
  const thread: RGB = [196, 146, 62];
  const bell = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
  // Whiskers: short arcs fanning from the crotch toward the hip on the front of the thigh.
  const whiskers = Array.from({ length: 6 }, (_, i) => ({ u0: 0.43 + i * 0.012, v0: 0.015 + i * 0.012, du: 0.17 - i * 0.012, dv: 0.06 + i * 0.008 }));
  return renderRect(W, H, (u, v) => {
    const x = u * W, y = v * H;
    const twill = frac((x + y) / 3) < 0.5 ? 1 : 0.8;
    const slub = pnoise(u, 0.5, 96, seed) * 0.6 + pnoise(u, v, 48, seed + 1) * 0.4;
    // Wear map 0..1.
    const front = bell(u, 0.5, 0.11), back = Math.max(bell(u, 0, 0.1), bell(u, 1, 0.1));
    let wear = front * (bell(v, 0.2, 0.15) * 0.9 + bell(v, 0.5, 0.07) * 0.75) + back * bell(v, 0.12, 0.08) * 0.3;
    wear += (fbm(u, v * 0.6, 4, seed + 7, 3) - 0.5) * 0.35;
    for (const w of whiskers) {
      // Distance to the arc from (u0, v0) bending toward the hip.
      const t = clamp01((u - w.u0) / w.du);
      const arcV = w.v0 + w.dv * t + 0.02 * Math.sin(t * Math.PI);
      const d = Math.abs(v - arcV) * H;
      if (u > w.u0 - 0.005 && u < w.u0 + w.du && d < 3.5) wear += (1 - d / 3.5) * 0.5 * Math.sin(t * Math.PI);
    }
    // Honeycomb behind the knee: short horizontal streaks.
    if (back > 0.4 && Math.abs(v - 0.52) < 0.05) wear += 0.35 * back * Math.max(0, Math.sin(v * Math.PI * 2 * 60)) * pnoise(u, v, 24, seed + 3);
    // Stack creases near the hem: lighter ridges.
    const stack = clamp01((v - 0.82) / 0.18);
    wear += stack * 0.3 * Math.max(0, Math.sin((v + 0.03 * pnoise(u, 0.5, 8, seed + 5)) * Math.PI * 2 * 40));
    // Worn hem edge.
    wear += bell(v, 0.995, 0.006) * 0.6;
    // Fade in from the top, where the legs meet the seat's plain denim.
    wear = clamp01(wear) * (0.25 + 0.75 * clamp01(v / 0.07));
    let c = mixc(mul(A, 0.93 + 0.1 * slub), B, wear * 0.75);
    let h = twill * 0.6 + slub * 0.2;
    // Side seams: a slightly darker roped ridge; a fine tan topstitch along the inseam.
    for (const su of [0.25, 0.75]) {
      const d = Math.abs(u - su) * W;
      if (d < 2) {
        c = mul(c, 0.82 + 0.15 * Math.max(0, Math.sin(y / 5)));
        h += 0.6;
      }
      if (su === 0.25 && Math.abs(d - 4) < 0.6 && frac(y / 6) < 0.55) c = mixc(c, thread, 0.7);
    }
    return { c: mul(c, twill), h };
  }, false, 2.2);
}

/**
 * Stencilled block letters (alpha mask) for print on workwear: `text` in c1, worn through in places.
 * Supports the letters the garments use (D, O, C).
 */
export function stencilText(text: string, c1: string, seed = 5): TexOut {
  const A = rgb(c1), n = text.length, W = 256 * n, H = 256;
  const inLetter = (ch: string, x: number, y: number): boolean => {
    // Letter box: x, y in 0..1 (y down); stroke width w.
    const w = 0.2;
    const ex = (x - 0.5) / 0.4, ey = (y - 0.5) / 0.42;
    const ring = (rx: number) => {
      const r = Math.hypot(ex, ey);
      return r <= 1 && r >= 1 - w / rx;
    };
    switch (ch) {
      case 'O':
        return ring(0.4);
      case 'C':
        return ring(0.4) && !(ex > 0.25 && Math.abs(ey) < 0.5);
      case 'D': {
        if (x >= 0.12 && x <= 0.12 + w * 0.8 && y >= 0.08 && y <= 0.92) return true;
        const dx = (x - 0.12) / 0.75, dy = (y - 0.5) / 0.42;
        const r = Math.hypot(dx, dy);
        return dx >= 0 && r <= 1 && r >= 1 - w / 0.75 * 0.9;
      }
      default:
        return false;
    }
  };
  return renderRect(W, H, (u, v) => {
    const k = Math.min(n - 1, Math.floor(u * n));
    const x = (u * n - k - 0.08) / 0.84;
    const on = x >= 0 && x <= 1 && inLetter(text[k], x, v);
    // Worn print: the paint is missing in small patches and cracks.
    const wear = fbm(u * n * 0.5, v, 16, seed, 3) < 0.24 || frac(fbm(u * n, v, 8, seed + 2, 2) * 9) < 0.03;
    return { c: mul(A, 0.9 + 0.2 * fbm(u, v, 32, seed + 4, 2)), a: on && !wear ? 0.92 : 0 };
  }, true);
}
