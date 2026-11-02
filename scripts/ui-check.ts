/**
 * UI smoke test: builds the app, opens it in headless Chrome and drives it through the main
 * flows (load, Quick build, slider, preset, animation browser, export panel, export), failing on
 * any page error. Catches UI wiring mistakes that the core tests can't see.
 *   npm run test:ui          (set CHROME=/path/to/chrome if not on macOS default)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { build } from 'vite';

const winDirs = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((d): d is string => !!d);
const CHROME = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge',
  ...winDirs.flatMap((d) => [join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
].find(existsSync);
if (!CHROME) throw new Error('No Chrome, Chromium or Edge found: set CHROME=/path/to/browser');

const DIST = join(import.meta.dirname, '../dist');
await build({ logLevel: 'error' });
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.pack': 'application/octet-stream', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const server = createServer((req, res) => {
  let path = normalize(join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0])));
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!path.startsWith(DIST) || !existsSync(path)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise<void>((r) => server.listen(4398, r));

// --- Chrome over the DevTools pipe (fds 3 and 4) ---------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'ui-check-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--window-size=1400,900', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const toChrome = chrome.stdio[3] as Writable, fromChrome = chrome.stdio[4] as Readable;
// Chrome keeps writing to its profile until it has exited, so wait for that before removing it.
const cleanup = async () => {
  const exited = chrome.exitCode !== null ? Promise.resolve() : new Promise<void>((r) => chrome.once('exit', () => r()));
  chrome.kill();
  server.close();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
};

let nextId = 0, session: string | undefined, buf = '';
const pending = new Map<number, (m: { result?: unknown; error?: { message: string } }) => void>();
const errors: string[] = [];
fromChrome.on('data', (c: Buffer) => {
  buf += c.toString('utf8');
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (m.id !== undefined) pending.get(m.id)?.(m);
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' '));
  }
});
function send<T = Record<string, unknown>>(method: string, params: object = {}, withSession = true): Promise<T> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result as T)));
    toChrome.write(JSON.stringify({ id, method, params, ...(withSession && session ? { sessionId: session } : {}) }) + '\0');
  });
}
async function evaluate<T>(js: string): Promise<T> {
  const r = await send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(js: string, what: string, ms = 120000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate<boolean>(js).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for ${what}`);
}

// --- The checks -------------------------------------------------------------------------------
const results: [string, boolean, string?][] = [];
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push([name, true]);
  } catch (e) {
    results.push([name, false, (e as Error).message]);
  }
}
/** Resolves after the next finished build (the stats line changes). */
const statsNow = () => evaluate<string>("document.querySelector('#stats').textContent");
const builtAfter = async (before: string, what: string) =>
  waitFor(`(() => { const s = document.querySelector('#stats').textContent; return !!s && s !== ${JSON.stringify(before)} && !document.querySelector('#status').classList.contains('show'); })()`, what);

