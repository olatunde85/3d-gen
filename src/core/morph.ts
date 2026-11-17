/**
 * MakeHuman-style morphing: macro parameters (gender, age, muscle, weight,
 * height, proportions, ethnicity, breast) blend between a lattice of targets;
 * detail sliders add individual targets on top.
 */
import type { AssetLibrary, Slider } from './assets';
import type { HumanParams } from './params';

type W = [string, number][];

function genderW(g: number): W {
  return [['female', 1 - g], ['male', g]];
}

function ageW(a: number): W {
  if (a < 0.5) {
    const young = Math.max(0, (a - 0.1875) * 3.2);
    const child = Math.max(0, Math.min(1, 5.333 * a) - young);
    const baby = Math.max(0, 1 - a * 5.333);
    return [['baby', baby], ['child', child], ['young', young]];
  }
  const old = Math.max(0, a * 2 - 1);
  return [['young', 1 - old], ['old', old]];
}

/** Three-way min/average/max split of a 0..1 value. */
function tri(v: number, lo: string, mid: string, hi: string): W {
  return v < 0.5
    ? [[lo, 1 - v * 2], [mid, v * 2]]
    : [[mid, 2 - v * 2], [hi, v * 2 - 1]];
}

/** Target name -> weight for the given parameters. */
export function targetWeights(p: HumanParams, sliders: Map<string, Slider>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (name: string, w: number) => {
    if (Math.abs(w) > 1e-5) out.set(name, (out.get(name) ?? 0) + w);
  };
  const G = genderW(p.gender), A = ageW(p.age);
  const M = tri(p.muscle, 'minmuscle', 'averagemuscle', 'maxmuscle');
  const Wt = tri(p.weight, 'minweight', 'averageweight', 'maxweight');
  const rs = p.african + p.asian + p.caucasian;
  const R: W = rs > 0
    ? [['african', p.african / rs], ['asian', p.asian / rs], ['caucasian', p.caucasian / rs]]
    : [['african', 1 / 3], ['asian', 1 / 3], ['caucasian', 1 / 3]];
  const hv = p.height * 2 - 1;
  const pv = p.proportions * 2 - 1;
  const cup = tri(p.breastSize, 'mincup', 'averagecup', 'maxcup');
  const firm = tri(p.breastFirmness, 'minfirmness', 'averagefirmness', 'maxfirmness');

  for (const [g, gw] of G) {
    for (const [a, aw] of A) {
      if (gw * aw < 1e-5) continue;
      for (const [r, rw] of R) add(`macrodetails/${r}-${g}-${a}`, rw * gw * aw);
      for (const [m, mw] of M)
        for (const [w, ww] of Wt) {
          const k = gw * aw * mw * ww;
          if (k < 1e-5) continue;
          add(`macrodetails/universal-${g}-${a}-${m}-${w}`, k);
          if (hv) add(`macrodetails/height/${g}-${a}-${m}-${w}-${hv < 0 ? 'minheight' : 'maxheight'}`, k * Math.abs(hv));
          if (pv) add(`macrodetails/proportions/${g}-${a}-${m}-${w}-${pv < 0 ? 'uncommonproportions' : 'idealproportions'}`, k * Math.abs(pv));
          if (g === 'female')
            for (const [c, cw] of cup)
              for (const [f, fw] of firm)
                if (!(c === 'averagecup' && f === 'averagefirmness'))
                  add(`breast/${g}-${a}-${m}-${w}-${c}-${f}`, k * cw * fw);
        }
    }
  }

  for (const [id, v] of Object.entries(p.modifiers)) {
    const s = sliders.get(id);
    if (!s || !v) continue;
    for (const [lo, hi] of s.targets) {
      if (v < 0 && lo) add(lo, -v);
      else if (v > 0 && hi) add(hi, v);
    }
  }
  return out;
}

/** Morphed copy of all base-mesh coordinates (decimetres, MakeHuman space). */
export function applyTargets(lib: AssetLibrary, weights: Map<string, number>): Float32Array {
  const coords = Float32Array.from(lib.base.arrays.positions as Float32Array);
  const { idx, dx, dy, dz } = lib.targets.arrays as Record<string, Uint16Array & Int16Array>;
  const table = lib.targets.meta.targets;
  for (const [name, w] of weights) {
    const t = table[name];
    if (!t) {
      // A target that the web copy has but nobody loaded would silently change the body: say so instead.
      if (lib.targetFiles?.[name]) throw Error(`The body shape "${name}" isn't loaded: call loadTargets() first.`);
      continue; // e.g. baby targets are not shipped
    }
    const [off, n, scale] = t;
    const k = w * scale;
    let v = 0;
    for (let i = off; i < off + n; i++) {
      v += idx[i];
      const o = v * 3;
      coords[o] += dx[i] * k;
      coords[o + 1] += dy[i] * k;
      coords[o + 2] += dz[i] * k;
    }
  }
  return coords;
}

/**
 * Every target that building this character can use: its body shape, plus the face's expression units (the face
 * shapes blend them by ethnicity). Load them before building when the data loads on demand (AssetLibrary.loadTargets).
 */
export function neededTargets(lib: AssetLibrary, p: HumanParams): string[] {
  const sliders = new Map(lib.catalog.sliders.flatMap((g) => g.sliders.map((s) => [s.id, s] as const)));
  const names = new Set(targetWeights(p, sliders).keys());
  for (const name of Object.keys(lib.targetFiles ?? lib.targets.meta.targets)) if (name.startsWith('expression/units/')) names.add(name);
  return [...names];
}
