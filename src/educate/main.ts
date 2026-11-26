/**
 * Ara Educate: the lesson editor. A lesson is a list of steps; every edit makes it into a Studio scene (lesson.ts) that
 * the preview plays with Studio's own scene, teacher and board drawing. The teacher's lines are voiced in the
 * background as they're written, so the preview speaks and exporting doesn't wait for them. Only what lessons use is
 * loaded here: no Studio editor, set browser or staging maps.
 */
import { AssetLibrary, fetchSource } from '../core/assets';
import { Engine } from '../app/engine';
import { decodeCharacter } from '../app/share';
import { characterFor } from '../app/characters/build';
import { PRESETS } from '../core/params';
import { StudioScene } from '../studio/scene';
import { StudioActor } from '../studio/actor';
import { orbitControls } from '../studio/orbit';
import { durationOf, type StudioProject } from '../studio/project';
import { BOARD_FONTS, BOARD_KIND_LABELS, DEFAULT_INK, SHAPES, loadBoardFonts } from '../studio/board';
import { CODE_LANGUAGES } from '../studio/code';
import { voiceMenu, voiceName, voiceProvider } from '../app/keys/voices';
import { openKeys } from '../app/keys/dialog';
import { onKeysChange } from '../app/keys/store';
import { AudioPlayback } from '../studio/audio/mix';
import { clearLinkedFile, hasLinkedFile, linkedFile } from '../app/links';
import { addImage, imageBitmap, imagesData, keepImages, loadImages } from './images';
import { LESSON_SETS, MAX_STEPS, WRITING_BOARDS, compileLesson, lessonLength, newLesson, parseLesson, stepTimes, type Lesson, type Step, type StepType, type Voiced } from './lesson';
import type { Region } from '../studio/board';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const BASE = import.meta.env.BASE_URL, STORAGE = 'ara.educate.lesson.v1', VOICES = 'ara.educate.voices.v1';
const scene = new StudioScene($<HTMLCanvasElement>('view'));
const sound = new AudioPlayback();
let engine: Engine | undefined, lib: AssetLibrary | undefined;
/** Someone here for the first time (no lesson kept in this browser) starts from the start screen. */
const firstVisit = (() => { try { return !localStorage.getItem(STORAGE); } catch { return false; } })();
let lesson: Lesson = restore(), voices: Record<string, Voiced> = restoreVoices(), project: StudioProject = compileLesson(lesson, voices);
let time = 0, playing = false, open = lesson.steps[0]?.id ?? '', builtTeacher = '', building: Promise<void> | undefined;

function restore(): Lesson {
  try { const saved = localStorage.getItem(STORAGE);if (saved) return parseLesson(saved); } catch { /* A broken saved lesson starts fresh. */ }
  return newLesson();
}
function restoreVoices(): Record<string, Voiced> {
  try { return JSON.parse(localStorage.getItem(VOICES) ?? '{}'); } catch { return {}; }
}
const notify = (message: string) => { $('notice').textContent = message; };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const STEPS: Record<StepType, { label: string; help: string }> = {
  write: { label: 'Write', help: 'Handwrite words or a formula' },
  shape: { label: 'Mark', help: 'Underline, circle, arrow or graph' },
  talk: { label: 'Say', help: 'Speak to the class' },
  code: { label: 'Code', help: 'Type out code, with highlights, fixes and changes' },
  terminal: { label: 'Terminal', help: 'Run a command and show its output' },
  image: { label: 'Image', help: 'A diagram or photo, zoomed and highlighted' },
  slide: { label: 'Slide', help: 'A title and points, one by one' },
  point: { label: 'Point', help: 'Point at what was just written' },
  clear: { label: 'Wipe', help: 'Clear the board' },
};

/** Every edit: the scene again from the lesson, saved in this browser, shown; the teacher's new lines voiced. */
function changed(opts: { teacher?: boolean; voice?: boolean } = {}) {
  // A lesson that plays but won't look right says why, under the preview.
  try { const notes: string[] = [];project = compileLesson(lesson, voices, notes);notify(notes[0] ?? ''); }
  catch (error) { notify((error as Error).message);return; }
  try { localStorage.setItem(STORAGE, JSON.stringify(lesson)); } catch { /* Storage full or off: the lesson stays open. */ }
  time = Math.min(time, durationOf(project));
  renderSteps();renderMarks();renderClock();
  $('reset-view').hidden = !lesson.view;
  if (opts.teacher) void syncTeacher();
  if (opts.voice !== false) scheduleVoices();
  draw();
}

// ---- The teacher ----

async function syncTeacher() {
  if (!engine || !lib) return;
  const recipe = `${project.actors[0].detail}:${project.actors[0].character}`;
  if (recipe === builtTeacher) return;
  await building;
  building = (async () => {
    $('loading').hidden = false;
    try {
      const params = decodeCharacter(project.actors[0].character, project.actors[0].detail)!;
      const ch = await characterFor(params, engine!, lib!, (label) => { $('loading-label').textContent = label; });
      const actor = new StudioActor(ch, (file) => lib!.textureUrl(file));
      await actor.ready();
      await scene.setActors(new Map([['teacher', actor]]), project);
      builtTeacher = recipe;
    } catch (error) { notify((error as Error).message); }
    finally { $('loading').hidden = true;draw(); }
  })();
  await building;
}

// ---- Voices, made in the background ----

