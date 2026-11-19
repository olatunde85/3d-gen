/**
 * Keys: every provider, every error and the write-and-fix loop, against the local stand-in (scripts/keys-mock.ts).
 * No real keys and no network. `npm run test:keys`; add --browser for the in-browser flows.
 */
import assert from 'node:assert/strict';
import { startKeysMock } from './keys-mock';

const mock = await startKeysMock();
(globalThis as { __ARA_KEYS_TEST_BASE?: string }).__ARA_KEYS_TEST_BASE = mock.url;
const { detectProvider, checkKey, aiModels, failure } = await import('../src/app/keys/providers');
const { updateKeys, keySettings, forgetAllKeys } = await import('../src/app/keys/store');
const { writeJson, StillWrong, writer } = await import('../src/app/keys/ai');
const { speakCloud, voiceMenu, voiceGuide, defaultVoice } = await import('../src/app/keys/voices');
const { ProviderError } = await import('../src/app/keys/http');

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; } catch (error) { failures.push(`${name}: ${(error as Error).message}`); }
}
const problemOf = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (error) { if (error instanceof ProviderError) return { problem: error.problem, message: error.message }; throw error; } throw Error('expected a ProviderError'); };
const queue = (...texts: string[]) => fetch(`${mock.url}/__replies`, { method: 'POST', body: JSON.stringify(texts) });
const logged = async () => (await (await fetch(`${mock.url}/__log`)).json()) as { provider: string; path: string; headers: Record<string, string>; body: any }[];
const reset = () => fetch(`${mock.url}/__reset`);

const KEYS = {
  anthropic: 'sk-ant-api03-' + 'a'.repeat(40), openai: 'sk-proj-' + 'b'.repeat(40), gemini: 'AIza' + 'c'.repeat(35),
  openrouter: 'sk-or-v1-' + 'd'.repeat(64), elevenlabs: 'sk_' + 'e'.repeat(48),
} as const;

await check('recognises each provider from its key', () => {
  for (const [id, key] of Object.entries(KEYS)) assert.equal(detectProvider(key), id, key);
  assert.equal(detectProvider('a'.repeat(32).replace(/a/g, 'f')), 'elevenlabs', 'legacy ElevenLabs hex key');
  for (const junk of ['', 'hello', 'sk-', 'sk-ant-admin01-xyz', 'AIza123']) assert.equal(detectProvider(junk), undefined, junk);
});

