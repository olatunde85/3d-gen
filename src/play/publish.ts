/**
 * Publishing a game online through the Ara publishing service: prepare the same files as the game ZIP, solve
 * Cloudflare's proof of work in a background thread, open a temporary Cloudflare account, upload the files in the
 * batches Cloudflare asks for, then go live on workers.dev. The service holds the account's token; this page only ever
 * sees an encrypted session, the live address and the claim link.
 */
import type { Zippable } from 'fflate';
import { PUBLISH_LIMITS, publishBlock } from './publish-guard';

export type PublishStep = 'check' | 'build' | 'puzzle' | 'account' | 'upload' | 'live';
export interface PublishResult { url: string; claimUrl: string; claimExpiresAt: string }
export interface PublishProgress { step: PublishStep; fraction?: number; detail?: string }
/** The publishing service for this build of Ara Play, or undefined when publishing is not set up. */
export const publishEndpoint = (): string | undefined => (import.meta.env.VITE_PUBLISH_URL as string | undefined)?.replace(/\/+$/, '') || undefined;
/** Files larger than this are stored as numbered parts that the game server joins again. */
const PART_BYTES = 4_718_592;
const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm', pack: 'application/octet-stream', bin: 'application/octet-stream', glb: 'model/gltf-binary', ktx2: 'image/ktx2' };
const typeOf = (path: string) => TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1].toLowerCase() ?? ''] ?? 'application/octet-stream';
const enc = new TextEncoder();
const base64 = (bytes: Uint8Array) => { let s = '';for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));return btoa(s); };
/** Cloudflare's asset hash: SHA-256 of the Base64 content plus the extension without its dot, first 32 hex digits. */
async function assetHash(b64: string, path: string) {
  const ext = /\.([^./]+)$/.exec(path)?.[1] ?? '', digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(b64 + ext)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const yieldToPage = () => new Promise((r) => setTimeout(r, 0));

/** The game's files as `/path → bytes`, with large files split into parts and a `/_parts.json` index. */
export function publishFiles(files: Zippable): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>(), parts: Record<string, { size: number; part: number; type: string }> = {};
  for (const [name, value] of Object.entries(files)) {
    const data = (Array.isArray(value) ? value[0] : value) as Uint8Array, path = '/' + name;
    if (data.byteLength <= PART_BYTES) { out.set(path, data);continue; }
    parts[path] = { size: data.byteLength, part: PART_BYTES, type: typeOf(path) };
    for (let i = 0; i * PART_BYTES < data.byteLength; i++) out.set(`${path}.part${i}`, data.subarray(i * PART_BYTES, (i + 1) * PART_BYTES));
  }
  if (Object.keys(parts).length) out.set('/_parts.json', enc.encode(JSON.stringify(parts)));
  return out;
}

