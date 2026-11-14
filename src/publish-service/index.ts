/**
 * Ara Play publishing service: a stateless Cloudflare Worker that puts a player's game online in a temporary
 * Cloudflare account the player can claim. It relays Cloudflare's provisioning and upload API, which a browser cannot
 * call directly, and keeps each temporary account's API token encrypted inside an opaque session the browser carries
 * between steps. It never stores anything.
 *
 *   POST /v1/challenge   → Cloudflare's proof-of-work challenge (solved in the browser)
 *   POST /v1/account     → checks the game, creates the temporary account; returns the session and claim link
 *   POST /v1/manifest    → checks the file list and opens an upload session
 *   POST /v1/upload      → relays one bucket of files
 *   POST /v1/finish      → uploads the fixed game server, attaches the files and turns on the workers.dev address
 *
 * Guardrails: allowed origins only, an optional per-visitor rate limit, games with 18+ characters refused, the
 * game's project.json pinned to the copy that was checked, only game file types and sizes accepted, and no custom
 * server code: every game runs the same fixed script.
 */
import { allowedPath, publishBlock, PUBLISH_LIMITS } from '../play/publish-guard';
import { GAME_SERVER } from './game-server';

interface RateLimit { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface Env { SESSION_SECRET: string; ALLOWED_ORIGINS?: string; PUBLISH_LIMIT?: RateLimit }
interface Session { account: string; token: string; expires: string; project: string; script: string }
type Json = Record<string, unknown>;

const API = 'https://api.cloudflare.com/client/v4';
const TERMS = 'https://www.cloudflare.com/website-terms/', PRIVACY = 'https://www.cloudflare.com/privacypolicy/';
const enc = new TextEncoder(), dec = new TextDecoder();

class Refusal extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const b64url = (bytes: Uint8Array) => { let s = '';for (const b of bytes) s += String.fromCharCode(b);return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
/** Standard Base64 of bytes, in slices so large files never overflow the argument limit. */
export const base64 = (bytes: Uint8Array) => { let s = '';for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));return btoa(s); };
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
/** Cloudflare's asset hash: SHA-256 of the Base64 content plus the extension without its dot, first 32 hex digits. */
export async function assetHash(base64: string, path: string) {
  const ext = /\.([^./]+)$/.exec(path)?.[1] ?? '', digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(base64 + ext)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function key(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Refusal('Publishing is not configured: SESSION_SECRET must be at least 32 characters.', 503);
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(env.SESSION_SECRET)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env: Env, session: Session) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(JSON.stringify(session))));
  const out = new Uint8Array(12 + data.length);out.set(iv);out.set(data, 12);return b64url(out);
}
async function open(env: Env, sealed: unknown): Promise<Session> {
  if (typeof sealed !== 'string' || sealed.length > 4096) throw new Refusal('Missing publishing session.');
  try {
    const bytes = unb64url(sealed), session = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await key(env), bytes.slice(12)))) as Session;
    if (Date.parse(session.expires) < Date.now()) throw new Refusal('This publishing session has expired. Start again.', 410);
    return session;
  } catch (error) { throw error instanceof Refusal ? error : new Refusal('This publishing session is not valid. Start again.'); }
}
/** Call the Cloudflare API and return `result`, turning its errors into a readable message. */
async function cloudflare(path: string, init: RequestInit & { token?: string } = {}): Promise<Json> {
  const headers = new Headers(init.headers);if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const response = await fetch(API + path, { ...init, headers });
  const body = await response.json().catch(() => ({})) as { success?: boolean; result?: Json; errors?: { message?: string }[] };
  if (!response.ok || body.success === false) {
    const message = body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Cloudflare answered ${response.status}.`;
    throw new Refusal(response.status === 429 ? 'Cloudflare is limiting new games right now. Please try again in a few minutes.' : message, response.status === 429 ? 429 : 502);
  }
  return body.result ?? {};
}
const json = async (request: Request): Promise<Json> => { try { return await request.json() as Json; } catch { throw new Refusal('Send JSON.'); } };
const slug = (title: unknown) => (typeof title === 'string' ? title : 'ara-game').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ara-game';

async function account(request: Request, env: Env) {
  const body = await json(request);
  if (body.acceptTermsOfService !== 'yes') throw new Refusal('Accept Cloudflare’s terms of service and privacy policy to publish.');
  if (typeof body.challengeToken !== 'string' || typeof body.checkpoints !== 'string') throw new Refusal('Missing the solved security puzzle.');
  if (typeof body.project !== 'string') throw new Refusal('Missing the game setup.');
  const blocked = publishBlock(body.project);if (blocked) throw new Refusal(blocked, 422);
  const result = await cloudflare('/provisioning/previews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ termsOfService: TERMS, privacyPolicy: PRIVACY, acceptTermsOfService: 'yes', challengeToken: body.challengeToken, solution: { checkpoints: body.checkpoints } }) });
  const acct = result.account as Json | undefined, claim = result.claim as Json | undefined;
  if (!acct?.id || !acct.apiToken || !acct.expiresAt || !claim?.url || !claim.expiresAt) throw new Refusal('Cloudflare did not return a complete account. Please try again.', 502);
  const project = JSON.parse(body.project) as { gameName?: unknown; identity?: { title?: unknown } };
  const session: Session = { account: String(acct.id), token: String(acct.apiToken), expires: String(acct.expiresAt), project: await assetHash(base64(enc.encode(body.project)), 'project.json'), script: slug(typeof project.gameName === 'string' && project.gameName.trim() ? project.gameName : project.identity?.title) };
  return { session: await seal(env, session), claimUrl: claim.url, claimExpiresAt: claim.expiresAt, accountName: acct.name ?? '' };
}
async function manifest(request: Request, env: Env) {
  const body = await json(request), session = await open(env, body.session), files = body.manifest as Record<string, { hash?: unknown; size?: unknown }> | undefined;
  if (!files || typeof files !== 'object') throw new Refusal('Missing the file list.');
  const entries = Object.entries(files);let total = 0;
  if (!entries.length || entries.length > PUBLISH_LIMITS.files) throw new Refusal(`A published game holds 1 to ${PUBLISH_LIMITS.files} files.`);
  for (const [path, f] of entries) {
    if (!allowedPath(path) || path === '/_parts.json' && typeof f.size === 'number' && f.size > 65536) throw new Refusal(`${path} is not a game file that can be published.`);
    if (typeof f.hash !== 'string' || !/^[0-9a-f]{32}$/.test(f.hash) || typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size < 0 || f.size > PUBLISH_LIMITS.fileBytes) throw new Refusal(`${path} is larger than 5 MiB or not described correctly.`);
    total += f.size;
  }
  if (total > PUBLISH_LIMITS.totalBytes) throw new Refusal('This game is too large to publish.');
  // The game that was checked is the game that goes online.
  if (files['/project.json']?.hash !== session.project) throw new Refusal('The game setup changed after it was checked. Start again.', 409);
  if (!files['/index.html']) throw new Refusal('The game page is missing.');
  const result = await cloudflare(`/accounts/${session.account}/workers/scripts/${session.script}/assets-upload-session`, { method: 'POST', token: session.token, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest: files }) });
  return { jwt: result.jwt, buckets: result.buckets ?? [] };
}
async function upload(request: Request, env: Env) {
  const session = await open(env, request.headers.get('x-ara-session')), jwt = request.headers.get('x-ara-upload');
  if (!jwt || jwt.length > 4096) throw new Refusal('Missing the upload token.');
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data')) throw new Refusal('Send the files as multipart form data.');
  // The body streams straight through; the upload token only works for this account's own upload session.
  const response = await fetch(`${API}/accounts/${session.account}/workers/assets/upload?base64=true`, { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': type }, body: request.body });
  const body = await response.json().catch(() => ({})) as { success?: boolean; result?: Json; errors?: { message?: string }[] };
  if (!response.ok || body.success === false) throw new Refusal(body.errors?.map((e) => e.message).join('; ') || `Upload failed (${response.status}).`, 502);
  return { jwt: body.result?.jwt ?? null };
}
async function finish(request: Request, env: Env) {
  const body = await json(request), session = await open(env, body.session);
  if (typeof body.completion !== 'string') throw new Refusal('Missing the finished upload token.');
  const form = new FormData(), base = `/accounts/${session.account}/workers`;
  form.append('metadata', new Blob([JSON.stringify({ main_module: 'index.js', compatibility_date: '2026-10-01', bindings: [{ type: 'assets', name: 'ASSETS' }], assets: { jwt: body.completion, config: { html_handling: 'auto-trailing-slash', not_found_handling: 'none', run_worker_first: true } } })], { type: 'application/json' }));
  form.append('index.js', new Blob([GAME_SERVER], { type: 'application/javascript+module' }), 'index.js');
  await cloudflare(`${base}/scripts/${session.script}`, { method: 'PUT', token: session.token, body: form });
  // A fresh account may not have a workers.dev name yet; give it one, then serve this game there.
  let sub = '';
  try { sub = String((await cloudflare(`${base}/subdomain`, { token: session.token })).subdomain ?? ''); } catch { /* none yet */ }
  if (!sub) sub = String((await cloudflare(`${base}/subdomain`, { method: 'PUT', token: session.token, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subdomain: `ara-${crypto.randomUUID().slice(0, 8)}` }) })).subdomain ?? '');
  await cloudflare(`${base}/scripts/${session.script}/subdomain`, { method: 'POST', token: session.token, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });
  if (!sub) throw new Refusal('Cloudflare did not give the game an address. Please try again.', 502);
  return { url: `https://${session.script}.${sub}.workers.dev/` };
}

function cors(request: Request, env: Env) {
  const origin = request.headers.get('origin') ?? '', allowed = (env.ALLOWED_ORIGINS ?? 'https://ara3dgen.com,http://localhost:5173').split(',').map((o) => o.trim());
  return { ok: allowed.includes(origin), headers: { 'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0], 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-ara-session, x-ara-upload', 'access-control-max-age': '86400', vary: 'origin' } };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const c = cors(request, env), url = new URL(request.url), reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...c.headers, 'content-type': 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.headers });
    try {
      if (!c.ok) throw new Refusal('Publishing is only available from Ara Play.', 403);
      if (request.method !== 'POST') throw new Refusal('Use POST.', 405);
      if (url.pathname === '/v1/challenge' || url.pathname === '/v1/account') {
        const visitor = request.headers.get('cf-connecting-ip') ?? 'unknown';
        if (env.PUBLISH_LIMIT && !(await env.PUBLISH_LIMIT.limit({ key: visitor })).success) throw new Refusal('You are publishing very quickly. Please wait a minute and try again.', 429);
      }
      switch (url.pathname) {
        case '/v1/challenge': return reply(await cloudflare('/provisioning/previews/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
        case '/v1/account': return reply(await account(request, env));
        case '/v1/manifest': return reply(await manifest(request, env));
        case '/v1/upload': return reply(await upload(request, env));
        case '/v1/finish': return reply(await finish(request, env));
        default: throw new Refusal('Not found.', 404);
      }
    } catch (error) {
      const refusal = error instanceof Refusal ? error : new Refusal('Something went wrong while publishing. Please try again.', 500);
      return reply({ error: refusal.message }, refusal.status);
    }
  },
};
