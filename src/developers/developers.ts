/**
 * The developers page playground: builds characters with the ara3d library itself, shows them in a three.js view and
 * writes the code that makes what you see. Changing the character, props or detail rebuilds it; animations and faces
 * change instantly, because the playground builds a set of popular clips once.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ANIMATIONS, createCharacter, EXPRESSIONS, VEHICLE_CLIPS, MOUTH_SHAPES, PRESET_NAMES, PROPS, type AraCharacter, type CharacterColors, type CharacterOptions } from '../../packages/cli/src/index';
import { encodeCharacter } from '../app/share';

const ASSETS = `${import.meta.env.BASE_URL}assets/`;
/** Clips the playground builds once, so switching between them is instant. */
const PLAY = ['idle', 'walk', 'model_walk', 'run', 'jump', 'wave', 'cheer', 'dance_groove', 'dance_bounce', 'talk_gestures', 'phone_call', 'punch_combo', 'kick_roundhouse', 'rifle_idle', 'rifle_fire_auto', 'pistol_aim'];
/** The riding clip that shows each vehicle in use. */
const RIDE: Readonly<Record<string, string>> = VEHICLE_CLIPS;
const clipName = new Map(ANIMATIONS.map((a) => [a.id, a.name]));
/** The vehicle each riding clip belongs to. */
const RIDER: Record<string, string> = Object.fromEntries(Object.entries(RIDE).map(([v, clip]) => [clip, v]));
/** A clip the visitor picked from the full list; it's built alongside the popular ones. */
let extraClip = '';
const label = (id: string) => id === 'none' ? 'None' : id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const form = $<HTMLFormElement>('#pg-form'), view = $<HTMLDivElement>('#pg-view');
const preset = $<HTMLSelectElement>('#pg-preset'), seed = $<HTMLInputElement>('#pg-seed'), share = $<HTMLInputElement>('#pg-share'), clipSelect = $<HTMLSelectElement>('#pg-clip');
const weapon = $<HTMLSelectElement>('#pg-weapon'), carry = $<HTMLSelectElement>('#pg-carry'), vehicle = $<HTMLSelectElement>('#pg-vehicle'), talk = $<HTMLInputElement>('#pg-talk');
const inPlace = $<HTMLInputElement>('#pg-inplace'), colorList = $<HTMLDivElement>('#pg-colors');
const loading = $<HTMLDivElement>('#pg-loading'), bar = $<HTMLElement>('#pg-bar'), statusText = $<HTMLSpanElement>('#pg-status');

const options = (select: HTMLSelectElement, values: readonly string[], text = label) => { select.replaceChildren(...values.map((v) => new Option(text(v), v))); };
options(preset, PRESET_NAMES, (v) => v);preset.value = 'The Soldier';
options(weapon, ['none', ...PROPS.weapons]);options(carry, ['none', ...PROPS.carried]);
options(vehicle, ['none', ...PROPS.vehicles.filter((v) => v !== 'auto')]);

// --- Install tabs and copy buttons -----------------------------------------------------------------------------
const INSTALL: Record<string, string> = { npm: 'npm install ara3d three', cli: 'npx ara3d export --preset "The Soldier"', mcp: 'claude mcp add ara3d -- npx -y ara3d mcp' };
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-install]')) tab.onclick = () => {
  for (const t of document.querySelectorAll('[data-install]')) t.setAttribute('aria-selected', String(t === tab));
  $('#install-command').textContent = INSTALL[tab.dataset.install!];
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) button.onclick = async () => {
  await navigator.clipboard.writeText($(button.dataset.copy!).textContent ?? '');
  button.dataset.copied = '';button.textContent = 'Copied';
  setTimeout(() => { delete button.dataset.copied;button.textContent = 'Copy'; }, 1500);
};

