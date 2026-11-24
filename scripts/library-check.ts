/**
 * Checks the ara3d browser library in headless Chrome: builds characters through the public API, plays a clip with
 * three's AnimationMixer and photographs the result to out/library/. Serves only the test page, the built library,
 * three.js and the character data.
 *   npm run test:library        (set CHROME=/path/to/chrome if it isn't in the default place)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { encodeCharacter } from '../src/app/share';
import { DEFAULT_PARAMS, PRESETS } from '../src/core/params';
import { Texture, TextureLoader } from 'three';
import { buildHuman } from '../src/core/human';
import { buildPack } from '../src/core/packs/build';
import { DEFAULT_EXPORT, planExport, runExport } from '../src/export';
import { nodeLibrary } from './node-assets';

const root = resolve(import.meta.dirname, '..'), out = join(root, 'out/library');
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(join(root, 'packages/cli/dist/index.js'))) throw Error('Build the library first: npx vite build --config packages/cli/vite.lib.config.ts');

const PAGE = `<!doctype html><html><body style="margin:0;background:#cfd6dd">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/examples/jsm/":"/three/examples/jsm/","ara3d":"/ara3d/index.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { createCharacter, createCharacterGLB, readPack, PRESET_NAMES, ANIMATIONS, PROPS } from 'ara3d';
window.lists = { presets: PRESET_NAMES.length, clips: ANIMATIONS.length, vehicles: PROPS.vehicles.length };
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });renderer.setSize(900, 700);document.body.append(renderer.domElement);
window.run = async (input, options, view) => {
  let frames = 0, ticking = true;(function tick() { frames++;if (ticking) requestAnimationFrame(tick); })();
  const steps = new Set(), started = performance.now();
  try {
    const hero = await createCharacter(input, { assetsUrl: '/assets/', ...options, onProgress: (label) => steps.add(label) });
    const seconds = (performance.now() - started) / 1000;ticking = false;
    const scene = new THREE.Scene();scene.background = new THREE.Color(0xcfd6dd);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.2));const sun = new THREE.DirectionalLight(0xffffff, 2);sun.position.set(2, 4, 3);scene.add(sun);
    scene.add(hero.scene);for (const p of hero.props) scene.add(p.scene);
    const clip = hero.clip(view.play);
    for (const [root, clips] of [[hero.scene, hero.animations], ...hero.props.map((p) => [p.scene, p.animations])]) {
      const c = root === hero.scene ? clip : clips.find((a) => a.name === clip?.name);
      if (c) { const m = new THREE.AnimationMixer(root);m.clipAction(c).play();m.setTime(view.t ?? 0.45); }
    }
    const camera = new THREE.PerspectiveCamera(30, 9 / 7, 0.1, 50);
    camera.position.set(Math.sin(view.az) * view.dist, 1.5, Math.cos(view.az) * view.dist);camera.lookAt(0, 0.95, 0);renderer.render(scene, camera);
    const result = { seconds, framesWhileBuilding: frames, steps: steps.size, height: hero.height, clips: hero.animations.map((a) => a.name), clipFound: !!clip, props: hero.props.map((p) => p.name), colors: hero.colors, carry: hero.params.carry, glb: hero.glb.length, name: hero.params.name };
    hero.dispose();return result;
  } catch (error) { ticking = false;return { error: error.message }; }
};
window.faceTest = async (expression, mouth) => {
  const hero = await createCharacter('The Female Executive', { assetsUrl: '/assets/', animations: ['idle'] });
  const meshes = [];hero.scene.traverse((o) => { if (o.morphTargetDictionary) meshes.push(o); });
  const value = (name) => Math.max(...meshes.map((m) => m.morphTargetDictionary[name] === undefined ? 0 : m.morphTargetInfluences[m.morphTargetDictionary[name]]));
  hero.setExpression(expression);hero.setMouth(mouth);
  const after = { expression: value(expression === 'happy' ? 'mouthSmile' : 'eyeWideLeft'), mouth: value(mouth), otherMouth: value('viseme_PP') };
  let blinkPeak = 0;for (let i = 0; i < 200; i++) { hero.update(0.05);blinkPeak = Math.max(blinkPeak, value('eyeBlinkLeft')); }
  hero.blinking = false;let lidAfterOff = 0;for (let i = 0; i < 200; i++) { hero.update(0.05);lidAfterOff = Math.max(lidAfterOff, value('eyeBlinkLeft')); }
  let errors = [];for (const f of [() => hero.setExpression('nope'), () => hero.setMouth('viseme_ZZ')]) try { f(); } catch (e) { errors.push(e.message); }
  // A close-up of the face, for the eye.
  const scene = new THREE.Scene();scene.background = new THREE.Color(0xcfd6dd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.4));const sun = new THREE.DirectionalLight(0xffffff, 1.6);sun.position.set(1, 3, 4);scene.add(sun);scene.add(hero.scene);
  const head = new THREE.Box3().setFromObject(hero.scene).max.y - 0.13;
  const camera = new THREE.PerspectiveCamera(22, 9 / 7, 0.05, 20);camera.position.set(0, head, 0.85);camera.lookAt(0, head, 0);renderer.render(scene, camera);
  hero.dispose();return { ...after, blinkPeak, lidAfterOff, errors, shapes: meshes.length };
};
// An expression holds while clips play, and a clip that moves the face adds its movement on top.
window.clipFaceTest = async () => {
  const hero = await createCharacter('The Female Executive', { assetsUrl: '/assets/', animations: ['idle', 'laugh'], detail: 'low' });
  const meshes = [];hero.scene.traverse((o) => { if (o.morphTargetDictionary) meshes.push(o); });
  const value = (name) => Math.max(...meshes.map((m) => m.morphTargetDictionary[name] === undefined ? 0 : m.morphTargetInfluences[m.morphTargetDictionary[name]]));
  const mixer = new THREE.AnimationMixer(hero.scene);
  const play = (id, seconds, watch) => { mixer.stopAllAction();mixer.clipAction(hero.clip(id)).play();for (let t = 0; t < seconds; t += 0.05) { mixer.update(0.05);hero.update(0.05);watch(); } };
  hero.setExpression('laughing');let smileLow = 1;play('idle', 10, () => { smileLow = Math.min(smileLow, value('mouthSmile')); });
  // A close-up after 10 seconds of idle, for the eye.
  const scene = new THREE.Scene();scene.background = new THREE.Color(0xcfd6dd);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2.4));const sun = new THREE.DirectionalLight(0xffffff, 1.6);sun.position.set(1, 3, 4);scene.add(sun);scene.add(hero.scene);
  const head = new THREE.Box3().setFromObject(hero.scene).max.y - 0.13;
  const camera = new THREE.PerspectiveCamera(22, 9 / 7, 0.05, 20);camera.position.set(0, head, 0.85);camera.lookAt(0, head, 0);renderer.render(scene, camera);
  hero.setExpression('neutral');let jawHigh = 0;play('laugh', 4.8, () => { jawHigh = Math.max(jawHigh, value('jawOpen')); });
  hero.dispose();return { smileLow, jawHigh };
};
window.sequenceTest = async () => {
  const hero = await createCharacter('The Soldier', { assetsUrl: '/assets/', animations: ['walk', 'wave', 'cheer'], detail: 'low' });
  const mixer = new THREE.AnimationMixer(hero.scene), order = [];
  const seq = hero.playSequence(mixer, 'walk 1s, wave, cheer');
  const names = { [hero.clip('walk').name]: 'walk', [hero.clip('wave').name]: 'wave', [hero.clip('cheer').name]: 'cheer' };
  const lengths = { wave: hero.clip('wave').duration, cheer: hero.clip('cheer').duration };
  for (let t = 0; t < lengths.wave + lengths.cheer + 0.3; t += 1 / 30) {
    mixer.update(1 / 30);
    const top = mixer._actions.filter((a) => a.isRunning()).sort((a, b) => b.getEffectiveWeight() - a.getEffectiveWeight())[0];
    const name = top && names[top.getClip().name];
    if (name && order[order.length - 1] !== name) order.push(name);
  }
  seq.stop();
  const errors = [];
  for (const steps of ['walk, nope', 'walk 3x', '']) try { hero.playSequence(new THREE.AnimationMixer(hero.scene), steps); } catch (e) { errors.push(e.message); }
  hero.dispose();return { order, lengths, errors };
};
// A content pack by its address: readPack lists it, and the character bakes its animations in.
window.packTest = async (url) => {
  try {
    const info = await readPack(url);
    const hero = await createCharacter('The Soldier', { assetsUrl: '/assets/', packs: [url], animations: ['idle', info.id], detail: 'low' });
    const mixer = new THREE.AnimationMixer(hero.scene), clip = hero.clip(info.animations[0].id);
    mixer.clipAction(clip).play();mixer.setTime(0.5);
    const hand = new THREE.Vector3();hero.scene.getObjectByName('RightHand').getWorldPosition(hand);
    const result = { info, clips: hero.animations.map((a) => a.name), handY: hand.y, height: hero.height };
    let missing = '';try { await createCharacter('The Soldier', { assetsUrl: '/assets/', animations: [info.animations[0].id], detail: 'low' }); } catch (e) { missing = e.message; }
    hero.dispose();return { ...result, missing };
  } catch (error) { return { error: error.message }; }
};
window.glbOnly = async () => { const glb = await createCharacterGLB('The Priest', { assetsUrl: '/assets/', animations: 'none', detail: 'low' });return { size: glb.length, magic: String.fromCharCode(...glb.slice(0, 4)) }; };
window.motionTest = async () => {
  const hero = await createCharacter('The Soldier', { assetsUrl: '/assets/', animations: ['idle', 'walk', 'run'], detail: 'low' });
  const mixer = new THREE.AnimationMixer(hero.scene), legs = hero.locomotion(mixer);
  const weights = () => ['idle', 'walk', 'run'].map((id) => +mixer.clipAction(hero.clip(id)).getEffectiveWeight().toFixed(2));
  const step = (seconds) => { for (let i = 0; i < seconds * 60; i++) { mixer.update(1 / 60);hero.update(1 / 60); } };
  const gaits = {};
  for (const [name, speed] of [['stand', 0], ['walk', legs.walkSpeed], ['run', legs.runSpeed]]) { legs.speed = speed;step(2);gaits[name] = weights(); }
  // The head turns towards a point to the character's left (+X), and back when told to look ahead.
  legs.speed = 0;step(1);
  const head = hero.scene.getObjectByName('Head'), ahead = new THREE.Vector3(), turned = new THREE.Vector3();
  head.getWorldDirection(ahead);hero.lookAt(new THREE.Vector3(2, 1.6, 1.5));step(1);head.getWorldDirection(turned);
  const turn = THREE.MathUtils.radToDeg(Math.atan2(turned.x, turned.z) - Math.atan2(ahead.x, ahead.z));
  hero.lookAt(null);
  // Lip-sync from a Web Audio node: a buzzing tone opens the mouth; stop() closes it.
  const ctx = new AudioContext();await ctx.resume();
  const tone = ctx.createOscillator();tone.type = 'sawtooth';tone.frequency.value = 150;const gain = ctx.createGain();gain.gain.value = 0.5;tone.connect(gain);tone.start();
  const meshes = [];hero.scene.traverse((o) => { if (o.morphTargetDictionary) meshes.push(o); });
  const mouth = () => Math.max(...['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_SS'].map((n) => Math.max(...meshes.map((m) => m.morphTargetDictionary[n] === undefined ? 0 : m.morphTargetInfluences[m.morphTargetDictionary[n]]))));
  const sync = hero.lipSync(gain);let open = 0;
  for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 50));hero.update(0.05);open = Math.max(open, mouth()); }
  sync.stop();hero.update(0.05);const closed = mouth();tone.stop();
  let error = '';try { hero.locomotion(mixer, { run: 'sprint_fast' }); } catch (e) { error = e.message; }
  hero.dispose();
  return { gaits, walkSpeed: legs.walkSpeed, runSpeed: legs.runSpeed, turn, open, closed, error };
};
window.ready = true;
</script></body></html>`;

// A content pack made from Ara's own wave, served like a host that lets other sites read it.
(globalThis as { self?: unknown }).self ??= globalThis;
TextureLoader.prototype.load = function (_url: string, onLoad?: (t: Texture) => void) { const t = new Texture();onLoad?.(t);return t; } as TextureLoader['load'];
const packLib = await nodeLibrary(), packCharacter = await buildHuman(packLib, { ...DEFAULT_PARAMS, ...PRESETS['The Adventurer'], detail: 'low' });
const packGlb = await runExport(packLib, packCharacter, planExport(packCharacter, { ...DEFAULT_EXPORT, mode: 'animated', format: 'glb', packaging: 'embedded', clips: ['wave'], stageProps: false }));
const PACK = JSON.stringify(await buildPack({ id: 'check-moves', name: 'Check moves', animations: [{ file: 'm.glb', id: 'big_wave', name: 'Big wave', category: 'Emotes' }] }, async () => packGlb.data));

// Only these paths are served.
const MOUNTS: [string, string][] = [['/three/', join(root, 'node_modules/three/')], ['/ara3d/', join(root, 'packages/cli/dist/')], ['/assets/', join(root, 'public/assets/')]];
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.pack': 'application/octet-stream' };
let refusedOnce = false;
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (path === '/' || path === '/index.html') { res.setHeader('Content-Type', 'text/html');res.end(PAGE);return; }
  if (path === '/packs/check-moves.ara-pack.json') { res.setHeader('Content-Type', 'application/json');res.end(PACK);return; }
  // The first request for the catalogue gets a 503, like a busy CDN: the library has to try again.
  if (path === '/assets/catalog.json' && !refusedOnce) { refusedOnce = true;res.statusCode = 503;res.end();return; }
  const mount = MOUNTS.find(([prefix]) => path.startsWith(prefix)), file = mount && resolve(mount[1], path.slice(mount[0].length));
  if (!mount || !file || !file.startsWith(mount[1]) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404;res.end();return; }
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');res.end(readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const port = (server.address() as { port: number }).port, profile = mkdtempSync(join(tmpdir(), 'ara-library-'));

const chrome = spawn(chromePath, ['--headless=new', '--use-angle=metal', '--no-first-run', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--autoplay-policy=no-user-gesture-required', '--window-size=900,700', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
const input = chrome.stdio[3] as Writable, output = chrome.stdio[4] as Readable, pending = new Map<number, (m: any) => void>();
let seq = 0, session = '', buffer = '';
output.on('data', (chunk: Buffer) => {
  buffer += chunk.toString();let n;
  while ((n = buffer.indexOf('\0')) >= 0) { const m = JSON.parse(buffer.slice(0, n));buffer = buffer.slice(n + 1);if (m.id) { pending.get(m.id)?.(m);pending.delete(m.id); } }
});
function send<T = any>(method: string, params: object = {}, attach = true): Promise<T> {
  const id = ++seq;
  return new Promise((ok, fail) => {
    pending.set(id, (m) => (m.error ? fail(Error(m.error.message)) : ok(m.result)));
    input.write(JSON.stringify({ id, method, params, ...(attach && session ? { sessionId: session } : {}) }) + '\0');
  });
}
const evaluate = async <T = any>(expression: string): Promise<T> => {
  const r = await send<any>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const photo = async (name: string) => { const r = await send<{ data: string }>('Page.captureScreenshot', { format: 'png' });writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); };

try {
  const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' }, false);
  session = (await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false)).sessionId;
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 100 && !(await evaluate('!!window.ready').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
  mkdirSync(out, { recursive: true });

  const lists = await evaluate('window.lists');
  assert.deepEqual(lists, { presets: 65, clips: 259, vehicles: 15 });console.log('OK lists', JSON.stringify(lists));
  const cases: [string, unknown, object, object][] = [
    ['soldier-rifle-backpack', 'The Soldier', { animations: ['walk', 'idle'], weapon: 'rifle', carry: 'backpack' }, { play: 'walk', az: 0.6, dist: 4.2 }],
    ['ara-character-file', { preset: 'The Bride', params: { name: 'Ada', ageYears: 30 } }, { animations: ['locomotion'], rootMotion: false }, { play: 'run', az: -0.5, dist: 4.2 }],
    ['motorcycle', 'The Soldier', { animations: ['ride_motorcycle'], vehicle: 'motorcycle', detail: 'low' }, { play: 'ride_motorcycle', az: 1.2, dist: 5.5 }],
  ];
  for (const [name, character, options, view] of cases) {
    const r = await evaluate<any>(`window.run(${JSON.stringify(character)}, ${JSON.stringify(options)}, ${JSON.stringify(view)})`);
    assert.ok(!r.error, `${name}: ${r.error}`);
    assert.ok(r.clipFound, `${name}: clip ${(view as { play: string }).play} missing from ${r.clips}`);
    assert.ok(r.height > 1.4 && r.height < 2.2, `${name}: height ${r.height}`);
    assert.ok(r.steps > 1, `${name}: progress was reported`);
    assert.ok(r.framesWhileBuilding > r.seconds * 10, `${name}: the page kept drawing while the character was built`);
    if (name === 'motorcycle') assert.ok(r.props.some((p: string) => p.includes('motorcycle')), 'motorcycle prop');
    await photo(name);
    console.log(`OK ${name}: ${r.name}, ${r.height.toFixed(2)} m, ${r.clips.length} clips, props ${r.props.join(', ') || 'none'}, ${(r.glb / 1e6).toFixed(1)} MB, ${r.seconds.toFixed(1)} s, ${r.framesWhileBuilding} frames drawn meanwhile`);
  }
  // Colours, and taking away a preset's own bag.
  const recolour: [string, unknown, object, object, (r: any) => void][] = [
    ['executive-recoloured', 'The Female Executive', { colors: { outfit: '#1d2a44', carry: '#8a1c1c', shoes: '#111111' } }, { play: 'idle', az: 0.5, dist: 4.2 },
      (r) => { assert.equal(r.carry, 'handbag');assert.deepEqual({ outfit: r.colors.outfit, carry: r.colors.carry, shoes: r.colors.shoes }, { outfit: '#1d2a44', carry: '#8a1c1c', shoes: '#111111' }); }],
    ['executive-no-bag', 'The Female Executive', { carry: 'none' }, { play: 'idle', az: 0.5, dist: 4.2 }, (r) => { assert.equal(r.carry, 'none');assert.ok(!('carry' in r.colors)); }],
    ['motorcycle-blue', 'The Soldier', { animations: ['ride_motorcycle'], vehicle: 'motorcycle', colors: { vehicle: '#1f6fd1', top: '#2b2b2b' } }, { play: 'ride_motorcycle', az: 1.2, dist: 5.5 },
      (r) => { assert.equal(r.colors.vehicle, '#1f6fd1');assert.equal(r.colors.top, '#2b2b2b'); }],
  ];
  for (const [name, character, options, view, check] of recolour) {
    const r = await evaluate<any>(`window.run(${JSON.stringify(character)}, ${JSON.stringify({ animations: ['idle'], detail: 'low', ...options })}, ${JSON.stringify(view)})`);
    assert.ok(!r.error, `${name}: ${r.error}`);check(r);
    await photo(name);console.log(`OK ${name}:`, JSON.stringify(r.colors));
  }
  const badColour = await evaluate<any>(`window.run('The Soldier', { animations: 'none', detail: 'low', colors: { shirt: '#ffffff' } }, { play: 'idle', az: 0, dist: 4 })`);
  assert.match(badColour.error ?? '', /Unknown colour "shirt"/);console.log('OK unknown colour:', badColour.error);

  // Random characters and share links from the builder.
  const shareCode = encodeCharacter({ ...DEFAULT_PARAMS, ...PRESETS['The Priest'], name: 'Shared priest', hairColor: '#aa3311' });
  for (const [name, character] of [['random', { random: 42 }], ['share-link', `https://ara3dgen.com/app/#c=${shareCode}`]] as const) {
    const r = await evaluate<any>(`window.run(${JSON.stringify(character)}, { animations: ['idle'], detail: 'low' }, { play: 'idle', az: 0.4, dist: 4.2 })`);
    assert.ok(!r.error, `${name}: ${r.error}`);
    assert.equal(r.name, name === 'random' ? 'random_42' : 'Shared priest');
    await photo(name);console.log(`OK ${name}: ${r.name}, ${r.height.toFixed(2)} m`);
  }
  const broken = await evaluate<any>(`window.run('https://ara3dgen.com/app/#c=broken', {}, { play: 'idle', az: 0, dist: 4 })`);
  assert.match(broken.error ?? '', /share link could not be read/);console.log('OK broken share link:', broken.error);
  // Faces: an expression, a mouth shape, blinking, and switching blinking off.
  for (const [expression, mouth] of [['surprised', 'viseme_O'], ['happy', 'viseme_aa'], ['angry', 'viseme_E']] as const) {
    await evaluate(`window.faceTest(${JSON.stringify(expression)}, ${JSON.stringify(mouth)})`);await photo(`face-${expression}-${mouth ?? 'none'}`);
  }
  const face = await evaluate<any>(`window.faceTest('surprised', 'viseme_O')`);
  assert.ok(face.shapes > 0, 'face shapes exported');
  assert.ok(face.expression > 0.3, `surprised widens the eyes (${face.expression})`);
  assert.equal(face.mouth, 1);assert.equal(face.otherMouth, 0);
  assert.ok(face.blinkPeak > 0.9, `blinks (${face.blinkPeak})`);
  assert.ok(face.lidAfterOff < 0.5, `blinking off (${face.lidAfterOff})`);
  assert.equal(face.errors.length, 2);
  await photo('face-surprised-O');console.log(`OK faces: expression ${face.expression.toFixed(2)}, mouth ${face.mouth}, blink peak ${face.blinkPeak.toFixed(2)}, errors: ${face.errors.join(' / ')}`);
  const clipFace = await evaluate<any>(`window.clipFaceTest()`);
  await photo('clip-face-laughing-after-idle');
  assert.ok(clipFace.smileLow > 0.95, `the laughing expression holds through 10 s of idle (${clipFace.smileLow})`);
  assert.ok(clipFace.jawHigh > 0.4, `the laugh clip moves the jaw (${clipFace.jawHigh})`);
  console.log(`OK clip faces: expression held at ${clipFace.smileLow.toFixed(2)}, laugh clip opens the jaw to ${clipFace.jawHigh.toFixed(2)}`);
  const bad = await evaluate<any>(`window.run('Nope', {}, { play: 'walk', az: 0, dist: 4 })`);
  assert.match(bad.error ?? '', /Unknown preset "Nope"/);console.log('OK unknown preset:', bad.error);
  const seq = await evaluate<any>('window.sequenceTest()');
  assert.deepEqual(seq.order, ['walk', 'wave', 'cheer', 'walk'], `sequence order ${seq.order}`);
  assert.equal(seq.errors.length, 3, `sequence errors ${seq.errors}`);
  console.log(`OK sequence: ${seq.order.join(' → ')} (wave ${seq.lengths.wave.toFixed(1)} s, cheer ${seq.lengths.cheer.toFixed(1)} s); errors: ${seq.errors.join(' / ')}`);
  // Texting brings the phone (in place of her handbag), unless a carried item is chosen.
  const texting = await evaluate<any>(`window.run('The Female Executive', { animations: ['texting'], detail: 'low' }, { play: 'texting', az: 0, dist: 4 })`);
  const keepBag = await evaluate<any>(`window.run('The Female Executive', { animations: ['texting'], detail: 'low', carry: 'handbag' }, { play: 'texting', az: 0, dist: 4 })`);
  assert.equal(texting.carry, 'phone');assert.equal(keepBag.carry, 'handbag');
  console.log('OK texting brings the phone, and a chosen carry stays');
  const motion = await evaluate<any>('window.motionTest()');
  assert.deepEqual(motion.gaits, { stand: [1, 0, 0], walk: [0, 1, 0], run: [0, 0, 1] }, JSON.stringify(motion.gaits));
  assert.ok(motion.turn > 25, `the head turned ${motion.turn.toFixed(0)}°`);
  assert.ok(motion.open > 0.3 && motion.closed === 0, `mouth opened ${motion.open} and closed to ${motion.closed}`);
  assert.match(motion.error, /isn't loaded/);
  console.log(`OK movement: idle/walk/run blend by speed (walk ${motion.walkSpeed.toFixed(2)} m/s, run ${motion.runSpeed.toFixed(2)} m/s), the head turned ${motion.turn.toFixed(0)}°, lip-sync opened the mouth to ${motion.open.toFixed(2)} and closed it`);
  const pack = await evaluate<any>(`window.packTest('/packs/check-moves.ara-pack.json')`);
  assert.ok(!pack.error, `pack: ${pack.error}`);
  assert.deepEqual(pack.info.animations.map((a: { id: string }) => a.id), ['check-moves/big_wave']);
  assert.deepEqual(pack.clips, ['Idle', 'Big wave']);
  assert.ok(pack.handY > pack.height * 0.85, `the pack's wave raises the right hand (${pack.handY.toFixed(2)} m of ${pack.height.toFixed(2)} m)`);
  assert.match(pack.missing, /add the pack to the packs option/);
  console.log('OK content pack: readPack lists it, createCharacter bakes its wave in, and a pack clip without the pack is refused');
  const glb = await evaluate<any>('window.glbOnly()');
  assert.equal(glb.magic, 'glTF');console.log(`OK createCharacterGLB: ${(glb.size / 1e6).toFixed(1)} MB GLB`);
  assert.ok(refusedOnce);console.log('OK a busy server (503) was tried again');
  console.log(`Library checks passed. Photos in ${out}`);
} finally {
  // Let Chrome exit before removing its profile, which it writes to until then.
  chrome.kill();server.close();await new Promise((r) => { chrome.once('exit', r);setTimeout(r, 3000); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* A leftover temp folder is harmless. */ }
}
