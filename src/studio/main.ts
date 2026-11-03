import { AssetLibrary, fetchSource } from '../core/assets';
import { DEFAULT_PARAMS, PRESETS } from '../core/params';
import { clipById } from '../core/anim/clips';
import { Engine } from '../app/engine';
import { decodeCharacter } from '../app/share';
import { StudioActor } from './actor';
import { StudioScene } from './scene';
import { exportMovie, supportsMp4 } from './export';
import { ACTIONS, CAST, SETS, beatId, durationOf, newProject, parseProject, presetCode, timelineAt, type StudioProject } from './project';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id), select = (id: string) => $<HTMLSelectElement>(id);
const button = (id: string) => $<HTMLButtonElement>(id);
const BASE = import.meta.env.BASE_URL;
const STORAGE = 'ara.studio.project.v1';
if (import.meta.env.DEV) $<HTMLAnchorElement>('video-licence').href = 'https://github.com/Vanilagy/mediabunny/blob/main/LICENSE';
const THUMBS: Record<string, string> = {
  'The Female Executive': new URL('../../docs/media/presets/female-executive.jpg', import.meta.url).href,
  'The Adventurer': new URL('../../docs/media/presets/adventurer.jpg', import.meta.url).href,
  'The Priest': new URL('../../docs/media/presets/priest.jpg', import.meta.url).href,
  'The Miami Dealer': new URL('../../docs/media/presets/miami-dealer.jpg', import.meta.url).href,
  'The Corporate High-Flier': new URL('../../docs/media/presets/corporate-high-flier.jpg', import.meta.url).href,
  'The Gangster': new URL('../../docs/media/presets/gangster.jpg', import.meta.url).href,
};
const scene = new StudioScene($<HTMLCanvasElement>('film'));
let project = newProject(), time = 0, selected = 0, playing = false, repeat = true, loading = true, exporting = false;
let engine: Engine, lib: AssetLibrary, customCode: string | undefined;
let movieUrl = '', renderedRecipe = '', movieInfo = '', noticeTimer = 0, dirty = true, loadToken = 0, capabilityToken = 0;
let controller: AbortController | undefined;
let titleEditing = false;
const history: string[] = [];
const filename = () => (project.title || 'ara-film').normalize('NFKD').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'ara-film';
function notify(text: string) { $('notice').textContent = text; $('notice').classList.add('show'); clearTimeout(noticeTimer); noticeTimer = window.setTimeout(() => $('notice').classList.remove('show'), 6000); }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
const codeTime = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}:${Math.min(29, Math.floor((t % 1) * 30 + 0.001)).toString().padStart(2, '0')}`;
function save() { try { localStorage.setItem(STORAGE, JSON.stringify(project)); $('save-status').textContent = 'Saved on this device'; } catch { $('save-status').textContent = 'Use Save project to keep a copy'; } }
function setPlaying(on: boolean) { playing = on && !loading && !exporting; if (playing && time >= durationOf(project) - 0.001) time = 0;
  button('play').textContent = playing ? 'Ⅱ' : '▶'; button('play').setAttribute('aria-label', playing ? 'Pause film' : 'Play film'); dirty = true; }
function lock() {
  for (const e of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('.workspace button,.workspace input,.workspace select,.file-tools button')) e.disabled = loading || exporting;
  if (!loading && !exporting) {
    button('undo').disabled = !history.length; button('remove-beat').disabled = project.beats.length === 1;
    button('earlier').disabled = selected === 0; button('later').disabled = selected === project.beats.length - 1;
    button('add-beat').disabled = project.beats.length >= 6 || durationOf(project) > 19;
    input('movement').disabled = !['walk', 'model_walk'].includes(project.beats[selected].clip);
  }
  $('loading').hidden = !loading;
}
function dimensions(size = 720) { return project.aspect === 'landscape' ? { width: Math.round(size * 16 / 9), height: size } : { width: size, height: Math.round(size * 16 / 9) }; }
function renderPosition() {
  const total = durationOf(project), at = timelineAt(project, time);
  $('timecode').replaceChildren(document.createTextNode(codeTime(time) + ' '));
  const rest = document.createElement('span'); rest.textContent = `/ ${codeTime(total)}`; $('timecode').append(rest);
  input('scrub').value = String(time); $('playhead').style.left = `${time / total * 100}%`;
  document.querySelectorAll('.beat').forEach((b, i) => b.classList.toggle('active', i === at.index));
}
function renderUI() {
  selected = Math.min(selected, project.beats.length - 1);
  $('project-name').textContent = project.title || 'Untitled film'; $('scene-name').textContent = SETS.find((s) => s.id === project.template)!.name;
  document.querySelectorAll<HTMLButtonElement>('.set-card').forEach((b) => { const active = b.dataset.set === project.template; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  const params = decodeCharacter(project.character, project.detail) ?? DEFAULT_PARAMS;
  $<HTMLAnchorElement>('edit-character').href = `${BASE}app/#${new URLSearchParams({ c: project.character, detail: project.detail })}`;
  const picker = select('character'); picker.replaceChildren();
  if (customCode) picker.append(new Option(`${params.name || 'Your character'} · your character`, '__custom'));
  for (const name of [...CAST, ...Object.keys(PRESETS).filter((n) => !CAST.includes(n))]) picker.append(new Option(name.replace(/^The /, ''), name));
  picker.value = customCode === project.character ? '__custom' : params.name in PRESETS ? params.name : picker.options[0].value;
  $('cast-card').replaceChildren();
  if (THUMBS[params.name] && customCode !== project.character) { const img = new Image(); img.src = THUMBS[params.name]; img.alt = params.name; $('cast-card').append(img); }
  else { const initial = document.createElement('div'); initial.className = 'cast-initial'; initial.textContent = (params.name || 'A')[0].toUpperCase(); $('cast-card').append(initial); }
  const castInfo = document.createElement('div'), castName = document.createElement('strong'), castNote = document.createElement('span');
  castName.textContent = params.name || 'Your character'; castNote.textContent = 'One character. Endless possibilities.'; castInfo.append(castName, castNote); $('cast-card').append(castInfo);
  const total = durationOf(project); input('scrub').max = String(total); $('duration-label').textContent = `${Number(total.toFixed(1))} seconds`;
  $('ruler').replaceChildren(); for (let i = 0; i <= 4; i++) { const tick = document.createElement('span'); tick.textContent = `${Number((total * i / 4).toFixed(1))}s`; $('ruler').append(tick); }
  $('beats').replaceChildren(); project.beats.forEach((b, i) => {
    const el = document.createElement('button'); el.className = `beat${i === selected ? ' selected' : ''}`; el.style.flex = String(b.duration);
    el.setAttribute('aria-label', `Shot ${i + 1}: ${clipById.get(b.clip)!.name}, ${b.duration} seconds`); el.setAttribute('aria-pressed', String(i === selected));
    const name = document.createElement('strong'), description = document.createElement('small'), number = document.createElement('span'); number.className = 'beat-number';
    name.textContent = clipById.get(b.clip)!.name.replace(' (catwalk)', ''); description.textContent = `${b.duration}s · ${b.shot === 'wide' ? 'Full body' : b.shot === 'close' ? 'Close-up' : 'Medium'}`; number.textContent = String(i + 1).padStart(2, '0');
    el.append(name, description, number); el.addEventListener('click', () => { selected = i; setPlaying(false); time = project.beats.slice(0, i).reduce((sum, q) => sum + q.duration, 0); renderUI(); dirty = true; }); $('beats').append(el);
  });
  const b = project.beats[selected]; $('beat-title').textContent = `Shot ${String(selected + 1).padStart(2, '0')}`; $('shot-count').textContent = `${selected + 1} of ${project.beats.length}`;
  select('action').value = b.clip; select('shot').value = b.shot; input('movement').checked = b.move;
  select('beat-duration').replaceChildren(); for (const duration of [...new Set([1, 1.5, 2, 2.4, 2.5, 3, 3.2, 4, 4.8, 5, 6, b.duration])].sort((a, c) => a - c)) select('beat-duration').append(new Option(`${duration} sec`, String(duration)));
  select('beat-duration').value = String(b.duration); select('camera').value = project.camera; input('title').value = project.title; input('caption').checked = project.caption;
  $('stage').dataset.aspect = project.aspect;
  for (const aspect of ['landscape', 'portrait']) button(aspect).setAttribute('aria-pressed', String(project.aspect === aspect));
  lock(); renderPosition(); dirty = true;
}
async function buildCharacter() {
  const token = ++loadToken; loading = true; setPlaying(false); lock();
  try {
    const params = decodeCharacter(project.character, project.detail);
    if (!params) throw new Error('The character recipe could not be opened.');
    const ch = await engine.build({ ...params, rig: params.rig === 'none' ? 'game' : params.rig, animations: true }, (label) => $('loading-label').textContent = label);
    const actor = new StudioActor(ch, (file) => lib.textureUrl(file));
    try { await actor.ready(); } catch (e) { actor.dispose(); throw e; }
    if (token !== loadToken) { actor.dispose(); return; }
    scene.setActor(actor); await scene.warmup(project); loading = false; renderUI();
    $('save-status').textContent = 'Saved on this device'; save();
  } catch (error) {
    if (token !== loadToken) return;
    loading = false; $('loading').hidden = false; $('loading-label').textContent = 'We couldn’t load this character.';
    const hint = $('loading').querySelector('span:last-child')!; hint.textContent = 'Choose another character, or reload to try again.';
    notify((error as Error).message); lock(); if (!scene.actor) { $('loading').hidden = false; }
  }
}
function apply(next: StudioProject, remember = true) {
  if (loading || exporting) return;
  const old = project;
  try { project = parseProject(JSON.stringify(next)); } catch (e) { notify((e as Error).message); renderUI(); return; }
  if (remember) { history.push(JSON.stringify(old)); if (history.length > 30) history.shift(); }
  time = Math.min(time, durationOf(project)); setPlaying(false);
  const { width, height } = dimensions(); scene.resize(width, height);
  if (old.character !== project.character || old.detail !== project.detail) {
    const p = decodeCharacter(project.character, project.detail);
    if (customCode !== project.character) customCode = p && PRESETS[p.name] && presetCode(p.name) === project.character ? undefined : project.character;
    void buildCharacter();
  }
  renderUI(); save();
}
function edit(fn: (p: StudioProject) => void) { const next = structuredClone(project); fn(next); apply(next); }
function undo() { if (loading || exporting || !history.length) return; const previous = history.pop()!; apply(parseProject(previous), false); notify('Last edit undone.'); }
for (const set of SETS) {
  const card = document.createElement('button'); card.className = `set-card ${set.id}`; card.dataset.set = set.id;
  const tag = document.createElement('small'), name = document.createElement('strong'), subtitle = document.createElement('span'); tag.textContent = set.tag; name.textContent = set.name; subtitle.textContent = set.subtitle; card.append(tag, name, subtitle);
  card.addEventListener('click', () => { if (set.id === project.template) return; const next = newProject(set.id, project.character, project.detail); next.aspect = project.aspect; apply(next); selected = 0; time = 0; renderUI(); notify(`${set.name} scene applied. Undo is available in the top bar.`); }); $('set-list').append(card);
}
for (const id of ACTIONS) select('action').append(new Option(clipById.get(id)!.name, id));
select('character').addEventListener('change', () => { const value = select('character').value; const next = structuredClone(project); next.character = value === '__custom' ? customCode! : presetCode(value);
  if (value !== '__custom') customCode = undefined; apply(next); });
