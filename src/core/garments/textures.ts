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

export interface TexOut {
  color: Uint8Array; // PNG
  normal?: Uint8Array; // PNG
  alpha: boolean;
}

/** Fill a texture from a per-pixel function returning colour, alpha (0..1) and height. */
export function render(size: number, fn: (u: number, v: number) => { c: RGB; a?: number; h?: number }, wantAlpha: boolean, normalStrength = 0): TexOut {
  const px = new Uint8Array(size * size * 4);
  const height = normalStrength ? new Float32Array(size * size) : null;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = fn((x + 0.5) / size, (y + 0.5) / size);
      const i = (y * size + x) * 4;
      px[i] = Math.max(0, Math.min(255, r.c[0]));
      px[i + 1] = Math.max(0, Math.min(255, r.c[1]));
      px[i + 2] = Math.max(0, Math.min(255, r.c[2]));
      px[i + 3] = Math.round(Math.max(0, Math.min(1, r.a ?? 1)) * 255);
      if (height) height[y * size + x] = r.h ?? 0;
    }
  let normal: Uint8Array | undefined;
  if (height) {
    const np = new Uint8Array(size * size * 4);
    const H = (x: number, y: number) => height[(((y + size) % size) * size + ((x + size) % size))];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
        const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        np[i] = (-dx / l * 0.5 + 0.5) * 255;
        np[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        np[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        np[i + 3] = 255;
      }
    normal = encodePNG(size, size, np, false);
  }
  return { color: encodePNG(size, size, px, wantAlpha), normal, alpha: wantAlpha };
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
  | 'ankara_floral' | 'ankara_web' | 'lace' | 'damask' | 'pleated';

export const PATTERNS: Pattern[] = [
  'solid', 'khaki', 'camo', 'kente', 'asooke', 'ankara', 'ankara_floral', 'ankara_web', 'adire', 'adire_panel', 'lace', 'damask', 'pleated',
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

export function makePattern(p: Pattern, c1: string, c2: string, seed = 1): TexOut {
  const A = rgb(c1), B = rgb(c2);
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

