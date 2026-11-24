/**
 * Content packs: files that add to what Ara offers without changing Ara itself. A pack is data only (no code), so
 * any pack is safe to open; its contents are checked here before Ara uses them.
 *
 *   { "kind": "ara-pack", "version": 1, "id": "salsa", "name": "Salsa", "author": "…", "license": "CC-BY-4.0",
 *     "animations": [{ "id": "basic", "name": "Salsa basic", "category": "Emotes", "motion": { …MocapData… } }] }
 *
 * Everything a pack adds is named "<pack>/<item>" (salsa/basic), so packs never clash with Ara's own items or with
 * each other, and films and games that use them can say which packs they need.
 */
import type { ClipCategory } from '../anim/clips/types';
import { MOCAP_BONES, REQUIRED_MOCAP_BONES } from '../anim/mocap-bones';
import type { MocapData } from '../anim/mocap';

export const PACK_KIND = 'ara-pack';
export const PACK_VERSION = 1;
/** The file name ending packs use. */
export const PACK_EXTENSION = '.ara-pack.json';
/** Largest pack file, in characters. */
export const MAX_PACK_SIZE = 32_000_000;
export const MAX_PACK_ANIMATIONS = 400;
/** Longest animation, in seconds. */
export const MAX_ANIMATION_SECONDS = 120;
/** A pack's ID: 2 to 40 lower-case letters, digits and hyphens, starting with a letter or digit. */
export const PACK_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** An item's ID inside its pack: 1 to 48 lower-case letters, digits and underscores. */
export const ITEM_ID = /^[a-z0-9][a-z0-9_]{0,47}$/;
/** A full item ID: "<pack>/<item>". */
export const PACK_ITEM_ID = /^([a-z0-9][a-z0-9-]{1,39})\/([a-z0-9][a-z0-9_]{0,47})$/;

/**
 * The groups a pack's animations can join. The others (aerial, climbing, swimming, vehicles, shooter) start
 * behaviour that only Ara's own clips are made for, such as props, water and seats.
 */
export const PACK_CATEGORIES = ['Idle & stance', 'Locomotion', 'Turns', 'Actions', 'Emotes', 'Reactions', 'Sitting & lying', 'Interaction', 'Everyday', 'Combat', 'Sports', 'Fitness'] as const satisfies readonly ClipCategory[];

export interface PackAnimation {
  /** ID inside the pack (the full ID is "<pack>/<id>"). */
  id: string;
  name: string;
  category: (typeof PACK_CATEGORIES)[number];
  /** The motion, retargeted and compressed (as `ara3d pack` writes it). */
  motion: MocapData;
}

export interface Pack {
  kind: typeof PACK_KIND;
  version: typeof PACK_VERSION;
  id: string;
  name: string;
  author?: string;
  /** An SPDX licence ID or a short licence name, such as CC-BY-4.0. */
  license?: string;
  /** A web page about the pack. */
  homepage?: string;
  description?: string;
  animations?: PackAnimation[];
}

/** The pack and item of a full item ID ("salsa/basic"), or undefined for Ara's own items. */
export function splitItemId(id: string): { pack: string; item: string } | undefined {
  const m = PACK_ITEM_ID.exec(id);
  return m ? { pack: m[1], item: m[2] } : undefined;
}

/** A web address a pack can be loaded from: https, or http on this computer while developing. */
export function packUrl(value: string, base?: string): string {
  let url: URL;
  try { url = new URL(value.trim(), base); } catch { throw Error(`"${value}" isn't a web address.`); }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw Error('Pack addresses start with https://.');
  return url.href;
}