async function call<T>(endpoint: string, path: string, body: BodyInit, signal: AbortSignal, headers: Record<string, string> = { 'content-type': 'application/json' }): Promise<T> {
  let response: Response;
  try { response = await fetch(endpoint + path, { method: 'POST', body, headers, signal }); } catch (error) { if ((error as Error).name === 'AbortError') throw error;throw Error('Could not reach the publishing service. Check your connection and try again.'); }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error ?? `Publishing failed (${response.status}). Please try again.`);
  return data;
}
function solve(challenge: { seed: string; k: number; g: number }, signal: AbortSignal, progress: (fraction: number) => void): Promise<string> {
  const worker = new Worker(new URL('./publish-pow-worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const stop = () => { worker.terminate();reject(new DOMException('Publishing cancelled.', 'AbortError')); };
    signal.addEventListener('abort', stop, { once: true });
    worker.onerror = (e) => { worker.terminate();reject(Error(e.message || 'The security puzzle could not run in this browser.')); };
    worker.onmessage = (e: MessageEvent<{ progress?: number; checkpoints?: string; error?: string }>) => {
      if (e.data.progress !== undefined) { progress(e.data.progress);return; }
      worker.terminate();signal.removeEventListener('abort', stop);
      if (e.data.error) reject(Error(e.data.error));else resolve(e.data.checkpoints!);
    };
    worker.postMessage(challenge);
  });
}
/** A brand-new workers.dev address can take a little while to answer; wait for it so the link works when shown. */
async function reachable(url: string, signal: AbortSignal) {
  for (let i = 0; i < 30; i++) {
    signal.throwIfAborted();
    try { await fetch(url, { mode: 'no-cors', cache: 'no-store', signal });return; } catch (error) { if ((error as Error).name === 'AbortError') throw error; }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function publishGame(projectText: string, build: () => Promise<Zippable>, signal: AbortSignal, report: (p: PublishProgress) => void): Promise<PublishResult> {
  const endpoint = publishEndpoint();
  if (!endpoint) throw Error('Publishing online is not set up for this copy of Ara Play.');
  report({ step: 'check' });
  const blocked = publishBlock(projectText);if (blocked) throw Error(blocked);

  report({ step: 'build', fraction: 0 });
  const files = publishFiles(await build());signal.throwIfAborted();
  if (new TextDecoder().decode(files.get('/project.json')) !== projectText) throw Error('The game changed while it was being prepared. Please try again.');
  let total = 0;for (const [path, data] of files) { total += data.byteLength;if (data.byteLength > PUBLISH_LIMITS.fileBytes) throw Error(`${path} is too large to publish.`); }
  if (files.size > PUBLISH_LIMITS.files) throw Error(`This game has ${files.size} files; a published game can hold ${PUBLISH_LIMITS.files}.`);
  if (total > PUBLISH_LIMITS.totalBytes) throw Error(`This game is ${(total / 1048576).toFixed(0)} MB; a published game can be up to ${PUBLISH_LIMITS.totalBytes / 1048576} MB. Remove a film or two and try again.`);

  // Hash every file while the puzzle is fetched; the manifest needs them all.
  const encoded = new Map<string, { b64: string; hash: string; size: number }>();let done = 0;
  for (const [path, data] of files) { const b64 = base64(data);encoded.set(path, { b64, hash: await assetHash(b64, path), size: data.byteLength });report({ step: 'build', fraction: ++done / files.size });if (done % 20 === 0) await yieldToPage(); }

  report({ step: 'puzzle', fraction: 0 });
  const challenge = await call<{ challengeToken: string; seed: string; k: number; g: number }>(endpoint, '/v1/challenge', '{}', signal);
  const checkpoints = await solve(challenge, signal, (fraction) => report({ step: 'puzzle', fraction }));

  report({ step: 'account' });
  const account = await call<{ session: string; claimUrl: string; claimExpiresAt: string }>(endpoint, '/v1/account', JSON.stringify({ challengeToken: challenge.challengeToken, checkpoints, acceptTermsOfService: 'yes', project: projectText }), signal);

  report({ step: 'upload', fraction: 0 });
  const manifest = Object.fromEntries([...encoded].map(([path, f]) => [path, { hash: f.hash, size: f.size }]));
  const opened = await call<{ jwt: string; buckets: string[][] }>(endpoint, '/v1/manifest', JSON.stringify({ session: account.session, manifest }), signal);
  const byHash = new Map([...encoded].map(([path, f]) => [f.hash, { ...f, path }])), bytes = opened.buckets.flat().reduce((n, h) => n + (byHash.get(h)?.size ?? 0), 0);
  let completion = opened.jwt, sent = 0;
  for (const bucket of opened.buckets) {
    const form = new FormData();
    for (const hash of bucket) { const f = byHash.get(hash);if (!f) throw Error('Cloudflare asked for a file this game does not have.');form.append(hash, new File([f.b64], hash, { type: typeOf(f.path) }), hash); }
    const result = await call<{ jwt: string | null }>(endpoint, '/v1/upload', form, signal, { 'x-ara-session': account.session, 'x-ara-upload': opened.jwt });
    if (result.jwt) completion = result.jwt;
    sent += bucket.reduce((n, h) => n + (byHash.get(h)?.size ?? 0), 0);report({ step: 'upload', fraction: bytes ? sent / bytes : 1, detail: `${(sent / 1048576).toFixed(1)} of ${(bytes / 1048576).toFixed(1)} MB` });
  }

  report({ step: 'live' });
  const live = await call<{ url: string }>(endpoint, '/v1/finish', JSON.stringify({ session: account.session, completion }), signal);
  await reachable(live.url, signal);
  return { url: live.url, claimUrl: account.claimUrl, claimExpiresAt: account.claimExpiresAt };
}
