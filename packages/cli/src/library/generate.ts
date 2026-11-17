/**
 * Builds a character and exports it as GLB bytes: the work the library's worker does. It shares the generator and
 * exporter with the builder and the CLI, so a character made here matches an export from either.
 */
import { unzipSync } from 'fflate';
import { AssetLibrary } from '../../../../src/core/assets';
import { buildHuman } from '../../../../src/core/human';
import { neededTargets } from '../../../../src/core/morph';
import { DEFAULT_PARAMS, PRESETS, randomParams, type HumanParams } from '../../../../src/core/params';
import { decodeCharacter } from '../../../../src/app/share';
import { CLIPS } from '../../../../src/core/anim/clips';
import { characterExample, parseCharacterInput } from '../../../../src/app/character-assist';
import { exportClipName, planExport, runExport, stemOf, type ExportSettings } from '../../../../src/export';
import { vehicleStyleForChoice } from '../../../../src/core/props/vehicles';
import { applyColors, colorsOf, type CharacterColors } from './colors';

/**
 * What to build: a preset name, a share link from the Ara builder, { random: seed }, an "ara-character" object, or
 * character settings (as in a params.json).
 */
export type CharacterInput = string | { random: number; name?: string } | Record<string, unknown>;

export interface GenerateOptions {
  /** Clip IDs or groups (such as "locomotion"), "all" (the default) or "none". */
  animations?: string[] | 'all' | 'none';
  detail?: 'low' | 'medium' | 'high';
  rootMotion?: boolean;
  weapon?: HumanParams['weapon'];
  carry?: HumanParams['carry'];
  vehicle?: HumanParams['vehicle'];
  /** New colours for the outfit, top, jacket, bottom, shoes, carried item or vehicle. */
  colors?: CharacterColors;
}

export interface GeneratedFile { name: string; data: Uint8Array }
export interface Generated {
  /** The character's GLB, then any prop GLBs (a vehicle, or a separate weapon). */
  files: GeneratedFile[];
  params: HumanParams;
  /** The colour of each part that can be recoloured. */
  colors: CharacterColors;
  /** Standing height in metres. */
  height: number;
  /** Clip ID -> the animation's name inside the GLB. */
  clipNames: Record<string, string>;
}

/**
 * Downloads one data file. A dropped connection, a stalled server or a busy one (5xx, 429) is tried again up to four
 * times, waiting 0.5, 1, 2 and 4 seconds, so a CDN hiccup slows a character down instead of breaking it.
 */