button('undo').addEventListener('click', undo);
button('play').addEventListener('click', () => setPlaying(!playing)); button('restart').addEventListener('click', () => { time = 0; dirty = true; renderPosition(); });
button('repeat').addEventListener('click', () => { repeat = !repeat; button('repeat').classList.toggle('on', repeat); button('repeat').setAttribute('aria-pressed', String(repeat)); });
input('scrub').addEventListener('input', () => { setPlaying(false); time = Number(input('scrub').value); dirty = true; renderPosition(); });
select('action').addEventListener('change', () => edit((p) => { const b = p.beats[selected]; b.clip = select('action').value as typeof b.clip; b.move = false; }));
select('shot').addEventListener('change', () => edit((p) => p.beats[selected].shot = select('shot').value as typeof p.beats[number]['shot']));
select('beat-duration').addEventListener('change', () => edit((p) => p.beats[selected].duration = Number(select('beat-duration').value)));
input('movement').addEventListener('change', () => edit((p) => p.beats[selected].move = input('movement').checked));
select('camera').addEventListener('change', () => edit((p) => p.camera = select('camera').value as typeof p.camera));
for (const aspect of ['landscape', 'portrait'] as const) button(aspect).addEventListener('click', () => edit((p) => p.aspect = aspect));
input('title').addEventListener('blur', () => { titleEditing = false; });
input('title').addEventListener('input', () => {
  if (exporting || loading) return;
  if (!titleEditing) { history.push(JSON.stringify(project)); if (history.length > 30) history.shift(); titleEditing = true; }
  project.title = input('title').value.slice(0, 60); $('project-name').textContent = project.title || 'Untitled film'; save(); lock(); dirty = true;
});
input('caption').addEventListener('change', () => edit((p) => p.caption = input('caption').checked));
button('add-beat').addEventListener('click', () => { const next = structuredClone(project), duration = Math.min(3, 20 - durationOf(next));
  if (duration < 1) return notify('Keep your film under 20 seconds.'); next.beats.push({ id: beatId(), clip: 'idle', duration, shot: 'medium', move: false }); selected = next.beats.length - 1; apply(next); });
