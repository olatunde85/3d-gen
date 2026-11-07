import {animationGroup,animationMatches} from '../core/anim/groups';
import {VEHICLE_FOR_CLIP,VEHICLE_LABELS} from '../core/props/vehicles';
import { CLIPS, clipById } from '../core/anim/clips';
import {manoeuvre} from '../core/props/vehicle-motion';
export const ANIMATION_CATEGORIES = [...new Set(CLIPS.map(animationGroup))];
export function searchAnimations(query: string, category = '') {
  return CLIPS.filter(c=>animationMatches(c,query,category));
}
export function actionNote(id: string, weapon?: string, seats?: number) {
  if(clipById.get(id)?.category==='Aerial')return 'Aerial performance. For parachuting equip Parachute / skydiving rig under Carry. Use skydive → parachute_deploy (2.4s) → parachute_glide → parachute_land (3s). Start height controls descent to the next aerial beat; landing reaches ground and finishes upright. Use full timing for deploy/land; optional glide movement travels forward. No wind or terrain-following simulation.';
  if(clipById.get(id)?.category==='Swimming'){
    if(id==='dive_into_water')return 'Dive from the bank into the water: crouch, spring out head first, glide underwater and surface. Start at the water’s edge facing the water, with movement on (about 3.5 m). Follow with a stroke or Tread water. Weapons are hidden.';
    if(id==='climb_out_of_water')return 'Climb out onto a bank at water level: hands on the edge, press up, knee on, stand. Start in the water facing the bank, within half a metre of the edge, with movement on (about 0.9 m). Weapons are hidden.';
    return 'Swims at the water surface: only the head and shoulders show above the water. Keep the actor inside the set’s water. Enable movement to travel (tread water stays in place). Weapons are hidden.';
  }
  if(id==='roll_forward')return 'Forward (shoulder) roll: crouch, tuck and roll over the back, then stand. Enable movement to travel about 2 m forward.';
  if(id==='dodge_left'||id==='dodge_right')return 'Quick side dodge: push off and land low on the near leg, guard up, then recover. Enable movement to travel about 1.2 m sideways.';
  if(clipById.get(id)?.vehicleStunt)return 'Controlled 360° stunt roll; rider and vehicle finish upright. Full 3 s, movement off, wide clear area. Weapons hidden.';
  if(id==='fly_jet')return 'Pilot a single-seat jet. Flight height sets the cruise altitude: the jet pitches with its climb, banks gently with the stick and folds its gear once airborne. Put Take off jet before and Land jet after for a full runway sequence; on its own a moving flight eases up and down automatically. Set height 0 to taxi. Board/alight only on the ground. Wings need a wide clear route; the jet defaults to 18 m/s.';
  if(id==='takeoff_jet')return 'Runway take-off over 6 seconds: accelerates from a standstill, rotates nose-up, lifts off halfway and climbs to Flight height (default: the next flight’s height, else 8 m), folding the gear. Always travels forward (about 80 m at 18 m/s). Follow with Pilot jet.';
  if(id==='taxi_jet')return 'Drive the jet along the runway on its wheels (loops). Always travels forward, default 8 m/s; the jet stays on the ground with its gear down. Follow with Take off jet.';
  if(id==='bailout_jet')return 'Bail out of the flying jet: the canopy opens, the pilot jumps clear on the right and turns belly-down into free fall while the empty jet flies on and leaves the shot. Equip Parachute / skydiving rig under Carry and follow with Skydive → Activate parachute → glide → land. Use a high flight (20–30 m); free fall starts just below the jet.';
  if(id==='bailout_helicopter')return 'Jump from the helicopter: the right-hand door opens and the pilot or passenger dives out into free fall; the helicopter then flies away. Equip Parachute / skydiving rig under Carry and follow with Skydive → Activate parachute → glide → land. Hover or fly high (20–30 m).';
  if(id.startsWith('crash_fall_'))return 'Driver thrown out left, lands on their back ~3 m away; follow with Get up (from back) or leave down. Vehicle rolls over and stays upside down. Full length, movement off, wide clear area.';
  if(manoeuvre(id)==='crash')return 'Driver dives out left, rolls and stands ~3 m away facing forward. Vehicle rolls over and stays upside down. Full length, movement off, wide clear area.';
  if(id==='gun_tank')return 'The tank driver stands in the open roof hatch and fires the pintle machine gun in bursts, head and shoulders above the gun shield. The gun traverses slowly. Movement is optional. Follow or precede Drive military tank; the hatch closes again when driving.';
  if(id==='land_jet')return 'Runway landing over 6 seconds: descends from the previous flight’s height with gear down, flares and touches down at 3.6 seconds, then brakes to a stop (about 85 m at 18 m/s). Always travels forward. Follow with Alight from jet cockpit.';
  const transition=clipById.get(id)?.vehicleTransition;
  if(transition)return `${transition.direction==='board'?'Boards':'Leaves'} the ${VEHICLE_LABELS[VEHICLE_FOR_CLIP[id]].toLowerCase()}. Use the full clip length with movement off. ${transition.direction==='board'?`Follow with ${clipById.get(transition.ride)!.name}.`:'Ends upright beside the parked vehicle.'} Keep the entry side clear.${weapon&&weapon!=='none'?' The weapon is hidden during this transition.':''}`;
  if (['sit_down','sit_idle','stand_up'].includes(id)) return seats === 0
    ? 'This set has nothing to sit on. Choose a set with chairs, sofas or benches, or the character sits on thin air.'
    : 'Sits on the set’s furniture: Studio moves the character to the nearest free seat (chair, sofa, bench or stool).';
  if(id==='fly_helicopter')return 'Pilot a four-seat helicopter. Move through the set controls forward travel; Flight height controls automatic takeoff and landing. Leave height empty for 3 m while moving, or set a positive height with movement off to hover. Board and alight on the ground; leave room for the rotor.';
  if(VEHICLE_FOR_CLIP[id])return `${VEHICLE_LABELS[VEHICLE_FOR_CLIP[id]]}, fitted to the rider and selected by this action. Move through the set travels at an adjustable speed; Show vehicle hides it for shared passengers.`;
  if (id === 'sleep' || id === 'lie_down') return 'Performed at floor level. Use character elevation to stage it on a raised surface.';
  if(id==='throw_grenade')return 'Equip Grenade under Weapon props. Releases at 0.82 seconds, follows a visual arc and settles on the ground. Use the full 2.2 second action. No explosion or damage simulation.';
  if (id.startsWith('rifle')) return weapon==='rifle'?'Uses this character’s equipped rifle.':'Choose a rifle in Equipment for this performance.';
  if (id.startsWith('pistol')) return weapon==='pistol'?'Uses this character’s equipped pistol.':'Choose a pistol in Equipment for this performance.';
  if (id.startsWith('sword')) return weapon==='sword'?'Uses this character’s equipped sword.':'Choose a sword in Equipment for this performance.';
  if(id==='head_load_idle'||id==='head_load_walk')return 'Choose Head load (basin) under Carry: an enamel basin of produce on a cloth head pad. The right hand steadies the rim and the head stays level; the walk keeps the recorded footfalls at a steadier pace. Keep Weapon set to None.';
  if(['carry_idle','carry_walk','pick_up','put_down'].includes(id))return 'Choose Box / parcel under Carry for a fitted box. Keep Weapon set to None for the two-hand grip. Pick up lifts it, carry clips hold it between the wrists, and Put down / drop returns it to the floor.';
  if (['open_door','use_press','push'].includes(id)) return 'Stage the character near the intended object. Prop contact is not solved automatically.';
  return clipById.get(id)?.loop ? 'Repeats naturally for the duration of this action.' : 'Plays once, then holds its last pose. Choose the clip length for its original timing.';
}
