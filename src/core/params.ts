import type { Catalog } from './assets';
import { rng } from './math';
import type { RigType } from './rig/skeletons';
import { WEAPONS, type WeaponId } from './props/weapons';
import { EARRINGS, FACIAL_HAIR, TATTOOS, type EarringId, type FacialHairId, type Metal, type TattooId } from './looks';
import { EXPRESSIONS, type ExpressionId } from './face';

export const DETAILS = ['low', 'medium', 'high'] as const;
export type Detail = (typeof DETAILS)[number];

export interface HumanParams {
  name: string;
  seed: number;
  // Macro body controls, 0..1 (MakeHuman conventions)
  gender: number; // 0 female .. 1 male
  age: number; // 0.1875 = 11y, 0.5 = 25y, 1 = 90y
  muscle: number;
  weight: number;
  height: number;
  proportions: number; // 0 uncommon .. 1 idealised
  african: number;
  asian: number;
  caucasian: number;
  breastSize: number;
  breastFirmness: number;
  /** Detail sliders: slider id -> value (-1..1 bipolar, 0..1 unipolar). */
  modifiers: Record<string, number>;
  // Appearance ('auto' / 'none' where noted)
  skin: string; // skin id or 'auto'
  skinTint: string;
  eyes: string;
  eyebrows: string; // id or 'none'
  eyelashes: string;
  /** MakeHuman hair id, a procedural style ('buzz', 'mohawk', 'cornrows', 'box_braids') or 'none'. */
  hair: string;
  hairTint: string;
  /** Colour of procedural hairstyles (buzz cut, spikes, braids). */
  hairColor: string;
  facialHair: FacialHairId;
  beardColor: string;
  /** Tattoo designs (adults 18+ only; ignored for younger characters). */
  tattoos: TattooId[];
  tattooInk: string;
  earrings: EarringId;
  earringMetal: Metal;
  /** MakeHuman outfit id, or 'none' to dress with separate pieces below. */
  outfit: string;
  /** Procedural top / bottom garment ids or 'none' (used when outfit is 'none'). 'none' top = shirtless/topless. */
  top: string;
  bottom: string;
  /**
   * Briefs under (or instead of) bottoms. Can be switched off for adult (18+)
   * characters only; under-18 characters always keep them.
   */
  underwear: boolean;
  /** Procedural accessories (garment ids). */
  accessories: string[];
  /** Per-garment pattern / colour overrides. */
  garmentStyles: Record<string, { pattern?: string; color?: string; color2?: string }>;
  /** MakeHuman shoes id, 'sandals', 'combat_boots' or 'none' (barefoot). */
  shoes: string;
  hat: string;
  outfitTint: string;
  // Output
  detail: Detail;
  // Rigging
  rig: RigType;
  /** Add jaw + eye bones (for facial animation). */
  faceBones: boolean;
  /** Bind pose: MakeHuman's natural A-pose, or a T-pose (Mixamo / Unity Humanoid style). */
  restPose: 'A' | 'T';
  /** Include the animation clips in GLB / FBX exports. */
  animations: boolean;
  /** Weapon held in the right hand (attached to the WeaponR socket). */
  weapon: WeaponId;
  /** A vehicle prop shown with its riding clip (preview only for now). */
  vehicle: 'none' | 'bicycle';
  /** Resting facial expression (applied in the viewer and in every exported clip). */
  expression: ExpressionId;
  /** Export facial blend shapes (expressions, blinking). Off: the expression is baked into the mesh. */
  faceShapes: boolean;
  /** With faceShapes: also export the speech mouth shapes (visemes) for lip-sync. */
  speechShapes: boolean;
  /** Teeth variant id or 'none'; the tongue sits behind them. */
  teeth: string;
  tongue: boolean;
}

