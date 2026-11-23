/**
 * Checks the characters page in headless Chrome against the built site (run npm run build first): on desktop and phone,
 * every preset has a card with a portrait, search and filters narrow the list, and nothing scrolls sideways; then a
 * Download .glb link builds the character in the builder and saves a .glb. Photos go to out/characters/.
 *   npx tsx scripts/characters-check.ts
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist'), out = join(root, 'out/characters');
if (!existsSync(join(dist, 'index.html'))) throw Error('Build the site first: npm run build');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const server = createServer((req, res) => {
  let file = resolve(dist, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-chars-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (c: Buffer) => { buffer += c.toString();let n;while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = <T = any>(method: string, params: object = {}, attach = true) => new Promise<T>((ok, fail) => { const id = ++seq;pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0'); });
const evaluate = async <T = any>(expression: string): Promise<T> => { const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(expression: string, label: string, ms = 60000) { const end = Date.now() + ms;while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return;await sleep(150); }throw Error(`Timed out: ${label}`); }
const photo = async (name: string, clip: object) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };

try {
  mkdirSync(out, { recursive: true });
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  const shown = () => evaluate<string[]>("[...document.querySelectorAll('.char:not([hidden]) .char-name')].map((n) => n.textContent)");
  for (const [name, width, height, scale, mobile] of [['desktop', 1440, 900, 1, false], ['phone', 390, 844, 2, true]] as const) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/characters/` });await sleep(1200);
    await until("document.querySelectorAll('.char').length > 0", 'cards');
    const total = await evaluate<number>("document.querySelectorAll('.char').length");
    assert.equal(total, 65, `${name}: every preset has a card`);
    // Every portrait loads.
    await evaluate("Promise.all([...document.images].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }))");
    const broken = await evaluate<string[]>("[...document.querySelectorAll('.char img')].filter((i) => !i.naturalWidth).map((i) => i.alt)");
    assert.deepEqual(broken, [], `${name}: portraits that didn't load`);
    // Search by name, and by what they wear.
    const search = async (q: string) => { await evaluate(`(() => { const i = document.getElementById('chars-q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`); return shown(); };
    assert.deepEqual(await search('nurse'), ['Nurse']);
    assert.ok((await search('hard hat')).includes('Road Worker'), 'search finds what a character wears');
    assert.deepEqual(await search('zzzz'), []);
    assert.ok(await evaluate("!document.getElementById('chars-empty').hidden"), 'no-match message');
    await search('');
    // Filters.
    await evaluate("document.querySelector('[data-filter=\\'Warriors and heritage\\']').click()");
    assert.deepEqual((await shown()).sort(), ['African Warrior', 'Dahomey Warrior', 'Maasai Warrior', 'Yoruba Warrior', 'Zulu Warrior']);
    await evaluate("document.querySelector('[data-filter=\\'Medical and science\\']').click()");
    assert.deepEqual((await shown()).sort(), ['Army Medic', 'Doctor', 'Lab Scientist', 'Nurse', 'Paramedic']);
    await evaluate("document.querySelector('[data-filter=women]').click()");
    const women = await shown();
    assert.ok(women.includes('Nurse') && !women.includes('Road Worker'), 'women filter');
    assert.match(await evaluate<string>('location.search'), /filter=women/);
    await evaluate("document.querySelector('[data-filter=all]').click()");
    assert.equal((await shown()).length, 65);
    const href = await evaluate<string>("[...document.querySelectorAll('.char')].find((c) => c.querySelector('.char-name').textContent === 'Nurse').querySelector('.char-glb').getAttribute('href')");
    assert.match(href, /app\/#preset=The%20Nurse&download$/);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), `${name}: no sideways scroll`);
    await photo(`characters-${name}`, { x: 0, y: 0, width, height });
    console.log(`OK ${name}: 65 cards with portraits, search, filters and links`);
  }
  // Download .glb: the builder opens the character and saves a .glb at once.
  const downloads = mkdtempSync(join(tmpdir(), 'ara-glb-'));
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true }, false);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/app/#preset=The%20Nurse&download` });
  const end = Date.now() + 240000;
  let glb = '';
  while (!glb && Date.now() < end) { await sleep(1000); glb = readdirSync(downloads).find((f) => f.endsWith('.glb')) ?? ''; }
  assert.ok(glb, 'a .glb downloads');
  const bytes = readFileSync(join(downloads, glb));
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF', 'the download is a binary glTF');
  console.log(`OK download: ${glb}, ${(bytes.length / 1e6).toFixed(1)} MB`);
  rmSync(downloads, { recursive: true, force: true });
  console.log(`Characters page checks passed. Photos in ${out}`);
} finally {
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
