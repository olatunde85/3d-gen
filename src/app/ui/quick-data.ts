/**
 * Quick build: the choices it offers and how each maps onto the character's settings. Pure data
 * and functions (no DOM): every choice can be read back from any character (a preset, a shared
 * link, edits in Detailed), so the Quick build always shows where the character stands.
 */
import type { Catalog } from '../../core/assets';
import { garmentById, setById, sharedPieces } from '../../core/garments';
import { EARRINGS, EARRING_LABELS, FACIAL_HAIR, FACIAL_HAIR_LABELS, TATTOOS, TATTOO_LABELS, isProceduralHair, type EarringId, type FacialHairId, type TattooId } from '../../core/looks';
import { EXPRESSIONS, EXPRESSION_LABELS, type ExpressionId } from '../../core/face';
import { ageToYears, DEFAULT_PARAMS, PRESETS, type HumanParams } from '../../core/params';
import { CARRIED, CARRY_LABELS, type CarryId } from '../../core/props/carry';
import { WEAPONS, WEAPON_LABELS, type WeaponId } from '../../core/props/weapons';
import {VEHICLE_IDS,VEHICLE_LABELS,VEHICLE_CLIP,RIDING_VEHICLES,vehicleFor,vehicleStyleForChoice,type VehicleId} from '../../core/props/vehicles';
import {VEHICLE_TRANSITIONS,ridingClip} from '../../core/props/vehicle-actions';

export type Patch = Partial<HumanParams>;
export type Gender = 'man' | 'woman';

/** An option: its id and label, and when it can't be picked, why (shown when tapped). */
export interface Option {
  id: string;
  label: string;
  /** Small picture (URL relative to the site root). */
  thumb?: string;
  /** A colour swatch instead of text. */
  swatch?: string;
  /** Why it can't be picked right now, with what to do instead. */
  blocked?: string;
}

export const genderOf = (p: HumanParams): Gender => (p.gender >= 0.5 ? 'man' : 'woman');
export const isMinor = (p: HumanParams) => ageToYears(p.age) < 18;
const nearest = <T,>(items: readonly T[], dist: (t: T) => number): T => items.reduce((a, b) => (dist(b) < dist(a) ? b : a));

// --- Body ----------------------------------------------------------------------------------

export const GENDERS: Option[] = [{ id: 'woman', label: 'Woman' }, { id: 'man', label: 'Man' }];

export const AGES = [
  { id: 'teen', label: 'Teen', years: 16 },
  { id: 'young', label: 'Young adult', years: 24 },
  { id: 'adult', label: 'Adult', years: 35 },
  { id: 'middle', label: 'Middle-aged', years: 52 },
  { id: 'elder', label: 'Elder', years: 72 },
] as const;
export const ageOf = (p: HumanParams) => nearest(AGES, (a) => Math.abs(a.years - ageToYears(p.age))).id;

export const BUILDS = [
  { id: 'slim', label: 'Slim', adj: 'slim', muscle: 0.35, weight: 0.3 },
  { id: 'average', label: 'Average', adj: '', muscle: 0.5, weight: 0.5 },
  { id: 'athletic', label: 'Athletic', adj: 'athletic', muscle: 0.7, weight: 0.4 },
  { id: 'muscular', label: 'Muscular', adj: 'muscular', muscle: 0.95, weight: 0.55 },
  { id: 'heavy', label: 'Heavy', adj: 'heavy-set', muscle: 0.55, weight: 0.88 },
] as const;
export const buildOf = (p: HumanParams) => nearest(BUILDS, (b) => Math.hypot(b.muscle - p.muscle, b.weight - p.weight)).id;

export const HEIGHTS = [
  { id: 'short', label: 'Short', height: 0.25 },
  { id: 'average', label: 'Average', height: 0.5 },
  { id: 'tall', label: 'Tall', height: 0.78 },
] as const;
export const heightOf = (p: HumanParams) => nearest(HEIGHTS, (h) => Math.abs(h.height - p.height)).id;

// --- Heritage -------------------------------------------------------------------------------

export const HERITAGES = [
  { id: 'african', label: 'African', adj: 'African', mix: [1, 0, 0], eyes: 'blackbrown' },
  { id: 'asian', label: 'Asian', adj: 'Asian', mix: [0, 1, 0], eyes: 'darkbrown' },
  { id: 'caucasian', label: 'Caucasian', adj: 'Caucasian', mix: [0, 0, 1], eyes: 'brownlight' },
  { id: 'mixed', label: 'Mixed', adj: 'mixed-heritage', mix: [0.34, 0.33, 0.33], eyes: 'brown' },
] as const;
export function heritageOf(p: HumanParams) {
  const m = [p.african, p.asian, p.caucasian], s = m[0] + m[1] + m[2] || 1, top = Math.max(...m) / s;
  return top >= 0.7 ? HERITAGES[m.indexOf(Math.max(...m))].id : 'mixed';
}