export const DEFAULT_PARAMS: HumanParams = {
  name: 'character',
  seed: 1,
  gender: 1,
  age: 0.5,
  muscle: 0.6,
  weight: 0.5,
  height: 0.5,
  proportions: 0.7,
  african: 0.1,
  asian: 0.1,
  caucasian: 0.8,
  breastSize: 0.5,
  breastFirmness: 0.5,
  modifiers: {},
  skin: 'auto',
  skinTint: '#ffffff',
  eyes: 'brownlight',
  eyebrows: 'eyebrow001',
  eyelashes: 'eyelashes01',
  hair: 'short02',
  hairTint: '#ffffff',
  hairColor: '#2a1e16',
  facialHair: 'none',
  beardColor: '#241a13',
  tattoos: [],
  tattooInk: '#1c2128',
  earrings: 'none',
  earringMetal: 'gold',
  outfit: 'male_casualsuit01',
  top: 'none',
  bottom: 'none',
  underwear: true,
  accessories: [],
  garmentStyles: {},
  shoes: 'shoes01',
  hat: 'none',
  outfitTint: '#ffffff',
  detail: 'medium',
  rig: 'game',
  faceBones: true,
  restPose: 'A',
  animations: true,
  weapon: 'none',
  vehicle: 'none',
  expression: 'neutral',
  faceShapes: true,
  speechShapes: true,
  teeth: 'teeth_base',
  tongue: true,
};

/** MakeHuman age value <-> years. */
export function ageToYears(a: number): number {
  if (a < 0.1875) return 1 + (a / 0.1875) * 10;
  if (a < 0.5) return 11 + ((a - 0.1875) / 0.3125) * 14;
  return 25 + ((a - 0.5) / 0.5) * 65;
}
export function yearsToAge(y: number): number {
  if (y < 11) return ((y - 1) / 10) * 0.1875;
  if (y < 25) return 0.1875 + ((y - 11) / 14) * 0.3125;
  return 0.5 + ((y - 25) / 65) * 0.5;
}

