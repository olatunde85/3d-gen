/**
 * The library's `colors` option: plain names for the parts of a character that can be recoloured, mapped onto the
 * character settings the builder uses (garment styles, the outfit tint and the vehicle's paint).
 */
import { dressing, garmentById, setById, sharedPieces, styleOf } from '../../../../src/core/garments/index';
import { CARRY_STYLES, carryStyle } from '../../../../src/core/props/carry';
import type { HumanParams } from '../../../../src/core/params';

export const COLOR_SLOTS = ['outfit', 'top', 'jacket', 'bottom', 'shoes', 'carry', 'vehicle'] as const;
export type ColorSlot = typeof COLOR_SLOTS[number];
/** A #rrggbb colour for each part to recolour. */
export type CharacterColors = Partial<Record<ColorSlot, string>>;

interface Slot { read: (p: HumanParams) => string; write: (p: HumanParams, color: string) => HumanParams }

const styled = (p: HumanParams, id: string, color: string): HumanParams => ({ ...p, garmentStyles: { ...p.garmentStyles, [id]: { ...p.garmentStyles[id], color } } });
const garment = (id: string): Slot => ({ read: (p) => styleOf(id, p.garmentStyles).color, write: (p, color) => styled(p, id, color) });

/** The parts of this character that can be recoloured, and how. */
function slotsOf(p: HumanParams): Partial<Record<ColorSlot, Slot>> {
  const slots: Partial<Record<ColorSlot, Slot>> = {}, set = setById.get(p.outfit), dressed = dressing(p);
  // An outfit set whose pieces share one fabric (a suit, a gown): `outfit` colours that fabric.
  const shared = set?.patterns ? sharedPieces(set) : [];
  if (set?.patterns) slots.outfit = { read: (q) => q.garmentStyles[set.id]?.color ?? set.color!, write: (q, color) => styled(q, set.id, color) };
  // A whole-body outfit: its colour is multiplied over the fabric, so it can darken but not lighten.
  else if (p.outfit !== 'none' && !set) slots.outfit = { read: (q) => q.outfitTint, write: (q, color) => ({ ...q, outfitTint: color }) };
  for (const part of ['top', 'jacket', 'bottom'] as const) {
    const id = dressed[part];
    if (id && !shared.includes(id)) slots[part] = garment(id);
  }
  if (garmentById.get(p.shoes)?.slot === 'feet') slots.shoes = garment(p.shoes);
  if (p.carry in CARRY_STYLES) slots.carry = { read: (q) => carryStyle(q.carry as keyof typeof CARRY_STYLES, q.garmentStyles).color, write: (q, color) => styled(q, q.carry, color) };
  else if (garmentById.get(p.carry)?.slot === 'bag') slots.carry = garment(p.carry);
  if (p.vehicle !== 'none' && p.vehicle !== 'auto') slots.vehicle = { read: (q) => q.vehicleStyle.color, write: (q, color) => ({ ...q, vehicleStyle: { ...q.vehicleStyle, color } }) };
  return slots;
}

/** The current colour of every part of this character that can be recoloured. */
export function colorsOf(p: HumanParams): CharacterColors {
  return Object.fromEntries(Object.entries(slotsOf(p)).map(([slot, s]) => [slot, s.read(p).toLowerCase()]));
}

/** Applies `colors` to the parts this character has; parts it doesn't have (a jacket on a T-shirt) are skipped. */
export function applyColors(p: HumanParams, colors: CharacterColors): HumanParams {
  if (!colors || typeof colors !== 'object') throw Error('colors takes an object, such as { top: "#2a4d7a" }.');
  const slots = slotsOf(p);
  for (const [slot, color] of Object.entries(colors)) {
    if (!COLOR_SLOTS.includes(slot as ColorSlot)) throw Error(`Unknown colour "${slot}". Use ${COLOR_SLOTS.join(', ')}.`);
    if (color === undefined) continue;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw Error(`colors.${slot} takes a colour such as "#2a4d7a".`);
    const s = slots[slot as ColorSlot];
    if (s) p = s.write(p, color.toLowerCase());
  }
  return p;
}