button('remove-beat').addEventListener('click', () => edit((p) => { p.beats.splice(selected, 1); selected = Math.max(0, selected - 1); }));
for (const [id, offset] of [['earlier', -1], ['later', 1]] as const) button(id).addEventListener('click', () => edit((p) => { const to = selected + offset; [p.beats[selected], p.beats[to]] = [p.beats[to], p.beats[selected]]; selected = to; }));
button('save-project').addEventListener('click', () => { save(); download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${filename()}.ara-studio.json`); notify('Editable project saved.'); });
button('load-project').addEventListener('click', () => input('project-file').click());
input('project-file').addEventListener('change', async () => {
  const file = input('project-file').files?.[0]; if (!file) return;
  try { if (file.size > 100_000) throw new Error('Choose a project file smaller than 100 KB.'); const next = parseProject(await file.text()); customCode = next.character; apply(next); selected = 0; time = 0; renderUI(); notify('Project opened.'); }
  catch (e) { notify((e as Error).message); } finally { input('project-file').value = ''; }
});
button('snapshot').addEventListener('click', () => { scene.render(project, time); scene.output.toBlob((blob) => { if (blob) download(blob, `${filename()}-frame.png`); }, 'image/png'); });
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input,select,textarea,button') || $<HTMLDialogElement>('export-dialog').open) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});
// A frame queue has a single owner. While exporting, requestAnimationFrame never touches the scene.
let lastTime = performance.now();
function tick(now: number) {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (!exporting && !loading && scene.actor) {
    if (playing) { time += elapsed; const total = durationOf(project); if (time >= total) { if (repeat) time %= total; else { time = total; setPlaying(false); } } dirty = true; }
    if (dirty) { scene.render(project, time); renderPosition(); dirty = false; }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

const dialog = $<HTMLDialogElement>('export-dialog');
async function updateCapability() {
  const token = ++capabilityToken, size = Number(select('resolution').value), { width, height } = dimensions(size);
  button('start-export').disabled = true; $('export-message').textContent = 'Checking video export on this browser…';
  const supported = await supportsMp4(width, height);
  if (token !== capabilityToken || !dialog.open) return;
  button('start-export').disabled = !supported;
  $('export-message').textContent = supported ? '' : 'This browser cannot encode this MP4 size. Try 720p, or use a current Chrome, Edge or Safari browser. You can still save a frame or project.';
}
button('open-export').addEventListener('click', () => {
  setPlaying(false); $('export-length').textContent = `${Number(durationOf(project).toFixed(1))} seconds`;
  $('export-options').hidden = false; $('export-progress').hidden = true; $('cancel-export').hidden = true;
  const hasFilm = !!movieUrl && renderedRecipe === JSON.stringify(project);
  $('download-film').hidden = !hasFilm; $('export-preview').hidden = !hasFilm; $('render-again').hidden = !hasFilm; $('start-export').hidden = hasFilm;
  $('export-options').hidden = hasFilm; $('export-message').textContent = hasFilm ? movieInfo : '';
  dialog.showModal(); if (!hasFilm) void updateCapability();
});
button('render-again').addEventListener('click', () => { $('render-again').hidden = true; $('export-options').hidden = false; $('start-export').hidden = false; $('download-film').hidden = true; $('export-preview').hidden = true; void updateCapability(); });
select('resolution').addEventListener('change', () => void updateCapability());
button('close-export').addEventListener('click', () => { if (exporting) controller?.abort(); else dialog.close(); });
button('cancel-export').addEventListener('click', () => controller?.abort());
dialog.addEventListener('cancel', (e) => { if (exporting) { e.preventDefault(); controller?.abort(); } });
button('start-export').addEventListener('click', async () => {
  if (exporting || loading) return;
  const recipe = JSON.stringify(project), snapshot = parseProject(recipe), before = time, size = Number(select('resolution').value), { width, height } = dimensions(size);
  controller = new AbortController(); exporting = true; lock(); $('export-options').hidden = true; $('export-progress').hidden = false;
  $('start-export').hidden = true; $('render-again').hidden = true; $('cancel-export').hidden = false; $('export-message').textContent = '';
  $<HTMLProgressElement>('render-progress').value = 0; $('render-status').textContent = 'Preparing frames…'; $('export-preview').hidden = true; $('download-film').hidden = true;
  const started = performance.now();
  try {
    const blob = await exportMovie(scene, snapshot, { width, height, signal: controller.signal, progress: (done, total) => {
      $<HTMLProgressElement>('render-progress').value = done / total * 100;
      $('render-status').textContent = `Frame ${done} of ${total} · ${Math.round(done / total * 100)}% · ${Math.round((performance.now() - started) / 1000)}s elapsed`;
    } });
    if (movieUrl) URL.revokeObjectURL(movieUrl); movieUrl = URL.createObjectURL(blob);
    const link = $<HTMLAnchorElement>('download-film'); link.href = movieUrl; link.download = `${filename()}.mp4`; link.hidden = false;
    $<HTMLVideoElement>('export-preview').src = movieUrl; $('export-preview').hidden = false;
    renderedRecipe = recipe; movieInfo = `Your film is ready. ${(blob.size / 1024 / 1024).toFixed(1)} MB · ${width} × ${height}`;
    $('export-message').textContent = movieInfo; $('render-again').hidden = false;
    $('render-status').textContent = 'Every frame rendered. Ready to download.';
  } catch (e) {
    $('export-message').textContent = controller.signal.aborted ? 'Export cancelled. Your project is safe.' : (e as Error).message;
    $('export-options').hidden = false; $('start-export').hidden = false;
  } finally {
    exporting = false; controller = undefined; time = before; dirty = true; $('cancel-export').hidden = true; lock();
    if (!button('start-export').hidden) button('start-export').disabled = false;
  }
});
window.addEventListener('beforeunload', (e) => { if (exporting) { e.preventDefault(); } });

async function start() {
  const hash = new URLSearchParams(location.hash.slice(1)), fromBuilder = hash.get('c');
  try {
    if (fromBuilder) {
      if (!decodeCharacter(fromBuilder, 'medium')) throw new Error('The character link is invalid. Open a fresh link from the character builder.');
      project = newProject('portrait', fromBuilder); customCode = fromBuilder;
      const d = hash.get('detail'); if (d === 'low' || d === 'medium' || d === 'high') project.detail = d;
    } else {
      const saved = localStorage.getItem(STORAGE); if (saved) { project = parseProject(saved); customCode = project.character; }
    }
  } catch (e) { notify((e as Error).message); }
  renderUI();
  try {
    const assets = new URL(`${BASE}assets/`, location.href).href;
    lib = await new AssetLibrary(fetchSource(assets)).initCatalog(); engine = new Engine(lib, assets);
    await buildCharacter();
  } catch (e) { $('loading-label').textContent = 'Character assets could not load.'; $('loading').querySelector('span:last-child')!.textContent = 'Run setup-assets for a self-hosted installation, then reload.'; notify((e as Error).message); }
}
void start();
// Only explicit scripted previews expose the scene, never ordinary browsing sessions.
if (new URLSearchParams(location.hash.slice(1)).has('demo')) Object.assign(window, { studio: { scene, get project() { return project; }, seek: (t: number) => { time = t; dirty = true; setPlaying(false); },
  get ready() { return !loading && !!scene.actor; }, exportMovie, supportsMp4 } });