try {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  ({ sessionId: session } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:4398/app/' });

  await step('loads and builds a character', async () => {
    await waitFor("document.querySelector('#loading')?.hidden === true && !!document.querySelector('#stats').textContent", 'the first character');
  });
  // Quick build: new visitors start there.
  const quick = (k: string) => `document.querySelector('#quick [data-k="${k}"]')`;
  const tap = async (k: string) => evaluate(`${quick(k)}.click()`);
  const sentence = () => evaluate<string>("document.querySelector('.qb-sentence').textContent");
  await step('new visitors start in Quick build', async () => {
    await waitFor(`document.body.dataset.mode === 'quick' && !!document.querySelector('.qb-sentence') && getComputedStyle(document.querySelector('#controls')).display === 'none'`, 'Quick build', 5000);
  });
  await step('Quick build options rebuild and read back', async () => {
    for (const [k, word] of [['gender:woman', 'woman'], ['heritage:african', 'African'], ['style:business', 'business suit'], ['hair:cornrows', 'cornrows']]) {
      const before = await statsNow();
      await tap(k);
      await builtAfter(before, `the rebuild after ${k}`);
      // (The panel redraws on the next frame.)
      await waitFor(`document.querySelector('.qb-sentence').textContent.includes(${JSON.stringify(word)})`, `the summary to say "${word}" after ${k}`, 3000).catch(async () => {
        throw new Error(`summary "${await sentence()}" lacks "${word}" after ${k}`);
      });
      if ((await evaluate<string>(`${quick(k)}.ariaPressed`)) !== 'true') throw new Error(`${k} isn't shown as picked`);
    }
    if ((await evaluate<string>("JSON.parse(localStorage.getItem('3dgen.human')).outfit")) !== 'set_pantsuit') throw new Error("a woman's business suit isn't the pantsuit");
  });
  await step('fast taps each see the latest character', async () => {
    // Two taps before the panel redraws: the outfit must be judged for a woman, not the man drawn.
    let before = await statsNow();
    await tap('gender:man');
    await builtAfter(before, 'the man');
    before = await statsNow();
    await evaluate(`(() => { ${quick('gender:woman')}.click(); ${quick('style:aso_ebi')}.click(); })()`);
    await builtAfter(before, 'the woman in aso-ebi');
    const outfit = await evaluate<string>("JSON.parse(localStorage.getItem('3dgen.human')).outfit");
    if (outfit !== 'set_aso_ebi') throw new Error(`outfit is ${outfit}`);
  });
  await step('unavailable options say why', async () => {
    const before = await statsNow();
    await tap('age:teen');
    await builtAfter(before, 'the teen build');
    await tap('tattoos:chest');
    await waitFor("document.querySelector('.qb-toast').classList.contains('show') && /adult/.test(document.querySelector('.qb-toast').textContent)", 'the reason a teen has no tattoos', 3000);
    if ((await evaluate<string>(`${quick('style:beach')}.ariaDisabled`)) !== 'true') throw new Error("beachwear isn't adults-only");
  });
  await step('undo goes back a step', async () => {
    await new Promise((r) => setTimeout(r, 600)); // the change settles into the history
    const before = await statsNow();
    await evaluate("[...document.querySelectorAll('.qb-act')].find((b) => b.textContent.includes('Undo')).click()");
    await builtAfter(before, 'the undo');
    if (/\b1[0-7]-year-old/.test(await sentence())) throw new Error(`still a teen after undo: ${await sentence()}`);
  });
  await step('Surprise me builds a character', async () => {
    const before = await statsNow();
    await tap('act:surprise');
    await builtAfter(before, 'the surprise build');
  });
  await step('switching to Detailed shows every control', async () => {
    await evaluate("[...document.querySelectorAll('.mode-switch button')].find((b) => b.textContent.includes('Detailed')).click()");
    await waitFor("document.body.dataset.mode === 'detailed' && getComputedStyle(document.querySelector('#controls')).display !== 'none' && getComputedStyle(document.querySelector('#quick')).display === 'none'", 'Detailed', 3000);
  });
  await step('slider rebuilds the character', async () => {
    const before = await statsNow();
    await evaluate(`(() => { const s = [...document.querySelectorAll('#controls .ctl')].find((c) => c.querySelector('span')?.textContent === 'Muscle').querySelector('input'); s.value = '0.9'; s.dispatchEvent(new Event('input')); })()`);
    await builtAfter(before, 'the rebuild after a slider change');
  });
  await step('preset replaces the controls', async () => {
    const before = await statsNow();
    await evaluate(`(() => { const s = document.querySelector('#preset'); s.value = 'The African Warrior'; s.dispatchEvent(new Event('change')); })()`);
    await builtAfter(before, 'the preset build');
    const name = await evaluate<string>("document.querySelector('#name').value");
    if (name !== 'The African Warrior') throw new Error(`name field shows "${name}"`);
  });
  await step('animation browser plays a clip', async () => {
    await evaluate("document.querySelector('.anim-browse').click()");
    await waitFor("document.querySelector('#anim-pop').classList.contains('open')", 'the browser to open', 5000);
    await evaluate(`(() => { const s = document.querySelector('.anim-search'); s.value = 'jump land'; s.dispatchEvent(new Event('input')); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); })()`);
    await waitFor("document.querySelector('.anim-browse span').textContent === 'Jump land'", 'the clip to play', 5000);
    await evaluate("document.querySelector('.anim-close').click()");
  });
  await step('export panel opens and closes', async () => {
    await evaluate("document.querySelector('#export-summary').click()");
    await waitFor("!document.querySelector('#export-panel').hidden && !!document.querySelector('#export-panel .xp-go')", 'the export panel', 5000);
    await evaluate("document.querySelector('#export-panel .xp-close').click()");
    await waitFor("document.querySelector('#export-panel').hidden", 'the export panel to close', 5000);
  });
  await step('export downloads a file', async () => {
    // Capture the download instead of saving it.
    await evaluate(`(() => {
      window.__download = null;
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href.startsWith('blob:')) fetch(this.href).then((r) => r.blob()).then((b) => (window.__download = { name: this.download, size: b.size }));
        else click.call(this);
      };
      document.querySelector('#export-go').click();
    })()`);
    await waitFor('!!window.__download', 'the export', 240000);
    const d = await evaluate<{ name: string; size: number }>('window.__download');
    if (!/\.(glb|fbx|zip|obj)$/.test(d.name) || d.size < 100000) throw new Error(`downloaded ${d.name} (${d.size} bytes)`);
  });
} finally {
  await cleanup();
}

let failed = 0;
for (const [name, ok, msg] of results) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${msg ? `: ${msg}` : ''}`);
  if (!ok) failed++;
}
if (errors.length) {
  failed++;
  console.log(`FAIL page errors:\n  ${errors.slice(0, 5).join('\n  ')}`);
}
console.log(failed ? 'UI CHECK FAILED' : 'UI works in a real browser');
process.exit(failed ? 1 : 0);