async function download(url: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    // A server that hasn't started answering in 20 seconds is given up on and asked again.
    const stalled = new AbortController(), timer = setTimeout(() => stalled.abort(), 20000);
    try {
      const response = await fetch(url, { signal: stalled.signal });
      clearTimeout(timer);
      status = response.status;
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch { status = 0; /* No response, or the download broke off: try again. */ } finally { clearTimeout(timer); }
    const again = attempt < 4 && (status === 0 || status === 429 || status >= 500);
    if (!again) throw Error(status ? `Could not load the character data (${status}) from ${url}` : `Could not reach the character data at ${url}. Check the internet connection.`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

const libraries = new Map<string, Promise<AssetLibrary>>();
/** The character data at `assetsUrl`, loaded once and shared by every character built from it. */
export function libraryAt(assetsUrl: string) {
  const base = assetsUrl.endsWith('/') ? assetsUrl : `${assetsUrl}/`;
  let lib = libraries.get(base);
  if (!lib) {
    lib = new AssetLibrary({ read: (path) => download(base + path) }).initWeb();
    lib.catch(() => libraries.delete(base));libraries.set(base, lib);
  }
  return lib;
}

export function clipIds(choice: GenerateOptions['animations']) {
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

/**
 * The character settings for an input: a preset name, a share link from the builder, { random: seed }, an
 * "ara-character" object or character settings. Used by the library and the ara3d MCP server.
 */
export function characterParams(lib: AssetLibrary, input: CharacterInput): HumanParams {
  let params: HumanParams;
  const share = typeof input === 'string' ? /[#&?]c=([A-Za-z0-9_-]+)/.exec(input) : null;
  if (share) {
    // A link from the builder's Share button: the character as designed there.
    const shared = decodeCharacter(share[1], DEFAULT_PARAMS.detail);
    if (!shared) throw Error('That share link could not be read. Copy it again from the Ara builder (Share, then Copy link).');
    params = shared;
  } else if (typeof input === 'string') {
    if (!PRESETS[input]) throw Error(`Unknown preset "${input}". See PRESET_NAMES, or pass a share link from the Ara builder.`);
    params = { ...DEFAULT_PARAMS, ...structuredClone(PRESETS[input]), name: input };
  } else if ('random' in input) {
    // The same seed always gives the same character, as with ara3d export --random.
    const seed = Number(input.random);
    if (!Number.isInteger(seed) || seed < 0 || seed > 1e9) throw Error('random takes a whole number from 0 to 1,000,000,000.');
    params = { ...randomParams(seed, lib.catalog), name: typeof input.name === 'string' ? input.name : `random_${seed}` };
  } else {
    // The same checks as the builder's LLM Assist and the CLI: unknown fields and out-of-range values are errors.
    const raw = 'kind' in input || 'preset' in input ? { kind: characterExample().kind, version: 1, ...input } : input;
    params = parseCharacterInput(JSON.stringify(raw), lib.catalog);
  }
  return params;
}

/** Texting and phone calls need the phone in hand: clips asked for by name bring it, unless a carried item was chosen. */
export const needsPhone = (clips: readonly string[], carry?: string) => !carry && clips.some((id) => id === 'phone_call' || id === 'texting');

export async function generate(lib: AssetLibrary, input: CharacterInput, options: GenerateOptions = {}, onProgress?: (label: string, fraction: number) => void): Promise<Generated> {
  let params = characterParams(lib, input);
  const clips = clipIds(options.animations);
  const phone = Array.isArray(options.animations) && needsPhone(clips, options.carry);
  params = {
    ...params,
    ...(options.detail ? { detail: options.detail } : {}),
    ...(options.weapon ? { weapon: options.weapon } : {}),
    ...(options.carry ? { carry: options.carry } : phone ? { carry: 'phone' } : {}),
    // A newly chosen vehicle gets its own factory paint, as in the builder.
    ...(options.vehicle ? { vehicle: options.vehicle, vehicleStyle: vehicleStyleForChoice(options.vehicle, params.vehicleStyle) } : {}),
    ...(options.animations === 'none' ? { animations: false } : {}),
  };
  if (options.colors) params = applyColors(params, options.colors);
  onProgress?.('Building the character', 0);
  // Only the body shapes this character uses are downloaded.
  await lib.loadTargets(neededTargets(lib, params));
  const character = await buildHuman(lib, params);
  const settings: ExportSettings = {
    mode: !character.rig ? 'static' : params.animations && clips.length ? 'animated' : 'rigged',
    format: 'glb', clips, packaging: 'embedded', clipMesh: false, rootMotion: !!options.rootMotion, loopSuffix: false, weaponFile: 'held', stageProps: false,
  };
  // Low and medium detail use textures up to 1024 pixels across, which look the same at web sizes; high keeps the full ones.
  const file = await runExport(lib, character, planExport(character, settings), { onProgress: (label, fraction = 0) => onProgress?.(label, fraction), smallTextures: params.detail !== 'high' });
  // A character with props comes back as a zip: the character's GLB plus props/*.glb. The character comes first.
  const own = `${stemOf(params.name)}.glb`;
  const files: GeneratedFile[] = file.name.endsWith('.zip')
    ? Object.entries(unzipSync(file.data)).filter(([path]) => path.endsWith('.glb'))
      .map(([path, data]) => ({ name: path.split('/').pop()!, data, main: !path.includes('/props/') && path.endsWith(`/${own}`) }))
      .sort((a, b) => Number(b.main) - Number(a.main)).map(({ name, data }) => ({ name, data }))
    : [{ name: file.name, data: file.data }];
  return { files, params, colors: colorsOf(params), height: character.height, clipNames: Object.fromEntries(clips.map((id) => [id, exportClipName(id, settings)])) };
}
