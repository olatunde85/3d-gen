import { CLIPS, clipById } from '../core/anim/clips';
export const ANIMATION_CATEGORIES = [...new Set(CLIPS.map(c => c.category))];
export function searchAnimations(query: string, category = '') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return CLIPS.filter(c => (!category || c.category === category) && words.every(w => `${c.name} ${c.id} ${c.id.replace(/_/g,'')} ${c.category}`.toLowerCase().includes(w)));
}
export function actionNote(id: string) {
  if (['sit_down','sit_idle','stand_up'].includes(id)) return 'A chair is fitted to this character automatically.';
  if (id === 'ride_bicycle') return 'A bicycle is fitted to this rider automatically.';
  if (id === 'sleep' || id === 'lie_down') return 'Performed at floor level. Use character elevation to stage it on a raised surface.';
  if (id.startsWith('rifle')) return 'Equip a rifle in the character builder for this performance.';
  if (id.startsWith('pistol')) return 'Equip a pistol in the character builder for this performance.';
  if (id.startsWith('sword')) return 'Equip a sword in the character builder for this performance.';
  if (clipById.get(id)?.category === 'Vehicles') return 'Vehicle pose only. The vehicle is not part of this set.';
  if (['open_door','use_press','push','carry_idle','carry_walk','pick_up'].includes(id)) return 'Stage the character near the intended object. Prop contact is not solved automatically.';
  return clipById.get(id)?.loop ? 'Repeats naturally for the duration of this action.' : 'Plays once, then holds its last pose. Choose the clip length for its original timing.';
}