// --- Outfit styles --------------------------------------------------------------------------

/** What a style dresses the character in (its clothing settings). */
export type Look = Pick<Patch, 'outfit' | 'top' | 'jacket' | 'bottom' | 'underwear' | 'shoes' | 'hat' | 'accessories' | 'garmentStyles' | 'carry'>;
const CLOTHING: (keyof Look)[] = ['outfit', 'top', 'jacket', 'bottom', 'underwear', 'shoes', 'hat', 'accessories', 'garmentStyles', 'carry'];
/** A complete look: clothing keys not given take their plain defaults (nothing left over from the last style). */
const full = (l: Look): Look => ({ outfit: 'none', top: 'none', jacket: 'none', bottom: 'none', underwear: true, shoes: 'none', hat: 'none', accessories: [], garmentStyles: {}, carry: 'none', ...l });
const fromPreset = (name: string): Look => full(Object.fromEntries(CLOTHING.filter((k) => k in PRESETS[name]).map((k) => [k, PRESETS[name][k]])) as Look);
const fromSet = (id: string): Look => {
  const s = setById.get(id)!;
  return full({ outfit: id, shoes: s.shoes ?? 'none', hat: s.hat ?? 'none', accessories: [...s.accessories], carry: s.carry ?? 'none' });
};
const outfit = (id: string, shoes: string): Look => full({ outfit: id, shoes });

export interface Style {
  id: string;
  label: string;
  /** How the summary says it: "in a business suit". */
  phrase: string;
  group: string;
  man?: Look;
  woman?: Look;
  /** For one gender only: the style to switch to for the other. */
  alt?: string;
  /** Adults (18+) only. */
  adult?: boolean;
}

export const STYLE_GROUPS = ['Everyday', 'Work & formal', 'Uniforms & action', 'Bridal & evening', 'Traditional', 'Warriors', 'Beach'] as const;
const both = (l: Look) => ({ man: l, woman: l });

