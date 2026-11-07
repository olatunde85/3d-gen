import {animationGroup,animationMatches} from '../core/anim/groups';
import {VEHICLE_FOR_CLIP,VEHICLE_LABELS} from '../core/props/vehicles';
import { CLIPS, clipById } from '../core/anim/clips';
export const ANIMATION_CATEGORIES = [...new Set(CLIPS.map(animationGroup))];
export function searchAnimations(query: string, category = '') {
  return CLIPS.filter(c=>animationMatches(c,query,category));
}
export function actionNote(id: string, weapon?: string, seats?: number) {
  const transition=clipById.get(id)?.vehicleTransition;
  if(transition)return `${transition.direction==='board'?'Boards':'Leaves'} the ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[id]].toLowerCase()}. Use the full clip length with movement off. ${transition.direction==='board'?`Follow with ${clipById.get(transition.ride)!.name}.`:'Ends upright beside the parked vehicle.'} Keep the entry side clear.${weapon&&weapon!=='none'?' The weapon is hidden during this transition.':''}`;
  if (['sit_down','sit_idle','stand_up'].includes(id)) return seats === 0
    ? 'This set has nothing to sit on. Choose a set with chairs, sofas or benches, or the character sits on thin air.'
    : 'Sits on the set’s furniture: Studio moves the character to the nearest free seat (chair, sofa, bench or stool).';
  if(id==='fly_helicopter')return 'Pilot a four-seat helicopter. Move through the set controls forward travel; Flight height controls automatic takeoff and landing. Leave height empty for 3 m while moving, or set a positive height with movement off to hover. Board and alight on the ground; leave room for the rotor.';
  if(VEHICLE_FOR_CLIP[id])return `${VEHICLE_LABELS[VEHICLE_FOR_CLIP[id]]} fitted to the rider. The action selects this vehicle. Enable Move through the set to travel; adjust its speed below. Show vehicle hides it for shared passengers. Stage a clear route.`;
  if (id === 'sleep' || id === 'lie_down') return 'Performed at floor level. Use character elevation to stage it on a raised surface.';
  if(id==='throw_grenade')return 'Equip Grenade under Weapon props. Releases at 0.82 seconds, follows a visual arc and settles on the ground. Use the full 2.2 second action. No explosion or damage simulation.';
  if (id.startsWith('rifle')) return weapon==='rifle'?'Uses this character’s equipped rifle.':'Choose a rifle in Equipment for this performance.';
  if (id.startsWith('pistol')) return weapon==='pistol'?'Uses this character’s equipped pistol.':'Choose a pistol in Equipment for this performance.';
  if (id.startsWith('sword')) return weapon==='sword'?'Uses this character’s equipped sword.':'Choose a sword in Equipment for this performance.';
  if(['carry_idle','carry_walk','pick_up','put_down'].includes(id))return 'Choose Box / parcel under Carry for a fitted box. Keep Weapon set to None for the two-hand grip. Pick up lifts it, carry clips hold it between the wrists, and Put down / drop returns it to the floor.';
  if (['open_door','use_press','push'].includes(id)) return 'Stage the character near the intended object. Prop contact is not solved automatically.';
  return clipById.get(id)?.loop ? 'Repeats naturally for the duration of this action.' : 'Plays once, then holds its last pose. Choose the clip length for its original timing.';
}
