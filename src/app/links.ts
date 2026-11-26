/**
 * Links that open Ara Studio with a film, Ara Play with a game, or Ara Educate with a lesson, already loaded. The file travels in the address
 * after "#", packed like a builder share link, or as an https address of a JSON file to download:
 *   https://ara3dgen.com/studio/#film=<packed>    https://ara3dgen.com/play/#game=<packed>
 *   https://ara3dgen.com/educate/#lesson=<packed>
 *   https://ara3dgen.com/studio/#src=https://…/film.json
 * Everything after "#" stays in the browser, so a link never sends the file to ara3dgen.com. The file then goes through
 * the same checks as opening it from disk.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { fromB64Url, toB64Url } from './share';

export type LinkKind = 'film' | 'game' | 'lesson';
const SITE = 'https://ara3dgen.com';
const PAGE: Record<LinkKind, string> = { film: 'studio', game: 'play', lesson: 'educate' };
/** The largest file a link may carry or download, as for files opened from disk. */
const MAX_BYTES = 512_000;

/** Packs a film or game file (JSON text) for a link. */
export const packFile = (json: string) => toB64Url(deflateSync(strToU8(json), { level: 9 }));

/** A link that opens the film (in Studio) or the game (in Play). */
export const fileLink = (kind: LinkKind, json: string, site = SITE) => `${site}/${PAGE[kind]}/#${kind}=${packFile(json)}`;

/** A link that opens a film or game file hosted at `url` (the host must allow other sites to read it). */
export const hostedLink = (kind: LinkKind, url: string, site = SITE) => `${site}/${PAGE[kind]}/#src=${encodeURIComponent(url)}`;

/** Whether a page address carries a film or game to open. */
export const hasLinkedFile = (hash: string, kind: LinkKind) => { const h = new URLSearchParams(hash.slice(1));return h.has(kind) || h.has('src'); };

/** The film or game file (JSON text) a page address carries, or undefined when it carries none. */
export async function linkedFile(hash: string, kind: LinkKind): Promise<string | undefined> {
  const h = new URLSearchParams(hash.slice(1)), packed = h.get(kind), src = h.get('src');
  if (packed) {
    let text: string;
    try { text = strFromU8(inflateSync(fromB64Url(packed))); } catch { throw Error(`That ${kind} link is incomplete. Copy the whole link and try again.`); }
    if (text.length > MAX_BYTES) throw Error(`That ${kind} is larger than 512 KB.`);
    return text;
  }
  if (!src) return undefined;
  let url: URL;
  try { url = new URL(src); } catch { throw Error(`The ${kind} address in the link isn't a web address.`); }
  if (url.protocol !== 'https:') throw Error(`The ${kind} address must start with https://.`);
  let response: Response;
  try { response = await fetch(url, { credentials: 'omit' }); } catch {
    throw Error(`Couldn't download the ${kind} from ${url.host}. Its host must allow other sites to read the file (GitHub raw files and gists do).`);
  }
  if (!response.ok) throw Error(`Couldn't download the ${kind} from ${url.host} (error ${response.status}).`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw Error(`That ${kind} is larger than 512 KB.`);
  return text;
}

/** Removes the film or game from the page address once it is open, so a reload keeps later edits. */
export function clearLinkedFile(kind: LinkKind) {
  const h = new URLSearchParams(location.hash.slice(1));h.delete(kind);h.delete('src');
  const rest = h.toString();history.replaceState(history.state, '', location.pathname + location.search + (rest ? '#' + rest : ''));
}