export const PRESETS: Record<string, Partial<HumanParams>> = {
  'Athletic man': {},
  'Athletic woman': {
    gender: 0, muscle: 0.6, weight: 0.45, height: 0.55, african: 0.15, asian: 0.15, caucasian: 0.7, breastSize: 0.55, hair: 'ponytail01',
    outfit: 'female_sportsuit01', shoes: 'shoes03', eyebrows: 'eyebrow010', eyelashes: 'eyelashes02', eyes: 'green',
  },
  'Businesswoman': {
    eyes: 'blackbrown',
    gender: 0, age: 0.6, muscle: 0.45, weight: 0.5, height: 0.6, hair: 'bob02', outfit: 'female_elegantsuit01',
    shoes: 'shoes02', eyebrows: 'eyebrow011', eyelashes: 'eyelashes03', african: 0.8, asian: 0.1, caucasian: 0.1,
  },
  'Heavy brute': {
    eyes: 'blackbrown',
    gender: 1, age: 0.62, muscle: 0.95, weight: 0.85, height: 0.72, proportions: 0.4, african: 0.85, asian: 0.05, caucasian: 0.1, hair: 'none',
    outfit: 'male_worksuit01', shoes: 'shoes04', eyebrows: 'eyebrow003', facialHair: 'full_beard', beardColor: '#16110d',
    modifiers: { 'head/head-fat': 0.4, 'chin/chin-width': 0.5, 'neck/neck-scale-horiz': 0.5, 'chin/chin-prominent': 0.4 },
  },
  Elder: {
    gender: 1, age: 0.95, muscle: 0.35, weight: 0.55, height: 0.4, hair: 'short04', outfit: 'male_elegantsuit01',
    shoes: 'shoes02', hat: 'fedora01', eyebrows: 'eyebrow006', african: 0.1, asian: 0.1, caucasian: 0.8,
    facialHair: 'mustache', beardColor: '#b9b2a8',
  },
  Teen: {
    gender: 0.1, age: 0.42, muscle: 0.45, weight: 0.4, height: 0.5, hair: 'long01', outfit: 'female_casualsuit02',
    shoes: 'shoes03', eyes: 'lightblue', african: 0.05, asian: 0.75, caucasian: 0.2,
  },
  'The Adventurer': {
    gender: 0, age: 0.52, muscle: 0.65, weight: 0.38, height: 0.58, proportions: 0.85, breastSize: 0.55,
    african: 0.05, asian: 0.05, caucasian: 0.9, hair: 'braid01', eyes: 'brownlight', eyebrows: 'eyebrow010', eyelashes: 'eyelashes02',
    outfit: 'none', top: 'tank_top', bottom: 'cargo_shorts', shoes: 'combat_boots', accessories: ['utility_belt'],
    garmentStyles: { tank_top: { pattern: 'solid', color: '#3b6f73' }, cargo_shorts: { pattern: 'khaki', color: '#8f7a55' } },
  },
  'The Secret Agent': {
    gender: 1, age: 0.6, muscle: 0.62, weight: 0.45, height: 0.5, proportions: 0.9,
    african: 0.05, asian: 0.05, caucasian: 0.9, hair: 'short04', eyes: 'lightblue', eyebrows: 'eyebrow007',
    outfit: 'male_elegantsuit01', shoes: 'shoes02', accessories: ['watch'],
  },
  'The Soldier': {
    gender: 1, age: 0.55, muscle: 0.8, weight: 0.55, height: 0.5, african: 0.3, asian: 0.1, caucasian: 0.6,
    hair: 'buzz', facialHair: 'stubble', eyebrows: 'eyebrow003', outfit: 'none', top: 'fatigue_shirt', bottom: 'fatigue_pants',
    shoes: 'combat_boots', accessories: ['tactical_vest', 'helmet', 'belt'],
  },
  'The Cyberpunk Hacker': {
    gender: 0.15, age: 0.45, muscle: 0.45, weight: 0.35, height: 0.5, african: 0.05, asian: 0.85, caucasian: 0.1,
    hair: 'bob02', hairTint: '#d080ff', eyes: 'ice', eyebrows: 'eyebrow012', eyelashes: 'eyelashes03',
    outfit: 'none', top: 'techwear_jacket', bottom: 'techwear_pants', shoes: 'combat_boots', accessories: ['visor', 'neon_accents'],
    earrings: 'studs', earringMetal: 'silver',
  },
  'The Wasteland Survivor': {
    gender: 0.9, age: 0.62, muscle: 0.75, weight: 0.4, height: 0.5, proportions: 0.45, african: 0.15, asian: 0.1, caucasian: 0.75,
    hair: 'mohawk', facialHair: 'short_beard', tattoos: ['sleeve_r'], earrings: 'small_hoops', earringMetal: 'silver',
    eyebrows: 'eyebrow005', outfit: 'none', top: 'tattered_shirt', bottom: 'tattered_pants', shoes: 'combat_boots',
    accessories: ['leather_armor', 'goggles', 'arm_wraps', 'belt', 'crossed_straps'],
    modifiers: { 'chin/chin-prominent': 0.3, 'head/head-square': 0.3 },
  },
  'The African Warrior': {
    eyes: 'blackbrown',
    gender: 1, age: 0.55, muscle: 1, weight: 0.55, height: 0.55, proportions: 1, african: 1, asian: 0, caucasian: 0,
    hair: 'none', eyebrows: 'eyebrow003', outfit: 'none', top: 'none', bottom: 'loincloth', underwear: false, shoes: 'none',
    accessories: [],
    garmentStyles: { loincloth: { pattern: 'adire', color: '#13234f', color2: '#3b9cff' } },
    modifiers: {
      // Balanced torso (not too triangular), big defined limbs.
      'torso/torso-vshape': 0.15, 'torso/torso-muscle-dorsi': 0.2, 'torso/torso-muscle-pectoral': 0.45, 'neck/neck-scale-horiz': 0.3,
      'armslegs/upperarm-muscle': 0.9, 'armslegs/lowerarm-muscle': 0.8, 'armslegs/upperarm-scale-horiz': 0.35, 'armslegs/upperarm-scale-depth': 0.35,
      'armslegs/lowerarm-scale-horiz': 0.2, 'armslegs/upperleg-muscle': 0.9, 'armslegs/lowerleg-muscle': 0.85,
      'armslegs/upperleg-scale-depth': 0.1, 'armslegs/lowerleg-scale-horiz': 0.15, 'hip/hip-scale-horiz': -0.35,
    },
  },
  'The Yoruba Warrior': {
    eyes: 'blackbrown',
    gender: 1, age: 0.55, muscle: 0.75, weight: 0.5, height: 0.48, african: 1, asian: 0, caucasian: 0,
    hair: 'none', eyebrows: 'eyebrow003', outfit: 'none', top: 'long_tunic', bottom: 'trousers', shoes: 'sandals',
    tattoos: ['face_marks'], facialHair: 'short_beard', beardColor: '#120e0b', tattooInk: '#1a1210',
    accessories: ['crossed_straps', 'cowrie_necklace', 'cowrie_armbands', 'amulets', 'fila_cap'],
    garmentStyles: {
      long_tunic: { pattern: 'asooke', color: '#4b1d3f', color2: '#d9b25f' },
      trousers: { pattern: 'asooke', color: '#4b1d3f', color2: '#d9b25f' },
      fila_cap: { pattern: 'asooke', color: '#4b1d3f', color2: '#d9b25f' },
    },
  },
  'The Maasai Warrior': {
    eyes: 'blackbrown',
    gender: 1, age: 0.45, muscle: 0.6, weight: 0.3, height: 0.6, proportions: 0.8, african: 1, asian: 0, caucasian: 0,
    hair: 'none', eyebrows: 'eyebrow001', outfit: 'none', top: 'none', bottom: 'wrapper_knee', shoes: 'sandals',
    accessories: ['shoulder_drape', 'bead_collar', 'bead_armbands', 'bead_headband'],
    garmentStyles: { wrapper_knee: { pattern: 'shuka', color: '#c81e1e', color2: '#1a2a6a' }, shoulder_drape: { pattern: 'shuka', color: '#c81e1e', color2: '#1a2a6a' } },
  },
  'The Zulu Warrior': {
    eyes: 'blackbrown',
    gender: 1, age: 0.5, muscle: 0.9, weight: 0.5, height: 0.5, african: 1, asian: 0, caucasian: 0,
    hair: 'none', eyebrows: 'eyebrow003', outfit: 'none', top: 'none', bottom: 'hide_aprons', shoes: 'none',
    accessories: ['fur_bands', 'feather_headband', 'bead_necklace'],
    garmentStyles: { hide_aprons: { pattern: 'hide', color: '#5a3a22', color2: '#1a1410' }, feather_headband: { pattern: 'leopard' } },
  },
  'The Dahomey Warrior': {
    gender: 0, age: 0.5, muscle: 0.8, weight: 0.42, height: 0.5, proportions: 0.85, breastSize: 0.45, african: 1, asian: 0, caucasian: 0,
    hair: 'cornrows', hairColor: '#17120f', earrings: 'small_hoops', eyes: 'blackbrown', eyebrows: 'eyebrow011', eyelashes: 'eyelashes02', outfit: 'none',
    top: 'tunic', bottom: 'wrapper_knee', shoes: 'sandals', accessories: ['waist_sash', 'amulet_bandolier', 'arm_guards', 'amulets'],
    garmentStyles: {
      tunic: { pattern: 'asooke', color: '#1f2f5c', color2: '#c9a24a' },
      wrapper_knee: { pattern: 'kente', color: '#1d6b3a', color2: '#a61b1b' },
      waist_sash: { pattern: 'solid', color: '#9b1c1c' },
    },
  },
  // Nigeria Police Force, general duty: all-black uniform (black shirt and trousers), black boots and duty belt.
  'The Police Officer (Nigeria)': {
    eyes: 'blackbrown',
    gender: 1, age: 0.56, muscle: 0.62, weight: 0.55, height: 0.52, african: 1, asian: 0, caucasian: 0,
    hair: 'buzz', facialHair: 'stubble', eyebrows: 'eyebrow003', outfit: 'none',
    top: 'uniform_shirt', bottom: 'uniform_trousers', shoes: 'combat_boots', accessories: ['beret', 'utility_belt'],
    garmentStyles: {
      uniform_shirt: { pattern: 'solid', color: '#141519', color2: '#24262c' },
      uniform_shirt_long: { pattern: 'solid', color: '#141519', color2: '#24262c' },
      uniform_trousers: { pattern: 'solid', color: '#141519' },
      beret: { pattern: 'solid', color: '#141519', color2: '#c9ccd2' },
      utility_belt: { pattern: 'leather', color: '#111111' },
    },
  },
  // FRSC marshal, No. 5b dress (FRSC dress code, 2025 compendium): beige short-sleeve shirt tucked into
  // black trousers, service belt, black boots; maroon beret with cap badge and maroon epaulettes.
  'The FRSC Officer (Nigeria)': {
    eyes: 'blackbrown',
    gender: 1, age: 0.52, muscle: 0.55, weight: 0.5, height: 0.55, african: 1, asian: 0, caucasian: 0,
    hair: 'buzz', eyebrows: 'eyebrow001', outfit: 'none',
    top: 'uniform_shirt', bottom: 'uniform_trousers', shoes: 'combat_boots', accessories: ['beret', 'belt'],
    garmentStyles: {
      uniform_shirt: { pattern: 'solid', color: '#c9b48c', color2: '#6a1b2a' },
      uniform_shirt_long: { pattern: 'solid', color: '#c9b48c', color2: '#6a1b2a' },
      uniform_trousers: { pattern: 'solid', color: '#141519' },
      beret: { pattern: 'solid', color: '#6a1b2a', color2: '#d4a845' },
      belt: { pattern: 'leather', color: '#111111' },
      reflective_vest: { pattern: 'solid', color: '#c6e82a', color2: '#d9dee4' },
    },
  },
  Detective: {
    gender: 0.95, age: 0.65, muscle: 0.55, weight: 0.5, height: 0.55, african: 0.2, asian: 0.6, caucasian: 0.2, hair: 'short01', outfit: 'male_casualsuit05',
    hat: 'fedora_cocked', shoes: 'shoes06', eyes: 'grey', eyebrows: 'eyebrow007', facialHair: 'stubble', beardColor: '#1a1410',
  },
};

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