class PackError extends Error {}
const fail = (message: string): never => { throw new PackError(message); };
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, name: string, max: number, required = false): string | undefined => {
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || !v.trim() || v.length > max) fail(`${name} must be text of 1 to ${max} characters.`);
  return (v as string).trim();
};
const finite = (v: unknown, name: string, min = -Infinity, max = Infinity): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${name} must be a number${Number.isFinite(min) ? ` from ${min} to ${max}` : ''}.`);
  return v as number;
};
const numbers = (v: unknown, length: number, name: string, limit = 10): number[] => {
  if (!Array.isArray(v) || v.length !== length) fail(`${name} must be a list of ${length} numbers.`);
  return (v as unknown[]).map((x) => finite(x, name, -limit, limit));
};
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Bytes a base64 string decodes to, after checking it is base64. */
function base64Bytes(v: unknown, name: string): number {
  if (typeof v !== 'string' || v.length % 4 || !BASE64.test(v)) fail(`${name} must be base64 data.`);
  const s = v as string;
  return (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
}
const ALLOWED_BONES = new Set(MOCAP_BONES);

/** Checks one animation's motion data, returning a clean copy (unknown fields dropped). */
function parseMotion(v: unknown, where: string): MocapData {
  if (!isRecord(v)) return fail(`${where}: motion is missing.`);
  const duration = finite(v.duration, `${where}: motion duration`, 1 / 120, MAX_ANIMATION_SECONDS);
  if (typeof v.loop !== 'boolean') fail(`${where}: motion loop must be true or false.`);
  const frames = finite(v.frames, `${where}: motion frames`, 2, Math.ceil(MAX_ANIMATION_SECONDS * 60) + 1);
  if (!Number.isInteger(frames)) fail(`${where}: motion frames must be a whole number.`);
  if (!Array.isArray(v.bones) || !v.bones.length) fail(`${where}: motion bones must list the bones it moves.`);
  const bones = v.bones as unknown[];
  for (const b of bones) if (typeof b !== 'string' || !ALLOWED_BONES.has(b)) fail(`${where}: "${String(b)}" isn't a bone Ara animates. Use Ara's (Mixamo's) bone names: ${MOCAP_BONES.join(', ')}.`);
  if (new Set(bones).size !== bones.length) fail(`${where}: motion bones lists a bone twice.`);
  const missing = REQUIRED_MOCAP_BONES.filter((b) => !bones.includes(b));
  if (missing.length) fail(`${where}: the motion doesn't move ${missing.join(', ')}.`);
  if (base64Bytes(v.rot, `${where}: motion rot`) !== frames * bones.length * 8) fail(`${where}: motion rot holds the wrong amount of data for ${frames} frames of ${bones.length} bones.`);
  if (base64Bytes(v.hips, `${where}: motion hips`) !== frames * 6) fail(`${where}: motion hips holds the wrong amount of data for ${frames} frames.`);
  const table = (raw: unknown, size: 3 | 4, name: string) => {
    if (!isRecord(raw)) return fail(`${where}: motion ${name} is missing.`);
    const out: Record<string, number[]> = {};
    for (const [bone, value] of Object.entries(raw)) {
      if (!ALLOWED_BONES.has(bone)) fail(`${where}: motion ${name} names "${bone}", which isn't a bone Ara animates.`);
      out[bone] = numbers(value, size, `${where}: motion ${name}.${bone}`, 1.0001);
    }
    return out;
  };
  const motion: MocapData = {
    duration, loop: v.loop as boolean, frames, bones: bones as string[], rot: v.rot as string, hips: v.hips as string,
    dir: table(v.dir, 3, 'dir') as MocapData['dir'], bias: table(v.bias, 4, 'bias') as MocapData['bias'],
  };
  if (v.travel !== undefined) motion.travel = numbers(v.travel, 3, `${where}: motion travel`, 20) as MocapData['travel'];
  if (v.hands !== undefined) { if (v.hands !== 'fist') fail(`${where}: motion hands is "fist" or left out.`);motion.hands = 'fist'; }
  if (v.ground !== undefined) { if (typeof v.ground !== 'boolean') fail(`${where}: motion ground must be true or false.`);if (v.ground) motion.ground = true; }
  if (v.anchor !== undefined) {
    const a = v.anchor;
    if (!isRecord(a)) return fail(`${where}: motion anchor must be an object.`);
    motion.anchor = { rot: numbers(a.rot, bones.length * 4, `${where}: motion anchor rot`, 1.0001), hips: numbers(a.hips, 3, `${where}: motion anchor hips`) as [number, number, number], key: text(a.key, `${where}: motion anchor key`, 80, true)! };
  }
  return motion;
}

/** Checks a pack file and returns the pack, or throws an error that says what to fix. */
export function parsePack(source: string | unknown): Pack {
  try {
    if (typeof source === 'string' && source.length > MAX_PACK_SIZE) fail(`The pack is larger than ${MAX_PACK_SIZE / 1e6} MB.`);
    let raw: unknown = source;
    if (typeof source === 'string') { try { raw = JSON.parse(source); } catch { fail('This isn\'t a pack: the file isn\'t JSON.'); } }
    if (!isRecord(raw) || raw.kind !== PACK_KIND) return fail('This isn\'t an Ara pack (its "kind" must be "ara-pack").');
    if (raw.version !== PACK_VERSION) fail(`This pack is version ${String(raw.version)}; this version of Ara reads version ${PACK_VERSION}. Update Ara, or rebuild the pack.`);
    const id = text(raw.id, 'The pack id', 40, true)!;
    if (!PACK_ID.test(id)) fail(`The pack id "${id}" must be 2 to 40 lower-case letters, digits and hyphens.`);
    const pack: Pack = { kind: PACK_KIND, version: PACK_VERSION, id, name: text(raw.name, 'The pack name', 60, true)! };
    for (const [key, max] of [['author', 100], ['license', 60], ['description', 500]] as const) { const v = text(raw[key], `The pack ${key}`, max);if (v) pack[key] = v; }
    const homepage = text(raw.homepage, 'The pack homepage', 500);
    if (homepage) { if (!/^https?:\/\//.test(homepage)) fail('The pack homepage must be a web address (https://…).');pack.homepage = homepage; }
    if (raw.animations !== undefined) {
      if (!Array.isArray(raw.animations) || raw.animations.length > MAX_PACK_ANIMATIONS) fail(`animations must be a list of up to ${MAX_PACK_ANIMATIONS}.`);
      const seen = new Set<string>();
      pack.animations = (raw.animations as unknown[]).map((a, i) => {
        const where = `Animation ${i + 1}`;
        if (!isRecord(a)) return fail(`${where} must be an object.`);
        const aid = text(a.id, `${where} id`, 48, true)!;
        if (!ITEM_ID.test(aid)) fail(`${where}: the id "${aid}" must be lower-case letters, digits and underscores.`);
        if (seen.has(aid)) fail(`Two animations have the id "${aid}".`);
        seen.add(aid);
        if (!(PACK_CATEGORIES as readonly unknown[]).includes(a.category)) fail(`${where} (${aid}): category must be one of ${PACK_CATEGORIES.join(', ')}.`);
        return { id: aid, name: text(a.name, `${where} name`, 60, true)!, category: a.category as PackAnimation['category'], motion: parseMotion(a.motion, `${where} (${aid})`) };
      });
    }
    if (!pack.animations?.length) fail('The pack has nothing in it: add animations.');
    return pack;
  } catch (error) {
    if (error instanceof PackError) throw Error(error.message);
    throw error;
  }
}
