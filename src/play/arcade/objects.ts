/**
 * Objects to find on a run: dossiers, relics, keys and treasure placed along the course. Each object has a type
 * (its 3D model and default name), a name the creator can change, an icon for the HUD and cards, how many pieces
 * to collect and an optional clue revealed when it is found.
 */
export const RUNNER_OBJECT_TYPES = ['dossier', 'letter', 'map', 'journal', 'magnifier', 'key', 'compass', 'dagger', 'figurine', 'mask', 'amulet', 'gem', 'crown', 'chest', 'hourglass'] as const;
export type RunnerObjectType = (typeof RUNNER_OBJECT_TYPES)[number];
export const RUNNER_OBJECT_NAMES: Record<RunnerObjectType, string> = {
  dossier: 'Dossier', letter: 'Sealed letter', map: 'Old map', journal: 'Journal', magnifier: 'Magnifier', key: 'Brass key', compass: 'Compass',
  dagger: 'Ancient dagger', figurine: 'Figurine', mask: 'Tribal mask', amulet: 'Amulet', gem: 'Gemstone', crown: 'Crown', chest: 'Treasure box', hourglass: 'Hourglass',
};
/** Icons that suit any object or clue, beside each type's own icon. */
export const RUNNER_GENERIC_ICONS = ['star', 'question', 'eye', 'fingerprint', 'footprints', 'lock', 'skull', 'flag', 'puzzle', 'feather', 'moon', 'pin'] as const;
export const RUNNER_OBJECT_ICONS = [...RUNNER_OBJECT_TYPES, ...RUNNER_GENERIC_ICONS] as const;
export type RunnerObjectIcon = (typeof RUNNER_OBJECT_ICONS)[number];
export const RUNNER_ICON_NAMES: Record<RunnerObjectIcon, string> = {
  ...RUNNER_OBJECT_NAMES, map: 'Map', key: 'Key', dagger: 'Dagger', mask: 'Mask', gem: 'Gem', chest: 'Treasure box', letter: 'Letter',
  star: 'Star', question: 'Question mark', eye: 'Eye', fingerprint: 'Fingerprint', footprints: 'Footprints', lock: 'Lock', skull: 'Skull', flag: 'Flag', puzzle: 'Puzzle piece', feather: 'Feather', moon: 'Moon', pin: 'Map pin',
};
export interface RunnerObject { type: RunnerObjectType; name: string; icon: RunnerObjectIcon; count: number; clue?: string }
export const MAX_RUNNER_OBJECTS = 8;
export const runnerObject = (type: RunnerObjectType): RunnerObject => ({ type, name: RUNNER_OBJECT_NAMES[type], icon: type, count: 1 });
/** Pieces in the whole list. */
export const objectPieces = (list: readonly RunnerObject[]) => list.reduce((n, o) => n + o.count, 0);

export function parseRunnerObjects(raw: unknown): RunnerObject[] {
  if (!Array.isArray(raw) || raw.length > MAX_RUNNER_OBJECTS) throw Error(`runner.objects: use a list of up to ${MAX_RUNNER_OBJECTS} objects.`);
  return raw.map((item, i) => {
    const at = `runner.objects[${i}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error(`${at}: use an object with a type.`);
    const o = item as Record<string, unknown>;
    for (const key of Object.keys(o)) if (!['type', 'name', 'icon', 'count', 'clue'].includes(key)) throw Error(`Unsupported ${at} setting: ${key}.`);
    if (!RUNNER_OBJECT_TYPES.includes(o.type as RunnerObjectType)) throw Error(`${at}.type: choose one of ${RUNNER_OBJECT_TYPES.join(', ')}.`);
    const type = o.type as RunnerObjectType, name = o.name === undefined ? RUNNER_OBJECT_NAMES[type] : o.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 40) throw Error(`${at}.name: use 1 to 40 characters.`);
    const icon = o.icon === undefined ? type : o.icon;
    if (!RUNNER_OBJECT_ICONS.includes(icon as RunnerObjectIcon)) throw Error(`${at}.icon: choose one of ${RUNNER_OBJECT_ICONS.join(', ')}.`);
    const count = o.count === undefined ? 1 : o.count;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > 10) throw Error(`${at}.count: use a whole number from 1 to 10.`);
    if (o.clue !== undefined && (typeof o.clue !== 'string' || o.clue.length > 160)) throw Error(`${at}.clue: use up to 160 characters.`);
    const clue = typeof o.clue === 'string' && o.clue.trim() ? o.clue.trim() : undefined;
    return { type, name: name.trim(), icon: icon as RunnerObjectIcon, count: count as number, ...(clue ? { clue } : {}) };
  });
}