/** Random but plausible human. Keeps output settings from `base`. */
export function randomParams(seed: number, cat: Catalog, base: HumanParams = DEFAULT_PARAMS): HumanParams {
  const r = rng(seed);
  const range = (lo: number, hi: number) => lo + (hi - lo) * r();
  const bell = (s: number) => (r() + r() + r() - 1.5) * s; // ~normal, mean 0
  const female = r() < 0.5;
  const ids = (items: { id: string; tags: string[] }[], tag?: string) =>
    items.filter((i) => !tag || i.tags.some((t) => t.toLowerCase() === tag) || !i.tags.some((t) => /^(male|female)$/i.test(t))).map((i) => i.id);
  const FEMALE_HAIR = ['bob01', 'bob02', 'braid01', 'long01', 'ponytail01', 'afro01', 'short02'];
  const MALE_HAIR = ['short01', 'short02', 'short03', 'short04', 'afro01', 'none', 'buzz', 'cornrows', 'box_braids'];
  const NATURAL = ['#15100c', '#241a13', '#3b2a1d', '#5a3e27', '#7a5a38', '#a8875c'];
  const FACIAL: HumanParams['facialHair'][] = ['none', 'none', 'none', 'stubble', 'stubble', 'mustache', 'goatee', 'short_beard', 'full_beard'];
  const TATTOO_POOL: HumanParams['tattoos'][number][] = ['armband_l', 'sleeve_r', 'forearm_l', 'chest', 'back'];
  // Ethnic mix: usually dominated by one group.
  const mix = [r() ** 3, r() ** 3, r() ** 3];
  mix[Math.floor(r() * 3)] += 1;
  const sum = mix[0] + mix[1] + mix[2];

  const modifiers: Record<string, number> = {};
  const sliders = cat.sliders.filter((g) => /face|head|nose|mouth|eye|ear|chin|cheek|forehead/i.test(g.category + g.group)).flatMap((g) => g.sliders);
  for (let i = 0; i < 18 && sliders.length; i++) {
    const s = pick(r, sliders);
    modifiers[s.id] = s.bipolar ? Math.max(-1, Math.min(1, bell(0.55))) : range(0, 0.5);
  }
  const outfits = ids(cat.outfits, female ? 'female' : 'male');
  return {
    ...base,
    seed,
    gender: female ? range(0, 0.15) : range(0.85, 1),
    age: yearsToAge(range(18, 70)),
    muscle: range(0.3, 0.9),
    weight: range(0.3, 0.8),
    height: range(0.3, 0.8),
    proportions: range(0.4, 0.9),
    african: mix[0] / sum,
    asian: mix[1] / sum,
    caucasian: mix[2] / sum,
    breastSize: range(0.3, 0.8),
    breastFirmness: range(0.3, 0.8),
    modifiers,
    skin: 'auto',
    skinTint: '#ffffff',
    eyes: eyesFor(r(), mix[0] / sum, mix[1] / sum, cat.eyes),
    eyebrows: pick(r, cat.eyebrows).id,
    eyelashes: pick(r, cat.eyelashes).id,
    hair: pick(r, female ? FEMALE_HAIR : MALE_HAIR),
    hairTint: '#ffffff',
    hairColor: pick(r, NATURAL),
    facialHair: female ? 'none' : pick(r, FACIAL),
    beardColor: pick(r, NATURAL),
    tattoos: r() < 0.2 ? [pick(r, TATTOO_POOL)] : [],
    earrings: r() < (female ? 0.5 : 0.12) ? pick(r, ['studs', 'small_hoops', 'big_hoops'] as const) : 'none',
    earringMetal: r() < 0.6 ? 'gold' : 'silver',
    outfit: outfits.length ? pick(r, outfits) : 'none',
    shoes: pick(r, cat.shoes).id,
    hat: r() < 0.15 && cat.hats.length ? pick(r, cat.hats).id : 'none',
    outfitTint: '#ffffff',
  };
}