// --- The 3D view -----------------------------------------------------------------------------------------------
// Transparent, so the view's soft gradient shows behind the character.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));renderer.toneMapping = THREE.ACESFilmicToneMapping;renderer.toneMappingExposure = 1.05;
view.prepend(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.4);key.position.set(2.5, 4, 3);scene.add(key);
const rim = new THREE.DirectionalLight(0x9db9ff, 1.4);rim.position.set(-3, 2.5, -3);scene.add(rim);
/** A soft pool of shade under the character, fading to nothing at its edge. */
function shadeTexture() {
  const c = document.createElement('canvas');c.width = c.height = 256;
  const g = c.getContext('2d')!, fill = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  fill.addColorStop(0, 'rgba(5,7,12,0.75)');fill.addColorStop(0.5, 'rgba(5,7,12,0.35)');fill.addColorStop(1, 'rgba(5,7,12,0)');
  g.fillStyle = fill;g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(c);texture.colorSpace = THREE.SRGBColorSpace;return texture;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false }));
floor.rotation.x = -Math.PI / 2;scene.add(floor);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;controls.minDistance = 1;controls.maxDistance = 14;controls.maxPolarAngle = Math.PI * 0.55;
camera.position.set(2.6, 1.6, 4.2);controls.target.set(0, 0.95, 0);

function resize() {
  const { width, height } = view.getBoundingClientRect();
  renderer.setSize(width, height, false);camera.aspect = width / Math.max(1, height);camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);resize();

/** Frames the character (and any vehicle) from the front-right. */
function frame(objects: THREE.Object3D[]) {
  const box = new THREE.Box3();for (const o of objects) box.expandByObject(o);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  // Fit the taller of the height and the width (as the view is wider than tall), with room to spare.
  const fit = Math.max(size.y, Math.max(size.x, size.z) / Math.max(1, camera.aspect));
  const distance = fit / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 1.45;
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0.45, 0.12, 1).normalize().multiplyScalar(distance));
  floor.scale.setScalar(Math.max(0.7, Math.max(size.x, size.z) / 1.6));
}

// --- Building ----------------------------------------------------------------------------------------------------
// `picked` is an expression the visitor chose: it stays across rebuilds; otherwise each character shows its own.
let hero: AraCharacter | undefined, mixers: THREE.AnimationMixer[] = [], expression = '', picked = '', building = 0;
type PropSlot = 'weapon' | 'carry' | 'vehicle';
const propSelects: Record<PropSlot, HTMLSelectElement> = { weapon, carry, vehicle };
/** The character's own props (The Female Executive's handbag): the selects start on them and the code lists changes. */
let own: Record<PropSlot, string> = { weapon: 'none', carry: 'none', vehicle: 'none' };
/** Set once the visitor changes a prop; builds then pass all three, so "none" takes a prop away. */
let propsChosen = false;
/** Colours the visitor picked, by part. A new character starts from its own colours. */
let colorChoices: CharacterColors = {};
const source = () => (form.elements.namedItem('source') as RadioNodeList).value as 'preset' | 'random' | 'share';
const detail = () => (form.elements.namedItem('detail') as RadioNodeList).value as 'low' | 'medium' | 'high';
const input = (): string | { random: number } => source() === 'random' ? { random: Math.max(0, Math.round(Number(seed.value) || 0)) } : source() === 'share' ? share.value.trim() : preset.value;
// The selects only offer the library's own PROPS, so their values are valid choices.
const props = (): Pick<CharacterOptions, PropSlot> => propsChosen
  ? { weapon: weapon.value as CharacterOptions['weapon'], carry: carry.value as CharacterOptions['carry'], vehicle: vehicle.value as CharacterOptions['vehicle'] }
  : {};
/** The props that differ from the character's own, as the code passes them. */
const propChanges = () => (Object.keys(propSelects) as PropSlot[]).filter((k) => propSelects[k].value !== own[k]).map((k) => [k, propSelects[k].value] as const);

/** A different character: it starts with its own props and colours. */
function newCharacter() {
  propsChosen = false;colorChoices = {};
  for (const select of Object.values(propSelects)) select.value = 'none';
  if (Object.values(RIDE).includes(clipSelect.dataset.want ?? '')) clipSelect.dataset.want = 'idle';
  rebuild();
}

