/**
 * Outfit sets: a top and a bottom worn together (with suggested extras), listed with the full
 * outfits. Both pieces share the set's pattern and colours.
 */
import type { GarmentDef } from './kit';

/** Outfits that pair a top and a bottom (and suggested extras), listed with the full outfits. */
export interface OutfitSet {
  id: string;
  label: string;
  top: string;
  bottom: string;
  /** Added when the set is picked (can be removed afterwards). */
  accessories: string[];
  shoes?: string;
  /** Patterns offered for the whole set (first = default) and default colours, shared by both pieces. */
  patterns: GarmentDef['patterns'];
  color: string;
  color2: string;
}

export const OUTFIT_SETS: OutfitSet[] = [
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
    id: 'set_gold_bikini', label: 'Gold bikini', top: 'bikini_top', bottom: 'bikini_bottom', accessories: ['sunglasses'], shoes: 'flipflops',
    patterns: ['foil', 'solid', 'ankara', 'leopard'], color: '#c9963a', color2: '#fff1c4',
  },
];
export const setById = new Map(OUTFIT_SETS.map((x) => [x.id, x]));