export const STYLES: Style[] = [
  { id: 'casual', label: 'Casual', phrase: 'in casual clothes', group: 'Everyday', man: outfit('male_casualsuit01', 'shoes01'), woman: outfit('female_casualsuit01', 'shoes03') },
  { id: 'tee', label: 'T-shirt & jeans', phrase: 'in a T-shirt and jeans', group: 'Everyday', man: outfit('male_casualsuit06', 'shoes03'), woman: outfit('female_casualsuit02', 'shoes03') },
  { id: 'street', label: 'Streetwear', phrase: 'in streetwear', group: 'Everyday', ...both(fromSet('set_street_tee_jeans')) },
  { id: 'smart', label: 'Smart casual', phrase: 'in smart casual clothes', group: 'Everyday', man: outfit('male_casualsuit05', 'shoes02'), woman: outfit('female_elegantsuit01', 'heels') },
  { id: 'sporty', label: 'Sporty', phrase: 'in sportswear', group: 'Everyday', man: full({ top: 'tank_top', bottom: 'cargo_shorts', shoes: 'sneakers' }), woman: outfit('female_sportsuit01', 'shoes03') },
  { id: 'adventurer', label: 'Adventurer', phrase: 'in adventure gear', group: 'Everyday', ...both(fromPreset('The Adventurer')) },
  { id: 'business', label: 'Business suit', phrase: 'in a business suit', group: 'Work & formal', man: fromSet('set_suit_tie'), woman: fromSet('set_pantsuit') },
  { id: 'classic', label: 'Classic suit', phrase: 'in a classic suit', group: 'Work & formal', ...both(outfit('male_elegantsuit01', 'shoes02')) },
  { id: 'pastel', label: 'Pastel suit', phrase: 'in a pastel suit', group: 'Work & formal', ...both(fromSet('set_pastel_suit')) },
  { id: 'clergy', label: 'Clergy', phrase: 'in clerical clothes', group: 'Work & formal', ...both(fromSet('set_clergy')) },
  { id: 'workwear', label: 'Overalls', phrase: 'in work overalls', group: 'Work & formal', ...both(outfit('male_worksuit01', 'shoes04')) },
  { id: 'soldier', label: 'Soldier', phrase: 'in combat fatigues', group: 'Uniforms & action', ...both(fromPreset('The Soldier')) },
  { id: 'police', label: 'Police (Nigeria)', phrase: 'in a Nigeria Police uniform', group: 'Uniforms & action', ...both(fromPreset('The Police Officer (Nigeria)')) },
  { id: 'frsc', label: 'Road marshal (FRSC)', phrase: 'in an FRSC uniform', group: 'Uniforms & action', ...both(fromPreset('The FRSC Officer (Nigeria)')) },
  { id: 'sheriff', label: 'Sheriff', phrase: "in a sheriff's uniform", group: 'Uniforms & action', ...both(fromPreset('The American Sheriff')) },
  { id: 'prisoner', label: 'Prison jumpsuit', phrase: 'in a prison jumpsuit', group: 'Uniforms & action', ...both(fromSet('set_prison_jumpsuit')) },
  { id: 'cyberpunk', label: 'Cyberpunk', phrase: 'in cyberpunk techwear', group: 'Uniforms & action', ...both(fromPreset('The Cyberpunk Hacker')) },
  { id: 'survivor', label: 'Wasteland survivor', phrase: 'in wasteland gear', group: 'Uniforms & action', ...both(fromPreset('The Wasteland Survivor')) },
  { id: 'wedding', label: 'Wedding gown & veil', phrase: 'in a wedding gown and veil', group: 'Bridal & evening', woman: fromSet('set_wedding_gown'), alt: 'classic' },
  { id: 'cocktail_dress', label: 'Red cocktail dress', phrase: 'in a short red cocktail dress', group: 'Bridal & evening', woman: fromSet('set_cocktail_dress'), alt: 'classic', adult: true },
  { id: 'buba', label: 'Buba & sokoto', phrase: 'in a Yoruba buba and sokoto', group: 'Traditional', ...both(full({ top: 'long_tunic', bottom: 'trousers', shoes: 'sandals', accessories: ['fila_cap'], garmentStyles: fromPreset('The Yoruba Warrior').garmentStyles })) },
  { id: 'ankara_gown', label: 'Ankara gown', phrase: 'in an ankara gown', group: 'Traditional', woman: fromSet('set_ankara_gown'), alt: 'buba' },
  { id: 'ankara_peplum', label: 'Ankara peplum & skirt', phrase: 'in an ankara peplum and skirt', group: 'Traditional', woman: fromSet('set_ankara_peplum'), alt: 'buba' },
  { id: 'aso_ebi', label: 'Aso-ebi lace & gele', phrase: 'in aso-ebi lace with a gele', group: 'Traditional', woman: fromSet('set_aso_ebi'), alt: 'buba' },
  { id: 'thobe', label: 'Thobe & keffiyeh', phrase: 'in a thobe and keffiyeh', group: 'Traditional', man: fromSet('set_thobe'), alt: 'ankara_gown' },
  { id: 'yoruba_warrior', label: 'Yoruba warrior', phrase: 'dressed as a Yoruba warrior', group: 'Warriors', ...both(fromPreset('The Yoruba Warrior')) },
  { id: 'dahomey', label: 'Dahomey warrior', phrase: 'dressed as a Dahomey warrior', group: 'Warriors', woman: fromPreset('The Dahomey Warrior'), alt: 'yoruba_warrior' },
  { id: 'maasai', label: 'Maasai', phrase: 'in a Maasai shuka', group: 'Warriors', man: fromPreset('The Maasai Warrior'), alt: 'dahomey' },
  { id: 'zulu', label: 'Zulu warrior', phrase: 'dressed as a Zulu warrior', group: 'Warriors', man: fromPreset('The Zulu Warrior'), alt: 'dahomey' },
  { id: 'beach', label: 'Beachwear', phrase: 'in beachwear', group: 'Beach', man: full({ bottom: 'cargo_shorts', shoes: 'flipflops', accessories: ['sunglasses'] }), woman: fromSet('set_gold_bikini'), adult: true },
];
export const styleById = new Map(STYLES.map((s) => [s.id, s]));

/** Why a style can't be picked for this character, if it can't. */
export function styleBlocked(s: Style, p: HumanParams, cat: Catalog): string | undefined {
  const g = genderOf(p), look = s[g];
  if (!look) return `${s.label} is a ${g === 'man' ? "women's" : "men's"} outfit. Switch to ${g === 'man' ? 'Woman' : 'Man'} in Body to wear it.`;
  if (s.adult && isMinor(p)) return `${s.label} is only for adult characters. Choose Young adult or older in Body.`;
  if (look.outfit && look.outfit !== 'none' && !setById.has(look.outfit) && !cat.outfits.some((o) => o.id === look.outfit)) return `${s.label} needs outfit files this copy of the app doesn't have.`;
  return undefined;
}

/**
 * Which style the character is wearing (or undefined: an outfit of their own). Styles that share
 * garments (a police and a road marshal's uniform) are told apart by shoes, accessories and colours.
 */
