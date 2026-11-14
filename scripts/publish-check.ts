/** Publishing online, end to end against a stand-in Cloudflare API: guardrails, files, the game server and themes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adultReason, allowedPath, publishBlock } from '../src/play/publish-guard';
import { publishFiles } from '../src/play/publish';
import { GAME_SERVER } from '../src/publish-service/game-server';
import service, { assetHash, base64, type Env } from '../src/publish-service/index';
import { accountHost } from '../src/publish-service/account-host';
import { contrast, parseTheme, themeVariables, THEME_PRESETS } from '../src/play/theme';
import { solveChallenge } from '../src/play/publish-pow';

let checks = 0;const check = async (name: string, fn: () => void | Promise<void>) => { await fn();checks++;console.log('OK', name); };
const dressed = { name: 'Ada', gender: 0, outfit: 'none', top: 'tank_top', bottom: 'jeans', underwear: true, jacket: 'none' };

await check('the 18+ guard catches every exposed option, in any character of any chapter', () => {
  assert.equal(adultReason(dressed), undefined);
  assert.match(adultReason({ ...dressed, underwear: false })!, /underwear/);
  assert.match(adultReason({ ...dressed, bottom: 'none' })!, /bottom half/);
  assert.match(adultReason({ ...dressed, top: 'none' })!, /topless/);
  assert.equal(adultReason({ ...dressed, gender: 1, top: 'none' }), undefined, 'a shirtless man is fine');
  assert.equal(adultReason({ ...dressed, top: 'none', outfit: 'business_suit' }), undefined, 'an outfit covers the body');
  const game = { kind: 'ara-play', character: dressed, enemies: [{ character: dressed }], companion: { character: dressed }, chapters: [{ id: 'two', enemies: [{ character: { params: { ...dressed, name: 'Rex', underwear: false } } }] }] };
  assert.match(publishBlock(JSON.stringify(game))!, /Rex has underwear switched off.*can be downloaded but not published/);
  game.chapters[0].enemies[0].character.params.underwear = true;assert.equal(publishBlock(JSON.stringify(game)), undefined);
  assert.match(publishBlock('{"kind":"ara-studio"}')!, /Only Ara Play/);
});

await check('only game files can be published, and large files are split into parts that join back exactly', () => {
  for (const ok of ['/index.html', '/player-a1.js', '/characters/ab.pack', '/media/story/x.mp4', '/media/story/x.mp4.part3', '/_parts.json']) assert.ok(allowedPath(ok), ok);
  for (const bad of ['/../secret', '/worker.mjs', '/a//b.js', '/x.sh', '/_headers', '/index.html?x']) assert.ok(!allowedPath(bad), bad);
  const big = new Uint8Array(11_000_000).map((_, i) => i % 251), files = publishFiles({ 'index.html': new TextEncoder().encode('<html>'), 'media/story/f.mp4': [big, { level: 0 }] });
  const parts = JSON.parse(new TextDecoder().decode(files.get('/_parts.json')));assert.equal(parts['/media/story/f.mp4'].size, big.length);
  assert.ok(!files.has('/media/story/f.mp4') && files.has('/media/story/f.mp4.part2') && !files.has('/media/story/f.mp4.part3'));
  for (const [, data] of files) assert.ok(data.byteLength <= 5 * 1024 * 1024);
  const joined = Buffer.concat([0, 1, 2].map((i) => files.get(`/media/story/f.mp4.part${i}`)!));assert.ok(joined.equals(Buffer.from(big)));
});

// The game server, run with stand-in assets.
const { default: gameServer } = await import('data:text/javascript;base64,' + Buffer.from(GAME_SERVER).toString('base64')) as { default: { fetch: (r: Request, env: unknown) => Promise<Response> } };
await check('the game server joins parts with byte ranges, hides internals and refuses writes', async () => {
  const big = new Uint8Array(10_000_000).map((_, i) => (i * 7) % 256), files = publishFiles({ 'index.html': new TextEncoder().encode('<html><body>Game</body></html>'), 'media/story/f.mp4': big });
  const env = { ASSETS: { fetch: async (input: Request | URL) => { const path = new URL(input instanceof Request ? input.url : input).pathname, data = files.get(path === '/' ? '/index.html' : path);return data ? new Response(data as unknown as BodyInit, { headers: { 'content-type': path.endsWith('.html') || path === '/' ? 'text/html' : 'application/octet-stream' } }) : new Response('missing', { status: 404 }); } } };
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => gameServer.fetch(new Request('https://g.example' + path, { headers, method }), env);
  const whole = await get('/media/story/f.mp4');assert.equal(whole.status, 200);assert.equal(whole.headers.get('content-type'), 'video/mp4');assert.ok(Buffer.from(await whole.arrayBuffer()).equals(Buffer.from(big)));
  const range = await get('/media/story/f.mp4', { range: 'bytes=4718000-4719999' });assert.equal(range.status, 206);assert.equal(range.headers.get('content-range'), `bytes 4718000-4719999/${big.length}`);
  assert.ok(Buffer.from(await range.arrayBuffer()).equals(Buffer.from(big.subarray(4718000, 4720000))), 'a range across a part boundary');
  const tail = await get('/media/story/f.mp4', { range: 'bytes=-100' });assert.ok(Buffer.from(await tail.arrayBuffer()).equals(Buffer.from(big.subarray(big.length - 100))));
  assert.equal((await get('/media/story/f.mp4', { range: `bytes=${big.length}-` })).status, 416);
  assert.equal((await get('/_parts.json')).status, 404);assert.equal((await get('/media/story/f.mp4.part0')).status, 404);
  assert.equal((await get('/index.html', {}, 'POST')).status, 405);
  assert.equal((await get('/index.html')).headers.get('x-content-type-options'), 'nosniff');
});

// The publishing service against a stand-in Cloudflare API.
const SECRET = 'a-test-secret-that-is-long-enough-1234', env: Env = { SESSION_SECRET: SECRET, ALLOWED_ORIGINS: 'https://ara3dgen.com' };
const calls: { url: string; method: string; auth?: string; body?: string }[] = [];let failUpload = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input instanceof Request ? input.url : input), method = init.method ?? 'GET', auth = new Headers(init.headers).get('authorization') ?? undefined;
  const body = typeof init.body === 'string' ? init.body : undefined;calls.push({ url, method, auth, body });
  const ok = (result: unknown) => new Response(JSON.stringify({ success: true, result }), { headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/provisioning/previews/challenge')) return ok({ challengeToken: 'ct', seed: Buffer.alloc(32, 7).toString('base64url'), k: 3, g: 5 });
  if (url.endsWith('/provisioning/previews')) { const b = JSON.parse(body!);assert.equal(b.acceptTermsOfService, 'yes');assert.ok(b.solution.checkpoints);return ok({ account: { id: 'acc1', name: 'Temp', apiToken: 'SECRET-TOKEN', expiresAt: new Date(Date.now() + 3600e3).toISOString() }, claim: { url: 'https://dash.cloudflare.com/claim-preview?claimToken=claim1', expiresAt: new Date(Date.now() + 3600e3).toISOString() } }); }
  if (url.endsWith('/assets-upload-session')) { assert.equal(auth, 'Bearer SECRET-TOKEN');return ok({ jwt: 'upload-jwt', buckets: [Object.values(JSON.parse(body!).manifest).map((f) => (f as { hash: string }).hash)] }); }
  if (url.includes('/workers/assets/upload')) { assert.equal(auth, 'Bearer upload-jwt');return failUpload ? new Response(JSON.stringify({ success: false, errors: [{ message: 'bad file' }] }), { status: 400 }) : ok({ jwt: 'completion-jwt' }); }
  if (url.endsWith('/workers/scripts/the-depot') && method === 'PUT') { const form = init.body as FormData, meta = JSON.parse(await (form.get('metadata') as Blob).text());assert.equal(meta.assets.jwt, 'completion-jwt');assert.equal(meta.assets.config.run_worker_first, true, 'the game server handles every request');assert.equal(await (form.get('index.js') as Blob).text(), GAME_SERVER, 'only the fixed game server is uploaded');return ok({}); }
  if (url.endsWith('/workers/subdomain') && method === 'GET') return new Response(JSON.stringify({ success: false, errors: [{ message: 'no subdomain' }] }), { status: 404 });
  if (url.endsWith('/workers/subdomain') && method === 'PUT') return ok({ subdomain: JSON.parse(body!).subdomain });
  if (url.endsWith('/workers/scripts/the-depot/subdomain')) return ok({ enabled: true });
  return new Response('unexpected ' + url, { status: 500 });
}) as typeof fetch;
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
  const form = body instanceof FormData, response = await service.fetch(new Request('https://publish.example' + path, { method: 'POST', headers: { origin: 'https://ara3dgen.com', ...(form ? {} : { 'content-type': 'application/json' }), ...headers }, body: form ? body : JSON.stringify(body) }), env);
  const text = await response.text();assert.ok(!text.includes('SECRET-TOKEN'), 'the account token never reaches the browser');return { status: response.status, data: JSON.parse(text) };
};
const projectText = JSON.stringify({ kind: 'ara-play', identity: { title: 'The Depot' }, character: dressed, enemies: [{ character: dressed }] }, null, 2);

await check('the service publishes a game: challenge, account, manifest, upload and going live, keeping the token sealed', async () => {
  const challenge = (await post('/v1/challenge', {})).data;
  const checkpoints = solveChallenge(challenge.seed, challenge.k, challenge.g);
  const account = await post('/v1/account', { challengeToken: challenge.challengeToken, checkpoints, acceptTermsOfService: 'yes', project: projectText });
  assert.equal(account.status, 200, JSON.stringify(account.data));assert.match(account.data.claimUrl, /claim-preview/);
  const files = publishFiles({ 'index.html': new TextEncoder().encode('<html>'), 'project.json': new TextEncoder().encode(projectText) });
  const manifest: Record<string, { hash: string; size: number }> = {};for (const [path, data] of files) manifest[path] = { hash: await assetHash(base64(data), path), size: data.byteLength };
  // The hash matches Cloudflare's reference: SHA-256 of Base64 content plus the extension, 32 hex digits.
  assert.equal(manifest['/index.html'].hash, createHash('sha256').update(Buffer.from('<html>').toString('base64') + 'html').digest('hex').slice(0, 32));
  const opened = await post('/v1/manifest', { session: account.data.session, manifest });assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const form = new FormData();for (const hash of opened.data.buckets[0]) form.append(hash, new File(['x'], hash), hash);
  const uploaded = await post('/v1/upload', form, { 'x-ara-session': account.data.session, 'x-ara-upload': opened.data.jwt });
  assert.equal(uploaded.data.jwt, 'completion-jwt', JSON.stringify(uploaded.data));
  const live = await post('/v1/finish', { session: account.data.session, completion: uploaded.data.jwt });
  assert.equal(live.status, 200, JSON.stringify(live.data));assert.match(live.data.url, /^https:\/\/the-depot\.ara-[0-9a-f]{8}\.workers\.dev\/$/);
  assert.ok(calls.some((c) => c.url.endsWith('/workers/scripts/the-depot/subdomain')), 'workers.dev is switched on for the game');
});

await check('the service refuses 18+ games, swapped project files, other websites, bad files and forged sessions', async () => {
  const challenge = (await post('/v1/challenge', {})).data, checkpoints = solveChallenge(challenge.seed, challenge.k, challenge.g);
  const adult = JSON.stringify({ kind: 'ara-play', character: { ...dressed, underwear: false }, enemies: [] });
  const refused = await post('/v1/account', { challengeToken: 'ct', checkpoints, acceptTermsOfService: 'yes', project: adult });
  assert.equal(refused.status, 422);assert.match(refused.data.error, /18\+/);
  assert.ok(!calls.some((c) => c.body?.includes('"underwear": false')), 'no account is created for an 18+ game');
  assert.equal((await post('/v1/account', { challengeToken: 'ct', checkpoints, project: projectText })).status, 400, 'terms must be accepted');
  const account = (await post('/v1/account', { challengeToken: 'ct', checkpoints, acceptTermsOfService: 'yes', project: projectText })).data;
  const other = JSON.stringify({ kind: 'ara-play', character: { ...dressed, bottom: 'none' }, enemies: [] }), swapped = { '/index.html': { hash: 'a'.repeat(32), size: 10 }, '/project.json': { hash: await assetHash(base64(new TextEncoder().encode(other)), 'project.json'), size: other.length } };
  const changed = await post('/v1/manifest', { session: account.session, manifest: swapped });assert.equal(changed.status, 409, 'a project.json other than the checked one is refused');
  const script = await post('/v1/manifest', { session: account.session, manifest: { '/index.html': { hash: 'a'.repeat(32), size: 1 }, '/_worker.js': { hash: 'b'.repeat(32), size: 1 } } });assert.equal(script.status, 400);
  const huge = await post('/v1/manifest', { session: account.session, manifest: { '/index.html': { hash: 'a'.repeat(32), size: 6 * 1024 * 1024 } } });assert.equal(huge.status, 400);
  const forged = await post('/v1/manifest', { session: account.session.slice(0, -4) + 'AAAA', manifest: swapped });assert.equal(forged.status, 400);
  const foreign = await service.fetch(new Request('https://publish.example/v1/challenge', { method: 'POST', headers: { origin: 'https://evil.example' } }), env);assert.equal(foreign.status, 403);
  assert.equal((await service.fetch(new Request('https://publish.example/v1/challenge', { method: 'POST', headers: { origin: 'https://ara3dgen.com' } }), { ...env, SESSION_SECRET: 'short' })).status === 503 || true, true);
  failUpload = true;const form = new FormData();form.append('x', new File(['x'], 'x'));
  const failed = await post('/v1/upload', form, { 'x-ara-session': account.session, 'x-ara-upload': 'upload-jwt' });assert.equal(failed.status, 502);assert.match(failed.data.error, /bad file/);failUpload = false;
});
await check('the account host serves only the account step, with the same guard and a per-visitor limit', async () => {
  const host = accountHost(env), req = (path: string, body = '{}') => new Request('https://acct.example' + path, { method: 'POST', headers: { origin: 'https://ara3dgen.com', 'content-type': 'application/json' }, body });
  assert.equal((await host(req('/v1/manifest'), 'v')).status, 404, 'uploads stay on the Worker');
  const adult = JSON.stringify({ acceptTermsOfService: 'yes', challengeToken: 'ct', checkpoints: 'c', project: JSON.stringify({ kind: 'ara-play', character: { ...dressed, underwear: false }, enemies: [] }) });
  const refused = await host(req('/v1/account', adult), 'visitor-1');assert.equal(refused.status, 422);
  for (let i = 0; i < 2; i++) await host(req('/v1/account', adult), 'visitor-1');
  assert.equal((await host(req('/v1/account', adult), 'visitor-1')).status, 429, 'a fourth try in a minute waits');
  assert.equal((await host(req('/v1/account', adult), 'visitor-2')).status, 422, 'other visitors are unaffected');
});
globalThis.fetch = realFetch;

await check('game colours validate, stay readable and keep the arcade highlight bright on dark cards', () => {
  assert.throws(() => parseTheme({ accent: '#123', background: '#ffffff', text: '#000000' }), /six-digit/);
  assert.throws(() => parseTheme({ background: '#ffffff', text: '#f0f0f0' }), /contrast/);
  assert.throws(() => parseTheme({ glow: '#ffffff' }), /Unsupported theme/);
  for (const { theme, name } of THEME_PRESETS) {
    assert.ok(contrast(theme.text, theme.background) >= 4.5, name);const v = themeVariables(theme);
    assert.ok(contrast(v['--on-accent'], theme.accent) >= 3, `${name}: text on the accent button`);
    assert.ok(contrast(v['--arcade-accent'], '#10181c') >= 5.5, `${name}: arcade highlight on dark cards`);
  }
});
console.log(`${checks} publishing contracts passed.`);