function showStatus(text: string, fraction?: number, error = false) {
  loading.hidden = false;loading.classList.toggle('error', error);statusText.textContent = text;
  if (fraction !== undefined) bar.style.width = `${Math.round(fraction * 100)}%`;
}

async function build() {
  const id = ++building, chosen = input();
  if (source() === 'share' && !String(chosen).includes('c=')) { showStatus('Paste a link from the builder: open it, choose Share, then Copy link.', 0, true);return; }
  const ride = RIDE[vehicle.value], clips = [...new Set([...PLAY, ...(ride ? [ride] : []), ...(extraClip ? [extraClip] : [])])];
  showStatus(hero ? 'Rebuilding…' : 'Loading the character data…', 0.02);
  const started = performance.now();
  try {
    const next = await createCharacter(chosen, {
      assetsUrl: ASSETS, animations: clips, detail: detail(), rootMotion: !inPlace.checked, ...props(),
      ...(Object.keys(colorChoices).length ? { colors: colorChoices } : {}),
      onProgress: (text, fraction) => { if (id === building) showStatus(text, 0.05 + fraction * 0.9); },
    });
    if (id !== building) { next.dispose();return; } // A newer build replaced this one.
    if (hero) { scene.remove(hero.scene);for (const p of hero.props) scene.remove(p.scene);hero.dispose(); }
    hero = next;scene.add(hero.scene);for (const p of hero.props) scene.add(p.scene);
    if (!propsChosen) {
      own = { weapon: hero.params.weapon, carry: hero.params.carry, vehicle: hero.params.vehicle === 'auto' ? 'none' : hero.params.vehicle };
      for (const k of Object.keys(propSelects) as PropSlot[]) propSelects[k].value = own[k];
    }
    renderColors();
    expression = picked || hero.params.expression;if (picked) hero.setExpression(picked);renderExpressions();
    options(clipSelect, clips, (c) => clipName.get(c) ?? c);
    const want = clipSelect.dataset.want ?? 'idle';
    clipSelect.value = clips.includes(want) ? want : ride ?? 'idle';
    play();frame([hero.scene, ...hero.props.map((p) => p.scene)]);
    hips = hero.scene.getObjectByName('Hips') ?? hero.scene;hips.getWorldPosition(lastHips);floor.position.set(0, 0, 0);
    loading.hidden = true;
    const triangles = countTriangles(hero.scene);
    $('#pg-stats').textContent = `${hero.params.name} · built in ${((performance.now() - started) / 1000).toFixed(1)} s · ${triangles.toLocaleString('en')} triangles · ${hero.height.toFixed(2)} m`;
    $<HTMLAnchorElement>('#pg-builder').href = `${import.meta.env.BASE_URL}app/#c=${encodeCharacter(hero.params)}`;
    $<HTMLButtonElement>('#pg-download').disabled = false;
    writeCode();
  } catch (error) {
    if (id === building) showStatus((error as Error).message, 0, true);
  }
}

function countTriangles(root: THREE.Object3D) {
  let n = 0;root.traverse((o) => { const g = (o as THREE.Mesh).geometry;if (g) n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; });
  return Math.round(n);
}

function play() {
  if (!hero) return;
  for (const m of mixers) m.stopAllAction();
  const clip = hero.clip(clipSelect.value);
  mixers = [hero.scene, ...hero.props.map((p) => p.scene)].map((root) => new THREE.AnimationMixer(root));
  if (clip) mixers.forEach((m, i) => { const c = i === 0 ? clip : hero!.props[i - 1].animations.find((a) => a.name === clip.name);if (c) m.clipAction(c).play(); });
  writeCode();
}

// With "In place" off, walks and runs travel: the camera and the shade under the character follow its hips.
let hips: THREE.Object3D | undefined;
const lastHips = new THREE.Vector3(), nowHips = new THREE.Vector3();
function follow() {
  if (!hips || inPlace.checked) return;
  hips.getWorldPosition(nowHips);
  const step = new THREE.Vector3(nowHips.x - lastHips.x, 0, nowHips.z - lastHips.z);
  controls.target.add(step);camera.position.add(step);floor.position.set(nowHips.x, 0, nowHips.z);lastHips.copy(nowHips);
}