export function styleOf(p: HumanParams): string | undefined {
  const same = (l: Look) => l.outfit === p.outfit && (p.outfit !== 'none' || (l.top === p.top && l.bottom === p.bottom && l.jacket === p.jacket));
  const score = (l: Look) =>
    (l.shoes === p.shoes ? 1 : 0) + (l.accessories ?? []).filter((a) => p.accessories.includes(a)).length +
    Object.entries(l.garmentStyles ?? {}).filter(([k, v]) => p.garmentStyles[k]?.color === v.color).length;
  const g = genderOf(p);
  let best: { id: string; score: number } | undefined;
  for (const s of STYLES)
    for (const [lg, l] of [['man', s.man], ['woman', s.woman]] as const) {
      if (!l || !same(l)) continue;
      // The character's own gender's version wins ties.
      const sc = score(l) + (lg === g ? 0.5 : 0);
      if (!best || sc > best.score) best = { id: s.id, score: sc };
    }
  return best?.id;
}

/** Extras: accessories offered in the Extras step, which stay when the outfit changes. */
const isExtra = (id: string) => GLASSES.some((g) => g.id === id) || JEWELLERY.some((j) => j.id === id) || HATS.some((h) => h.id === id);

/** Dress the character in a style: its clothes replace the old outfit's (with its accessories); extras stay. */
export function applyStyle(p: HumanParams, s: Style, g: Gender = genderOf(p)): Patch {
  const look = s[g]!;
  const outfitBound = new Set(STYLES.flatMap((x) => [...(x.man?.accessories ?? []), ...(x.woman?.accessories ?? [])]));
  const kept = p.accessories.filter((a) => isExtra(a) || !outfitBound.has(a));
  const accessories = [...new Set([...kept, ...(look.accessories ?? [])])];
  return { ...look, accessories, garmentStyles: { ...p.garmentStyles, ...look.garmentStyles }, outfitTint: '#ffffff' };
}

// --- Colours --------------------------------------------------------------------------------

export const PALETTE: Option[] = [
  ['black', 'Black', '#16171a'], ['charcoal', 'Charcoal', '#3a3d44'], ['grey', 'Grey', '#8a8d93'], ['white', 'White', '#f2f2ef'],
  ['cream', 'Cream', '#e8dcc4'], ['tan', 'Tan', '#c9b28d'], ['brown', 'Brown', '#6b4a32'], ['red', 'Red', '#b0211f'],
  ['burgundy', 'Burgundy', '#5e1624'], ['orange', 'Orange', '#d9731f'], ['gold', 'Gold', '#c9a24a'], ['yellow', 'Yellow', '#e3c33b'],
  ['green', 'Green', '#2f6b3a'], ['olive', 'Olive', '#5d5b3e'], ['teal', 'Teal', '#2a6f73'], ['blue', 'Blue', '#2b55a8'],
  ['navy', 'Navy', '#1d2a4a'], ['purple', 'Purple', '#5a2f7a'], ['pink', 'Pink', '#e08aa8'],
].map(([id, label, swatch]) => ({ id, label, swatch }));
/** Tints only darken an outfit's own colours, so they're light. */
export const TINTS: Option[] = [
  ['natural', 'Natural', '#ffffff'], ['warm', 'Warm', '#f2dcc0'], ['red', 'Red', '#f0a8a0'], ['rose', 'Rose', '#f0c0d0'], ['gold', 'Gold', '#f0dc98'],
  ['green', 'Green', '#b8dcb0'], ['teal', 'Teal', '#a8d8d4'], ['blue', 'Blue', '#a8c0f0'], ['purple', 'Purple', '#cab4e8'], ['grey', 'Grey', '#b8b8b8'], ['dark', 'Dark', '#707070'],
].map(([id, label, swatch]) => ({ id, label, swatch }));

const PATTERN_NAMES: Record<string, string> = {
  solid: 'Plain', khaki: 'Khaki', camo: 'Camouflage', kente: 'Kente', asooke: 'Aso-oke', ankara: 'Ankara', ankara_floral: 'Ankara (floral)',
  ankara_web: 'Ankara (web)', adire: 'Adire', adire_panel: 'Adire panel', lace: 'Lace', damask: 'Damask', pleated: 'Pleated', foil: 'Metallic foil',
  denim: 'Denim', jersey: 'Jersey', workwear: 'Workwear', tropical: 'Tropical', linen: 'Linen', suiting: 'Suiting', nappa: 'Smooth leather',
  patent: 'Patent leather', shemagh: 'Shemagh', satin: 'Satin', striped: 'Striped', shuka: 'Shuka check', leather: 'Leather', hide: 'Hide',
  leopard: 'Leopard', techwear: 'Techwear', tattered: 'Worn', molle: 'MOLLE', fur: 'Fur', beadbands: 'Beads', straw: 'Straw', rib: 'Rib knit',
};
export const patternName = (id: string) => PATTERN_NAMES[id] ?? id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Something whose colours Quick build can change: an outfit set, a garment, or a ready-made outfit's tint. */
export interface ColourTarget {
  /** Key in garmentStyles ('' for the outfit tint). */
  key: string;
  label: string;
  patterns: string[];
  pattern: string;
  color: string;
  color2?: string;
  /** Names for the two colours. */
  names: [string, string];
}

