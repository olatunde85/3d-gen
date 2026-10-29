/**
 * Outfit sets: a top and a bottom worn together (with suggested extras), listed with the full
 * outfits. The pieces either share the set's pattern and colours, or keep their own.
 */
import type { HumanParams } from '../params';
import type { GarmentDef } from './kit';

/** Outfits that pair a top and a bottom (and suggested extras), listed with the full outfits. */
export interface OutfitSet {
  id: string;
  label: string;
  top: string;
  /** Worn over the top: a suit jacket. */
  jacket?: string;
  bottom: string;
  /** Added when the set is picked (can be removed afterwards). */
  accessories: string[];
  shoes?: string;
  hat?: string;
  /**
   * Patterns offered for the whole set (first = default) and default colours, shared by the top
   * and bottom, or by the jacket and bottom when there is a jacket (a suit; the shirt keeps its
   * own). Without them each piece keeps its own pattern and colours (e.g. a tee and jeans).
   */
  patterns?: GarmentDef['patterns'];
  color?: string;
  color2?: string;
}

type Styles = HumanParams['garmentStyles'];

/** The pieces of a set that share its pattern and colours: a suit's jacket and trousers, otherwise top and bottom. */
export const sharedPieces = (set: OutfitSet): string[] => [set.jacket ?? set.top, set.bottom].filter((id) => id !== 'none');

/**
 * The garment styles a set dresses with: a shared set applies its pattern and colours (and any
 * the user picked for the set) to its shared pieces, and a matching gele unless it has its own.
 */
export function setStyles(set: OutfitSet, styles: Styles): Styles {
  if (!set.patterns) return styles;
  const shared = { pattern: set.patterns[0], color: set.color, color2: set.color2, ...styles[set.id] };
  const out: Styles = { ...styles, ...Object.fromEntries(sharedPieces(set).map((id) => [id, shared])) };
  if (!out.gele) out.gele = { color: shared.color, color2: shared.color2 };
  return out;
}

export const OUTFIT_SETS: OutfitSet[] = [
  {
    id: 'set_thobe', label: 'Thobe & keffiyeh', top: 'thobe', bottom: 'none', accessories: ['gold_necklace_long', 'watch_gold', 'gold_ring', 'sunglasses'], shoes: 'slides', hat: 'keffiyeh',
    patterns: ['linen', 'solid'], color: '#f4f2ec', color2: '#e3dfd4',
  },
  {
    id: 'set_ankara_gown', label: 'Ankara gown', top: 'ankara_gown', bottom: 'none', accessories: ['gold_necklace'], shoes: 'heels',
    patterns: ['ankara_floral', 'ankara_web', 'ankara', 'lace', 'solid'], color: '#4b2a9a', color2: '#e9e4f2',
  },
  {
    id: 'set_ankara_peplum', label: 'Ankara peplum & skirt', top: 'peplum_top', bottom: 'pencil_skirt_midi', accessories: ['gold_necklace'], shoes: 'heels',
    patterns: ['ankara_web', 'ankara_floral', 'ankara', 'lace', 'solid'], color: '#d2711c', color2: '#150c08',
  },
  {
    id: 'set_aso_ebi', label: 'Aso-ebi lace & gele', top: 'lace_top', bottom: 'pencil_skirt_maxi', accessories: ['gele', 'coral_beads'], shoes: 'heels',
    patterns: ['lace', 'damask', 'ankara', 'solid'], color: '#c98aa0', color2: '#e6b3c4',
  },
  {
    id: 'set_street_tee_jeans', label: 'Tee & baggy jeans', top: 'oversized_tee', bottom: 'baggy_jeans', accessories: ['cuban_chain'], shoes: 'sneakers', hat: 'baseball_cap',
  },
  {
    id: 'set_gold_bikini', label: 'Gold bikini', top: 'bikini_top', bottom: 'bikini_bottom', accessories: ['sunglasses'], shoes: 'flipflops',
    patterns: ['foil', 'solid', 'ankara', 'leopard'], color: '#c9963a', color2: '#fff1c4',
  },
  {
    id: 'set_prison_jumpsuit', label: 'Prison jumpsuit', top: 'prison_top', bottom: 'prison_trousers', accessories: ['backpack'], shoes: 'sneakers',
    patterns: ['workwear', 'solid'], color: '#e2621f', color2: '#4a3a2a',
  },
  {
    id: 'set_pastel_suit', label: 'Pastel suit & tropical shirt', top: 'camp_shirt', jacket: 'suit_jacket', bottom: 'suit_trousers', accessories: ['gold_chains', 'aviators', 'watch_gold'], shoes: 'loafers',
    patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db',
  },
];
export const setById = new Map(OUTFIT_SETS.map((x) => [x.id, x]));