let voicing: AbortController | undefined, voiceTimer = 0;
const voiceState = (state: 'idle' | 'working' | 'ready' | 'failed' | 'waiting', label: string, action?: string) => {
  $('voices').dataset.state = state;$('voices-label').textContent = label;
  $('voices-retry').hidden = !action;$('voices-retry').textContent = action ?? '';
  // The export window shows the same progress while it waits for them.
  if (!$('export-working').hidden && state === 'working') $('export-detail').textContent = label;
};
const unvoiced = () => project.audio.speech.filter((c) => !c.asset && c.text.trim());
/** An AI voice (Gemini, ElevenLabs) uses the person's own key, so its lines are only made when they ask. */
const aiVoice = () => voiceProvider(lesson.voice);
function scheduleVoices() {
  clearTimeout(voiceTimer);
  const todo = unvoiced().length;
  if (!todo) { voiceState(project.audio.speech.length ? 'ready' : 'idle', project.audio.speech.length ? 'Voices ready' : 'No lines yet');return; }
  const provider = aiVoice();
  if (provider) { voiceState('waiting', `${todo} line${todo > 1 ? 's' : ''} to voice with ${provider === 'gemini' ? 'Gemini' : 'ElevenLabs'}`, 'Make voices');return; }
  voiceState('working', 'Voicing soon…');
  voiceTimer = window.setTimeout(() => void makeVoices(), 900);
}
/** Voices every line not voiced yet; the lesson is timed again to their real lengths. */
async function makeVoices(signal?: AbortSignal): Promise<void> {
  voicing?.abort();const own = new AbortController();voicing = own;
  const stop = () => own.abort();signal?.addEventListener('abort', stop, { once: true });
  const { prepareDialogue } = await import('../studio/audio/prepare');
  try {
    const todo = unvoiced().length;
    if (!todo) return;
    voiceState('working', `Voicing ${todo} line${todo > 1 ? 's' : ''}…`);
    const done = await prepareDialogue(project, { signal: own.signal, progress: (m) => voiceState('working', m.replace(/^Line (\d+) of (\d+) · [^·]+· /, 'Line $1 of $2 · ').replace('Loading Ara’s voices…', 'Getting the free voices ready…')) });
    for (const cue of done.audio.speech) if (cue.asset) voices[cue.id.slice(4)] = { asset: cue.asset, duration: cue.duration, text: cue.text, voice: cue.voice };
    try { localStorage.setItem(VOICES, JSON.stringify(voices)); } catch { /* Voices are made again next time. */ }
    changed({ voice: false });
    voiceState('ready', 'Voices ready');
  } catch (error) {
    if (own.signal.aborted) return;
    voiceState('failed', `Voices: ${(error as Error).message}`, 'Try again');
    throw error;
  } finally { signal?.removeEventListener('abort', stop);if (voicing === own) voicing = undefined; }
}
$('voices-retry').addEventListener('click', () => void makeVoices().catch(() => {}));
// Connecting or removing a key changes which voices there are.
onKeysChange(() => void renderVoices());

// ---- Preview ----

function draw() { if (scene.actors.size) scene.render(project, time); }
let last = 0;
function tick(now: number) {
  if (playing) {
    time += Math.min(0.1, (now - last) / 1000);
    if (time >= durationOf(project)) { time = durationOf(project);setPlaying(false); }
    renderClock();draw();
  }
  last = now;requestAnimationFrame(tick);
}
function setPlaying(on: boolean) {
  playing = on && scene.actors.size > 0;
  $('play-icon').setAttribute('d', playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (playing) { if (time >= durationOf(project) - 0.05) time = 0;playSound(); }
  else sound.stop();
}
function renderClock() {
  const length = durationOf(project), scrub = $<HTMLInputElement>('scrub');
  scrub.max = String(length);scrub.value = String(time);
  $('clock').textContent = `${fmt(time)} / ${fmt(length)}`;
  // The step the playhead is in.
  for (const m of $('marks').children as HTMLCollectionOf<HTMLElement>) m.classList.toggle('now', time >= Number(m.dataset.start) && time < Number(m.dataset.end));
}
function renderMarks() {
  const length = durationOf(project) || 1;
  $('marks').replaceChildren(...lesson.steps.flatMap((s) => {
    const at = stepTimes.get(s.id);if (!at) return [];
    const m = document.createElement('span');m.style.left = `${(at.start / length) * 100}%`;m.style.width = `calc(${((at.end - at.start) / length) * 100}% - 2px)`;m.dataset.start = String(at.start);m.dataset.end = String(at.end);m.title = STEPS[s.type].label;
    return [m];
  }));
}
/** The preview's sound: the lines voiced so far (the rest are still being made, and play once they are). */
function playSound() {
  const ready = { ...project, audio: { ...project.audio, speech: project.audio.speech.filter((c) => c.asset) } };
  void sound.play(ready, time, () => {}).catch((e) => notify((e as Error).message));
}
const seek = (t: number) => { time = Math.max(0, Math.min(durationOf(project), t));if (playing) { sound.stop();playSound(); }renderClock();draw(); };
$('play').addEventListener('click', () => setPlaying(!playing));
$('scrub').addEventListener('input', () => seek(Number($<HTMLInputElement>('scrub').value)));
document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) { e.preventDefault();setPlaying(!playing); } });
scene.onSetReady = () => draw();
// Dragging turns the camera, the wheel zooms: kept with the lesson and used in the video.
orbitControls($<HTMLCanvasElement>('view'), () => lesson.view ?? { azimuth: 0, elevation: 0, zoom: 1 }, () => scene.actors.size > 0, () => {}, (v) => { lesson.view = v;changed({ voice: false }); }, () => {});
$('reset-view').addEventListener('click', () => { delete lesson.view;changed({ voice: false }); });

// ---- Steps ----

