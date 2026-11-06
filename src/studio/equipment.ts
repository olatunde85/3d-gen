/** Equipment edits reuse Ara's fitted/rigged props and remain part of the character recipe. */
import { decodeCharacter, encodeCharacter } from '../app/share';
import { CARRIED, CARRY_LABELS, type CarryId } from '../core/props/carry';
import { WEAPONS, WEAPON_LABELS,isFirearm, type WeaponId } from '../core/props/weapons';
import type { ActorTrack } from './project';
export { CARRIED, CARRY_LABELS, WEAPONS, WEAPON_LABELS };
/** Keep existing action tracks usable after an Equipment edit or a builder round trip. */
export function reconcileWeaponActions(actor:ActorTrack){
  const weapon=decodeCharacter(actor.character,actor.detail)!.weapon;
  for(const b of actor.beats){if(weapon==='none'){if(b.weaponPose!=='hidden')delete b.weaponPose;delete b.weaponYaw;}else if(b.weaponPose==='fire'&&!isFirearm(weapon))b.weaponPose='hold';}
}
export function equipActor(actor: Pick<ActorTrack, 'character' | 'detail'>, slot: 'weapon' | 'carry', value: string): string {
  const params = decodeCharacter(actor.character, actor.detail);
  if (!params) throw new Error('This character recipe could not be opened.');
  if (slot === 'weapon') {
    if (!WEAPONS.includes(value as WeaponId)) throw new Error('Choose an available weapon.');
    params.weapon = value as WeaponId;
  } else {
    if (!CARRIED.includes(value as CarryId)) throw new Error('Choose an available carried prop.');
    params.carry = value as CarryId;
  }
  return encodeCharacter(params);
}
