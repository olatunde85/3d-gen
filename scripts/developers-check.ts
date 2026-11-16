/**
 * Checks the developers page playground in headless Chrome against the built site (run npm run build first):
 * the first character loads, expressions and vehicles change it, a bad share link explains itself, and the page fits
 * a phone. Photos go to out/developers/.
 *   npx tsx scripts/developers-check.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist'), out = join(root, 'out/developers');
if (!existsSync(join(dist, 'developers/index.html'))) throw Error('Build the site first: npm run build');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
// Serves the built site only.
const server = createServer((req, res) => {
  let file = resolve(dist, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-developers-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (c: Buffer) => { buffer += c.toString();let n;while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = <T = any>(method: string, params: object = {}, attach = true) => new Promise<T>((ok, fail) => {
  const id = ++seq;pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));
  input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0');
});
const evaluate = async <T = any>(expression: string): Promise<T> => { const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(expression: string, label: string, ms = 90000) { const end = Date.now() + ms;while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return;await sleep(150); }throw Error(`Timed out: ${label}: ${await evaluate("document.getElementById('pg-status').textContent")}`); }
const photo = async (name: string, clip?: object) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };
const ready = "document.getElementById('pg-loading').hidden && !document.getElementById('pg-download').disabled";
const box = (selector: string) => evaluate<object>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);
const set = (selector: string, value: string) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));return 1})()`);

try {
  mkdirSync(out, { recursive: true });
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/developers/` });
  await until(ready, 'first character');await sleep(800);
  const first = await evaluate<{ stats: string; code: string; clips: number }>("({stats:document.getElementById('pg-stats').textContent,code:document.getElementById('pg-code').textContent,clips:document.getElementById('pg-clip').options.length})");
  assert.match(first.stats, /The Soldier · built in/);assert.match(first.code, /createCharacter\('The Soldier'/);assert.equal(first.clips, 16);
  console.log('OK first character:', first.stats);
  await photo('hero-desktop', { x: 0, y: 0, width: 1400, height: 1000 });
  await evaluate("document.getElementById('playground').scrollIntoView()");await sleep(300);
  await photo('playground-soldier', await box('#playground'));

  // An expression changes the face at once and appears in the code.
  await evaluate("[...document.querySelectorAll('#pg-expressions button')].find(b=>b.textContent==='happy').click()");
  assert.match(await evaluate("document.getElementById('pg-code').textContent"), /setExpression\('happy'\)/);console.log('OK expression in code');
  // A vehicle rebuilds the character and plays its riding clip.
  await set('#pg-vehicle', 'motorcycle');await sleep(400);await until(ready, 'motorcycle');await sleep(800);
  const ride = await evaluate<{ clip: string; code: string }>("({clip:document.getElementById('pg-clip').value,code:document.getElementById('pg-code').textContent})");
  assert.equal(ride.clip, 'ride_motorcycle');assert.match(ride.code, /vehicle: 'motorcycle'/);assert.match(ride.code, /setExpression\('happy'\)/);
  console.log('OK motorcycle: plays', ride.clip, 'and keeps the chosen expression');
  await photo('playground-motorcycle', await box('#playground'));
  // Longer code scrolls inside the code panel instead of making the playground taller.
  await evaluate("document.getElementById('pg-talk').click()");await sleep(200);
  const fit = await evaluate<{ code: number; controls: number; scrolls: boolean }>("({code:document.querySelector('.code').getBoundingClientRect().height,controls:document.querySelector('.pg-controls').getBoundingClientRect().height,scrolls:document.querySelector('.code pre').scrollHeight>document.querySelector('.code pre').clientHeight})");
  assert.ok(fit.code <= fit.controls + 1 && fit.scrolls, `code panel ${fit.code}px, controls ${fit.controls}px, scrolls ${fit.scrolls}`);
  console.log(`OK long code scrolls inside a ${Math.round(fit.code)} px panel`);
  await evaluate("document.getElementById('pg-talk').click()");
  // The code in TypeScript.
  await evaluate("document.querySelector('[data-lang=ts]').click()");
  const typed = await evaluate<string>("document.getElementById('pg-code').textContent");
  assert.match(typed, /const hero: AraCharacter = await/);assert.match(typed, /hero\.clip\('ride_motorcycle'\)!/);
  writeFileSync(join(out, 'main.ts'), typed);console.log('OK TypeScript code (out/developers/main.ts)');
  await photo('playground-typescript', await box('#playground'));
  await evaluate("document.querySelector('[data-lang=js]').click()");
  // Walking forward instead of in place.
  await set('#pg-vehicle', 'none');await sleep(300);await until(ready, 'no vehicle');
  await set('#pg-clip', 'walk');
  await evaluate("document.getElementById('pg-inplace').click()");await sleep(400);await until(ready, 'root motion');
  assert.match(await evaluate("document.getElementById('pg-code').textContent"), /rootMotion: true/);console.log('OK in place off: rootMotion in the code');
  // The camera follows the walker, so after a few steps the character is still in view.
  await sleep(2500);await photo('playground-walking-forward', await box('#pg-view'));
  await evaluate("document.getElementById('pg-inplace').click()");await sleep(400);await until(ready, 'in place again');
  // A preset's own bag shows in the Carry select; choosing none takes it away; colours rebuild and appear in the code.
  await set('#pg-preset', 'The Female Executive');await sleep(400);await until(ready, 'executive');
  const exec = await evaluate<{ carry: string; code: string; parts: string[] }>("({carry:document.getElementById('pg-carry').value,code:document.getElementById('pg-code').textContent,parts:[...document.querySelectorAll('#pg-colors span')].map(s=>s.textContent)})");
  assert.equal(exec.carry, 'handbag');assert.doesNotMatch(exec.code, /carry:/);assert.ok(exec.parts.includes('Handbag'), `colour parts: ${exec.parts}`);
  console.log('OK executive: carries her handbag; colours for', exec.parts.join(', '));
  await set('#pg-colors input[data-part=outfit]', '#1d2a44');await sleep(400);await until(ready, 'recolour');
  assert.match(await evaluate("document.getElementById('pg-code').textContent"), /colors: \{ outfit: '#1d2a44' \}/);
  await photo('playground-executive-navy', await box('#playground'));
  await set('#pg-carry', 'none');await sleep(400);await until(ready, 'no handbag');
  const noBag = await evaluate<{ code: string; parts: string[] }>("({code:document.getElementById('pg-code').textContent,parts:[...document.querySelectorAll('#pg-colors span')].map(s=>s.textContent)})");
  assert.match(noBag.code, /carry: 'none'/);assert.ok(!noBag.parts.includes('Handbag'));assert.match(noBag.code, /outfit: '#1d2a44'/);
  console.log('OK executive without the handbag, keeping the navy suit');
  await photo('playground-executive-nobag', await box('#playground'));
  // Every animation: search the full list and play one that isn't among the popular clips.
  await evaluate("document.getElementById('pg-all-clips').click()");await sleep(200);
  await photo('all-animations-full', await box('#pg-clips'));
  await evaluate("(()=>{const e=document.getElementById('pg-clip-search');e.value='swim';e.dispatchEvent(new Event('input'));return 1})()");await sleep(200);
  await photo('all-animations', await box('#pg-clips'));
  const swim = await evaluate<string>("(()=>{const b=document.querySelector('#pg-clip-list button');const id=b.querySelector('code').textContent;b.click();return id})()");
  await sleep(400);await until(ready, 'swim clip');
  const swum = await evaluate<{ clip: string; code: string; open: boolean }>("({clip:document.getElementById('pg-clip').value,code:document.getElementById('pg-code').textContent,open:document.getElementById('pg-clips').open})");
  assert.equal(swum.clip, swim);assert.match(swum.code, new RegExp(`animations: \\['${swim}'\\]`));assert.equal(swum.open, false);
  console.log('OK all animations: picked', swim);
  // A random character, then a broken share link.
  await evaluate("document.querySelector('input[name=source][value=random]').click()");await sleep(400);await until(ready, 'random');
  assert.match(await evaluate("document.getElementById('pg-code').textContent"), /\{ random: 42 \}/);console.log('OK random:', await evaluate("document.getElementById('pg-stats').textContent"));
  await evaluate("document.querySelector('input[name=source][value=share]').click()");
  await evaluate("(()=>{const e=document.getElementById('pg-share');e.value='https://ara3dgen.com/app/#c=broken';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()");
  await until("document.getElementById('pg-loading').classList.contains('error')", 'share error', 30000);
  console.log('OK broken share link:', await evaluate("document.getElementById('pg-status').textContent"));

  // The embed demos load when scrolled into view.
  await evaluate("document.getElementById('embed').scrollIntoView()");
  await until("[...document.querySelectorAll('#embed-demo ara-character')].every((e) => e.character)", 'embed demos');await sleep(1500);
  await photo('embed-section', await box('#embed'));console.log('OK embed demos loaded');
  await photo('rest-desktop', { ...(await box('.dev-uses')), height: await evaluate<number>("document.querySelector('.footer').getBoundingClientRect().bottom + scrollY - document.querySelector('.dev-uses').getBoundingClientRect().top - scrollY") });
  // A phone: no sideways scrolling, and the playground stacks with the view first.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.reload');await until(ready, 'phone first character');await evaluate('scrollTo(0, 0)');await sleep(800);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no sideways scroll on a phone');
  await photo('phone-top', { x: 0, y: 0, width: 390, height: 844 });
  await evaluate("document.getElementById('playground').scrollIntoView()");await sleep(300);
  await photo('phone-playground', await box('#playground'));
  await evaluate("document.getElementById('embed').scrollIntoView()");
  await until("[...document.querySelectorAll('#embed-demo ara-character')].every((e) => e.character)", 'phone embed demos');await sleep(1500);
  await photo('phone-embed', await box('#embed'));
  await photo('phone-rest', { ...(await box('.dev-uses')), height: await evaluate<number>("document.querySelector('.footer').getBoundingClientRect().bottom - document.querySelector('.dev-uses').getBoundingClientRect().top") });
  // The docs search: "/" focuses it, typing lists matching sections, Enter opens the first.
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/docs/library/` });await sleep(1200);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', text: '/' });await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '/' });
  assert.equal(await evaluate("document.activeElement.id"), 'docs-search');
  await send('Input.insertText', { text: 'chain anim' });
  await until("document.querySelectorAll('#docs-results a').length > 0", 'search results', 10000);
  const found = await evaluate<string[]>("[...document.querySelectorAll('#docs-results a b')].map((b) => b.textContent)");
  assert.ok(/Chaining animations/.test(found[0]), `first result: ${found}`);
  await photo('docs-search', { x: 0, y: 0, width: 900, height: 700 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });await sleep(1200);
  assert.match(await evaluate<string>('location.href'), /#chaining-animations$/);
  console.log('OK docs search:', found.slice(0, 3).join(' | '));
  await evaluate("(()=>{const b=document.getElementById('docs-search');b.focus();b.value='zzqx';b.dispatchEvent(new Event('input'));return 1})()");
  await until("/No results/.test(document.getElementById('docs-results').textContent)", 'no results', 10000);
  console.log('OK docs search: no results message');
  // On a phone, the search box spans the width and its results fit the screen.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/docs/` });await sleep(1200);
  await evaluate("(()=>{const b=document.getElementById('docs-search');b.focus();b.value='motorcycle';b.dispatchEvent(new Event('input'));return 1})()");
  await until("document.querySelectorAll('#docs-results a').length > 0", 'phone search results', 10000);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no sideways scroll with results open');
  await photo('docs-search-phone', { x: 0, y: 0, width: 390, height: 844 });
  console.log(`Developers page checks passed. Photos in ${out}`);
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