function summary(step: Step) {
  switch (step.type) {
    case 'write': case 'code': case 'terminal': return (step.text ?? '').split('\n')[0];
    case 'slide': return step.title ?? '';
    case 'shape': return step.shape === 'graph' ? `Graph of y = ${step.fn ?? 'x'}` : `${step.shape?.[0].toUpperCase()}${step.shape?.slice(1)}${['underline', 'circle', 'box', 'tick', 'cross'].includes(step.shape ?? '') ? ' the step before' : ''}`;
    case 'image': return `${step.on === 'board' ? 'On the board' : 'On the screen'}${step.focus?.length ? ` · ${step.focus.length} zoom${step.focus.length > 1 ? 's and highlights' : ' or highlight'}` : ''}`;
    case 'point': return 'At what was just written';
    case 'clear': return 'The whole board';
    default: return step.say ?? '';
  }
}
function renderSteps() {
  $('step-count').textContent = String(lesson.steps.length);
  $('steps').replaceChildren(...lesson.steps.map((step) => {
    const li = document.createElement('li');li.className = 'step';
    const expanded = step.id === open;li.setAttribute('aria-expanded', String(expanded));
    const head = document.createElement('button');head.className = 'step-head';
    const at = stepTimes.get(step.id);
    head.innerHTML = '<span class="bar"></span><span class="kind"></span><span class="what"><span class="text"></span><span class="said"></span></span><span class="when"></span>';
    head.querySelector('.kind')!.textContent = STEPS[step.type].label;
    head.querySelector('.text')!.textContent = summary(step) || '—';
    head.querySelector('.said')!.textContent = step.type !== 'talk' && step.say ? `“${step.say}”` : '';
    head.querySelector('.when')!.textContent = at ? fmt(at.start) : '';
    head.addEventListener('click', () => { open = open === step.id ? '' : step.id;if (at) seek(at.start + 0.01);renderSteps(); });
    li.append(head);
    if (expanded) li.append(stepBody(step));
    return li;
  }));
}

