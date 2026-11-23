/**
 * Clips that only make sense with a carried item: the phone for calls and texting, the broom for sweeping, the box for
 * the carry clips, the basin for the head load, the parachute rig for parachuting and the gym weights for the lifts.
 */
import { clipById } from '../anim/clips';
import { GYM_WEIGHTS, type CarryId } from './carry';

const NEEDS: Record<string, CarryId> = {
  phone_call: 'phone', texting: 'phone', sweep: 'broom', carry_idle: 'parcel', carry_walk: 'parcel', head_load_idle: 'head_load', head_load_walk: 'head_load',
};

/** The carried item a clip needs, if any. */
export function carryNeeded(clip: string): CarryId | undefined {
  return NEEDS[clip] ?? (clip.startsWith('parachute_') ? 'parachute' : undefined) ?? clipById.get(clip)?.weights;
}

/** Whether carrying `have` provides `need` (Gym weights (all) provides each weight). */
export const provides = (have: string | undefined, need: CarryId) => have === need || (have === 'gym_weights' && (GYM_WEIGHTS as readonly string[]).includes(need));

/**
 * The one item a character needs for these clips (several gym weights make Gym weights (all)), or the clips that
 * need different items: a character carries one item at a time.
 */
export function carryForClipList(clips: readonly string[]): { carry?: CarryId; clash?: string } {
  const needs = new Map<CarryId, string[]>();
  for (const id of clips) { const n = carryNeeded(id);if (n) needs.set(n, [...(needs.get(n) ?? []), id]); }
  const weights = [...needs.keys()].filter((n) => (GYM_WEIGHTS as readonly string[]).includes(n) && n !== 'gym_weights'), other = [...needs.keys()].filter((n) => !weights.includes(n));
  const items = [...other, ...(weights.length > 1 ? ['gym_weights' as CarryId] : weights)];
  if (items.length > 1) return { clash: items.map((n) => `${n} (${[...new Set(n === 'gym_weights' ? weights.flatMap((w) => needs.get(w)!) : needs.get(n)!)].join(', ')})`).join(' and ') };
  return { carry: items[0] };
}