/** What the current outfit lets you recolour. */
export function colourTargets(p: HumanParams): ColourTarget[] {
  const style = (key: string, def: { patterns: string[]; color: string; color2: string }, label: string, names: [string, string]): ColourTarget => {
    const st = p.garmentStyles[key] ?? {};
    const pattern = st.pattern && def.patterns.includes(st.pattern) ? st.pattern : def.patterns[0];
    return { key, label, patterns: def.patterns, pattern, color: st.color ?? def.color, color2: st.color2 ?? def.color2, names };
  };
  const piece = (id: string, label: string): ColourTarget[] => {
    const def = garmentById.get(id);
    return def && id !== 'none' && !def.patterns.includes('beadbands') ? [style(def.id, def, label, def.colorLabels ?? ['Colour', 'Second colour'])] : [];
  };
  const set = setById.get(p.outfit);
  if (set) {
    // As in Detailed: the set's shared fabric, and the pieces with colours of their own.
    const shared = set.patterns ? sharedPieces(set) : [];
    return [
      ...(set.patterns ? [style(set.id, { patterns: set.patterns, color: set.color!, color2: set.color2! }, 'Outfit', ['Main colour', 'Second colour'])] : []),
      ...(shared.includes(set.top) ? [] : piece(set.top, 'Top')),
      ...(set.patterns || set.bottom === 'none' ? [] : piece(set.bottom, 'Bottom')),
    ];
  }
  if (p.outfit !== 'none') return [{ key: '', label: 'Outfit', patterns: [], pattern: '', color: p.outfitTint, names: ['Tint', ''] }];
  return [...piece(p.top, 'Top'), ...piece(p.jacket, 'Jacket'), ...piece(p.bottom, 'Bottom')];
}

// --- Hair and face --------------------------------------------------------------------------

/** Hairstyles (each pictured in public/quick-thumbs/hair-<id>.png). */
export const HAIRS: { id: string; label: string }[] = [
  { id: 'none', label: 'Bald' },
  { id: 'buzz', label: 'Buzz cut' },
  { id: 'short01', label: 'Short crop' },
  { id: 'short02', label: 'Short tousled' },
  { id: 'short03', label: 'Short side part' },
  { id: 'short04', label: 'Short neat' },
  { id: 'afro01', label: 'Afro' },
  { id: 'cornrows', label: 'Cornrows' },
  { id: 'box_braids', label: 'Box braids' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'bob01', label: 'Bob' },
  { id: 'bob02', label: 'Bob (fair)' },
  { id: 'braid01', label: 'Long braid' },
  { id: 'long01', label: 'Long' },
  { id: 'ponytail01', label: 'Ponytail' },
];
const hairPhrase: Record<string, string> = {
  none: 'bald', buzz: 'with a buzz cut', short01: 'with short hair', short02: 'with short hair', short03: 'with short hair', short04: 'with short hair',
  afro01: 'with an afro', cornrows: 'with cornrows', box_braids: 'with box braids', mohawk: 'with a mohawk', bob01: 'with a bob', bob02: 'with a bob',
  braid01: 'with a long braid', long01: 'with long hair', ponytail01: 'with a ponytail',
};
/** Hairstyles that suit each gender when one is picked for you. */
export const DEFAULT_HAIR: Record<Gender, string> = { man: 'short02', woman: 'long01' };

/**
 * Hair colours. Ready-made hairstyles carry their own colour and a tint can only darken it, so a
 * colour is offered for them only when it's no lighter than the hairstyle's own (in every channel).
 * Procedural styles (buzz cut, braids, mohawk) take any colour.
 */