/**
 * Make untrusted params (e.g. from a shared link) safe to build: unknown keys are dropped,
 * numbers are clamped, and enumerated options fall back to their defaults.
 */
export function sanitizeParams(raw: unknown, base: HumanParams = DEFAULT_PARAMS): HumanParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: HumanParams = { ...base };
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const str = (v: unknown, d: string, max = 80) => (typeof v === 'string' && v.length <= max ? v : d);
  const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
  for (const k of ['gender', 'muscle', 'weight', 'height', 'proportions', 'african', 'asian', 'caucasian', 'breastSize', 'breastFirmness'] as const)
    out[k] = num(src[k], 0, 1, base[k]);
  // Same range as the app's age slider (12-90 years).
  out.age = num(src.age, yearsToAge(12), 1, base.age);
  out.seed = Math.round(num(src.seed, 0, 1e9, base.seed));
  for (const k of ['name', 'skin', 'eyes', 'eyebrows', 'eyelashes', 'hair', 'outfit', 'top', 'bottom', 'shoes', 'hat'] as const) out[k] = str(src[k], base[k]);
  for (const k of ['skinTint', 'hairTint', 'outfitTint', 'hairColor', 'beardColor', 'tattooInk'] as const) out[k] = color(src[k], base[k]);
  if (typeof src.underwear === 'boolean') out.underwear = src.underwear;
  if (typeof src.faceBones === 'boolean') out.faceBones = src.faceBones;
  if (typeof src.animations === 'boolean') out.animations = src.animations;
  if (typeof src.faceShapes === 'boolean') out.faceShapes = src.faceShapes;
  if (typeof src.speechShapes === 'boolean') out.speechShapes = src.speechShapes;
  if (typeof src.tongue === 'boolean') out.tongue = src.tongue;
  out.teeth = str(src.teeth, base.teeth, 40);
  out.expression = oneOf(src.expression, EXPRESSIONS, base.expression);
  out.detail = oneOf(src.detail, DETAILS, base.detail);
  out.rig = oneOf(src.rig, ['game', 'game_lite', 'full', 'none'] as const, base.rig);
  out.restPose = oneOf(src.restPose, ['A', 'T'] as const, base.restPose);
  out.weapon = oneOf(src.weapon, WEAPONS, base.weapon);
  out.vehicle = oneOf(src.vehicle, ['none', 'bicycle'] as const, base.vehicle);
  out.facialHair = oneOf(src.facialHair, FACIAL_HAIR, base.facialHair);
  out.earrings = oneOf(src.earrings, EARRINGS, base.earrings);
  out.earringMetal = oneOf(src.earringMetal, ['gold', 'silver'] as const, base.earringMetal);
  out.tattoos = Array.isArray(src.tattoos) ? [...new Set(src.tattoos.filter((t): t is TattooId => TATTOOS.includes(t as TattooId)))] : base.tattoos;
  out.accessories = Array.isArray(src.accessories) ? src.accessories.filter((a): a is string => typeof a === 'string' && a.length <= 40).slice(0, 40) : base.accessories;
  const mods: Record<string, number> = {};
  if (src.modifiers && typeof src.modifiers === 'object')
    for (const [k, v] of Object.entries(src.modifiers as Record<string, unknown>).slice(0, 400)) if (k.length <= 80) mods[k] = num(v, -1, 1, 0);
  out.modifiers = mods;
  const styles: HumanParams['garmentStyles'] = {};
  if (src.garmentStyles && typeof src.garmentStyles === 'object')
    for (const [k, v] of Object.entries(src.garmentStyles as Record<string, unknown>).slice(0, 60)) {
      if (k.length > 40 || !v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      styles[k] = {
        ...(typeof o.pattern === 'string' && o.pattern.length <= 30 ? { pattern: o.pattern } : {}),
        ...(typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? { color: o.color } : {}),
        ...(typeof o.color2 === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color2) ? { color2: o.color2 } : {}),
      };
    }
  out.garmentStyles = styles;
  return out;
}

/**
 * Eye colour to suit the ethnicity mix: mostly black-brown, dark brown or brown for African and Asian
 * characters, any colour for Caucasian ones. `x` is one random number in 0..1.
 */
function eyesFor(x: number, african: number, asian: number, eyes: { id: string }[]): string {
  const has = (id: string) => eyes.some((e) => e.id === id);
  const dark = african * 0.95 + asian * 0.85 + (1 - african - asian) * 0.25;
  if (x < dark) {
    const u = x / dark;
    const id = u < 0.25 ? 'blackbrown' : u < 0.65 ? 'darkbrown' : 'brown';
    return has(id) ? id : has('brown') ? 'brown' : eyes[0].id;
  }
  return eyes[Math.min(eyes.length - 1, Math.floor(((x - dark) / (1 - dark)) * eyes.length))].id;
}
