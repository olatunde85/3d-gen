/**
 * Keys in a real browser, against the local stand-in: connecting keys, Assist writing a character and a film,
 * errors shown in place, and Sound voicing lines with Gemini and ElevenLabs. Builds the site pointed at the stand-in.
 * `npm run test:keys:browser` (set CHROME to use another browser; SHOTS=<folder> saves screenshots).
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Readable, Writable } from 'node:stream';
import { build } from 'vite';
import { startKeysMock } from './keys-mock';
import { characterExample } from '../src/app/character-assist';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOTS;
const mock = await startKeysMock(4471);
process.env.VITE_KEYS_TEST_BASE = mock.url;
if (!process.argv.includes('--no-build')) await build({ logLevel: 'error' });
const dist = join(import.meta.dirname, '../dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('content-type', TYPES[extname(p)] ?? 'application/octet-stream'); res.end(readFileSync(p));
});
await new Promise<void>(r => server.listen(4472, '127.0.0.1', r));
const site = 'http://127.0.0.1:4472';

const profile = mkdtempSync(join(tmpdir(), 'keys-check-'));
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const toChrome = chrome.stdio[3] as Writable, fromChrome = chrome.stdio[4] as Readable;
let nextId = 0, session: string | undefined, buf = '';
const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
const errors: string[] = [];
fromChrome.on('data', (c: Buffer) => {
  buf += c.toString('utf8'); let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.id !== undefined) pending.get(m.id)?.(m);
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
});
function send<T = Record<string, unknown>>(method: string, params: object = {}, withSession = true): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, m => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
    toChrome.write(JSON.stringify({ id, method, params, ...(withSession && session ? { sessionId: session } : {}) }) + '\0');
  });
}
async function e<T = unknown>(js: string): Promise<T> {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function w(js: string, what: string, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await e<boolean>(js).catch(() => false)) return; await new Promise(r => setTimeout(r, 150)); }
  throw new Error(`timed out waiting for ${what}`);
}
const pause = (ms = 300) => new Promise(r => setTimeout(r, ms));
async function shot(name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
}
async function viewport(width: number, height: number, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); }
async function go(path: string) { await send('Page.navigate', { url: site + path }); await pause(800); await w('document.readyState==="complete"', 'page load'); }
const click = (selector: string) => e(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('No ${selector.replace(/'/g, '')}');el.click();})()`);
const type = (selector: string, value: string) => e(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const text = (selector: string) => e<string>(`document.querySelector(${JSON.stringify(selector)})?.textContent??''`);
const queue = (...replies: string[]) => fetch(`${mock.url}/__replies`, { method: 'POST', body: JSON.stringify(replies) });

const results: [string, boolean, string?][] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push([name, true]); } catch (error) { results.push([name, false, (error as Error).message]); await shot(`failed-${results.length}`); }
}

const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
await send('Runtime.enable'); await send('Page.enable');
await viewport(1400, 1000);

const KEYS = { anthropic: 'sk-ant-api03-' + 'a'.repeat(40), gemini: 'AIza' + 'c'.repeat(35), elevenlabs: 'sk_' + 'e'.repeat(48) };

await step('Builder: Assist offers to connect a key, and Keys recognises, checks and connects it', async () => {
  await go('/app/');
  await w('document.getElementById("character-assist-btn")&&!document.getElementById("character-assist-btn").disabled', 'builder ready', 120000);
  await click('#character-assist-btn'); await w('document.getElementById("character-assist-dialog")?.open', 'Assist open');
  if (await e('document.querySelector("#character-assist-dialog [data-r=connect]").hidden')) throw Error('No connect prompt without a key');
  await shot('1-assist-no-key');
  await click('#character-assist-dialog [data-r=connect-keys]'); await w('document.getElementById("keys-dialog")?.open', 'Keys open');
  await shot('2-keys-empty');
  await type('#keys-paste', 'sk-ant-api03-' + 'a'.repeat(40) + '-bad');
  if (!/Anthropic Claude/.test(await text('#keys-dialog [data-r=detect]'))) throw Error('Provider not recognised as typed');
  await click('#keys-dialog [data-r=connect]'); await w('/didn’t accept/.test(document.querySelector("#keys-dialog [data-r=detect]").textContent)', 'wrong-key message');
  await shot('3-keys-wrong-key');
  await type('#keys-paste', KEYS.anthropic); await click('#keys-dialog [data-r=connect]');
  await w('/Connected to Anthropic/.test(document.querySelector("#keys-dialog [data-r=detect]").textContent)', 'connected');
  await w('document.querySelector("#keys-model").value==="anthropic:claude-opus-5-5"', 'Opus chosen');
  await shot('4-keys-connected');
  await click('#keys-dialog [data-r=done]');
  await w('!document.querySelector("#character-assist-dialog [data-r=direct]").hidden', 'Write here shown');
  if (!/Claude Opus 5\.5/.test(await text('#character-assist-dialog [data-r=write]'))) throw Error('Write button names the model');
});

await step('Builder: Assist writes a character, fixes a rejected reply and builds it', async () => {
  const good = JSON.stringify(characterExample());
  await queue('```json\n{"kind":"ara-character","version":1,"params":{"hair":"invented-hair"}}\n```', `Fixed:\n${good}`);
  await type('#ca-brief', 'A confident explorer with a backpack');
  await pause(500); await shot('5-assist-ready-to-write');
  await click('#character-assist-dialog [data-r=write]');
  await w('document.querySelector("#character-assist-dialog [data-r=result]").classList.contains("ok")', 'written and accepted', 30000);
  const done = await text('#character-assist-dialog [data-r=direct-done]');
  if (!/after 1 fix/.test(done) || !/¢|\$/.test(done)) throw Error(`Done note: ${done}`);
  await shot('6-assist-written');
  await click('#character-assist-dialog [data-r=build]');
  await w('!document.getElementById("character-assist-dialog").open', 'built', 120000);
});

await step('Builder: a blocked organisation key is explained where you write', async () => {
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{anthropic:{key:${JSON.stringify(KEYS.anthropic + '-cors')}}},ai:{provider:'anthropic',model:'claude-opus-5-5'},autoVoices:true,remember:true}))`);
  await go('/app/'); await w('document.getElementById("character-assist-btn")&&!document.getElementById("character-assist-btn").disabled', 'builder ready', 120000);
  await click('#character-assist-btn'); await w('document.getElementById("character-assist-dialog")?.open', 'Assist open');
  await type('#ca-brief', 'A tall chef'); await click('#character-assist-dialog [data-r=write]');
  await w('!document.querySelector("#character-assist-dialog [data-r=direct-error]").hidden', 'error shown');
  if (!/OpenRouter/.test(await text('#character-assist-dialog [data-r=direct-error-text]'))) throw Error('No way forward offered');
  await shot('7-assist-blocked-org');
  await e('localStorage.removeItem("ara.keys.v1")');
});

await step('Studio: Sound shows a voice per speaker, the script as lines, and voices them with Gemini and ElevenLabs', async () => {
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini)}},elevenlabs:{key:${JSON.stringify(KEYS.elevenlabs)}}},autoVoices:true,remember:true}))`);
  await go('/studio/#demo'); await w('window.studio?.ready', 'Studio ready', 180000);
  await e(`(async()=>{const p=structuredClone(studio.project);const a=p.actors[0].id;p.audio.speech=[
    {source:'tts',id:'l1',name:'Line',actor:a,text:'We have to move, now.',voice:'gemini/Kore',delivery:'whispered urgently',start:0.5,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'},
    {source:'tts',id:'l2',name:'Line',actor:'narrator',text:'Night fell over the harbour.',voice:'elevenlabs/21m00Tcm4TlvDq8ikWAM',start:3,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'},
    {source:'tts',id:'l3',name:'Line',actor:a,text:'Did you hear that?',voice:'gemini/Kore',start:6,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'}];await studio.setProject(p);})()`);
  await click('#open-sound'); await w('document.getElementById("sound-dialog").open&&document.querySelectorAll(".sound-line").length===3', 'Sound open with lines');
  await pause(600); await shot('8-sound-dialogue');
  if (!/Voice 3 lines/.test(await text('#sound-generate-all'))) throw Error('Voice-all button');
  await click('#sound-generate-all');
  await w('document.querySelectorAll(".sound-line.ready").length===3', 'all voiced', 30000);
  await shot('9-sound-voiced');
  await click('.sound-line-head[data-line="l1"]'); await pause(400);
  if (await e('document.getElementById("sound-delivery-row").hidden')) throw Error('Direction hidden for a Gemini voice');
  await shot('10-sound-line-open');
});

await step('Studio: Assist writes a film with Gemini, casts Gemini voices and voices the lines before you build', async () => {
  await viewport(1400, 1000);
  await e('document.getElementById("sound-dialog").close()');
  const film = await e<string>(`(()=>{const p=structuredClone(studio.project);const a=p.actors[0].id;p.title='Harbour night';p.audio.speech=[
    {source:'tts',id:'s1',name:'Line',actor:a,text:'Keep your voice down.',voice:'gemini/Kore',delivery:'whispered',start:0.5,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'},
    {source:'tts',id:'s2',name:'Line',actor:'narrator',text:'The harbour was quiet.',voice:'gemini/Charon',start:3,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'}];return JSON.stringify(p);})()`);
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini)}}},ai:{provider:'gemini',model:'gemini-4-hydrogen'},autoVoices:true,remember:true}))`);
  await e('window.dispatchEvent(new StorageEvent("storage",{key:"ara.keys.v1"}))');
  await queue(film);
  await click('#open-assist'); await w('document.getElementById("assist-dialog").open', 'Assist open');
  if (!/gemini\/Kore/.test(await e<string>('document.querySelector("#assist-dialog [data-r=guide]").value'))) throw Error('The guide does not list Gemini voices');
  await type('#assist-brief', 'Two smugglers at a harbour at night'); await pause(300);
  await click('#assist-dialog [data-r=write]');
  await w('/ready and saved/.test(document.querySelector("#assist-dialog [data-r=preparation-status]")?.textContent??"")', 'voices prepared', 60000);
  await shot('12-studio-assist-voiced');
  await click('#assist-dialog [data-r=build]');
  await w('!document.getElementById("assist-dialog").open&&studio.project.title==="Harbour night"&&studio.project.audio.speech.every(c=>c.asset)', 'film built with voiced lines', 120000);
});

await step('Keys: “Remember” off keeps keys for this visit only', async () => {
  await go('/app/'); await w('document.getElementById("character-assist-btn")', 'builder');
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini)}}},autoVoices:true,remember:true}))`);
  await go('/app/'); await w('document.getElementById("character-assist-btn")', 'builder');
  await click('#character-assist-btn'); await w('document.getElementById("character-assist-dialog")?.open', 'Assist open');
  await click('#character-assist-dialog [data-r=change-ai]').catch(() => click('#character-assist-dialog [data-r=connect-keys]'));
  await w('document.getElementById("keys-dialog")?.open', 'Keys open');
  await e(`(()=>{const c=document.querySelector('#keys-dialog [data-r=remember]');c.checked=false;c.dispatchEvent(new Event('change'));})()`);
  if (await e('localStorage.getItem("ara.keys.v1")!==null') || !await e('sessionStorage.getItem("ara.keys.v1")!==null')) throw Error('Keys not moved to this visit only');
  await e('sessionStorage.removeItem("ara.keys.v1")');
});

await step('Studio: changing a speaker’s voice re-voices only their lines; phone layout fits', async () => {
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini)}},elevenlabs:{key:${JSON.stringify(KEYS.elevenlabs)}}},autoVoices:true,remember:true}))`);
  await go('/studio/#demo'); await w('window.studio?.ready', 'Studio ready', 180000);
  await e(`(async()=>{const p=structuredClone(studio.project);const a=p.actors[0].id;p.audio.speech=[{source:'tts',id:'l1',name:'Line',actor:a,text:'One.',voice:'gemini/Kore',start:0.5,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'},{source:'tts',id:'l2',name:'Line',actor:'narrator',text:'Two.',voice:'elevenlabs/21m00Tcm4TlvDq8ikWAM',start:3,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'},{source:'tts',id:'l3',name:'Line',actor:a,text:'Three.',voice:'gemini/Kore',start:6,duration:2,offset:0,speed:1,volume:1,pan:0,effect:'natural'}];await studio.setProject(p);})()`);
  await click('#open-sound'); await w('document.querySelectorAll(".sound-line").length===3', 'lines'); await click('#sound-generate-all'); await w('document.querySelectorAll(".sound-line.ready").length===3', 'voiced', 30000);
  await e(`(()=>{const s=document.querySelector('#sound-cast select[data-speaker="narrator"]');s.value='M2';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await w('document.querySelectorAll(".sound-line.ready").length===2&&document.querySelector(".sound-line.needs")?.dataset.id==="l2"', 'only the narrator line needs voicing');
  await viewport(390, 844, true); await pause(500);
  if (!await e('document.getElementById("sound-dialog").scrollWidth<=document.getElementById("sound-dialog").clientWidth+1')) throw Error('Sound overflows sideways on a phone');
  await shot('11-sound-phone');
  await viewport(1400, 1000);
});

await step('Ask Ara: the corner button opens a chat that offers to connect a key, then writes a film to review and build', async () => {
  await viewport(1400, 1000);
  await e('localStorage.removeItem("ara.keys.v1");sessionStorage.removeItem("ara.chat.studio.v1")');
  await go('/studio/#demo'); await w('window.studio?.ready&&document.getElementById("ask-ara")', 'Studio ready', 180000);
  await e('document.querySelectorAll("dialog[open]").forEach(d=>d.close())'); await pause(300);
  await shot('12b-studio-ask-button');
  await click('#ask-ara'); await w('!document.getElementById("ask-ara-panel").hidden', 'chat open');
  if (!/Connect a key/.test(await text('#ask-ara-panel'))) throw Error('No connect prompt');
  await shot('13-ask-ara-hello');
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini + '-slow')}}},ai:{provider:'gemini',model:'gemini-4-hydrogen'},autoVoices:true,remember:true}))`);
  await e('window.dispatchEvent(new StorageEvent("storage",{key:"ara.keys.v1"}))');
  await queue('To add a line, open **Sound** and press **+ Line**. Then:\n- type what they say\n- pick *How it’s said*\n- press **Voice all lines**');
  await type('#ask-ara-input', 'How do I add dialogue?'); await click('#ask-ara-panel [data-r=send]');
  await w('document.querySelector("#ask-ara-panel .ara-thinking")', 'thinking shown'); await pause(250); await shot('14-ask-ara-thinking');
  await w('document.querySelectorAll("#ask-ara-panel .ask-msg.ara li").length===3&&document.querySelector("#ask-ara-panel .ask-meta")&&!document.querySelector("#ask-ara-panel [data-r=send]").hidden', 'answer with a list', 30000);
  const film = await e<string>(`(()=>{const p=structuredClone(studio.project);p.title='Rooftop chase';return JSON.stringify(p,null,2);})()`);
  await queue('Here’s a rooftop chase for you:\n```json\n' + film + '\n```\nReview it in Assist, then build.');
  await type('#ask-ara-input', 'Write a 20-second rooftop chase'); await click('#ask-ara-panel [data-r=send]');
  await w('document.querySelector("#ask-ara-panel .ask-slot .ara-thinking")', 'writing card while the JSON streams', 30000); await pause(700); await shot('15-ask-ara-writing');
  const before = await e<string>('studio.project.title');
  await w('document.querySelector("#ask-ara-panel .ask-card.ok .ask-undo")&&studio.project.title==="Rooftop chase"', 'film built automatically with Undo', 120000);
  if (!/Film ready/.test(await text('#ask-ara-panel .ask-card.ok'))) throw Error('Card does not say the film is ready');
  await shot('16-ask-ara-film-ready');
  await click('#ask-ara-panel .ask-undo');
  await w(`studio.project.title===${JSON.stringify(before)}&&/Undone/.test(document.querySelector("#ask-ara-panel .ask-card")?.textContent??"")`, 'undo restored the previous film', 120000);
  await shot('16b-ask-ara-undone');
  await viewport(390, 844, true); await click('#ask-ara'); await pause(400); await shot('17-ask-ara-phone');
  await viewport(1400, 1000);
});

await step('Assist: the Ara animation shows while it writes', async () => {
  await e(`localStorage.setItem('ara.keys.v1',JSON.stringify({keys:{gemini:{key:${JSON.stringify(KEYS.gemini + '-slow')}}},ai:{provider:'gemini',model:'gemini-4-hydrogen'},autoVoices:true,remember:true}))`);
  await go('/app/'); await w('document.getElementById("character-assist-btn")&&!document.getElementById("character-assist-btn").disabled', 'builder ready', 120000);
  await queue(JSON.stringify(characterExample(), null, 2).repeat(1));
  await click('#character-assist-btn'); await w('document.getElementById("character-assist-dialog")?.open', 'Assist open');
  await type('#ca-brief', 'A desert explorer'); await click('#character-assist-dialog [data-r=write]');
  await w('document.querySelector("#character-assist-dialog .ara-thinking .ara-figures")', 'loader shown'); await pause(600); await shot('18-assist-thinking');
  await w('document.querySelector("#character-assist-dialog [data-r=result]").classList.contains("ok")', 'written', 60000);
});

await step('Keys: a key Ara doesn’t recognise asks which service it is for, then connects', async () => {
  await e('localStorage.removeItem("ara.keys.v1")');
  await go('/app/'); await w('document.getElementById("character-assist-btn")&&!document.getElementById("character-assist-btn").disabled', 'builder ready', 120000);
  await click('#character-assist-btn'); await w('document.getElementById("character-assist-dialog")?.open', 'Assist open');
  await click('#character-assist-dialog [data-r=connect-keys]'); await w('document.getElementById("keys-dialog")?.open', 'Keys open');
  await type('#keys-paste', '  "AQ.NewStyleGoogleKey' + 'x'.repeat(30) + '"\n');
  await click('#keys-dialog [data-r=connect]');
  await w('!document.querySelector("#keys-dialog [data-r=pick]").hidden', 'service choice shown');
  await shot('19-keys-pick-service');
  await click('#keys-dialog [data-pick=gemini]');
  await w('/Connected to Google Gemini/.test(document.querySelector("#keys-dialog [data-r=detect]").textContent)', 'connected after choosing');
  const sent = (await (await fetch(`${mock.url}/__log`)).json() as { headers: Record<string, string> }[]).pop()!;
  if (sent.headers['x-goog-api-key'] !== 'AQ.NewStyleGoogleKey' + 'x'.repeat(30)) throw Error('The key was not cleaned of spaces and quotes');
  await e('document.getElementById("keys-dialog").close()');
});

await step('Play: Ask Ara is on the setup screen', async () => {
  await go('/play/'); await w('document.getElementById("ask-ara")&&!document.getElementById("ask-ara").hidden', 'Ask Ara on Play', 120000);
  await pause(1500);
  if (await e('document.getElementById("ask-ara").hidden')) throw Error('Ask Ara hidden before the game starts');
  await shot('20-play-preview');
  await e('Object.defineProperty(document,"fullscreenElement",{get:()=>document.body,configurable:true})'); await pause(1200);
  if (!await e('document.getElementById("ask-ara").hidden')) throw Error('Ask Ara still showing in full screen');
  await e('delete document.fullscreenElement');
});

await mock.close();
const exited = new Promise<void>(r => chrome.once('exit', () => r())); chrome.kill(); server.close(); await exited;
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
for (const [name, ok, why] of results) console.log(`${ok ? '✓' : '✗'} ${name}${why ? `\n    ${why}` : ''}`);
if (errors.length) console.log(`Page errors:\n${errors.slice(0, 8).map(x => '  ' + x.split('\n')[0]).join('\n')}`);
const failed = results.filter(r => !r[1]).length;
console.log(`Keys in the browser: ${results.length - failed} of ${results.length} passed.`);
process.exit(failed || errors.length ? 1 : 0);