let rebuildTimer = 0;
const rebuild = () => { clearTimeout(rebuildTimer);rebuildTimer = window.setTimeout(build, 250); };

// --- Colours -------------------------------------------------------------------------------------------------------
const PART_NAMES: Record<string, string> = { outfit: 'Outfit', top: 'Top', jacket: 'Jacket', bottom: 'Bottom', shoes: 'Shoes' };
const partName = (part: string) => part === 'carry' ? label(carry.value) : part === 'vehicle' ? label(vehicle.value) : PART_NAMES[part] ?? part;
/** A colour picker for each part this character lets you recolour, starting on its current colour. */
function renderColors() {
  if (!hero) return;
  colorList.replaceChildren(...Object.entries(hero.colors).map(([part, color]) => {
    const item = document.createElement('label'), picker = document.createElement('input'), name = document.createElement('span');
    picker.type = 'color';picker.value = color!;picker.dataset.part = part;name.textContent = partName(part);
    item.append(picker, name);return item;
  }));
}

// --- Every animation ------------------------------------------------------------------------------------------------
const clipDialog = $<HTMLDialogElement>('#pg-clips'), clipSearch = $<HTMLInputElement>('#pg-clip-search'), clipList = $<HTMLDivElement>('#pg-clip-list');
/** Lists every animation by category, filtered by the search; the one playing is marked. */
function renderClipList() {
  const words = clipSearch.value.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, typeof ANIMATIONS[number][]>();
  for (const a of ANIMATIONS) {
    const text = `${a.name} ${a.id} ${a.category}`.toLowerCase();
    if (words.every((w) => text.includes(w))) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  }
  clipList.replaceChildren(...[...groups].map(([category, clips]) => {
    const section = document.createElement('section'), title = document.createElement('h4'), grid = document.createElement('div');
    title.innerHTML = `${category} <small>${clips.length}</small>`;grid.className = 'pg-clip-grid';
    grid.append(...clips.map((a) => {
      const b = document.createElement('button'), id = document.createElement('code');
      b.type = 'button';b.textContent = a.name;id.textContent = a.id;b.append(id);b.setAttribute('aria-current', String(a.id === clipSelect.value));
      b.onclick = () => pickClip(a.id);
      return b;
    }));
    section.append(title, grid);return section;
  }));
  if (!groups.size) { const p = document.createElement('p');p.className = 'pg-clip-empty';p.textContent = 'No animation matches that search.';clipList.append(p); }
}
/** Plays a clip from the full list: at once if it's already built, otherwise after a rebuild that includes it. */
function pickClip(id: string) {
  clipDialog.close();clipSelect.dataset.want = id;
  // A riding clip brings its vehicle.
  const newVehicle = !!RIDER[id] && vehicle.value !== RIDER[id];
  if (newVehicle) { vehicle.value = RIDER[id];propsChosen = true;delete colorChoices.vehicle; }
  if (!newVehicle && hero?.clip(id) && [...clipSelect.options].some((o) => o.value === id)) { clipSelect.value = id;play();return; }
  extraClip = id;rebuild();
}
$<HTMLButtonElement>('#pg-all-clips').onclick = () => { clipSearch.value = '';renderClipList();clipDialog.showModal();clipSearch.focus(); };
$<HTMLButtonElement>('#pg-clips-close').onclick = () => clipDialog.close();
clipDialog.addEventListener('click', (event) => { if (event.target === clipDialog) clipDialog.close(); });
clipSearch.addEventListener('input', renderClipList);

