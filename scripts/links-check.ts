/**
 * Checks film and game links (src/app/links.ts): files survive packing, hosted files download with clear errors, and
 * the built Studio and Play open a linked film or game, keeping the visitor's own work when a link can't be opened.
 *   npm run build && npm run test:links
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { fileLink, hostedLink, linkedFile, packFile } from '../src/app/links';
import { assistExample } from '../src/studio/assist';
import { playExample } from '../src/play/assist';

// --- Packing and hosted files, without a browser ------------------------------------------------------------------
const film = JSON.stringify(assistExample()), game = JSON.stringify(playExample());
assert.equal(await linkedFile('#film=' + packFile(film), 'film'), film);
assert.equal(await linkedFile('#game=' + packFile(game), 'game'), game);
assert.match(fileLink('game', game), /^https:\/\/ara3dgen\.com\/play\/#game=[\w-]+$/);
assert.equal(hostedLink('film', 'https://example.com/a b.json'), 'https://ara3dgen.com/studio/#src=https%3A%2F%2Fexample.com%2Fa%20b.json');
assert.equal(await linkedFile('#other=1', 'film'), undefined);
await assert.rejects(linkedFile('#film=AAAA', 'film'), /incomplete/);
await assert.rejects(linkedFile('#src=http://example.com/f.json', 'film'), /https/);
await assert.rejects(linkedFile('#src=not a url', 'game'), /web address/);
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: URL) => url.host === 'ok.example' ? new Response(game) : url.host === 'gone.example' ? new Response('', { status: 404 }) : Promise.reject(TypeError('blocked'))) as typeof fetch;
assert.equal(await linkedFile('#src=' + encodeURIComponent('https://ok.example/g.json'), 'game'), game);
await assert.rejects(linkedFile('#src=https://gone.example/g.json', 'game'), /error 404/);
await assert.rejects(linkedFile('#src=https://cors.example/g.json', 'game'), /allow other sites/);
globalThis.fetch = realFetch;
console.log(`OK links pack and unpack (film link ${fileLink('film', film).length} characters, game link ${fileLink('game', game).length})`);

// --- The built apps -------------------------------------------------------------------------------------------------
const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist');
if (!existsSync(join(dist, 'studio/index.html'))) throw Error('Build the site first: npm run build');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
let embedPage = '';
const server = createServer((req, res) => {
  if (req.url === '/embed-test.html') { res.setHeader('Content-Type', 'text/html');res.end(embedPage);return; }
  let file = resolve(dist, '.' + decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(dist) || !existsSync(file)) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-links-'));
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (c: Buffer) => { buffer += c.toString();let n;while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } } });
const send = <T = any>(method: string, params: object = {}, attach = true) => new Promise<T>((ok, fail) => {
  const id = ++seq;pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));
  input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0');
});
const evaluate = async <T = any>(expression: string): Promise<T> => { const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);return r.result.value; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(expression: string, label: string, ms = 120000) { const end = Date.now() + ms;while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return;await sleep(200); }throw Error(`Timed out: ${label}`); }
// A blank page in between, so a link to the page already open loads it afresh rather than only changing the address.
const open = async (path: string) => { await send('Page.navigate', { url: 'about:blank' });await sleep(200);await send('Page.navigate', { url: `http://127.0.0.1:${port}${path}` });await sleep(500); };

try {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');

  // Studio: a linked film opens like a file, and leaves the address so a reload keeps later edits.
  const example = assistExample();
  await open('/studio/#demo&film=' + packFile(film));
  await until('window.studio?.project?.actors?.length > 0 && !location.hash.includes("film=")', 'Studio opens the linked film');
  const opened = await evaluate<{ actors: number; set: string }>('({actors:studio.project.actors.length,set:studio.project.template})');
  assert.equal(opened.actors, example.actors.length);assert.equal(opened.set, example.template);
  console.log(`OK Studio opens a linked film (${opened.actors} characters, set ${opened.set}) and clears it from the address`);
  await evaluate('document.getElementById("undo").click()');
  await until('window.studio.project.title !== ' + JSON.stringify(example.title), 'Undo returns to the film from before the link');
  console.log('OK Undo returns to the film from before the link');
  await open('/studio/#demo&film=AAAA');
  await until('document.body.textContent.includes("That film link is incomplete")', 'Studio explains a broken link');
  console.log('OK Studio explains a broken film link');

  // Play: a linked game plays in place of the saved setup.
  await open('/play/#demo&game=' + packFile(game));
  await until('window.araPlay?.project?.identity?.title === "Operation Homebound"', 'Play opens the linked game');
  await until('document.getElementById("announcement").textContent.includes("Opened the game from the link")', 'Play says where the game came from', 10000);
  console.log('OK Play opens a linked game: Operation Homebound');
  await open('/play/#demo&game=AAAA');
  await until('window.araPlay?.project && document.getElementById("announcement").textContent.includes("That game link is incomplete")', 'Play explains a broken link');
  assert.notEqual(await evaluate('araPlay.project.identity.title'), undefined);
  console.log('OK Play explains a broken game link and keeps its own game');

  // The embed snippet from docs/hosting-games.md, around the site's own Play page: it loads on Play, can go full screen,
  // and a mission pauses when the page around it takes the focus.
  const docs = readFileSync(join(root, 'docs/hosting-games.md'), 'utf8'), snippet = /## Put the game on your own page[\s\S]*?```html\n([\s\S]*?)```/.exec(docs)![1];
  embedPage = `<!doctype html><html><body style="margin:24px;background:#fff"><h1>My blog</h1><input id="elsewhere">${snippet.replace('https://your-host.example/my-game/', `http://127.0.0.1:${port}/play/#demo`)}</body></html>`;
  await open('/embed-test.html');
  assert.equal(await evaluate('document.querySelectorAll(".ara-game iframe").length'), 0, 'nothing loads before Play');
  await evaluate('document.querySelector(".ara-game button").click()');
  await until('document.querySelector(".ara-game iframe")?.contentWindow?.araPlay?.game && !document.querySelector(".ara-game iframe").contentDocument.getElementById("start").disabled', 'the embedded game loads');
  const frame = 'document.querySelector(".ara-game iframe").contentWindow';
  assert.equal(await evaluate(`${frame}.document.getElementById("fullscreen").hidden`), false, 'full screen is offered inside the frame');
  await evaluate(`${frame}.document.getElementById("start").click()`);
  await until(`${frame}.araPlay.game.status === "playing"`, 'the embedded game starts');
  await evaluate(`${frame}.dispatchEvent(new Event("blur"))`);
  await until(`${frame}.araPlay.paused === true && !${frame}.document.getElementById("paused").hidden`, 'the game pauses when it loses focus', 5000);
  await evaluate(`${frame}.document.getElementById("resume").click()`);
  await until(`${frame}.araPlay.paused === false`, 'Keep playing resumes', 5000);
  console.log('OK the documented embed loads on Play, offers full screen, and pauses when it loses focus');
  console.log('Link checks passed.');
} finally { chrome.kill();server.close();rmSync(profile, { recursive: true, force: true }); }
