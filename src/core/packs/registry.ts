/**
 * The content packs loaded in this page or process. Registering a pack adds its items to Ara's own lists (its
 * animations join CLIPS and clipById), so every part of Ara that lists, checks, plays or exports clips uses them
 * like built-in ones.
 */
import { BUILT_IN_CLIPS, CLIPS, removeClips, replaceClips, type Clip } from '../anim/clips';
import { clipFromMocap, type MocapData } from '../anim/mocap';
import { parsePack, splitItemId, type Pack } from './format';

export interface LoadedPack {
  pack: Pack;
  /** Where it was loaded from, when it has a web address (films and games that use it record this). */
  url?: string;
  /** The pack file as text, for background workers that keep their own registry. */
  text: string;
  /** Full IDs of the animations it added. */
  animations: string[];
  /** The pack's name as the apps list it: its own, or with "(import)" when an Ara group or another pack has that name. */
  label: string;
}
export interface PackRef { id: string; name?: string; url?: string }

const loaded = new Map<string, LoadedPack>();
const listeners = new Set<() => void>();

/** A clip that decodes its motion the first time it is played (a pack can hold hundreds). */
function lazyClip(d: MocapData, meta: { id: string; name: string; category: Clip['category'] }, pack: Clip['pack']): Clip {
  let real: Clip | undefined;
  // Chained cuts share their grounding by key: keep each pack's keys to itself.
  const data = d.anchor ? { ...d, anchor: { ...d.anchor, key: `${pack!.id}/${d.anchor.key}` } } : d;
  return { ...meta, pack, duration: d.duration, loop: d.loop, travel: d.travel, sample: (t) => (real ??= clipFromMocap(data, meta)).sample(t) };
}

/**
 * Adds a pack. Loading the same pack again changes nothing; a different pack with the same ID is refused until the
 * other one is removed, unless `replace` is set (a newer version takes its place).
 */
export function registerPack(source: string | Pack, options: { url?: string; replace?: boolean } = {}): LoadedPack {
  const text = typeof source === 'string' ? source : JSON.stringify(source);
  const pack = typeof source === 'string' ? parsePack(source) : parsePack(source as unknown);
  const before = loaded.get(pack.id);
  if (before) {
    if (before.text === text || (options.url && before.url === options.url && !options.replace)) return before;
    // A new version takes the old one's place in one step (see below), so its clips are never missing in between.
    if (options.replace) loaded.delete(pack.id);
    else throw Error(`Another pack called "${pack.id}" is loaded${before.url ? ` (from ${before.url})` : ''}. Remove it first.`);
  }
  // Names that clash are told apart: a pack named like an Ara group or another pack gets "(import)", and an animation
  // named like another gets its pack's name, so every tab and every animation in a list is distinct.
  const groups = new Set([...BUILT_IN_CLIPS.map((c) => c.category.toLowerCase()), ...[...loaded.values()].map((p) => p.label.toLowerCase())]);
  let label = pack.name;
  for (let n = 1; groups.has(label.toLowerCase()); n++) label = `${pack.name} (import${n > 1 ? ` ${n}` : ''})`;
  const replaced = new Set(before?.animations ?? []);
  const info = { id: pack.id, name: label }, names = new Set(CLIPS.filter((c) => !replaced.has(c.id)).map((c) => c.name.toLowerCase()));
  const clips = (pack.animations ?? []).map((a) => {
    let shown = a.name;
    for (let n = 1; names.has(shown.toLowerCase()); n++) shown = `${a.name} (${label}${n > 1 ? ` ${n}` : ''})`;
    names.add(shown.toLowerCase());
    return lazyClip(a.motion, { id: `${pack.id}/${a.id}`, name: shown, category: a.category }, info);
  });
  const entry: LoadedPack = { pack, ...(options.url ? { url: options.url } : {}), text, animations: clips.map((c) => c.id), label };
  // Listed before its clips are added, so anything that redraws on the new clips sees the pack too.
  loaded.set(pack.id, entry);
  try { replaceClips(replaced, clips); } catch (error) { loaded.delete(pack.id);if (before) loaded.set(pack.id, before);throw error; }
  for (const fn of listeners) fn();
  return entry;
}

/** Removes a pack and everything it added. */
export function unregisterPack(id: string) {
  const entry = loaded.get(id);
  if (!entry) return;
  loaded.delete(id);
  removeClips(entry.animations);
  for (const fn of listeners) fn();
}

export const loadedPacks = (): LoadedPack[] => [...loaded.values()];

/** Makes this registry hold exactly these packs (a worker following its page's packs). */
export function syncPacks(packs: readonly { text: string; url?: string }[]) {
  const texts = new Set(packs.map((p) => p.text));
  // Packs dropped or replaced by another version go first, so a new version of a pack takes its place.
  for (const [id, entry] of [...loaded]) if (!texts.has(entry.text)) unregisterPack(id);
  for (const p of packs) {
    try { registerPack(p.text, p.url ? { url: p.url } : {}); }
    catch { /* The page already reported it. */ }
  }
}
export const loadedPack = (id: string): LoadedPack | undefined => loaded.get(id);

/** Calls `fn` whenever a pack is added or removed; returns a function that stops it. */
export function onPacksChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The packs that items (such as the clips of a film) come from, in a form to save with the film or game. */
export function packRefsFor(items: Iterable<string>): PackRef[] {
  const ids = new Set<string>();
  for (const item of items) { const s = splitItemId(item);if (s) ids.add(s.pack); }
  return [...ids].sort().map((id) => {
    const entry = loaded.get(id);
    return { id, ...(entry ? { name: entry.pack.name } : {}), ...(entry?.url ? { url: entry.url } : {}) };
  });
}

/** An error message for an item from a pack that isn't loaded, or undefined for other IDs. */
export function missingPackMessage(item: string): string | undefined {
  const s = splitItemId(item);
  if (!s || loaded.get(s.pack)?.animations.includes(item)) return undefined;
  return loaded.has(s.pack) ? `The ${loaded.get(s.pack)!.pack.name} pack has no "${s.item}".` : `"${item}" comes from the ${s.pack} pack, which isn't loaded. Add the pack, then try again.`;
}
