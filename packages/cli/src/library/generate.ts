/**
 * Builds a character and exports it as GLB bytes: the work the library's worker does. It shares the generator and
 * exporter with the builder and the CLI, so a character made here matches an export from either.
 */
import { unzipSync } from 'fflate';
import { AssetLibrary } from '../../../../src/core/assets';
import { buildHuman } from '../../../../src/core/human';
import { DEFAULT_PARAMS, PRESETS, type HumanParams } from '../../../../src/core/params';
import { CLIPS } from '../../../../src/core/anim/clips';
import { characterExample, parseCharacterInput } from '../../../../src/app/character-assist';
import { exportClipName, planExport, runExport, stemOf, type ExportSettings } from '../../../../src/export';

/** What to build: a preset name, an "ara-character" object, or character settings (as in a params.json). */
export type CharacterInput = string | Record<string, unknown>;

export interface GenerateOptions {
  /** Clip IDs or groups (such as "locomotion"), "all" (the default) or "none". */
  animations?: string[] | 'all' | 'none';
  detail?: 'low' | 'medium' | 'high';
  rootMotion?: boolean;
  weapon?: HumanParams['weapon'];
  carry?: HumanParams['carry'];
  vehicle?: HumanParams['vehicle'];
}

export interface GeneratedFile { name: string; data: Uint8Array }
export interface Generated {
  /** The character's GLB, then any prop GLBs (a vehicle, or a separate weapon). */
  files: GeneratedFile[];
  params: HumanParams;
  /** Standing height in metres. */
  height: number;
  /** Clip ID -> the animation's name inside the GLB. */
  clipNames: Record<string, string>;
}

const libraries = new Map<string, Promise<AssetLibrary>>();
/** The character data at `assetsUrl`, loaded once and shared by every character built from it. */
export function libraryAt(assetsUrl: string) {
  const base = assetsUrl.endsWith('/') ? assetsUrl : `${assetsUrl}/`;
  let lib = libraries.get(base);
  if (!lib) {
    lib = new AssetLibrary({ read: async (path) => {
      const response = await fetch(base + path);
      if (!response.ok) throw Error(`Could not load the character data (${response.status}) from ${base + path}`);
      return new Uint8Array(await response.arrayBuffer());
    } }).init();
    lib.catch(() => libraries.delete(base));libraries.set(base, lib);
  }
  return lib;
}

function clipIds(choice: GenerateOptions['animations']) {
  if (!choice || choice === 'all') return CLIPS.map((c) => c.id);
  if (choice === 'none') return [];
  const ids = new Set<string>();
  for (const item of choice) {
    const clip = CLIPS.find((c) => c.id === item), group = CLIPS.filter((c) => c.category.toLowerCase() === item.toLowerCase());
    if (clip) ids.add(clip.id);
    else if (group.length) for (const c of group) ids.add(c.id);
    else throw Error(`Unknown animation "${item}". Use clip IDs or categories from ANIMATIONS.`);
  }
  return [...ids];
}

export async function generate(lib: AssetLibrary, input: CharacterInput, options: GenerateOptions = {}, onProgress?: (label: string, fraction: number) => void): Promise<Generated> {
  let params: HumanParams;
  if (typeof input === 'string') {
    if (!PRESETS[input]) throw Error(`Unknown preset "${input}". See PRESET_NAMES.`);
    params = { ...DEFAULT_PARAMS, ...structuredClone(PRESETS[input]), name: input };
  } else {
    // The same checks as the builder's LLM Assist and the CLI: unknown fields and out-of-range values are errors.
    const raw = 'kind' in input || 'preset' in input ? { kind: characterExample().kind, version: 1, ...input } : input;
    params = parseCharacterInput(JSON.stringify(raw), lib.catalog);
  }
  const clips = clipIds(options.animations);
  params = {
    ...params,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.weapon ? { weapon: options.weapon } : {}),
    ...(options.carry ? { carry: options.carry } : {}),
    ...(options.vehicle ? { vehicle: options.vehicle } : {}),
    ...(options.animations === 'none' ? { animations: false } : {}),
  };
  onProgress?.('Building the character', 0);
  const character = await buildHuman(lib, params);
  const settings: ExportSettings = {
    mode: !character.rig ? 'static' : params.animations && clips.length ? 'animated' : 'rigged',
    format: 'glb', clips, packaging: 'embedded', clipMesh: false, rootMotion: !!options.rootMotion, loopSuffix: false, weaponFile: 'held', stageProps: false,
  };
  const file = await runExport(lib, character, planExport(character, settings), { onProgress: (label, fraction = 0) => onProgress?.(label, fraction) });
  // A character with props comes back as a zip: the character's GLB plus props/*.glb. The character comes first.
  const own = `${stemOf(params.name)}.glb`;
  const files: GeneratedFile[] = file.name.endsWith('.zip')
    ? Object.entries(unzipSync(file.data)).filter(([path]) => path.endsWith('.glb'))
      .map(([path, data]) => ({ name: path.split('/').pop()!, data, main: !path.includes('/props/') && path.endsWith(`/${own}`) }))
      .sort((a, b) => Number(b.main) - Number(a.main)).map(({ name, data }) => ({ name, data }))
    : [{ name: file.name, data: file.data }];
  return { files, params, height: character.height, clipNames: Object.fromEntries(clips.map((id) => [id, exportClipName(id, settings)])) };
}
