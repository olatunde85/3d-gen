/**
 * Content packs in a real browser: adding a pack in the Packs window, its animations in the builder's browser and
 * exports (made in the builder's worker), the pack kept across a reload and shared with Studio, a film link that
 * loads the pack it needs, and a pack in use that can't be removed. The test pack is made from Ara's own wave.
 *   npm run test:packs:browser   (--no-build reuses dist/; SHOTS=<folder> saves screenshots; CHROME=<path>)
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Readable, Writable } from 'node:stream';
import { Texture, TextureLoader } from 'three';
import { build } from 'vite';
import { fileLink } from '../src/app/links';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { buildPack } from '../src/core/packs/build';
import { DEFAULT_EXPORT, planExport, runExport } from '../src/export';
import { presetCode } from '../src/studio/project';
import { nodeLibrary } from './node-assets';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = process.env.SHOTS;

// The test pack: Ara's own wave and walk, exported and converted back.
(globalThis as { self?: unknown }).self ??= globalThis;
TextureLoader.prototype.load = function (_url: string, onLoad?: (t: Texture) => void) { const t = new Texture();onLoad?.(t);return t; } as TextureLoader['load'];
const lib = await nodeLibrary(), ch = await buildHuman(lib, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], detail: 'low' });
const glb = await runExport(lib, ch, planExport(ch, { ...DEFAULT_EXPORT, mode: 'animated', format: 'glb', packaging: 'embedded', clips: ['wave', 'walk'], stageProps: false }));
// FBX files as Mixamo gives them, for importing in the Packs window: one of them twice, as a numbered copy.
const fbx = await runExport(lib, ch, planExport(ch, { ...DEFAULT_EXPORT, mode: 'animated', format: 'fbx', packaging: 'embedded', clips: ['cheer'], stageProps: false }));
const downloads = mkdtempSync(join(tmpdir(), 'packs-files-'));
for (const name of ['victory cheer.fbx', 'victory cheer (2).fbx']) writeFileSync(join(downloads, name), fbx.data);
const PACK = JSON.stringify(await buildPack({ id: 'check-moves', name: 'Check moves', author: 'Ara', license: 'CC0-1.0', animations: [
  { file: 'moves.glb', clip: 'Wave', id: 'big_wave', name: 'Big wave', category: 'Emotes' },
  { file: 'moves.glb', clip: 'Walk', id: 'stroll', name: 'Stroll', category: 'Locomotion' },
] }, async () => glb.data));

if (!process.argv.includes('--no-build')) await build({ logLevel: 'error' });
const dist = join(import.meta.dirname, '../dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // The pack, as a host that lets other sites read it serves it.
  if (path === '/packs/check-moves.ara-pack.json') { res.setHeader('content-type', 'application/json');res.setHeader('access-control-allow-origin', '*');res.end(PACK);return; }
  let p = join(dist, path);
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.statusCode = 404;res.end();return; }
  res.setHeader('content-type', TYPES[extname(p)] ?? 'application/octet-stream');res.end(readFileSync(p));
});
await new Promise<void>((r) => server.listen(4473, '127.0.0.1', r));
const site = 'http://127.0.0.1:4473', packUrl = `${site}/packs/check-moves.ara-pack.json`;

const profile = mkdtempSync(join(tmpdir(), 'packs-check-'));
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const toChrome = chrome.stdio[3] as Writable, fromChrome = chrome.stdio[4] as Readable;
let nextId = 0, session: string | undefined, buf = '';
const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
const errors: string[] = [];
fromChrome.on('data', (c: Buffer) => {
  buf += c.toString('utf8');let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));buf = buf.slice(i + 1);
    if (m.id !== undefined) pending.get(m.id)?.(m);
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
});
function send<T = Record<string, unknown>>(method: string, params: object = {}, withSession = true): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
    toChrome.write(JSON.stringify({ id, method, params, ...(withSession && session ? { sessionId: session } : {}) }) + '\0');
  });
}
async function e<T = unknown>(js: string): Promise<T> {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function w(js: string, what: string, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await e<boolean>(js).catch(() => false)) return;await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`timed out waiting for ${what}`);
}
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));
async function shot(name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64'));
}
async function go(url: string) { await send('Page.navigate', { url });await pause(800);await w('document.readyState==="complete"', 'page load'); }
const assert = (ok: unknown, what: string) => { if (!ok) throw new Error(what); };
const results: [string, boolean, string?][] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn();results.push([name, true]); } catch (error) { results.push([name, false, (error as Error).message]);await shot(`failed-${results.length}`); }
}

const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
const builderReady = 'window.ara?.store.current && document.querySelector("#loading").hidden';

await step('Builder: add a pack by its address in the Packs window', async () => {
  await go(`${site}/app/#demo`);await w(builderReady, 'the builder');
  await e('document.querySelector(".anim-browse").click()');await w('document.querySelector("#anim-pop.open")', 'the animation browser');
  await e('document.querySelector(".anim-packs").click()');await w('document.getElementById("packs-dialog")?.open', 'Packs');
  await e(`(()=>{document.querySelector('#packs-dialog .pk-address').open=true;const i=document.querySelector('#packs-dialog [data-r=url]');i.value=${JSON.stringify(packUrl)};document.querySelector('#packs-dialog [data-r=add]').click();})()`);
  await w('/Added Check moves: 2 animations/.test(document.querySelector("#packs-dialog [data-r=status]").textContent)', 'the pack added');
  assert(/1 pack · 2 animations/.test(await e<string>('document.querySelector("#packs-dialog [data-r=summary]").textContent')), 'summary');
  await shot('1-packs-window');
});
await step('Builder: animation files dropped in become a pack, with names and groups filled in and copies skipped', async () => {
  const { root } = await send<{ root: { nodeId: number } }>('DOM.getDocument');
  const { nodeId } = await send<{ nodeId: number }>('DOM.querySelector', { nodeId: root.nodeId, selector: '#packs-dialog [data-r=file]' });
  await send('DOM.setFileInputFiles', { nodeId, files: ['victory cheer.fbx', 'victory cheer (2).fbx'].map((f) => join(downloads, f)) });
  await w('/Imported 1 animation into My animations/.test(document.querySelector("#packs-dialog [data-r=status]").textContent)', 'the import', 120000);
  assert(/Skipped 1: victory cheer \(2\)\.fbx \(the same as victory cheer\.fbx\)/.test(await e<string>('document.querySelector("#packs-dialog [data-r=status]").textContent')), 'the copy skipped');
  const fields = await e<string[]>('[...document.querySelectorAll("#packs-dialog .pk-edit [data-field]")].map(f=>f.value)');
  assert(fields.join('|') === 'My animations|Victory cheer|Emotes', `editor: ${fields.join('|')}`);
  await shot('2-imported');
});
await step('Builder: renaming an imported animation updates the lists at once', async () => {
  await e(`(()=>{const i=document.querySelector('#packs-dialog .pk-edit [data-field=name]');i.value='Big cheer';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await e('document.querySelector("#packs-dialog [data-r=done]").click()');
  await w('[...document.querySelectorAll(".anim-tab")].some(t=>t.firstChild.textContent==="My animations")', 'the imported pack\'s tab');
  await e('[...document.querySelectorAll(".anim-tab")].find(t=>t.firstChild.textContent==="My animations").click()');
  const names = await e<string>('[...document.querySelectorAll(".anim-clip")].map(b=>b.firstChild.textContent).join()');
  assert(names === 'Big cheer', `renamed in the browser: ${names}`);
});
await step('Builder: the pack has its own tab, and its animations play', async () => {
  await e('document.querySelector("#packs-dialog")?.open && document.querySelector("#packs-dialog [data-r=done]").click()');
  const tabs = await e<string[]>('[...document.querySelectorAll(".anim-tab")].map(t=>t.firstChild.textContent)');
  assert(tabs.includes('Check moves'), `tabs: ${tabs.join(', ')}`);
  await e('[...document.querySelectorAll(".anim-tab")].find(t=>t.firstChild.textContent==="Check moves").click()');
  const clips = await e<string[]>('[...document.querySelectorAll(".anim-clip")].map(b=>b.dataset.id)');
  assert(clips.join() === 'check-moves/big_wave,check-moves/stroll', `clips: ${clips.join()}`);
  await e('document.querySelector(\'.anim-clip[data-id="check-moves/big_wave"]\').click()');
  await w('window.ara.viewer.clip?.id==="check-moves/big_wave"', 'the pack clip playing');
  await pause(1200);await shot('2-builder-pack-tab');
});
await step('Builder: exports from the worker include the pack\'s animations', async () => {
  const names = await e<string[]>(`(async()=>{const f=await ara.engine.export({...ara.store.exportSettings,mode:'animated',format:'glb',packaging:'embedded',clips:['idle','check-moves/stroll','check-moves/big_wave'],stageProps:false});
    const d=f.data,v=new DataView(d.buffer,d.byteOffset),n=v.getUint32(12,true);return JSON.parse(new TextDecoder().decode(d.subarray(20,20+n))).animations.map(a=>a.name);})()`);
  assert(names.join('|') === 'Idle|Stroll|Big wave', `animations: ${names.join('|')}`);
});
await step('The pack stays in this browser: after a reload, in the builder and in Studio', async () => {
  await go(`${site}/app/#demo`);await w(builderReady, 'the builder again');
  await w('[...document.querySelectorAll(".anim-tab")].some(t=>t.firstChild.textContent==="Check moves")', 'the pack restored');
  await go(`${site}/studio/#demo`);await w('window.studio?.ready', 'Studio', 180000);
  await w('[...document.querySelectorAll("#animation-category option")].some(o=>o.value==="Check moves")', 'the pack in Studio');
  assert(/2 packs · 3 animations/.test(await e<string>('document.getElementById("pack-summary").textContent')), 'Studio summary');
});
await step('Studio: a film link brings the pack it needs to a browser that doesn\'t have it', async () => {
  // A fresh browser state: no packs kept.
  await e('indexedDB.deleteDatabase("ara-packs");localStorage.clear()');
  const film = { kind: 'ara-studio', version: 2, title: 'Pack link', template: 'portrait', camera: 'locked', aspect: 'landscape', caption: false, view: { azimuth: 0, elevation: 0, zoom: 1 },
    packs: [{ id: 'check-moves', name: 'Check moves', url: packUrl }],
    actors: [{ id: 'a', character: presetCode('The Adventurer'), detail: 'medium', x: 0, y: 0, z: 0, yaw: 0, beats: [{ clip: 'check-moves/stroll', duration: 2, move: false }, { clip: 'check-moves/big_wave', duration: 2, move: false }] }],
    shots: [{ duration: 4, shot: 'wide', target: 'all' }] };
  // From a blank page: a link to the page already open would only change its # part, without opening Studio again.
  await send('Page.navigate', { url: 'about:blank' });await pause(300);
  await go(fileLink('film', JSON.stringify(film), site).replace('/studio/#', '/studio/#demo&'));
  await w('window.studio?.ready && studio.project.title==="Pack link"', 'the film from the link', 180000);
  assert(await e<string>('studio.project.actors[0].beats.map(b=>b.clip).join()') === 'check-moves/stroll,check-moves/big_wave', 'film actions');
  await e('studio.seek(3)');await pause(1500);await shot('3-studio-film-link');
  const saved = await e<{ packs?: { id: string; url?: string }[] }>('JSON.parse(localStorage.getItem("ara.studio.project.v2"))');
  assert(saved.packs?.[0]?.url === packUrl, 'the saved film lists the pack');
});
await step('Studio: choosing a one-off animation gives its action the animation\'s own length; a loop keeps the length set', async () => {
  const pick = (id: string) => e(`(()=>{const s=document.getElementById('action');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await e(`(()=>{const s=document.getElementById('timeline-selection');s.value='a:0';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(200);
  await pick('check-moves/big_wave');await pause(400);
  const duration = await e<number>('studio.project.actors[0].beats[0].duration');
  const wave = JSON.parse(PACK).animations.find((a: { id: string }) => a.id === 'big_wave').motion;
  assert(Math.abs(duration - Math.round(wave.duration * 100) / 100) < 1e-6, `the wave's action lasts ${duration} s, the wave ${wave.duration} s`);
  await e(`(()=>{const i=document.getElementById('beat-duration');i.value='5';i.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(300);
  await pick('check-moves/stroll');await pause(400);
  assert(await e<number>('studio.project.actors[0].beats[0].duration') === 5, 'the loop keeps 5 s');
});
await step('Studio: a pack the film uses can\'t be removed', async () => {
  await e('document.getElementById("animation-packs").click()');await w('document.getElementById("packs-dialog")?.open', 'Packs');
  assert(await e<boolean>('!document.querySelector("#packs-dialog [data-act=remove][data-id=check-moves]") && /In use/.test(document.querySelector("#packs-dialog [data-r=list]").textContent)'), 'in use');
  await shot('4-in-use');
});

const exited = new Promise<void>((r) => chrome.once('exit', () => r()));chrome.kill();server.close();await exited;
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
rmSync(downloads, { recursive: true, force: true });
for (const [name, ok, why] of results) console.log(`${ok ? '✓' : '✗'} ${name}${why ? `\n    ${why}` : ''}`);
if (errors.length) console.log(`Page errors:\n${errors.slice(0, 8).map((x) => '  ' + x.split('\n')[0]).join('\n')}`);
const failed = results.filter((r) => !r[1]).length;
console.log(`Packs in the browser: ${results.length - failed} of ${results.length} passed.`);
process.exit(failed || errors.length ? 1 : 0);