await check('good keys connect, list models best first and describe the account', async () => {
  const a = await checkKey('anthropic', { key: KEYS.anthropic });
  assert.deepEqual(a.models!.slice(0, 4).map(m => m.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-haiku-5-5']);
  assert.ok(a.models!.some(m => m.id === 'claude-sonnet-4-6'), 'other models kept after the known ones');
  const o = await aiModels('openai', { key: KEYS.openai });
  assert.equal(o[0].id, 'gpt-6.2-sol');
  assert.ok(!o.some(m => /tts|embedding|realtime/.test(m.id)), 'only text models');
  const g = await aiModels('gemini', { key: KEYS.gemini });
  assert.equal(g[0].id, 'gemini-4-hydrogen'); assert.ok(g[0].free);
  assert.ok(!g.some(m => /tts|image|embedding/.test(m.id)));
  const r = await checkKey('openrouter', { key: KEYS.openrouter });
  assert.equal(r.models![0].id, 'anthropic/claude-opus-5.5'); assert.equal(r.models![0].note, 'Recommended');
  assert.ok(r.models!.find(m => m.id.endsWith(':free'))?.free); assert.ok(!r.models!.some(m => m.id === 'black-forest/flux-3'), 'image models left out');
  assert.equal(r.models![0].price?.input, 4); assert.match(r.note, /\$7\.25 left/);
  const e = await checkKey('elevenlabs', { key: KEYS.elevenlabs });
  assert.match(e.note, /3 voices, 1 of your own · 8,500 characters left/);
});

await check('Anthropic calls carry the browser-access header and the workspace when set', async () => {
  await reset();
  await checkKey('anthropic', { key: KEYS.anthropic + '-workspace', workspace: 'wrkspc_good' });
  const l = await logged();
  assert.equal(l[0].headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(l[0].headers['anthropic-workspace-id'], 'wrkspc_good');
  assert.equal(l[0].headers['anthropic-version'], '2023-06-01');
});

await check('each error says what happened and what to do', async () => {
  const cases: [string, string, () => Promise<unknown>, string, RegExp][] = [
    ['anthropic', 'wrong key', () => checkKey('anthropic', { key: KEYS.anthropic + '-bad' }), 'key', /didn’t accept this key/],
    ['anthropic', 'org blocks browsers', () => checkKey('anthropic', { key: KEYS.anthropic + '-cors' }), 'blocked', /doesn’t allow calls from web pages.*OpenRouter/],
    ['anthropic', 'zero data retention', () => checkKey('anthropic', { key: KEYS.anthropic + '-zdr' }), 'blocked', /zero data retention/],
    ['anthropic', 'organisation key needs a workspace', () => checkKey('anthropic', { key: KEYS.anthropic + '-workspace' }), 'workspace', /Workspaces/],
    ['anthropic', 'unknown workspace', () => checkKey('anthropic', { key: KEYS.anthropic + '-workspace', workspace: 'wrkspc_nope' }), 'workspace', /couldn’t find that workspace/],
    ['anthropic', 'no models', () => checkKey('anthropic', { key: KEYS.anthropic + '-nomodels' }), 'permission', /can’t use any models/],
    ['openai', 'wrong key', () => checkKey('openai', { key: KEYS.openai + '-bad' }), 'key', /OpenAI didn’t accept/],
    ['gemini', 'wrong key (Google answers 400)', () => checkKey('gemini', { key: KEYS.gemini + '-bad' }), 'key', /Google Gemini didn’t accept/],
    ['gemini', 'leaked key', () => checkKey('gemini', { key: KEYS.gemini + '-leaked' }), 'key', /found in public/],
    ['openrouter', 'wrong key', () => checkKey('openrouter', { key: KEYS.openrouter + '-bad' }), 'key', /OpenRouter didn’t accept/],
    ['elevenlabs', 'wrong key', () => checkKey('elevenlabs', { key: KEYS.elevenlabs + '-bad' }), 'key', /ElevenLabs didn’t accept/],
    ['elevenlabs', 'restricted key', () => checkKey('elevenlabs', { key: KEYS.elevenlabs + '-scoped' }), 'permission', /Voices \(read\)/],
  ];
  for (const [provider, what, fn, problem, message] of cases) {
    const e = await problemOf(fn);
    assert.equal(e.problem, problem, `${provider} ${what}: ${e.message}`);
    assert.match(e.message, message, `${provider} ${what}`);
  }
});

await check('documented errors map to the right problem for every provider', () => {
  const m = (id: Parameters<typeof failure>[0], status: number, body: unknown) => failure(id, status, JSON.stringify(body)).problem;
  assert.equal(m('anthropic', 402, { type: 'error', error: { type: 'billing_error', message: 'x' } }), 'credit');
  assert.equal(m('anthropic', 429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests' } }), 'rate');
  assert.equal(m('anthropic', 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), 'busy');
  assert.equal(m('anthropic', 404, { type: 'error', error: { type: 'not_found_error', message: 'model: x' } }), 'model');
  assert.equal(m('openai', 429, { error: { type: 'insufficient_quota', code: 'insufficient_quota', message: 'quota' } }), 'credit');
  assert.equal(m('openai', 429, { error: { code: 'project_spend_limit_exceeded', message: 'limit' } }), 'credit');
  assert.equal(m('openai', 429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' } }), 'rate');
  assert.equal(m('openai', 403, { error: { message: 'Country, region, or territory not supported' } }), 'permission');
  assert.equal(m('gemini', 429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded ... per day' } }), 'credit');
  assert.equal(m('gemini', 402, { error: { code: 'payment_required', message: 'prepay' } }), 'credit');
  assert.equal(m('gemini', 503, { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } }), 'busy');
  assert.equal(m('openrouter', 402, { error: { code: 402, message: 'Insufficient credits' } }), 'credit');
  assert.equal(m('openrouter', 403, { error: { code: 403, message: 'flagged' } }), 'refused');
  assert.equal(m('elevenlabs', 401, { detail: { status: 'quota_exceeded', message: 'quota' } }), 'credit');
  assert.equal(m('elevenlabs', 402, { detail: { type: 'payment_required', code: 'insufficient_credits', message: 'credits' } }), 'credit');
  assert.equal(m('elevenlabs', 403, { detail: { code: 'voice_access_denied', message: 'x' } }), 'model');
  assert.equal(m('elevenlabs', 429, { detail: { code: 'system_busy', message: 'x' } }), 'busy');
  assert.equal(m('elevenlabs', 401, { detail: { code: 'missing_permissions', message: 'missing text_to_speech' } }), 'permission');
});

// ---- Writing ----
const accept = (json: string) => { const v = JSON.parse(json); if (!v.ok) throw Error('The JSON needs "ok": true.'); return v; };
const request = (signal = new AbortController().signal, phases: string[] = []) => writeJson({
  prompt: 'GUIDE '.repeat(200), noun: 'film', extract: t => t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1), accept,
  fix: reason => `Fix it: ${reason}`, onProgress: p => phases.push(p.phase), signal,
});
const use = (provider: 'anthropic' | 'openai' | 'gemini' | 'openrouter', model: string, suffix = '') =>
  updateKeys(s => { s.keys = { [provider]: { key: KEYS[provider] + suffix } }; s.ai = { provider, model }; });

for (const [provider, model] of [['anthropic', 'claude-opus-5-5'], ['openai', 'gpt-6.2-sol'], ['gemini', 'gemini-4-hydrogen'], ['openrouter', 'anthropic/claude-opus-5.5']] as const) {
  await check(`${provider}: streams a reply, sends Ara's complaint back and returns the fixed JSON`, async () => {
    await reset(); use(provider, model);
    await queue('Here you go:\n```json\n{"ok":false}\n```', 'Sorry! {"ok":true,"film":"A"}');
    const phases: string[] = [];
    const r = await request(undefined, phases);
    assert.deepEqual(r.value, { ok: true, film: 'A' });
    assert.equal(r.rounds, 2);
    assert.ok(phases.includes('writing') && phases.includes('checking') && phases.includes('fixing'), phases.join());
    assert.ok(r.usage.input > 0 && r.usage.output > 0);
    assert.ok(r.cost !== undefined && r.cost > 0, 'cost known');
    const calls = (await logged()).filter(l => !(l.path.startsWith('/models') && !l.path.includes(':')) && l.path !== '/key');
    assert.equal(calls.length, 2);
    const second = JSON.stringify(calls[1].body);
    assert.match(second, /Fix it: The JSON needs/, 'the complaint is sent back');
    assert.match(second, /\{\\"ok\\":false\}/, 'with the earlier reply');
    if (provider === 'anthropic') assert.equal(calls[1].body.messages[0].content[0].cache_control.type, 'ephemeral', 'the guide is cached for the fix');
    if (provider === 'openai') assert.equal(calls[0].body.store, false);
  });
}
await check('OpenRouter reports its own cost', async () => {
  use('openrouter', 'openai/gpt-6.2-sol'); await queue('{"ok":true}');
  assert.equal((await request()).cost, 0.0421);
});
await check('a reply still wrong after three tries comes back to the visitor with the reason', async () => {
  use('anthropic', 'claude-sonnet-5-5'); await queue('{"ok":false}', '{"ok":false}', '{"ok":false}');
  try { await request(); assert.fail('expected StillWrong'); }
  catch (error) { assert.ok(error instanceof StillWrong); assert.match((error as Error).message, /needs "ok"/); assert.equal((error as InstanceType<typeof StillWrong>).json, '{"ok":false}'); }
});
await check('length limits, refusals, mid-stream errors and stopping are explained', async () => {
  use('anthropic', 'claude-opus-5-5', '-cut'); await queue('{"ok":tr');
  assert.equal((await problemOf(() => request())).problem, 'length');
  use('openai', 'gpt-6.2-sol', '-cut'); await queue('{"ok":tr');
  assert.equal((await problemOf(() => request())).problem, 'length');
  use('gemini', 'gemini-4-hydrogen', '-cut'); await queue('{"ok":tr');
  assert.equal((await problemOf(() => request())).problem, 'length');
  use('openrouter', 'openai/gpt-6.2-sol', '-cut'); await queue('{"ok":tr');
  assert.equal((await problemOf(() => request())).problem, 'length');
  use('anthropic', 'claude-opus-5-5', '-refuse');
  assert.equal((await problemOf(() => request())).problem, 'refused');
  use('anthropic', 'claude-opus-5-5', '-midstream'); await queue('{"ok":true,"padding":"' + 'x'.repeat(200) + '"}');
  const mid = await problemOf(() => request()); assert.equal(mid.problem, 'busy'); assert.match(mid.message, /partway/);
  use('openrouter', 'openai/gpt-6.2-sol', '-midstream'); await queue('{"ok":true,"padding":"' + 'x'.repeat(200) + '"}');
  assert.match((await problemOf(() => request())).message, /partway/);
  use('anthropic', 'claude-opus-5-5'); await queue('{"ok":true,"padding":"' + 'x'.repeat(4000) + '"}');
  const stop = new AbortController(); setTimeout(() => stop.abort(), 30);
  assert.equal((await problemOf(() => request(stop.signal))).problem, 'stopped');
  await reset();
});
await check('account problems while writing: credit, rate limits (retried) and busy (retried)', async () => {
  use('anthropic', 'claude-opus-5-5', '-nocredit'); assert.equal((await problemOf(() => request())).problem, 'credit');
  use('openai', 'gpt-6.2-sol', '-nocredit'); assert.equal((await problemOf(() => request())).problem, 'credit');
  use('gemini', 'gemini-4-hydrogen', '-quota'); const q = await problemOf(() => request()); assert.equal(q.problem, 'credit'); assert.match(q.message, /today’s Gemini allowance/);
  use('gemini', 'gemini-4-hydrogen', '-verify'); assert.match((await problemOf(() => request())).message, /verify your account/);
  use('openrouter', 'openai/gpt-6.2-sol', '-nocredit'); assert.equal((await problemOf(() => request())).problem, 'credit');
  use('openrouter', 'meta/llama-5-70b:free', '-rate'); assert.match((await problemOf(() => request())).message, /free OpenRouter requests/);
  await reset(); use('anthropic', 'claude-opus-5-5', '-busy');
  const started = Date.now(); assert.equal((await problemOf(() => request())).problem, 'busy');
  assert.equal((await logged()).filter(l => l.path === '/messages').length, 3, 'busy is retried twice');
  assert.ok(Date.now() - started > 3000, 'with waits between');
  await reset(); use('anthropic', 'claude-opus-5-5', '-rate'); assert.equal((await problemOf(() => request())).problem, 'rate');
  assert.equal((await logged()).filter(l => l.path === '/messages').length, 2, 'a rate limit is retried once');
});

// ---- Voices ----
await check('voice menus, defaults and the Assist voice list follow what is connected', async () => {
  forgetAllKeys();
  assert.equal((await voiceMenu()).length, 1);
  assert.equal(defaultVoice(0, 1), 'M1'); assert.equal(defaultVoice(1, 0), 'F2');
  assert.doesNotMatch(await voiceGuide(), /gemini\//);
  updateKeys(s => { s.keys.gemini = { key: KEYS.gemini }; s.keys.elevenlabs = { key: KEYS.elevenlabs }; });
  const menu = await voiceMenu();
  assert.deepEqual(menu.map(g => g.provider ?? 'ara'), ['ara', 'gemini', 'elevenlabs']);
  assert.equal(menu[2].voices[0].name, 'My narrator', 'your own voices first');
  assert.equal(defaultVoice(0, 0), 'elevenlabs/21m00Tcm4TlvDq8ikWAM');
  const guide = await voiceGuide();
  assert.match(guide, /gemini\/Kore \(female, firm\)/); assert.match(guide, /elevenlabs\/MyClonedVoice000001 \(My narrator/);
});
await check('Gemini and ElevenLabs speak lines, with direction', async () => {
  await reset();
  const g = await speakCloud('gemini/Kore', 'Hello there.', 'whispered');
  assert.equal(g.sampleRate, 24000);
  const e = await speakCloud('elevenlabs/21m00Tcm4TlvDq8ikWAM', 'Hello there.', 'excited');
  assert.ok(Math.abs(e.samples.length / 24000 - .9) < .01); assert.equal(e.model, 'elevenlabs/eleven_v4');
  const l = await logged();
  const gem = l.find(x => x.path === '/interactions')!, el = l.find(x => x.path.startsWith('/v1/text-to-speech'))!;
  assert.equal(gem.body.model, 'gemini-3.8-flash-tts');
  assert.equal(gem.body.input[0].content[0].text, 'Hello there.', 'only the words are spoken');
  assert.deepEqual(gem.body.input[0].content[0].annotations, [{ type: 'speech_metadata', style: 'whispered' }], 'direction goes as a style');
  assert.ok(Math.abs(g.samples.length / 24000 - 1.1) < .01, 'the WAV reply is read');
  const plain = await speakCloud('gemini/Kore', 'No direction.');
  assert.ok(Math.abs(plain.samples.length / 24000 - 1.2) < .01);
  assert.equal((await logged()).filter(x => x.path.includes(':generateContent')).pop()!.body.contents[0].parts[0].text, 'No direction.');
  assert.equal(el.body.text, '[excited] Hello there.'); assert.match(el.path, /output_format=pcm_24000/);
});
await check('voices explain a missing key, an old ElevenLabs plan and an empty allowance', async () => {
  updateKeys(s => { delete s.keys.gemini; });
  assert.match((await problemOf(() => speakCloud('gemini/Kore', 'Hi'))).message, /Connect your Google Gemini key/);
  updateKeys(s => { s.keys.elevenlabs = { key: KEYS.elevenlabs + '-eleven-old' }; });
  const old = await speakCloud('elevenlabs/21m00Tcm4TlvDq8ikWAM', 'Hi', 'excited');
  assert.equal(old.model, 'elevenlabs/eleven_multilingual_v2', 'falls back to a model the plan includes');
  updateKeys(s => { s.keys.elevenlabs = { key: KEYS.elevenlabs + '-nocredit' }; });
  const credit = await problemOf(() => speakCloud('elevenlabs/21m00Tcm4TlvDq8ikWAM', 'Hi'));
  assert.equal(credit.problem, 'credit'); assert.match(credit.message, /allowance is used up/);
});

await check('removing a key drops the choices that needed it', () => {
  use('anthropic', 'claude-opus-5-5');
  assert.ok(writer());
  updateKeys(s => { delete s.keys.anthropic; });
  assert.equal(keySettings().ai, undefined); assert.equal(writer(), undefined);
});

await check('Studio writes only with capable models; the builder and Play use any', async () => {
  const { useCapableModels } = await import('../src/app/keys/providers');
  use('anthropic', 'claude-haiku-5-5'); assert.equal(writer()?.model, 'claude-haiku-5-5');
  use('openrouter', 'meta/some-small-model'); assert.equal(writer()?.model, 'meta/some-small-model');
  useCapableModels();
  assert.equal(writer()?.model, 'anthropic/claude-opus-5.5');
  use('anthropic', 'claude-haiku-5-5'); assert.equal(writer()?.model, 'claude-opus-5-5'); assert.equal(writer()?.label, 'Claude Opus 5.5');
  use('anthropic', 'claude-sonnet-5-5'); assert.equal(writer()?.model, 'claude-sonnet-5-5');
  use('gemini', 'gemini-3.8-flash'); assert.equal(writer()?.model, 'gemini-4-hydrogen');
  use('openai', 'gpt-6-luna'); assert.equal(writer()?.model, 'gpt-6.2-sol');
  use('openai', 'gpt-6.2-astra'); assert.equal(writer()?.model, 'gpt-6.2-astra');
});

await mock.close();
console.log(`Keys: ${passed} checks passed${failures.length ? `, ${failures.length} failed` : ''}.`);
if (failures.length) { for (const f of failures) console.error(`✗ ${f}`); process.exit(1); }