// --- Faces ---------------------------------------------------------------------------------------------------------
const chips = $<HTMLDivElement>('#pg-expressions');
function renderExpressions() {
  chips.replaceChildren(...EXPRESSIONS.map((e) => {
    const b = document.createElement('button');b.type = 'button';b.textContent = e;b.setAttribute('role', 'radio');b.setAttribute('aria-checked', String(e === expression));
    b.onclick = () => { expression = picked = e;hero?.setExpression(e);renderExpressions();writeCode(); };
    return b;
  }));
}
renderExpressions();
let mouthTime = 0;
function talkStep(delta: number) {
  if (!hero) return;
  if (!talk.checked) { if (mouthTime) { hero.setMouth(null);mouthTime = 0; } return; }
  // A new mouth shape every 90 ms, with short closed pauses, as a lip-sync tool would send them.
  mouthTime -= delta;
  if (mouthTime <= 0) { mouthTime = 0.09;hero.setMouth(Math.random() < 0.18 ? null : MOUTH_SHAPES[Math.floor(Math.random() * MOUTH_SHAPES.length)], 0.6 + Math.random() * 0.4); }
}

// --- The code that makes what you see --------------------------------------------------------------------------------
/** A line of code with a comment after it, the comments lined up in a column. */
const note = (code: string, comment: string, column = 34) => `${code.padEnd(column)}// ${comment}`;

/** The language the code is shown in; TypeScript adds the type and the ! where a lookup could come back empty. */
let lang: 'js' | 'ts' = 'js';
try { if (localStorage.getItem('ara-dev-lang') === 'ts') lang = 'ts'; } catch { /* Storage can be blocked; JavaScript it is. */ }
function showLang() { for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) tab.setAttribute('aria-selected', String(tab.dataset.lang === lang)); }
for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) tab.onclick = () => {
  lang = tab.dataset.lang as 'js' | 'ts';showLang();writeCode();
  try { localStorage.setItem('ara-dev-lang', lang); } catch { /* Not remembered; that's fine. */ }
};
showLang();

function writeCode() {
  const ts = lang === 'ts', sure = ts ? '!' : '';
  const chosen = input(), clip = clipSelect.value || 'idle';
  const literal = typeof chosen === 'string' ? `'${chosen}'` : `{ random: ${chosen.random} }`;
  const colors = hero ? Object.entries(colorChoices).filter(([part]) => part in hero!.colors) : [];
  const opts = [
    `animations: ['${clip}'],`,
    ...(detail() !== 'medium' ? [`detail: '${detail()}',`] : []),
    ...(!inPlace.checked ? [note(`rootMotion: true,`, 'walks and runs move forward', 32)] : []),
    ...propChanges().map(([k, v]) => v === 'none' ? note(`${k}: 'none',`, `without the ${label(own[k]).toLowerCase()}`, 32) : `${k}: '${v}',`),
    ...(colors.length === 1 ? [`colors: { ${colors[0][0]}: '${colors[0][1]}' },`] : []),
    ...(colors.length > 1 ? [`colors: {`, ...colors.map(([part, color]) => `  ${part}: '${color}',`), `},`] : []),
  ];
  const ride = hero?.props[0], rideClip = ride && hero!.clip(clip), rideMoves = !!rideClip && ride!.animations.some((a) => a.name === rideClip.name);
  const lines = [
    `import * as THREE from 'three';`,
    ts ? `import { createCharacter, type AraCharacter } from 'ara3d';` : `import { createCharacter } from 'ara3d';`,
    ``,
    `const hero${ts ? ': AraCharacter' : ''} = await createCharacter(${literal}, {`,
    ...opts.map((o) => `  ${o}`),
    `});`,
    `scene.add(hero.scene);`,
    ...(ride ? [note(`const [vehicle] = hero.props;`, `the ${label(vehicle.value).toLowerCase()}`), `scene.add(vehicle.scene);`] : []),
    ...(hero && expression !== hero.params.expression ? [`hero.setExpression('${expression}');`] : []),
    ...(talk.checked ? [`// Show each mouth shape your lip-sync tool reports:`, `hero.setMouth('viseme_aa');`] : []),
    ``,
    `// Play a clip: the mixer moves the character's bones.`,
    `const mixer = new THREE.AnimationMixer(hero.scene);`,
    `const clip = hero.clip('${clip}')${sure};`,
    `mixer.clipAction(clip).play();`,
    ...(rideMoves ? [
      `// The vehicle's own clip turns its wheels, pedals or rotors.`,
      `const ride = vehicle.animations.find((a) => a.name === clip.name)${sure};`,
      `const vehicleMixer = new THREE.AnimationMixer(vehicle.scene);`,
      `vehicleMixer.clipAction(ride).play();`,
    ] : []),
    ``,
    `// Every frame, move the animation and the face on.`,
    `let last = performance.now();`,
    `renderer.setAnimationLoop((time) => {`,
    `  // Seconds since the last frame.`,
    `  const delta = (time - last) / 1000;`,
    `  last = time;`,
    `  // Pose the body for this moment of the clip.`,
    `  mixer.update(delta);`,
    ...(rideMoves ? [`  vehicleMixer.update(delta);`] : []),
    `  // Blink the eyes every few seconds.`,
    `  hero.update(delta);`,
    `  renderer.render(scene, camera);`,
    `});`,
  ];
  $('#pg-code').innerHTML = highlight(lines.join('\n'));
}

