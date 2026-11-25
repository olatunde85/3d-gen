/**
 * A character from its recipe, wherever Ara shows characters: built from the recipe's settings, or, for an imported
 * character, opened from the model kept in this browser with the recipe's name and props.
 */
import type { AssetLibrary } from '../../core/assets';
import type { Character } from '../../core/human';
import type { HumanParams } from '../../core/params';
import type { Equipment } from '../../core/props/equip';
import type { Engine } from '../engine';
import { openCharacter, registerTextures } from './store';

/** The props a recipe gives a character. */
export const equipmentOf = (p: HumanParams): Equipment => ({ weapon: p.weapon, carry: p.carry, vehicle: p.vehicle, vehicleStyle: p.vehicleStyle, garmentStyles: p.garmentStyles });

/** Builds (or, for an imported character, opens) the character a recipe describes, rigged and animated. */
export async function characterFor(p: HumanParams, engine: Engine, lib: AssetLibrary, progress?: (label: string, frac?: number) => void): Promise<Character> {
  if (!p.imported) return engine.build({ ...p, rig: p.rig === 'none' ? 'game' : p.rig, animations: true }, progress);
  const name = p.name || 'This character';
  const c = await openCharacter(p.imported, (stage) => progress?.(`${name}: ${stage}`)).catch(() => {
    throw Error(`${name} is a character imported from a model file in another browser, or removed from this one. Open its model in the builder here, then choose it again.`);
  });
  registerTextures(lib, c.textures);
  const ch = await engine.use({ ...c.character, params: { ...c.character.params, name } }, c.textures, equipmentOf(p));
  return ch;
}
