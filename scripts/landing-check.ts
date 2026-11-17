/**
 * Checks the landing page in headless Chrome against the built site (run npm run build first): on desktop and phone,
 * each of the four developer tabs builds the character its code makes, and nothing scrolls sideways. Photos go to
 * out/landing/.
 *   npx tsx scripts/landing-check.ts
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist'), out = join(root, 'out/landing');
if (!existsSync(join(dist, 'index.html'))) throw Error('Build the site first: npm run build');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const server = createServer((req, res) => {
  let file = resolve(dist, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-tabs-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (c: Buffer) => { buffer += c.toString();let n;while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = <T = any>(method: string, params: object = {}, attach = true) => new Promise<T>((ok, fail) => { const id = ++seq;pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0'); });
const evaluate = async <T = any>(expression: string): Promise<T> => { const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(expression: string, label: string, ms = 60000) { const end = Date.now() + ms;while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return;await sleep(150); }throw Error(`Timed out: ${label}`); }
const photo = async (name: string, clip: object) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };
const box = (selector: string) => evaluate<object>(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}})()`);

try {
  mkdirSync(out, { recursive: true });
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  const want: Record<string, string> = { library: 'The Soldier', embed: 'The Priest', cli: 'The Female Executive', mcp: 'The Cyberpunk Hacker' };
  for (const [name, width, height, scale, mobile] of [['desktop', 1440, 900, 1, false], ['phone', 390, 844, 2, true]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });await sleep(1500);
    await evaluate("document.getElementById('developers').scrollIntoView()");
    for (const tab of Object.keys(want)) {
      await evaluate(`document.querySelector('.devx [data-tab="${tab}"]').click()`);
      // Desktop builds each tab's character live; phones play a recording of it instead.
      if (mobile) await until(`(() => { const v = document.querySelector('.devx-video');return v && v.src.endsWith('/${tab}.mp4') && v.readyState >= 2 && !v.paused; })()`, `${tab} recording`);
      else await until(`document.getElementById('devx-character').character?.params.name === ${JSON.stringify(want[tab])} && document.getElementById('devx-character').shadowRoot.querySelector('.status').hidden`, tab);
      await evaluate("document.querySelector('.devx').scrollIntoView({block:'center'})");await sleep(1500);
      await photo(`devx-${name}-${tab}`, await box('.devx'));
    }
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: no sideways scroll`);
    // Phones hold one live 3D character, the hero's; desktop has the Develop panel's too.
    const live = await evaluate<number>("document.querySelectorAll('ara-character').length");
    assert.equal(live, mobile ? 1 : 2, `${name}: ${live} live characters`);
    console.log(`OK ${name}: four developer tabs, each ${mobile ? 'playing its recording' : 'building its own character'}; ${mobile ? 1 : 2} live 3D character${mobile ? '' : 's'}`);
    await evaluate('scrollTo(0, 0)');await sleep(300);
    await photo(`top-${name}`, { x: 0, y: 0, width, height });
  }
  console.log(`Landing checks passed. Photos in ${out}`);
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