/** Just enough JavaScript highlighting for the snippet: comments, strings, keywords, numbers and calls. */
function highlight(code: string) {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return code.replace(/(\/\/[^\n]*)|('(?:[^'\\]|\\.)*')|\b(import|from|const|await|new|for|of|type)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)(?=\()|([^'/\w]+|\w+|.)/g,
    (m, comment, string, keyword, number, call) => comment ? `<span class="tok-c">${escape(comment)}</span>` : string ? `<span class="tok-s">${escape(string)}</span>`
      : keyword ? `<span class="tok-k">${keyword}</span>` : number ? `<span class="tok-n">${number}</span>` : call ? `<span class="tok-f">${call}</span>` : escape(m));
}

// --- Wiring ----------------------------------------------------------------------------------------------------------
function showSource() { for (const f of form.querySelectorAll<HTMLElement>('[data-for]')) f.hidden = f.dataset.for !== source(); }
form.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target === clipSelect) { clipSelect.dataset.want = clipSelect.value;play();return; }
  if (target === talk) { writeCode();return; }
  if (target.dataset.part) { colorChoices[target.dataset.part as keyof CharacterColors] = target.value;rebuild();return; }
  if (target === preset || target === seed || target === share || target.name === 'source') { showSource();newCharacter();return; }
  if (target === weapon || target === carry || target === vehicle) {
    propsChosen = true;
    // A new bag or vehicle starts in its own colour.
    if (target === carry) delete colorChoices.carry;
    if (target === vehicle) { delete colorChoices.vehicle;clipSelect.dataset.want = RIDE[vehicle.value] ?? 'idle'; }
  }
  rebuild();
});
seed.addEventListener('input', newCharacter);
share.addEventListener('input', newCharacter);
$<HTMLButtonElement>('#pg-dice').onclick = () => { seed.value = String(Math.floor(Math.random() * 100000));newCharacter(); };
$<HTMLButtonElement>('#pg-download').onclick = () => {
  if (!hero) return;
  const link = document.createElement('a');link.href = URL.createObjectURL(new Blob([hero.glb as BlobPart], { type: 'model/gltf-binary' }));
  link.download = `${hero.params.name.replace(/[^\w-]+/g, '_') || 'character'}.glb`;link.click();setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

// The embed demos load when they come into view, after the playground's first character.
const demo = $<HTMLDivElement>('#embed-demo');
for (const el of demo.querySelectorAll('ara-character')) el.setAttribute('assets-url', ASSETS);
new IntersectionObserver((entries, observer) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  observer.disconnect();void import('../../packages/cli/src/embed');
}, { rootMargin: '200px' }).observe(demo);

let last = 0;
renderer.setAnimationLoop((time) => {
  const delta = last ? Math.min((time - last) / 1000, 0.1) : 0;last = time;
  for (const m of mixers) m.update(delta);
  talkStep(delta);hero?.update(delta);follow();
  controls.update();renderer.render(scene, camera);
});
clipSelect.dataset.want = 'walk';showSource();writeCode();build();
