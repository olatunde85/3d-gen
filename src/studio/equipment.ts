/** Equipment edits reuse Ara's fitted/rigged props and remain part of the character recipe. */
import { decodeCharacter, encodeCharacter } from '../app/share';
import { CARRIED, CARRY_LABELS, type CarryId } from '../core/props/carry';
import { WEAPONS, WEAPON_LABELS, type WeaponId } from '../core/props/weapons';
import type { ActorTrack } from './project';
export { CARRIED, CARRY_LABELS, WEAPONS, WEAPON_LABELS };
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