/** The open step's fields, by its type. */
function stepBody(step: Step) {
  const body = document.createElement('div');body.className = 'step-body';
  const field = (label: string, input: HTMLElement, into: HTMLElement = body) => { const l = document.createElement('label');l.className = 'field';l.append(label, input);into.append(l);return l; };
  const text = (label: string, value: string | undefined, apply: (v: string) => void, opts: { area?: boolean; code?: boolean; placeholder?: string; into?: HTMLElement } = {}) => {
    const input = opts.area ? document.createElement('textarea') : document.createElement('input');
    if (input instanceof HTMLInputElement) input.type = 'text';
    if (opts.code) { input.className = 'code';input.spellcheck = false; }
    input.value = value ?? '';if (opts.placeholder) input.placeholder = opts.placeholder;
    // Typing updates the board; the list's summary follows when the field is left.
    input.addEventListener('input', () => { apply(input.value);changedQuietly(); });
    input.addEventListener('change', () => renderSteps());
    return field(label, input, opts.into);
  };
  const number = (label: string, value: number | undefined, apply: (v: number | undefined) => void, min: number, max: number, step: number, into?: HTMLElement) => {
    const input = document.createElement('input');input.type = 'number';input.min = String(min);input.max = String(max);input.step = String(step);input.value = value === undefined ? '' : String(value);input.placeholder = 'Auto';
    input.addEventListener('change', () => { apply(input.value === '' ? undefined : Math.min(max, Math.max(min, Number(input.value))));changed(); });
    return field(label, input, into);
  };
  const choose = (label: string, value: string, options: [string, string][], apply: (v: string) => void, into?: HTMLElement) => {
    const select = document.createElement('select');select.append(...options.map(([v, l]) => new Option(l, v)));select.value = value;
    select.addEventListener('change', () => { apply(select.value);changed();renderSteps(); });
    return field(label, select, into);
  };
  const row = () => { const r = document.createElement('div');r.className = 'field-row';body.append(r);return r; };
  // An ⓘ beside a field's name that opens a short explanation under it.
  const explain = (l: HTMLLabelElement, about: string) => {
    const name = l.firstChild!.textContent ?? '', input = l.querySelector('input, textarea, select')!;
    const head = document.createElement('span');head.className = 'field-name';head.textContent = name;
    const info = document.createElement('button');info.type = 'button';info.className = 'info';info.textContent = 'i';
    info.setAttribute('aria-label', `What is “${name}”?`);info.setAttribute('aria-expanded', 'false');
    const tip = document.createElement('span');tip.className = 'tip';tip.textContent = about;tip.hidden = true;
    tip.id = `tip-${Math.random().toString(36).slice(2)}`;info.setAttribute('aria-controls', tip.id);
    info.addEventListener('click', (e) => { e.preventDefault();tip.hidden = !tip.hidden;info.setAttribute('aria-expanded', String(!tip.hidden)); });
    input.setAttribute('aria-label', name);
    head.append(info);l.firstChild!.replaceWith(head, tip);
  };
  switch (step.type) {
    case 'write': {
      text('Write', step.text, (v) => { step.text = v; }, { area: true });
      const r = row();
      number('Size', step.size, (v) => { step.size = v; }, 24, 160, 2, r);
      const swatches = document.createElement('div');swatches.className = 'swatches';
      const inks = ['', '#c0262d', '#1e8a3a', '#1f3a93', '#1b1b1b', '#ffe58a'];
      for (const ink of inks) {
        const b = document.createElement('button');b.type = 'button';if (ink) b.style.setProperty('--swatch', ink);else b.className = 'ink';
        b.title = ink ? ink : `The board's ink (${DEFAULT_INK[lesson.board.kind]})`;b.setAttribute('aria-pressed', String((step.color ?? '') === ink));
        b.addEventListener('click', () => { step.color = ink || undefined;changed();renderSteps(); });
        swatches.append(b);
      }
      field('Colour', swatches, r);
      break;
    }
    case 'shape':
      choose('Mark', step.shape ?? 'underline', SHAPES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), (v) => { step.shape = v as Step['shape']; });
      if (step.shape === 'graph') text('Plot y =', step.fn, (v) => { step.fn = v; }, { placeholder: '2*x or sin(x)' });
      break;
    case 'slide':
      text('Title', step.title, (v) => { step.title = v; });
      text('Points (one a line)', (step.bullets ?? []).join('\n'), (v) => { step.bullets = v.split('\n').filter((l) => l.trim()).slice(0, 8); }, { area: true });
      break;
    case 'code': {
      const r = row();
      choose('Language', step.lang ?? 'javascript', CODE_LANGUAGES.map((l) => [l, l === 'javascript' ? 'JavaScript' : l === 'sql' ? 'SQL' : l === 'css' ? 'CSS' : l === 'html' ? 'HTML' : l[0].toUpperCase() + l.slice(1)]), (v) => { step.lang = v as Step['lang']; }, r);
      text('File name', step.fileName, (v) => { step.fileName = v || undefined; }, { placeholder: 'main.py', into: r });
      // A change: from the code before (the last code step's, to begin with) to this step's code.
      const earlier = lesson.steps.slice(0, lesson.steps.indexOf(step)).reverse().find((s) => s.type === 'code');
      const toggle = document.createElement('label');toggle.className = 'switch';toggle.innerHTML = '<input type="checkbox" /><span></span>';
      toggle.append(earlier ? 'Show as a change to the code before' : 'Show as a change');
      const box = toggle.querySelector('input')!;box.checked = step.before !== undefined;
      box.addEventListener('change', () => { step.before = box.checked ? earlier?.text ?? step.text ?? '' : undefined;changed();renderSteps(); });
      body.append(toggle);
      if (step.before !== undefined) {
        const hint = document.createElement('p');hint.className = 'hint';
        hint.textContent = earlier && step.before === earlier.text ? 'Starts from the code on the screen. Lines taken out turn red and fold away; new lines open in green.' : 'Lines taken out turn red and fold away; new lines open in green.';
        body.append(hint);
        text('Before', step.before, (v) => { step.before = v; }, { area: true, code: true });
      }
      text(step.before !== undefined ? 'After' : 'Code', step.text, (v) => { step.text = v; }, { area: true, code: true });
      const lit = text('Highlight lines', (step.highlights ?? []).map((h) => (h.to && h.to !== h.from ? `${h.from}-${h.to}` : `${h.from}`)).join(', '), (v) => {
        step.highlights = v.split(',').map((p) => p.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => ({ from: Number(m[1]), ...(m[2] ? { to: Number(m[2]) } : {}) }));
      }, { placeholder: 'For example 2-3, 5' });
      explain(lit, 'Lines to light up once the code is typed, so the class knows where to look. Use line numbers: 2 for one line, 2-3 for lines 2 to 3, and commas for more than one (2-3, 5).');
      const mistake = number('Mistake on line', step.errors?.[0]?.line, (v) => { step.errors = v ? [{ ...(step.errors?.[0] ?? {}), line: v }] : [];renderSteps(); }, 1, 40, 1);
      mistake.querySelector('input')!.placeholder = 'None';
      explain(mistake, 'Shows a mistake the way a code editor does: the line gets a red wavy underline, with the message you write. Add the fixed line and it’s retyped correctly a moment later. Leave it empty for no mistake.');
      if (step.errors?.length) {
        text('What the editor says', step.errors[0].message, (v) => { step.errors![0].message = v || undefined; }, { placeholder: 'SyntaxError: …' });
        text('The line, fixed', step.errors[0].fix, (v) => { step.errors![0].fix = v || undefined; }, { code: true });
      }
      break;
    }
    case 'terminal': text('Commands and output (commands start with $)', step.text, (v) => { step.text = v; }, { area: true, code: true, placeholder: '$ python main.py\nHello' });break;
    case 'image': body.append(imageEditor(step));break;
  }
  text(step.type === 'talk' ? 'The teacher says' : 'The teacher says, meanwhile', step.say, (v) => { step.say = v || undefined; }, { area: true, placeholder: step.type === 'talk' ? 'Something to the class…' : 'Optional' });
  number('Pause after (seconds)', step.pause, (v) => { step.pause = v; }, 0, 10, 0.1);
  const tools = document.createElement('div');tools.className = 'step-tools';
  const tool = (label: string, title: string, run: () => void, cls = '') => { const b = document.createElement('button');b.type = 'button';b.textContent = label;b.title = title;if (cls) b.className = cls;b.addEventListener('click', run);tools.append(b); };
  tool('↑', 'Move up', () => move(step, -1));
  tool('↓', 'Move down', () => move(step, 1));
  tool('Duplicate', 'Duplicate this step', () => { const copy = { ...structuredClone(step), id: newId() };lesson.steps.splice(lesson.steps.indexOf(step) + 1, 0, copy);open = copy.id;changed(); });
  tool('Delete', 'Delete this step', () => { if (lesson.steps.length === 1) return;const i = lesson.steps.indexOf(step);lesson.steps.splice(i, 1);open = lesson.steps[Math.max(0, i - 1)].id;changed(); }, 'danger');
  body.append(tools);
  return body;
}
/** Asks for an image file, keeps it and hands back its ID. */
function chooseImage(then: (id: string) => void) {
  const input = document.createElement('input');input.type = 'file';input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];if (!file) return;
    try { then(await addImage(file));scene.invalidateBoards();draw(); } catch (error) { notify((error as Error).message); }
  });
  input.click();
}
/**
 * An image step's editor: the picture, with its zooms and highlights drawn on it. Dragging on it adds one (which kind,
 * the toggle above says); the list below them can be reordered by deleting and adding, and "Zoom back out" adds a step
 * back to the whole picture.
 */