export const HAIR_COLOURS: Option[] = [
  ['natural', 'Natural', ''], ['black', 'Black', '#16120f'], ['darkbrown', 'Dark brown', '#2e2019'], ['brown', 'Brown', '#4a3226'],
  ['auburn', 'Auburn', '#6a2f1e'], ['lightbrown', 'Light brown', '#7c5c42'], ['blonde', 'Blonde', '#b39563'], ['platinum', 'Platinum', '#d6cdbb'],
  ['grey', 'Grey', '#8c8c8a'], ['red', 'Red', '#8c2a1c'], ['pink', 'Pink', '#c86a96'], ['blue', 'Blue', '#3b5aa8'], ['purple', 'Purple', '#7a4aa8'],
].map(([id, label, swatch]) => ({ id, label, swatch }));
/** Each ready-made hairstyle's own average colour (measured from its texture). */
const HAIR_BASE: Record<string, [number, number, number]> = {
  afro01: [15, 5, 5], bob01: [38, 31, 33], bob02: [159, 151, 136], braid01: [24, 19, 16], long01: [49, 28, 21],
  ponytail01: [86, 59, 41], short01: [27, 27, 27], short02: [75, 60, 50], short03: [79, 51, 43], short04: [36, 36, 36],
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** A light hairstyle for a colour (the suggestion when one can't take it). */
const LIGHT_HAIR = 'Bob (fair), Buzz cut, Cornrows, Box braids or Mohawk';

export function hairColours(p: HumanParams): Option[] {
  const base = HAIR_BASE[p.hair], name = HAIRS.find((h) => h.id === p.hair)?.label ?? 'This hairstyle';
  return HAIR_COLOURS.map((c) => {
    if (c.id === 'natural' || !base) return c;
    const t = rgb(c.swatch!);
    const ok = t.every((v, i) => v <= base[i] * 1.15 + 6);
    return ok ? c : { ...c, blocked: `${name} is naturally darker than ${c.label.toLowerCase()}, and its colour can only be darkened. For ${c.label.toLowerCase()} hair, pick ${LIGHT_HAIR}.` };
  });
}
/** The settings for a hair colour on this hairstyle (beards follow the hair). */
export function applyHairColour(p: HumanParams, id: string): Patch {
  const c = HAIR_COLOURS.find((x) => x.id === id)!;
  if (id === 'natural') return { hairTint: '#ffffff', hairColor: DEFAULT_PARAMS.hairColor, beardColor: DEFAULT_PARAMS.beardColor };
  const base = HAIR_BASE[p.hair];
  const tint = base ? hex(rgb(c.swatch!).map((v, i) => Math.min(1, v / Math.max(1, base[i])) * 255)) : '#ffffff';
  return { hairTint: tint, hairColor: c.swatch!, beardColor: c.swatch! };
}
/** Which hair colour the character has (undefined: one picked elsewhere). */
export function hairColourOf(p: HumanParams): string | undefined {
  if (isProceduralHair(p.hair)) return p.hairColor === DEFAULT_PARAMS.hairColor ? 'natural' : HAIR_COLOURS.find((c) => c.swatch === p.hairColor)?.id;
  if (p.hairTint === '#ffffff') return 'natural';
  return HAIR_COLOURS.find((c) => c.swatch && applyHairColour(p, c.id).hairTint === p.hairTint)?.id;
}

/** Beard colour on its own (bald characters). */
export const applyBeardColour = (id: string): Patch => ({ beardColor: HAIR_COLOURS.find((c) => c.id === id)?.swatch || DEFAULT_PARAMS.beardColor });
export const beardColourOf = (p: HumanParams) =>
  p.beardColor === DEFAULT_PARAMS.beardColor ? 'natural' : HAIR_COLOURS.find((c) => c.swatch === p.beardColor)?.id;

export const BEARDS: Option[] = FACIAL_HAIR.map((f) => ({ id: f, label: FACIAL_HAIR_LABELS[f] }));
const beardPhrase: Partial<Record<FacialHairId, string>> = {
  stubble: 'stubble', mustache: 'a mustache', mustache_stubble: 'a mustache and stubble', goatee: 'a goatee', short_beard: 'a short beard', full_beard: 'a full beard',
};

export const EYES: Option[] = [
  ['blackbrown', 'Black-brown', '#2a1a12'], ['darkbrown', 'Dark brown', '#3d2414'], ['brown', 'Brown', '#5a3a22'], ['brownlight', 'Light brown', '#8a6a44'],
  ['green', 'Green', '#4f7a3f'], ['bluegreen', 'Blue-green', '#4f7f7a'], ['grey', 'Grey', '#8a9096'], ['blue', 'Blue', '#3f6fb0'],
  ['lightblue', 'Light blue', '#7fa6cf'], ['deepblue', 'Deep blue', '#234b8f'], ['ice', 'Ice', '#b9d4e3'],
].map(([id, label, swatch]) => ({ id, label, swatch }));

export const EXPRESSION_OPTIONS: Option[] = EXPRESSIONS.map((e) => ({ id: e, label: EXPRESSION_LABELS[e as ExpressionId] }));

// --- Extras ---------------------------------------------------------------------------------

export const GLASSES: Option[] = [
  { id: 'none', label: 'None' }, { id: 'sunglasses', label: 'Sunglasses' }, { id: 'aviators', label: 'Aviators' }, { id: 'sunglasses_sleek', label: 'Cat-eye' },
];
export const JEWELLERY: Option[] = [
  'watch_gold', 'watch_silver', 'gold_necklace', 'fine_pendant', 'gold_chains', 'cuban_chain', 'pearl_necklace', 'silver_cross', 'gold_ring', 'bangles', 'wrist_beads', 'gloves', 'earpiece',
].map((id) => ({ id, label: garmentById.get(id)?.label.replace(/ \(.*\)$/, '') ?? id }));
/** Hats: the ready-made ones (the hat setting) and procedural ones (accessories). */
export const HATS: Option[] = [
  { id: 'none', label: 'None' }, { id: 'baseball_cap', label: 'Baseball cap' }, { id: 'fedora01', label: 'Fedora' }, { id: 'fedora_cocked', label: 'Fedora (tilted)' },
  { id: 'cowboy_hat', label: 'Cowboy hat' }, { id: 'beret', label: 'Beret' },
];
const ACC_HATS = ['cowboy_hat', 'beret'];
/** Headwear that comes with an outfit (shown so "None" can take it off). */
const OUTFIT_HEADWEAR: Record<string, string> = { gele: 'Gele', keffiyeh: 'Keffiyeh', helmet: 'Helmet', fila_cap: 'Fila cap', feather_headband: 'Headband', bead_headband: 'Headband', visor: 'Visor' };

export function hatOf(p: HumanParams): string {
  if (p.hat !== 'none') return p.hat;
  return p.accessories.find((a) => ACC_HATS.includes(a)) ?? (p.accessories.some((a) => a in OUTFIT_HEADWEAR) ? 'outfit' : 'none');
}
export function outfitHeadwear(p: HumanParams): string | undefined {
  const a = p.hat === 'keffiyeh' ? 'keffiyeh' : p.accessories.find((x) => x in OUTFIT_HEADWEAR);
  return a ? OUTFIT_HEADWEAR[a] : undefined;
}
export function applyHat(p: HumanParams, id: string): Patch {
  const accessories = p.accessories.filter((a) => !ACC_HATS.includes(a) && !(a in OUTFIT_HEADWEAR));
  if (ACC_HATS.includes(id)) return { hat: 'none', accessories: [...accessories, id] };
  return { hat: id, accessories };
}
export const glassesOf = (p: HumanParams) => GLASSES.find((g) => g.id !== 'none' && p.accessories.includes(g.id))?.id ?? 'none';
export const applyGlasses = (p: HumanParams, id: string): Patch => ({ accessories: [...p.accessories.filter((a) => !GLASSES.some((g) => g.id === a)), ...(id === 'none' ? [] : [id])] });
export const toggleAccessory = (p: HumanParams, id: string): Patch => ({ accessories: p.accessories.includes(id) ? p.accessories.filter((a) => a !== id) : [...p.accessories, id] });

export const EARRING_OPTIONS: Option[] = EARRINGS.map((e) => ({ id: e, label: EARRING_LABELS[e as EarringId] }));
export const METALS: Option[] = [{ id: 'gold', label: 'Gold', swatch: '#d4af37' }, { id: 'silver', label: 'Silver', swatch: '#c0c4ca' }];
export function tattooOptions(p: HumanParams): Option[] {
  return TATTOOS.map((t) => ({ id: t, label: TATTOO_LABELS[t as TattooId].replace(/ \(.*\)$/, ''), blocked: isMinor(p) ? 'Tattoos are only for adult characters. Choose Young adult or older in Body.' : undefined }));
}
export const BAGS: Option[] = CARRIED.map((c) => ({ id: c, label: CARRY_LABELS[c as CarryId] }));
export const HELD: Option[] = WEAPONS.map((w) => ({ id: w, label: w === 'none' ? 'Nothing' : WEAPON_LABELS[w as WeaponId] }));

// --- Motion ---------------------------------------------------------------------------------

export const VEHICLES: Option[] = [{ id: 'none', label: 'On foot' }, ...VEHICLE_IDS.map(id => ({ id, label: VEHICLE_LABELS[id] }))];
/** Quick choices follow the playing action rather than locking out other vehicle animations. */
export const vehicleOf = (p: HumanParams, clip: string) => vehicleFor(p.vehicle, clip);
export function vehiclePatch(p: HumanParams, id: VehicleId): Patch {
  return { vehicle: 'auto', vehicleStyle: vehicleStyleForChoice(id, p.vehicleStyle), rig: p.rig === 'none' ? 'game' : p.rig, animations: true };
}
export const vehicleActions = (id: VehicleId, clip = VEHICLE_CLIP[id]) => {
  const ride = RIDING_VEHICLES[ridingClip(clip)] === id ? ridingClip(clip) : VEHICLE_CLIP[id];
  const transition = VEHICLE_TRANSITIONS.find(([, action]) => action === ride)?.[0];
  return transition ? [`board_${transition}`, ...(id==='jet'?['takeoff_jet']:[]), ride, ...(id==='jet'?['land_jet']:[]), `alight_${transition}`, ...(['horse'].includes(id)?[]:[`tumble_${id}`])] : [ride];
};

/** Clips to try, and more for whatever is in hand. */
export function actions(p: HumanParams, clip = 'idle'): Option[] {
  const base = ['idle', 'walk', 'model_walk', 'run', 'wave', 'talk', 'laugh', 'cheer', 'sit_idle', 'jump', 'punch'];
  const held: Record<string, string[]> = {
    pistol: ['pistol_idle', 'pistol_aim', 'pistol_fire'], rifle: ['rifle_idle', 'rifle_aim', 'rifle_fire_auto', 'rifle_walk', 'rifle_reload'],
    sword: ['sword_idle', 'sword_slash', 'sword_block'], knife: [], grenade:['throw_grenade'],
  };
  const vehicle = vehicleOf(p, clip);
  return [...base,...(p.carry==='parachute'?['skydive','parachute_deploy','parachute_glide','parachute_land']:[]), ...(held[p.weapon] ?? []), ...(vehicle ? vehicleActions(vehicle, clip) : [])].map((id) => ({ id, label: '' }));
}

// --- Summary --------------------------------------------------------------------------------

/** The summary sentence, in parts; parts that name a step are links to it (the rest is plain text). */
export function summary(p: HumanParams): { text: string; step?: string }[] {
  const years = Math.round(ageToYears(p.age)), g = genderOf(p);
  const build = BUILDS.find((b) => b.id === buildOf(p))!.adj;
  const heritage = HERITAGES.find((h) => h.id === heritageOf(p))!.adj;
  const noun = years < 18 ? (g === 'man' ? 'boy' : 'girl') : g;
  const style = styleById.get(styleOf(p) ?? '');
  const beard = g === 'man' ? beardPhrase[p.facialHair] : undefined;
  const hair = hairPhrase[p.hair] ?? 'with their own hairstyle', bald = hair === 'bald';
  // "An" before a vowel sound: "an athletic", "an 18-year-old", "an 80-year-old".
  const first = build || String(years);
  const parts: { text: string; step?: string }[] = [{ text: /^[aeiou]/i.test(first) || /^(8|11$|18$)/.test(first) ? 'An' : 'A' }];
  if (build) parts.push({ text: build, step: 'body' });
  parts.push({ text: `${years}-year-old`, step: 'body' }, { text: heritage, step: 'heritage' }, { text: noun, step: 'body' });
  parts.push({ text: style ? style.phrase : 'in their own outfit', step: 'outfit' }, { text: ',' });
  // "…, bald, with stubble." / "…, with short hair and stubble."
  parts.push({ text: hair, step: 'hair' });
  if (beard) parts.push({ text: bald ? ', with' : 'and' }, { text: beard, step: 'hair' });
  parts.push({ text: '.' });
  return parts;
}

// --- Defaults when switching gender ---------------------------------------------------------

/** Settings that follow a gender change, unless the user picked them: hair, beard, and a fitting outfit. */
export function genderPatch(p: HumanParams, g: Gender, chosen: Set<string>): { patch: Patch; notes: string[] } {
  const patch: Patch = { gender: g === 'man' ? 1 : 0 };
  const notes: string[] = [];
  const style = styleById.get(styleOf(p) ?? '');
  if (style) {
    const target = style[g] ? style : styleById.get(style.alt ?? '');
    if (target && target !== style && target[g]) {
      Object.assign(patch, applyStyle(p, target, g));
      notes.push(`${style.label} is a ${g === 'man' ? "women's" : "men's"} outfit, so the outfit is now ${target.label}.`);
    } else if (target?.man && target.woman && target.man !== target.woman) {
      // The style's version for the other gender (a pantsuit for a business suit); one look for both stays as it is.
      Object.assign(patch, applyStyle(p, target, g));
    }
  }
  if (g === 'woman' && p.facialHair !== 'none') patch.facialHair = 'none';
  if (!chosen.has('hair')) patch.hair = DEFAULT_HAIR[g];
  return { patch, notes };
}

/** Settings that follow a heritage change: natural eyes and brows, unless the user picked eyes. */
export function heritagePatch(id: string, chosen: Set<string>): Patch {
  const h = HERITAGES.find((x) => x.id === id)!;
  const patch: Patch = { african: h.mix[0], asian: h.mix[1], caucasian: h.mix[2], skin: 'auto' };
  if (!chosen.has('eyes')) patch.eyes = h.eyes;
  // African-led faces get the soft, natural brows (drawn styles look carved on them).
  if (id === 'african') patch.eyebrows = 'eyebrow001';
  return patch;
}

/** Hairstyles Surprise me picks from, per gender. */
export const SURPRISE_HAIR: Record<Gender, string[]> = {
  man: ['none', 'buzz', 'short01', 'short02', 'short03', 'short04', 'afro01', 'cornrows', 'box_braids'],
  woman: ['bob01', 'bob02', 'braid01', 'long01', 'ponytail01', 'afro01', 'cornrows', 'box_braids'],
};
