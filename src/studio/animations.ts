import {VEHICLE_FOR_CLIP,VEHICLE_LABELS} from '../core/props/vehicles';
import { CLIPS, clipById } from '../core/anim/clips';
export const ANIMATION_CATEGORIES = [...new Set(CLIPS.map(c => c.category))];
export function searchAnimations(query: string, category = '') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return CLIPS.filter(c => (!category || c.category === category) && words.every(w => `${c.name} ${c.id} ${c.id.replace(/_/g,'')} ${c.category}`.toLowerCase().includes(w)));
}
export function actionNote(id: string, weapon?: string, seats?: number) {
  if (['sit_down','sit_idle','stand_up'].includes(id)) return seats === 0
    ? 'This set has nothing to sit on. Choose a set with chairs, sofas or benches, or the character sits on thin air.'
    : 'Sits on the set’s furniture: Studio moves the character to the nearest free seat (chair, sofa, bench or stool).';
  if(VEHICLE_FOR_CLIP[id])return `${VEHICLE_LABELS[VEHICLE_FOR_CLIP[id]]} fitted to the rider. The action selects this vehicle. Enable Move through the set to travel; adjust its speed below. Show vehicle hides it for shared passengers. Stage a clear route.`;
  if (id === 'sleep' || id === 'lie_down') return 'Performed at floor level. Use character elevation to stage it on a raised surface.';
  if (id.startsWith('rifle')) return weapon==='rifle'?'Uses this character’s equipped rifle.':'Choose a rifle in Equipment for this performance.';
  if (id.startsWith('pistol')) return weapon==='pistol'?'Uses this character’s equipped pistol.':'Choose a pistol in Equipment for this performance.';
  if (id.startsWith('sword')) return weapon==='sword'?'Uses this character’s equipped sword.':'Choose a sword in Equipment for this performance.';
  if(['carry_idle','carry_walk','pick_up','put_down'].includes(id))return 'Choose Box / parcel under Carry for a fitted box. Keep Weapon set to None for the two-hand grip. Pick up lifts it, carry clips hold it between the wrists, and Put down / drop returns it to the floor.';
  if (['open_door','use_press','push'].includes(id)) return 'Stage the character near the intended object. Prop contact is not solved automatically.';
  return clipById.get(id)?.loop ? 'Repeats naturally for the duration of this action.' : 'Plays once, then holds its last pose. Choose the clip length for its original timing.';
}