function imageEditor(step: Step) {
  const wrap = document.createElement('div');wrap.className = 'image-editor';
  let mode: 'zoom' | 'highlight' = 'highlight';
  const modes = document.createElement('div');modes.className = 'image-modes';
  const modeButton = (m: typeof mode, label: string) => { const b = document.createElement('button');b.type = 'button';b.textContent = label;b.setAttribute('aria-pressed', String(m === mode));b.addEventListener('click', () => { mode = m;for (const x of modes.children) x.setAttribute('aria-pressed', String(x === b)); });modes.append(b); };
  modeButton('highlight', 'Drag to highlight');modeButton('zoom', 'Drag to zoom in');
  const canvas = document.createElement('canvas');canvas.className = 'image-canvas';
  const list = document.createElement('ol');list.className = 'image-actions';
  const actions = () => (step.focus ??= []);
  let bitmap: ImageBitmap | undefined, dragging: [number, number, number, number] | undefined;
  const draw2 = () => {
    if (!bitmap) return;
    const w = 300, h = Math.round((w * bitmap.height) / bitmap.width);canvas.width = w * 2;canvas.height = h * 2;canvas.style.aspectRatio = `${w} / ${h}`;
    const g = canvas.getContext('2d')!;g.scale(2, 2);g.drawImage(bitmap, 0, 0, w, h);
    actions().forEach((a, i) => { if (!a.region) return;const [x, y, rw, rh] = a.region;g.strokeStyle = a.kind === 'zoom' ? '#f4f4f5' : '#6d8dff';g.setLineDash(a.kind === 'zoom' ? [5, 4] : []);g.lineWidth = 2;g.strokeRect(x * w, y * h, rw * w, rh * h);g.setLineDash([]);g.fillStyle = 'rgba(9,9,11,.75)';g.fillRect(x * w, y * h, 18, 16);g.fillStyle = '#f4f4f5';g.font = '600 11px system-ui';g.fillText(String(i + 1), x * w + 5, y * h + 12); });
    if (dragging) { const [x0, y0, x1, y1] = dragging;g.strokeStyle = mode === 'zoom' ? '#f4f4f5' : '#6d8dff';g.lineWidth = 2;g.strokeRect(Math.min(x0, x1) * w, Math.min(y0, y1) * h, Math.abs(x1 - x0) * w, Math.abs(y1 - y0) * h); }
  };
  const renderList = () => {
    list.replaceChildren(...actions().map((a, i) => {
      const li = document.createElement('li');li.textContent = `${i + 1}. ${a.kind === 'zoom' ? 'Zoom in' : a.kind === 'highlight' ? 'Highlight' : 'Zoom back out'}`;
      const x = document.createElement('button');x.type = 'button';x.className = 'icon';x.textContent = '✕';x.setAttribute('aria-label', 'Remove');
      x.addEventListener('click', () => { actions().splice(i, 1);renderList();draw2();changed(); });li.append(x);return li;
    }));
  };
  const at = (e: PointerEvent): [number, number] => { const r = canvas.getBoundingClientRect();return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
  canvas.addEventListener('pointerdown', (e) => { const [x, y] = at(e);dragging = [x, y, x, y];canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return;const [x, y] = at(e);dragging[2] = x;dragging[3] = y;draw2(); });
  canvas.addEventListener('pointerup', () => {
    if (!dragging) return;const [x0, y0, x1, y1] = dragging;dragging = undefined;
    const region: Region = [Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)];
    if (region[2] > 0.03 && region[3] > 0.03) { actions().push({ kind: mode, region: region.map((v) => +v.toFixed(4)) as Region });renderList();changed(); }
    draw2();
  });
  const out = document.createElement('button');out.type = 'button';out.textContent = 'Zoom back out';out.addEventListener('click', () => { actions().push({ kind: 'all' });renderList();changed(); });
  const where = document.createElement('select');where.append(new Option('On the projector screen', 'projector'), new Option('On the board', 'board'));where.value = step.on ?? 'projector';
  where.addEventListener('change', () => { step.on = where.value === 'board' ? 'board' : undefined;changed(); });
  const replace = document.createElement('button');replace.type = 'button';replace.textContent = 'Replace image';replace.addEventListener('click', () => chooseImage((id) => { step.image = id;changed(); }));
  const row = document.createElement('div');row.className = 'step-tools';row.append(out, replace);
  const label = (text: string, el: HTMLElement) => { const l = document.createElement('label');l.className = 'field';l.append(text, el);return l; };
  wrap.append(label('Shown', where), modes, canvas, list, row);
  void (async () => {
    const missing = await loadImages([step.image!]);
    if (missing.length) { canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'This image isn’t in this browser. Choose it again with Replace image.' }));return; }
    bitmap = await imageBitmap(step.image!);draw2();
  })();
  renderList();
  return wrap;
}
/** While typing: the scene follows, without redrawing the list (which would take the field away). */
let quiet = 0;
function changedQuietly() {
  try { const notes: string[] = [];project = compileLesson(lesson, voices, notes);notify(notes[0] ?? ''); } catch (error) { notify((error as Error).message);return; }
  try { localStorage.setItem(STORAGE, JSON.stringify(lesson)); } catch { /* The lesson stays open. */ }
  renderMarks();renderClock();draw();
  clearTimeout(quiet);quiet = window.setTimeout(() => scheduleVoices(), 300);
}
const newId = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
function move(step: Step, by: number) {
  const i = lesson.steps.indexOf(step), j = i + by;
  if (j < 0 || j >= lesson.steps.length) return;
  [lesson.steps[i], lesson.steps[j]] = [lesson.steps[j], lesson.steps[i]];changed();
}
function addStep(type: StepType, image?: string) {
  if (lesson.steps.length >= MAX_STEPS) return notify(`A lesson has up to ${MAX_STEPS} steps.`);
  if (type === 'image' && !image) { toggleAdd(false);return chooseImage((id) => addStep('image', id)); }
  const id = newId();
  const step: Step = type === 'write' ? { id, type, text: 'New line' } : type === 'shape' ? { id, type, shape: 'underline' } : type === 'code' ? { id, type, lang: 'python', text: 'print("Hello")' }
    : type === 'terminal' ? { id, type, text: '$ python main.py\nHello' } : type === 'image' ? { id, type, image, focus: [] } : type === 'slide' ? { id, type, title: 'A slide', bullets: ['A first point'] } : type === 'talk' ? { id, type, say: 'Something to say.' } : { id, type };
  const at = lesson.steps.findIndex((s) => s.id === open);
  lesson.steps.splice(at < 0 ? lesson.steps.length : at + 1, 0, step);
  open = id;toggleAdd(false);changed();
  requestAnimationFrame(() => document.querySelector('.step[aria-expanded=true]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}
const menu = $('add-menu');
menu.replaceChildren(...(Object.keys(STEPS) as StepType[]).map((type) => {
  const b = document.createElement('button');b.type = 'button';
  b.innerHTML = '<b></b><small></small>';b.querySelector('b')!.textContent = STEPS[type].label;b.querySelector('small')!.textContent = STEPS[type].help;
  b.addEventListener('click', () => addStep(type));return b;
}));
const toggleAdd = (show = menu.hidden) => { menu.hidden = !show;$('add-step').setAttribute('aria-expanded', String(show)); };
$('add-step').addEventListener('click', () => toggleAdd());

// ---- Tabs and lesson settings ----

for (const tab of ['steps', 'preferences']) $(`tab-${tab}`).addEventListener('click', () => {
  for (const t of ['steps', 'preferences']) { $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));$(`panel-${t}`).hidden = t !== tab; }
});
function pressed(container: string, items: [string, string | HTMLElement][], value: string, apply: (v: string) => void) {
  $(container).replaceChildren(...items.map(([v, content]) => {
    const b = document.createElement('button');b.type = 'button';b.setAttribute('aria-pressed', String(v === value));
    if (typeof content === 'string') b.textContent = content;else b.append(content);
    b.addEventListener('click', () => { apply(v);renderSettings(); });return b;
  }));
}
function renderSettings() {
  pressed('sets', Object.entries(LESSON_SETS).map(([id, s]) => [id, s!.label]), lesson.set, (v) => { lesson.set = v as Lesson['set'];changed({ voice: false }); });
  // The board the teacher writes on; slides, code and terminals come on a projector screen that rolls down for them.
  pressed('boards', WRITING_BOARDS.map((k) => { const s = document.createElement('span');s.style.display = 'contents';s.innerHTML = `<i class="${k}"></i>`;s.append(BOARD_KIND_LABELS[k]);return [k, s]; }), lesson.board.kind, (v) => {
    lesson.board.kind = v as Lesson['board']['kind'];changed({ voice: false });
  });
  pressed('fonts', Object.entries(BOARD_FONTS).filter(([k]) => k !== 'sans').map(([k, f]) => {
    const s = document.createElement('span');s.style.display = 'contents';
    const sample = document.createElement('span');sample.className = 'sample';sample.textContent = 'F = m × a';sample.style.font = `${f.weight} 22px ${f.file ? `"${f.family}"` : f.family}`;
    const name = document.createElement('small');name.textContent = f.label;s.append(sample, name);return [k, s];
  }), lesson.board.font, (v) => { lesson.board.font = v as Lesson['board']['font'];changed({ voice: false }); });
  const teacher = $<HTMLSelectElement>('teacher');
  teacher.replaceChildren(...Object.keys(PRESETS).sort().map((n) => new Option(n.replace(/^The /, ''), n)));teacher.value = lesson.teacher.preset ?? 'The Doctor';
  void renderVoices();
  $<HTMLInputElement>('captions').checked = lesson.captions;
  $<HTMLInputElement>('title').value = lesson.title;
}
$('teacher').addEventListener('change', () => {
  const preset = $<HTMLSelectElement>('teacher').value, male = (PRESETS[preset]?.gender ?? 0.5) >= 0.5;
  lesson.teacher = { preset };
  // A free voice follows the teacher: a man's voice for a man, a woman's for a woman.
  const free = /^[FM][12]$/.test(lesson.voice), swap = free && (lesson.voice[0] === 'M') !== male;
  if (swap) { lesson.voice = `${male ? 'M' : 'F'}${lesson.voice[1]}`;void renderVoices(); }
  changed({ teacher: true, voice: swap });
});
/** The voices to choose from: Ara's free voices, then those of each AI provider connected, and a way to connect one. */
async function renderVoices() {
  const select = $<HTMLSelectElement>('voice'), groups = await voiceMenu();
  select.replaceChildren(...groups.map((g) => { const o = document.createElement('optgroup');o.label = g.label;o.append(...g.voices.map((v) => new Option(v.detail ? `${v.name} · ${v.detail}` : v.name, v.id)));return o; }), new Option('Connect AI voices…', 'keys'));
  // A voice chosen with a key that's since been removed is still shown, by name.
  if (![...select.options].some((o) => o.value === lesson.voice)) select.prepend(new Option(voiceName(lesson.voice), lesson.voice));
  select.value = lesson.voice;
  const provider = aiVoice();
  $('voice-hint').textContent = provider
    ? `Made with your own ${provider === 'gemini' ? 'Gemini' : 'ElevenLabs'} key, only when you choose Make voices or export. Your key stays in this browser.`
    : 'Free voices are made here in your browser, automatically. The first time, it downloads them once (about 130 MB).';
}
$('voice').addEventListener('change', () => {
  const value = $<HTMLSelectElement>('voice').value;
  if (value === 'keys') { $<HTMLSelectElement>('voice').value = lesson.voice;openKeys({ focus: 'voice', then: () => void renderVoices() });return; }
  lesson.voice = value;void renderVoices();changed();
});
$('captions').addEventListener('change', () => { lesson.captions = $<HTMLInputElement>('captions').checked;changed({ voice: false }); });
$('title').addEventListener('input', () => { lesson.title = $<HTMLInputElement>('title').value || 'A lesson';changedQuietly(); });

// ---- Files ----

function openLesson(next: Lesson) {
  if (startDialog.open) startDialog.close();
  lesson = next;open = lesson.steps[0]?.id ?? '';time = 0;setPlaying(false);
  renderSettings();changed({ teacher: true });void showImages();
}
const lessonImages = () => lesson.steps.flatMap((s) => (s.image ? [s.image] : []));
/** Decodes the lesson's images for the boards, and says if any isn't in this browser. */
async function showImages() {
  const missing = await loadImages(lessonImages()).catch(() => []);
  scene.invalidateBoards();draw();
  if (missing.length) notify(`${missing.length} image${missing.length > 1 ? 's aren’t' : ' isn’t'} in this browser: open the lesson file it was saved in, or choose the image again.`);
}
$('new-lesson').addEventListener('click', () => void showStart(true));

// ---- Starting a lesson: blank, or from a ready-made one ----

const startDialog = $<HTMLDialogElement>('start-dialog');
let templates: Promise<typeof import('./templates')> | undefined;
async function showStart(replacing: boolean) {
  $('start-foot').hidden = !replacing;$('start-save').textContent = 'Save it first';
  const { TEMPLATES } = await (templates ??= import('./templates'));
  const blank = { id: 'blank', subject: 'Blank', title: 'A blank lesson', about: 'A title and an underline, ready for your own steps.', lesson: newLesson() };
  $('templates').replaceChildren(...[blank, ...TEMPLATES].map((t) => {
    const b = document.createElement('button');b.type = 'button';b.className = 'template';
    // A glimpse of it: the first thing written, on its board, or else its first code or slide, on a screen.
    const first = t.lesson.steps.find((s) => s.type === 'write') ?? t.lesson.steps.find((s) => s.type === 'slide' || s.type === 'code');
    const preview = document.createElement('div'), glimpse = document.createElement('span');
    preview.className = `preview ${!first || first.type === 'write' ? t.lesson.board.kind : 'screen'}`;preview.setAttribute('aria-hidden', 'true');
    glimpse.textContent = first?.type === 'code' ? (first.text ?? '').split('\n')[0] : first?.type === 'slide' ? first.title ?? '' : first?.text ?? t.title;
    const hand = BOARD_FONTS[t.lesson.board.font];
    if (first?.type !== 'code') glimpse.style.font = `${hand.weight} 1em ${hand.file ? `"${hand.family}"` : hand.family}`;
    preview.append(glimpse);
    const used = new Set(t.lesson.steps.flatMap((s) => s.type === 'write' ? ['Writing'] : s.type === 'shape' && s.shape === 'graph' ? ['Graph'] : s.type === 'slide' ? ['Slides'] : s.type === 'code' ? [s.before ? 'Code changes' : 'Code'] : s.type === 'terminal' ? ['Terminal'] : s.type === 'image' ? ['Images'] : []));
    if (used.has('Code changes')) used.delete('Code');
    const uses = [...used];
    const text = document.createElement('div');text.className = 'template-text';
    text.innerHTML = '<small class="subject"></small><b></b><p></p><small class="facts"></small>';
    text.querySelector('.subject')!.textContent = t.subject;text.querySelector('b')!.textContent = t.title;text.querySelector('p')!.textContent = t.about;
    text.querySelector('.facts')!.textContent = [fmt(lessonLength(t.lesson)), `${t.lesson.steps.length} steps`, ...uses].join(' · ');
    b.append(preview, text);
    b.addEventListener('click', () => openLesson(parseLesson(JSON.stringify(t.lesson))));
    return b;
  }));
  if (!startDialog.open) { startDialog.showModal();(document.activeElement as HTMLElement | null)?.blur(); }
}
$('close-start').addEventListener('click', () => startDialog.close());

// ---- Assist: an AI assistant writes a lesson from a description (loaded when first opened) ----

const lessonEditor = { lesson: () => lesson, open: (next: Lesson) => openLesson(structuredClone(next)) };
const assistModule = () => import('./assist');
$('open-assist').addEventListener('click', async () => { await (await assistModule()).lessonAssist(lessonEditor).open(); });
// Ask Ara, the chat in the corner, comes once the page is ready (it's not needed to show a lesson).
window.addEventListener('load', () => setTimeout(() => void assistModule().then((m) => m.mountLessonAskAra(lessonEditor)), 600), { once: true });
$('start-save').addEventListener('click', () => { $('save-lesson').click();$('start-save').textContent = 'Saved to your downloads'; });
$('open-lesson').addEventListener('click', () => $('lesson-file').click());
/** Opens a lesson file's text, keeping the images it carries. */
async function openLessonText(text: string) {
  const next = parseLesson(text), carried = (JSON.parse(text) as { images?: Record<string, string> }).images;
  if (carried) await keepImages(carried);
  openLesson(next);
}
$('lesson-file').addEventListener('change', async () => {
  const file = $<HTMLInputElement>('lesson-file').files?.[0];$<HTMLInputElement>('lesson-file').value = '';
  if (!file) return;
  try { await openLessonText(await file.text());notify(`Opened ${file.name}.`); } catch (error) { notify((error as Error).message); }
});
// A link with a lesson in it (from the ara3d MCP server, or shared): it opens in place of the lesson kept here.
const linked = hasLinkedFile(location.hash, 'lesson');
if (linked) void linkedFile(location.hash, 'lesson').then(async (text) => { if (text) { await openLessonText(text);notify('Opened the lesson from the link. Save it to keep a copy.'); } })
  .catch((error) => notify((error as Error).message)).finally(() => clearLinkedFile('lesson'));
/** Saves a file to the person's downloads. */
function download(blob: Blob, name: string) {
  const a = document.createElement('a');a.href = URL.createObjectURL(blob);a.download = name;document.body.append(a);a.click();a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
const fileName = (ext: string) => `${(lesson.title || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lesson'}${ext}`;
$('save-lesson').addEventListener('click', async () => {
  // The file carries the lesson's images, so it opens anywhere.
  const images = await imagesData(lessonImages());
  download(new Blob([JSON.stringify({ ...lesson, ...(Object.keys(images).length ? { images } : {}) }, null, 2)], { type: 'application/json' }), fileName('.ara-lesson.json'));notify('Saved the lesson file to your downloads.');
});

// ---- Export ----

const dialog = $<HTMLDialogElement>('export-dialog');
let exporting: AbortController | undefined, video: { url: string; name: string } | undefined;
/** Shows one of the window's panes: the choices, the work going on, the result or what went wrong. */
const pane = (which: 'ready' | 'working' | 'done' | 'failed') => {
  for (const p of ['ready', 'working', 'done', 'failed']) $(`export-${p}`).hidden = p !== which;
  // Focus goes to what you'd do next, not the close button.
  ({ ready: $('start-export'), working: $('cancel-export'), done: $('download-lesson').hidden ? $('export-again') : $('download-lesson'), failed: $('retry-export') })[which].focus();
};
function readyPane() {
  const lines = project.audio.speech.length, todo = unvoiced().length, provider = aiVoice();
  $('export-summary').textContent = `${fmt(durationOf(project))} long${lines ? ` · ${lines} spoken line${lines > 1 ? 's' : ''}` : ''}`
    + (todo && provider ? `. ${todo} will be voiced with your ${provider === 'gemini' ? 'Gemini' : 'ElevenLabs'} key first.` : todo ? `. ${todo} still to be voiced; that happens first.` : '.')
    + (durationOf(project) > STREAM_FROM && 'showSaveFilePicker' in window ? ' You’ll choose where to save it, and it’s written there as it’s made.' : '');
  pane('ready');
}
$('open-export').addEventListener('click', () => { setPlaying(false);dialog.showModal();if (!exporting) readyPane(); });
$('close-export').addEventListener('click', () => dialog.close());
$('cancel-export').addEventListener('click', () => { exporting?.abort();readyPane(); });
$('export-again').addEventListener('click', () => readyPane());
$('retry-export').addEventListener('click', () => readyPane());
dialog.addEventListener('close', () => { exporting?.abort();exporting = undefined; });

/** Lessons longer than this go straight into a file the person chooses, where the browser allows it, rather than memory. */
const STREAM_FROM = 120;
type SavePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ name: string; createWritable(): Promise<WritableStream> }>;
$('start-export').addEventListener('click', async () => {
  // A long lesson is written into a file as it's made: the file is chosen first, while this click still counts.
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  let file: { name: string; stream: WritableStream } | undefined;
  if (durationOf(project) > STREAM_FROM && picker) {
    try { const handle = await picker({ suggestedName: fileName('.mp4'), types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });file = { name: handle.name, stream: await handle.createWritable() }; }
    catch { return; }
  }
  exporting?.abort();exporting = new AbortController();const signal = exporting.signal;
  const bar = $<HTMLProgressElement>('export-progress'), step = (text: string, detail = '') => { $('export-step').textContent = text;$('export-detail').textContent = detail; };
  bar.value = 0;pane('working');
  try {
    // Voices first (usually made already while editing).
    const provider = aiVoice(), todo = unvoiced().length;
    if (todo) {
      step(`Voicing ${todo} line${todo > 1 ? 's' : ''}…`, provider ? `With your ${provider === 'gemini' ? 'Gemini' : 'ElevenLabs'} key` : 'With Ara’s free voices, here in your browser');
      clearTimeout(voiceTimer);await makeVoices(signal);
    }
    const { exportMovie, exportFilmToFile } = await import('../studio/export');
    const size = (document.querySelector('input[name=size]:checked') as HTMLInputElement).value, [width, height] = size === '1080' ? [1920, 1080] : [1280, 720];
    step('Making the video…', 'Every frame is made here in your browser.');
    const options = { width, height, signal, progress: (done: number, total: number) => { bar.value = done / total;$('export-detail').textContent = `${Math.round((done / total) * 100)}% · frame ${done} of ${total}`; } };
    if (file) {
      await exportFilmToFile(scene, [project], options, file.stream as never);
      $('export-file').textContent = `Saved as ${file.name} · ${fmt(durationOf(project))} at ${size}p`;$('download-lesson').hidden = true;
    } else {
      const blob = await exportMovie(scene, project, options);
      if (video) URL.revokeObjectURL(video.url);
      video = { url: URL.createObjectURL(blob), name: fileName('.mp4') };
      const link = $<HTMLAnchorElement>('download-lesson');link.href = video.url;link.download = video.name;link.hidden = false;
      download(blob, video.name);
      $('export-file').textContent = `${video.name} · ${(blob.size / 1e6).toFixed(1)} MB · in your downloads`;
    }
    pane('done');
  } catch (error) {
    if (file) await file.stream.abort().catch(() => {});
    if (signal.aborted) return;
    $('export-error').textContent = (error as Error).message;pane('failed');
  } finally {
    if (exporting?.signal === signal) exporting = undefined;
    changed({ voice: false });
  }
});

// ---- Start ----

renderSettings();changed({ voice: false });
void loadBoardFonts(Object.keys(BOARD_FONTS).map((font) => ({ id: font, kind: 'whiteboard', font, place: 'frame', items: [] })) as never);
requestAnimationFrame(tick);
(async () => {
  try {
    const assets = new URL(`${BASE}assets/`, location.href).href;
    lib = await new AssetLibrary(fetchSource(assets)).initCatalog();engine = new Engine(lib, assets);
    await syncTeacher();
    void showImages();
    scheduleVoices();
  } catch (error) { notify((error as Error).message);$('loading').hidden = true; }
})();
if (new URLSearchParams(location.hash.slice(1)).has('demo')) Object.assign(window, { educate: { get lesson() { return lesson; }, get project() { return project; }, scene, open: (value: unknown) => openLesson(parseLesson(JSON.stringify(value))), seek, start: (replacing = true) => showStart(replacing), get ready() { return scene.actors.size > 0 && $('loading').hidden; }, get voices() { return $('voices-label').textContent; } } });
else if (firstVisit && !linked) void showStart(false);
