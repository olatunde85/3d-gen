/**
 * Checks the <ara-character> embed (packages/cli/dist/embed.js) in headless Chrome: six elements on one page (a
 * preset with an expression, colours, a vehicle, a random character, a character file and a broken preset), then
 * changing attributes and removing an element. Build it first with npm run release-cli (or the embed Vite config).
 * Photos go to out/embed/.
 *   npx tsx scripts/embed-check.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { buildHuman } from '../src/core/human';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { DEFAULT_EXPORT, planExport, runExport } from '../src/export';
import { nodeLibrary } from './node-assets';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'out/embed');
if (!existsSync(join(root, 'packages/cli/dist/embed.js'))) throw Error('Build the embed first: npx vite build --config packages/cli/vite.embed.config.ts');
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width">
<style>body{margin:0;padding:16px;background:#f3efe8;font:14px system-ui;display:grid;grid-template-columns:repeat(3,300px);gap:16px}ara-character{border-radius:12px;background:#e4dfd5}</style>
<script>window.events=[];for(const t of ['load','error'])document.addEventListener(t,(e)=>{if(e.target.localName==='ara-character')events.push(t+':'+e.target.id+':'+(t==='load'?e.detail.params.name:e.detail.message));},true);</script>
<script type="module" src="/ara3d/embed.js"></script></head><body>
<ara-character id="soldier" preset="The Soldier" animation="wave" expression="happy" assets-url="/assets/"></ara-character>
<ara-character id="executive" preset="The Female Executive" colors="outfit: #1d2a44; carry: #8a1c1c" assets-url="/assets/"></ara-character>
<ara-character id="rider" preset="The Soldier" vehicle="motorcycle" style="aspect-ratio:3/4" assets-url="/assets/"></ara-character>
<ara-character id="random" random="42" background="#20283a" auto-rotate assets-url="/assets/"></ara-character>
<ara-character id="file" src="/hero.json" animation="walk 2s, wave, cheer" assets-url="/assets/"></ara-character>
<ara-character id="broken" preset="Nobody" assets-url="/assets/"></ara-character>
</body></html>`;
const HERO = JSON.stringify({ kind: 'ara-character', version: 1, preset: 'The Bride', params: { name: 'Ada' } });
// A rigged model from another tool, for the model attribute: Ara's own export stands in for one.
const modelLib = await nodeLibrary(), modelSource = await buildHuman(modelLib, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], detail: 'low' });
const MODEL = (await runExport(modelLib, modelSource, planExport(modelSource, { ...DEFAULT_EXPORT, mode: 'rigged', format: 'glb', packaging: 'embedded', clips: [], stageProps: false }))).data;

// Only these paths are served.
const MOUNTS: [string, string][] = [['/ara3d/', join(root, 'packages/cli/dist/')], ['/assets/', join(root, 'public/assets/')]];
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/') { res.setHeader('Content-Type', 'text/html');res.end(PAGE);return; }
  if (path === '/hero.json') { res.setHeader('Content-Type', 'application/json');res.end(HERO);return; }
  if (path === '/models/hero.glb') { res.setHeader('Content-Type', 'model/gltf-binary');res.end(MODEL);return; }
  const mount = MOUNTS.find(([prefix]) => path.startsWith(prefix)), file = mount && resolve(mount[1], path.slice(mount[0].length));
  if (!mount || !file || !file.startsWith(mount[1]) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-embed-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (c: Buffer) => { buffer += c.toString();let n;while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = <T = any>(method: string, params: object = {}, attach = true) => new Promise<T>((ok, fail) => {
  const id = ++seq;pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));
  input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0');
});
const evaluate = async <T = any>(expression: string): Promise<T> => { const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(expression: string, label: string, ms = 120000) { const end = Date.now() + ms;while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return;await sleep(200); }throw Error(`Timed out: ${label}: ${JSON.stringify(await evaluate('events'))}`); }
const photo = async (name: string) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };

try {
  mkdirSync(out, { recursive: true });
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 980, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await until('events.length >= 6', 'six elements');await sleep(1200);
  const events = await evaluate<string[]>('events');
  for (const expected of ['load:soldier:The Soldier', 'load:executive:The Female Executive', 'load:rider:The Soldier', 'load:random:random_42', 'load:file:Ada']) assert.ok(events.includes(expected), `${expected} in ${events}`);
  assert.ok(events.some((e) => e.startsWith('error:broken:Unknown preset "Nobody"')), `broken preset error in ${events}`);
  const state = await evaluate<any>(`(()=>{const q=(id)=>document.getElementById(id);return {
    executive:q('executive').character.colors, rider:q('rider').character.props.length, file:q('file').character.clip('walk')!==undefined,
    broken:q('broken').shadowRoot.querySelector('.status').textContent }})()`);
  assert.equal(state.executive.outfit, '#1d2a44');assert.equal(state.executive.carry, '#8a1c1c');assert.equal(state.rider, 1);assert.ok(state.file);
  assert.match(state.broken, /Unknown preset "Nobody"/);
  console.log('OK six elements:', events.join(' | '));
  await photo('page');
  // An expression applies at once; a new animation rebuilds with that clip.
  const loads = await evaluate<number>('events.length');
  await evaluate("document.getElementById('soldier').setAttribute('expression','surprised')");await sleep(300);
  assert.equal(await evaluate('events.length'), loads, 'an expression does not rebuild');
  await evaluate("document.getElementById('soldier').setAttribute('animation','dance_groove')");
  await until(`events.length > ${loads}`, 'new animation');
  assert.ok(await evaluate("!!document.getElementById('soldier').character.clip('dance_groove')"));
  console.log('OK attributes: expression at once, animation rebuilt with dance_groove');
  // look-at="pointer": the head turns towards the pointer, wherever it is on the page, and adds no rebuild.
  const yaw = `(()=>{const h=document.getElementById('soldier').character.scene.getObjectByName('Head'),d=new (h.position.constructor)();h.getWorldDirection(d);return Math.atan2(d.x,d.z)*180/Math.PI})()`;
  const ahead = await evaluate<number>(yaw), box = await evaluate<any>("(()=>{const r=document.getElementById('soldier').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()");
  await evaluate("document.getElementById('soldier').setAttribute('look-at','pointer')");
  // The element sits at the page's left edge: the pointer goes far to its right, then back to its left.
  const turnTo = async (x: number) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: box.y + box.h * 0.2 });await sleep(900);return evaluate<number>(yaw); };
  const right = await turnTo(box.x + box.w + 500), left = await turnTo(1);
  assert.ok(Math.abs(right - ahead) > 20 && Math.abs(right - left) > 20, `the head follows the pointer (ahead ${ahead.toFixed(0)}°, pointer right ${right.toFixed(0)}°, left ${left.toFixed(0)}°)`);
  await evaluate("document.getElementById('soldier').removeAttribute('look-at')");
  assert.equal(await evaluate('events.length'), loads + 1, 'look-at does not rebuild');
  console.log(`OK look-at="pointer": the head follows the pointer (${ahead.toFixed(0)}° ahead, ${right.toFixed(0)}° and ${left.toFixed(0)}°)`);
  // A sequence: the bride walks, waves and cheers, all three clips loaded in one build.
  assert.ok(await evaluate("['walk','wave','cheer'].every((id) => document.getElementById('file').character.clip(id))"));
  const before = await evaluate<number>('events.length');
  await evaluate("document.getElementById('file').setAttribute('animation','cheer, walk 1s')");await sleep(300);
  assert.equal(await evaluate('events.length'), before, 'reordering loaded clips does not rebuild');
  await evaluate("document.getElementById('file').setAttribute('animation','walk 3x')");await sleep(300);
  assert.match(await evaluate<string>("document.getElementById('file').shadowRoot.querySelector('.status').textContent"), /Can't read "3x"/);
  await evaluate("document.getElementById('file').setAttribute('animation','walk 2s, wave, cheer')");await sleep(300);
  assert.ok(await evaluate<boolean>("document.getElementById('file').shadowRoot.querySelector('.status').hidden"), 'the fixed attribute clears the message');
  console.log('OK sequence: walk 2s, wave, cheer; reordering is instant; a typo explains itself');
  const strip = await evaluate<object>("(()=>{const r=document.getElementById('file').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()");
  for (let i = 0; i < 8; i++) { await sleep(600);const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', clip: strip });writeFileSync(join(out, `sequence-${i}.png`), Buffer.from(r.data, 'base64')); }
  // Removing an element frees it.
  await evaluate("document.getElementById('random').remove()");
  assert.equal(await evaluate("document.getElementById('random') ? 1 : document.querySelectorAll('ara-character').length"), 5);
  console.log('OK removed element');
  // A model from another tool, with a rifle: its model worker loads beside embed.js.
  await evaluate(`(()=>{const m=document.createElement('ara-character');m.id='model';for(const [k,v] of [['model','/models/hero.glb'],['weapon','rifle'],['animation','rifle_idle'],['assets-url','/assets/']])m.setAttribute(k,v);document.body.append(m);})()`);
  await until(`events.some((e)=>e.startsWith('load:model:')||e.startsWith('error:model:'))`, 'the model element');
  const modelEvent = (await evaluate<string[]>('events')).find((e) => e.includes(':model:'))!;
  assert.equal(modelEvent, 'load:model:hero', modelEvent);
  assert.ok(await evaluate<boolean>(`(()=>{const c=document.getElementById('model').character;return !!c.clip('rifle_idle')&&!!c.scene.getObjectByName('WeaponR')})()`), 'rifle_idle and the rifle socket');
  console.log('OK model attribute: a GLB from another tool, with a rifle');
  await sleep(1200);await photo('page-after');
  console.log(`Embed checks passed. Photos in ${out}`);
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
