/**
 * Ara Educate's lesson: a list of steps (write this, underline it, show this code, say this), with a set, a board and
 * a teacher. Ara works out the rest: when each step happens, where it goes on the board, where the teacher stands and
 * what they do, and what the camera shows. A lesson becomes an ordinary Studio scene (`lesson: true`, with a board),
 * so the preview, Studio and the video all play it the same way.
 */
import { BOARD_FONTS, BOARD_H, BOARD_W, DEFAULT_INK, ROLL_TIME, SHAPES, boardSurface, type Board, type BoardFont, type BoardItem, type Region, type Shape } from '../studio/board';
import { CODE_LANGUAGES, diffTime, type CodeLanguage } from '../studio/code';
import { LESSON_LIMITS } from '../studio/limits';
import { offsetAt, parseProject, presetCode, timelineAt, type Beat, type CameraShot, type StudioProject } from '../studio/project';
import { decodeCharacter, encodeCharacter } from '../app/share';
import type { TextCue } from '../studio/text';
import type { SetId } from '../studio/catalog';

// ---- The lesson file ----

export type StepType = 'write' | 'shape' | 'slide' | 'code' | 'terminal' | 'image' | 'clear' | 'point' | 'talk';
/** One thing done to a step's image, in order: zoom into a region, highlight one, or zoom back out to all of it. */
export interface ImageAction { kind: 'zoom' | 'highlight' | 'all'; region?: Region }
export interface Step {
  id: string; type: StepType;
  /** What the teacher says during the step. */
  say?: string;
  /** Seconds to wait after it (default 0.4). */
  pause?: number;
  // write
  text?: string; size?: number; color?: string;
  // shape: round or under the step before it ('underline', 'circle', 'box', 'tick', 'cross'), or placed by from/to
  shape?: Shape; from?: [number, number]; to?: [number, number]; fn?: string; range?: [number, number, number, number];
  // slide
  title?: string; bullets?: string[];
  // code and terminal
  lang?: CodeLanguage; fileName?: string; highlights?: { from: number; to?: number; at?: number }[]; errors?: { line: number; message?: string; fix?: string }[];
  /** A code step shown as a change: the code before it, which then changes to the step's text. */
  before?: string;
  // image: its ID (see images.ts), where it shows (the projector screen unless 'board') and what's done to it
  image?: string; on?: 'board' | 'projector'; focus?: ImageAction[];
  /** Where a write, code or terminal step goes (0 to 1 across and down); laid out down the board when left out. */
  x?: number; y?: number;
}
export interface Lesson {
  kind: 'ara-lesson'; version: 1; title: string; set: SetId;
  /** The board the teacher writes on; slides, code and terminals go on a projector screen that comes down for them. */
  board: { kind: WritingBoard; font: BoardFont };
  teacher: { preset?: string; character?: string };
  /** The teacher's voice: F1, F2, M1, M2 (free voices in the browser) or a provider voice such as gemini/Kore. */
  voice: string;
  /** Show what the teacher says as captions. */
  captions: boolean;
  aspect: 'landscape' | 'portrait';
  /** Your turn of the camera, added to every shot's own angle: degrees round and up, and how far (1 = as chosen). */
  view?: { azimuth: number; elevation: number; zoom: number };
  steps: Step[];
}
/** When each step of the last lesson made into a scene starts and ends (seconds), for the editor's list and timeline. */
export const stepTimes = new Map<string, { start: number; end: number; type: StepType }>();
/** A line already voiced: its audio and length, for the words and voice it was made with. */
export interface Voiced { asset: string; duration: number; text: string; voice: string }

/** Sets that suit a lesson, each with where its board stands (x, z metres; facing yaw degrees). */
export const LESSON_SETS: Partial<Record<SetId, { label: string; board: { x: number; z: number; yaw: number } }>> = {
  classroom: { label: 'Classroom', board: { x: 0.6, z: -1.2, yaw: 0 } },
  laboratory: { label: 'Laboratory', board: { x: 0.4, z: -1.2, yaw: 0 } },
  'black-box': { label: 'Studio (plain)', board: { x: 0.3, z: -1.0, yaw: 0 } },
  office: { label: 'Office', board: { x: 0.4, z: -1.2, yaw: 0 } },
  'home-library': { label: 'Home library', board: { x: 0.4, z: -1.2, yaw: 0 } },
};
export const WRITING_BOARDS = ['whiteboard', 'chalkboard'] as const;
export type WritingBoard = typeof WRITING_BOARDS[number];
const SIDESTEP_RATE = 1.6;
const BOARD_WIDTH: Record<WritingBoard, number> = { whiteboard: 1.9, chalkboard: 2.2 };

export function newLesson(kind: WritingBoard = 'whiteboard'): Lesson {
  return {
    kind: 'ara-lesson', version: 1, title: 'A new lesson', set: 'classroom', board: { kind, font: 'kalam' },
    teacher: { preset: 'The Doctor' }, voice: 'M1', captions: true, aspect: 'landscape',
    steps: [
      { id: 's1', type: 'talk', say: 'Today we look at one simple idea.' },
      { id: 's2', type: 'write', text: 'A new lesson', size: 80, say: 'Here it is.' },
      { id: 's3', type: 'shape', shape: 'underline' },
    ],
  };
}

/** How long a lesson runs, in seconds, before its voices are made (the editor's own step times are kept). */
export function lessonLength(lesson: Lesson): number {
  const kept = new Map(stepTimes);
  try { compileLesson(lesson);return Math.max(0, ...[...stepTimes.values()].map((s) => s.end)); }
  finally { stepTimes.clear();kept.forEach((v, k) => stepTimes.set(k, v)); }
}

// ---- Reading a lesson ----

const record = (v: unknown, label: string) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${label} must be an object.`);return v as Record<string, unknown>; };
export const STEP_FIELDS = ['id', 'type', 'say', 'pause', 'text', 'size', 'color', 'shape', 'from', 'to', 'fn', 'range', 'title', 'bullets', 'lang', 'fileName', 'highlights', 'errors', 'before', 'image', 'on', 'focus', 'x', 'y'];
export const MAX_STEPS = 200;

/** Checks a lesson file and fills in defaults. The board's details are checked again when it becomes a scene. */
export function parseLesson(text: string): Lesson {
  if (text.length > 1_000_000) throw Error('Choose a lesson smaller than 1 MB.');
  const v = record(JSON.parse(text), 'A lesson');
  if (v.kind !== 'ara-lesson' || v.version !== 1) throw Error('Choose an Ara Educate lesson (kind "ara-lesson", version 1).');
  for (const k of Object.keys(v)) if (!['$schema', 'kind', 'version', 'title', 'set', 'board', 'teacher', 'voice', 'captions', 'aspect', 'view', 'steps', 'images'].includes(k)) throw Error(`Unsupported field ${k}.`);
  // Lessons made before the projector screen could choose a screen as their board: they write on a whiteboard now.
  const board = record(v.board ?? {}, 'board'), kind = (board.kind === 'screen' ? 'whiteboard' : board.kind ?? 'whiteboard') as WritingBoard;
  if (!WRITING_BOARDS.includes(kind)) throw Error(`board.kind is ${WRITING_BOARDS.join(' or ')}.`);
  const font = (board.font === undefined || board.font === 'sans' && board.kind === 'screen' ? 'kalam' : board.font) as BoardFont;
  if (!(font in BOARD_FONTS)) throw Error(`board.font is ${Object.keys(BOARD_FONTS).join(', ')}.`);
  const set = (v.set ?? 'classroom') as SetId;
  if (!LESSON_SETS[set]) throw Error(`set is one of ${Object.keys(LESSON_SETS).join(', ')}.`);
  const teacher = record(v.teacher ?? { preset: 'The Doctor' }, 'teacher');
  if (!Array.isArray(v.steps) || !v.steps.length || v.steps.length > MAX_STEPS) throw Error(`A lesson has 1 to ${MAX_STEPS} steps.`);
  const ids = new Set<string>();
  const steps = v.steps.map((raw, i): Step => {
    const s = record(raw, `Step ${i + 1}`);
    for (const k of Object.keys(s)) if (!STEP_FIELDS.includes(k)) throw Error(`Step ${i + 1}: unsupported field ${k}.`);
    const type = s.type as StepType;
    if (!['write', 'shape', 'slide', 'code', 'terminal', 'image', 'clear', 'point', 'talk'].includes(type)) throw Error(`Step ${i + 1}: type is write, shape, slide, code, terminal, image, clear, point or talk.`);
    if (type === 'image' && (typeof s.image !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.image))) throw Error(`Step ${i + 1}: an image step needs its image.`);
    const id = typeof s.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(s.id) && !ids.has(s.id) ? s.id : `step-${i + 1}`;
    ids.add(id);
    if (s.say !== undefined && (typeof s.say !== 'string' || s.say.length > 600)) throw Error(`Step ${i + 1}: say is up to 600 characters.`);
    if (type === 'shape' && !SHAPES.includes(s.shape as Shape)) throw Error(`Step ${i + 1}: shape is ${SHAPES.join(', ')}.`);
    if (s.before !== undefined && (typeof s.before !== 'string' || s.before.length > 6000)) throw Error(`Step ${i + 1}: before is code of up to 6000 characters.`);
    if (type === 'code' && s.lang !== undefined && !CODE_LANGUAGES.includes(s.lang as CodeLanguage)) throw Error(`Step ${i + 1}: lang is ${CODE_LANGUAGES.join(', ')}.`);
    return { ...(s as unknown as Step), id, type };
  });
  return {
    kind: 'ara-lesson', version: 1, title: typeof v.title === 'string' ? v.title.slice(0, 80) : 'A lesson', set,
    board: { kind, font }, teacher: { ...(typeof teacher.preset === 'string' ? { preset: teacher.preset } : {}), ...(typeof teacher.character === 'string' ? { character: teacher.character } : {}) },
    voice: typeof v.voice === 'string' ? v.voice : 'F2', captions: v.captions !== false, aspect: v.aspect === 'portrait' ? 'portrait' : 'landscape', steps,
    ...(viewOf(v.view) ? { view: viewOf(v.view) } : {}),
  };
}
function viewOf(raw: unknown): Lesson['view'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>, n = (x: unknown, a: number, b: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d);
  return { azimuth: n(r.azimuth, -180, 180, 0), elevation: n(r.elevation, -30, 50, 0), zoom: n(r.zoom, 0.5, 2.5, 1) };
}

// ---- From steps to a scene ----

/** The teacher's character, with nothing in their hands (the marker or chalk goes there) and no sunglasses. */
export function teacherFor(teacher: Lesson['teacher']): string {
  const code = teacher.character ?? presetCode(teacher.preset ?? 'The Doctor'), params = decodeCharacter(code, 'medium');
  if (!params) return code;
  return encodeCharacter({ ...params, carry: 'none', weapon: 'none', accessories: params.accessories.filter((a) => !/sunglass|aviator/.test(a)) });
}

const words = (s?: string) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);
/** Seconds to say a line, before its voice is made (the voice's own length replaces it). */
export const speechTime = (say?: string) => (say?.trim() ? 0.6 + words(say) * 0.36 : 0);
/** Seconds a step takes to appear on the board. */
function drawTime(step: Step): number {
  switch (step.type) {
    case 'write': return Math.min(8, Math.max(0.7, [...(step.text ?? '')].length * 0.085));
    case 'shape': return step.shape === 'graph' ? 2.6 : step.shape === 'axes' ? 1.2 : 0.8;
    case 'slide': return 1 + 0.9 * (step.bullets?.length ?? 0);
    case 'code': return Math.min(18, Math.max(1.5, (step.text ?? '').replace(/\s+/g, ' ').length * 0.04));
    case 'terminal': return 1.6;
    case 'clear': return 1.1;
    case 'image': return 0.8;
    default: return 0;
  }
}

interface Box { x: number; y: number; w: number; h: number }
/** Where things go: down the board's left column, then its right one; a clear starts again at the top. */
class Layout {
  private y = 0.09;
  private column = 0;
  last?: Box;
  /** Set when something didn't fit below what's there, and was put over it. */
  full = false;
  constructor(private screen: boolean) {}
  reset() { this.y = 0.09;this.column = 0;this.last = undefined; }
  place(w: number, h: number, x?: number, y?: number): Box {
    if (x !== undefined && y !== undefined) return (this.last = { x, y, w, h });
    const width = this.screen ? 0.9 : 0.42;
    if (this.y + h > 0.94 && (this.column === 0 && !this.screen)) { this.column = 1;this.y = 0.09; }
    if (this.y + h > 0.94 + 1e-6) this.full = true;
    const box = { x: this.screen ? 0.05 : 0.05 + this.column * 0.5, y: Math.min(this.y, 0.94 - h), w: Math.min(w, width), h };
    this.y = box.y + h + 0.045;
    return (this.last = box);
  }
}

/** Turns a lesson into a Studio scene: board items in time, the teacher's actions, the camera and the narration. */
/** Where a step happens: slides, code and terminals on the projector screen; writing, marks and wipes on the board. */
export const surfaceOf = (step: Pick<Step, 'type' | 'on'>): 'board' | 'projector' | undefined =>
  step.type === 'image' ? (step.on === 'board' ? 'board' : 'projector')
    : step.type === 'slide' || step.type === 'code' || step.type === 'terminal' ? 'projector' : step.type === 'write' || step.type === 'shape' || step.type === 'clear' ? 'board' : undefined;

/**
 * The size code or a terminal is shown at on the projector screen: 36 (32 for a terminal), smaller for long code so
 * all of it fits, across and down.
 */
function screenSize(step: Step): number {
  const texts = [step.text ?? '', ...(step.before !== undefined ? [step.before] : [])].map((t) => t.split('\n'));
  const lines = Math.max(...texts.map((t) => t.length)), longest = Math.max(1, ...texts.flat().map((l) => [...l].length));
  const code = step.type === 'code';
  const down = (0.86 * BOARD_H) / (code ? lines * 1.55 + 3.7 : lines * 1.5 + 3.2), across = (0.9 * BOARD_W) / (longest * 0.6 + (code ? 4 : 3));
  return Math.max(16, Math.floor(Math.min(code ? 36 : 32, down, across)));
}

/** Notes on a lesson that plays but won't look right: writing over writing, a screen too full. */
export function reviewLesson(lesson: Lesson): string[] {
  const notes: string[] = [];
  const kept = new Map(stepTimes);
  try { compileLesson(lesson, {}, notes); } finally { stepTimes.clear();kept.forEach((v, k) => stepTimes.set(k, v)); }
  return notes;
}

export function compileLesson(lesson: Lesson, voices: Record<string, Voiced> = {}, notes?: string[]): StudioProject {
  // A voiced line counts when it was made with the step's words and the lesson's voice.
  const voiceOf = (step: Step) => { const v = voices[step.id];return v && v.text === step.say?.trim() && v.voice === lesson.voice ? v : undefined; };
  const kind = lesson.board.kind, spot = LESSON_SETS[lesson.set]!.board;
  const place = { ...spot, width: BOARD_WIDTH[kind] };
  const board: Board = { id: 'board', kind, font: lesson.board.font, place, items: [] };
  // The projector screen hangs just in front of the board and a little wider, and comes down only when needed.
  const usesProjector = lesson.steps.some((s) => surfaceOf(s) === 'projector');
  const projector: Board = { id: 'projector', kind: 'projector', font: 'sans', place: { ...spot, z: spot.z + 0.09 * Math.cos((spot.yaw * Math.PI) / 180), x: spot.x + 0.09 * Math.sin((spot.yaw * Math.PI) / 180), width: BOARD_WIDTH[kind] + 0.1 }, items: [], shown: [] };
  const { width: bw } = boardSurface(board), yaw = (place.yaw * Math.PI) / 180;
  // Along the board (metres from its middle) to a point in the set, `out` metres in front of it.
  const at = (along: number, out: number) => ({ x: place.x + along * Math.cos(yaw) + out * Math.sin(yaw), z: place.z - along * Math.sin(yaw) + out * Math.cos(yaw) });
  const layouts = { board: new Layout(false), projector: new Layout(true) };
  const beats: Beat[] = [], shots: CameraShot[] = [], speech: StudioProject['audio']['speech'] = [], texts: TextCue[] = [];
  let t = 0, teacherT = 0;
  // The teacher: where they stand along the board, and which way they face (board-relative).
  let station = -bw / 4;
  const path: number[] = [station];
  // Board-relative facing: writing faces the board (turned a little to the class); pointing faces the class, turned
  // towards the board on the right hand's side. Sidesteps face the board square on, so they travel along it (a turned
  // sidestep would drift towards or away from it).
  const facing = { write: 180 - 22, step: 180, talk: 12, point: -28 };
  const addBeat = (clip: string, duration: number, face: number, extra: Partial<Beat> = {}) => {
    let left = duration;
    while (left > 1e-3) { const d = Math.min(12, left);beats.push({ id: `b${beats.length}`, clip, duration: +d.toFixed(3), move: false, face: (face + place.yaw + 540) % 360 - 180, ...extra });left -= d; }
    teacherT += duration;
  };
  const turn = lesson.view ?? { azimuth: 0, elevation: 0, zoom: 1 };
  const addShot = (duration: number, shot: CameraShot['shot'], target: string, own: CameraShot['view'] = { azimuth: 0, elevation: 4, zoom: 1 }) => {
    const view = { azimuth: ((own.azimuth + turn.azimuth + 540) % 360) - 180, elevation: Math.max(-30, Math.min(60, own.elevation + turn.elevation)), zoom: Math.max(0.5, Math.min(3, own.zoom * turn.zoom)) };
    let left = duration;
    while (left > 1e-3) { const d = Math.min(12, left);shots.push({ id: `c${shots.length}`, duration: +d.toFixed(3), shot, target, view });left -= d; }
  };
  // Moves along the board: brisk sidesteps facing it (the sidestep at 1.6 times its own pace, about 0.6 m a second)
  // for a short way, or turning and walking (1.49 m a second) for a long one.
  const stepTo = (along: number) => {
    const d = along - station;
    if (Math.abs(d) < 0.3) return 0;
    const walk = Math.abs(d) > 1, time = Math.abs(d) / (walk ? 1.49 : 0.38 * SIDESTEP_RATE);
    // Facing the board, the right is +along: a step to the right is strafe_right; walking right faces +along.
    if (walk) addBeat('walk', time, d > 0 ? 90 : -90, { move: true, exact: true });
    else addBeat(d > 0 ? 'strafe_right' : 'strafe_left', time, facing.step, { move: true, exact: true, rate: SIDESTEP_RATE });
    station = along;path.push(station);
    return time;
  };
  // Writing big enough to read from the back of the room: the lesson's first writing larger, as its heading; a long
  // line smaller, so it fits its half of the board.
  const heading = lesson.steps.find((s) => s.type === 'write');
  const writingSize = (step: Step) => {
    if (step.size) return step.size;
    const longest = Math.max(1, ...(step.text ?? '').split('\n').map((l) => [...l].length));
    return Math.max(36, Math.min(step === heading ? 88 : 68, Math.floor((0.42 * BOARD_W) / (longest * 0.5))));
  };

  stepTimes.clear();
  let lastSurface: 'board' | 'projector' = 'board', down = false, lastWipe = 0;
  lesson.steps.forEach((step, i) => {
    const voiced = voiceOf(step), said = voiced ? voiced.duration + 0.15 : speechTime(step.say), draw0 = drawTime(step);
    // A change to code: the code before it shows first (at once, if it's what the screen shows already), then changes.
    const before = step.type === 'code' && step.before?.trim() ? step.before : undefined;
    const showing = before !== undefined && [...projector.items].reverse().find((it) => it.type === 'code' && it.start >= lastWipe);
    const draw = before === undefined ? draw0 : showing && showing.type === 'code' && showing.text === before ? 0 : drawTime({ ...step, text: before });
    const change = before === undefined ? 0 : 0.5 + diffTime(before, step.text ?? '');
    let start = t;
    const surface = surfaceOf(step) ?? (step.type === 'point' ? lastSurface : undefined);
    const layout = surface === 'projector' ? layouts.projector : layouts.board, target = surface === 'projector' ? projector : board;
    // The projector screen rolls back up before the board is written on again (it comes down below, as the teacher
    // goes over to it).
    if (surface === 'board' && down) { projector.shown![projector.shown!.length - 1][1] = start;start += ROLL_TIME;down = false; }
    // Where it goes on its surface.
    let box: Box | undefined;
    if (step.type === 'write') {
      const lines = (step.text ?? '').split('\n'), size = writingSize(step);
      box = layout.place(Math.max(...lines.map((l) => [...l].length)) * size * 0.5 / BOARD_W, lines.length * size * 1.25 / BOARD_H, step.x, step.y);
    } else if (step.type === 'code' || step.type === 'terminal') {
      // As drawn: a code window's title bar, padding and lines; a terminal's bar, padding and lines.
      const lines = (step.text ?? '').split('\n'), size = screenSize(step), was = step.before?.split('\n').length ?? 0;
      box = { w: 0.9, h: (step.type === 'code' ? Math.max(lines.length, was) * 1.55 + 3.7 : lines.length * 1.5 + 3.2) * size / BOARD_H, x: 0, y: 0 };
    } else if (step.type === 'shape' && step.from && step.to) box = { x: Math.min(step.from[0], step.to[0]), y: Math.min(step.from[1], step.to[1]), w: Math.abs(step.to[0] - step.from[0]), h: Math.abs(step.to[1] - step.from[1]) };
    else if (step.type === 'shape' && (step.shape === 'axes' || step.shape === 'graph')) box = layout.place(0.4, 0.4);
    else if (step.type === 'image') box = surface === 'projector' ? { x: 0.04, y: 0.05, w: 0.92, h: 0.9 } : layout.place(0.42, 0.5);
    else if (step.type === 'shape') box = layout.last;
    if (step.type === 'clear') layout.reset();
    // A screen shows one thing at a time: a new slide or new code replaces what was there; a terminal joins code (and
    // replaces anything else).
    const onScreen = projector.items.filter((it) => it.type !== 'clear' && it.start >= lastWipe);
    const replaces = step.type === 'terminal' ? onScreen.some((it) => it.type !== 'code' && it.type !== 'terminal') : step.type === 'slide' || step.type === 'code' || step.type === 'image';
    if (surface === 'projector' && replaces && onScreen.length) {
      projector.items.push({ id: `${step.id}-wipe`, type: 'clear', start, duration: 0 });lastWipe = start;layouts.projector.reset();
    }
    if (step.type === 'code' || step.type === 'terminal') box = layouts.projector.place(box!.w, box!.h, step.x, step.y);
    // Anything that went over what was there already.
    for (const [where, l] of [['board', layouts.board], ['screen', layouts.projector]] as const) {
      if (!l.full) continue;
      l.full = false;
      notes?.push(where === 'board' ? `Step ${i + 1}: the board is full by here, so this goes over earlier writing. Add a Wipe step before it.` : `Step ${i + 1}: the screen is full by here, so this goes over what's on it. Shorten the code or the terminal output.`);
    }
    // Where the teacher goes: beside what they write, reaching across it so their body is clear of the line (past the
    // board's left edge for the first column if need be); beside the projector screen for what it shows; and to point
    // at the board, beside what they point at, on its right.
    const writes = surface === 'board' && step.type !== 'point' && step.type !== 'image';
    if (writes && box) start += stepTo(Math.max(-bw / 2 - 0.35, Math.min(bw / 2 - 0.3, (box.x + box.w / 2 - 0.5) * bw - 0.42)));
    // On the projector screen the camera shows the screen alone, so the teacher talks to the class beside it rather
    // than pointing (an arm reaching into the shot).
    const points = step.type === 'point' || (step.type === 'image' && surface === 'board');
    if (surface === 'projector') {
      const from = start;start += stepTo(bw / 2 + 0.5);
      // The screen rolls down while the teacher goes over to it, and is down by the time they get there.
      if (!down) { start = Math.max(start, from + ROLL_TIME);projector.shown!.push([start, LESSON_LIMITS.duration]);down = true; }
    }
    else if (step.type === 'point') { const last = layouts.board.last ?? { x: 0.3, y: 0.3, w: 0.2, h: 0.1 };start += stepTo(Math.min(bw / 2 + 0.45, (last.x + last.w - 0.5) * bw + 0.5)); }
    // The teacher catches up with the lesson's clock (they wait, facing the class, while nothing is happening).
    if (teacherT < start - 1e-3) addBeat('idle', start - teacherT, facing.talk);
    const length = Math.max(draw, said) + (step.pause ?? 0.4);
    const ink = step.color && /^#[0-9a-fA-F]{6}$/.test(step.color) ? step.color : undefined;
    const put = (item: BoardItem) => target.items.push(item);
    switch (step.type) {
      case 'write': put({ id: step.id, type: 'write', start, duration: draw, text: step.text ?? '', x: box!.x, y: box!.y, size: writingSize(step), ...(ink ? { color: ink } : {}), align: 'left' });break;
      case 'shape': {
        const s = step.shape!, b = box ?? { x: 0.3, y: 0.3, w: 0.3, h: 0.1 };
        const from: [number, number] = step.from ?? (s === 'underline' ? [b.x, b.y + b.h + 0.012] : s === 'tick' || s === 'cross' ? [b.x + b.w + 0.02, b.y] : [b.x, b.y]);
        const to: [number, number] = step.to ?? (s === 'underline' ? [b.x + b.w, b.y + b.h + 0.012] : s === 'tick' || s === 'cross' ? [b.x + b.w + 0.02 + b.h * 0.8, b.y + b.h] : [b.x + b.w, b.y + b.h]);
        const clampP = (p: [number, number]): [number, number] => [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))];
        put({ id: step.id, type: 'shape', start, duration: draw, shape: s, from: clampP(from), to: clampP(to), width: 6, ...(ink ? { color: ink } : {}), ...(s === 'graph' ? { fn: step.fn ?? 'x', range: step.range ?? [-5, 5, -5, 5] } : {}) } as BoardItem);
        break;
      }
      case 'slide': put({ id: step.id, type: 'slide', start, duration: draw, title: step.title ?? '', bullets: step.bullets ?? [] });break;
      case 'code': {
        const lines = (step.text ?? '').split('\n').length;
        const after = start + draw + change;
        put({ id: step.id, type: 'code', start, duration: draw, ...(before !== undefined ? { diff: { from: before, at: start + draw + 0.5 } } : {}), text: step.text ?? '', lang: step.lang ?? 'javascript', x: box!.x, y: box!.y, width: box!.w, size: screenSize(step), ...(step.fileName ? { title: step.fileName } : {}), lineNumbers: true,
          highlights: (step.highlights ?? []).map((h) => ({ from: Math.min(lines, h.from), to: Math.min(lines, h.to ?? h.from), start: after + (h.at ?? 0.3) })),
          errors: (step.errors ?? []).map((e, n) => ({ line: Math.min(lines, e.line), start: after + 0.5 + n * 0.3, ...(e.message ? { message: e.message } : {}), ...(e.fix ? { fix: e.fix, fixAt: after + 2.2 + n * 0.3 } : {}) })) });
        break;
      }
      case 'terminal': put({ id: step.id, type: 'terminal', start, duration: draw, text: step.text ?? '$ ', x: box!.x, y: box!.y, width: box!.w, size: screenSize(step) });break;
      case 'clear': put({ id: step.id, type: 'clear', start, duration: draw });break;
      case 'image': {
        const actions = step.focus ?? [], each = actions.length ? Math.max(2.2, (said - draw) / actions.length) : 0;
        put({ id: step.id, type: 'image', start, duration: draw, image: step.image!, x: box!.x, y: box!.y, w: box!.w, h: box!.h,
          focus: actions.map((a, n) => ({ at: start + draw + 0.3 + n * each, kind: a.kind, ...(a.region ? { region: a.region } : {}) })) });
        break;
      }
    }
    // A code step's errors and fixes take their own time.
    const extra = step.type === 'image' ? (step.focus?.length ? 0.3 + step.focus.length * Math.max(2.2, (said - draw) / step.focus.length) : 0.6) : step.type === 'code' ? change + Math.max(0, ...(step.errors ?? []).map((e, n) => (e.fix ? 3.2 : 1.2) + n * 0.3), ...(step.highlights ?? []).map((h) => (h.at ?? 0.3) + 0.6)) : 0;
    const total = Math.max(length, draw + extra + 0.3);
    // What the teacher does: writes while the board draws, points at what's shown, or talks to the class.
    if (writes && draw > 0) { addBeat('board_write', draw, facing.write, { board: 'board' });if (total - draw > 0.05) addBeat(said > draw ? 'talk' : 'idle', total - draw, said > draw ? facing.talk : facing.write); }
    else if (points) { const p = Math.min(total, 3);addBeat('board_point', p, facing.point, { board: surface ?? 'board' });if (total - p > 0.05) addBeat(said > p ? 'talk' : 'idle', total - p, facing.talk); }
    else addBeat(said > 0 ? 'talk' : 'idle', total, facing.talk);
    // What the camera shows: the whole room to begin with, the screen while it shows something, the teacher and the
    // board together while they write (from the side away from them, so the writing isn't behind them), the teacher
    // while they talk.
    // While the teacher crosses the room or the projector screen rolls, the whole room; then the step's own shot.
    let shotLength = start + total - t;
    if (i > 0 && start - t > 0.6) { addShot(start - t, 'wide', 'all');shotLength = total; }
    if (i === 0) addShot(shotLength, 'wide', 'all');
    else if (step.type === 'talk') addShot(shotLength, 'medium', 'teacher');
    else if (step.type === 'point') addShot(shotLength, 'wide', 'all');
    else if (surface === 'projector') addShot(shotLength, 'medium', 'board:projector');
    else addShot(shotLength, 'wide', 'all', { azimuth: 26, elevation: 5, zoom: 0.78 });
    if (step.say?.trim()) {
      const duration = Math.min(voiced?.duration ?? said, LESSON_LIMITS.duration - start);
      speech.push({ source: 'tts', id: `say-${step.id}`, name: `Step ${i + 1}`, actor: 'teacher', text: step.say.trim(), voice: lesson.voice, start, duration, offset: 0, speed: 1, volume: 1.35, pan: 0, effect: 'natural', ...(voiced ? { asset: voiced.asset } : {}) } as never);
      if (lesson.captions) texts.push({ id: `cap-${step.id}`, text: step.say.trim(), start, duration: Math.min(duration + 0.3, LESSON_LIMITS.duration - start), style: 'subtitle', anchor: 'screen', x: 0.5, y: 0.92, size: 26, color: '#ffffff', background: '#151820' });
    }
    if (surface) lastSurface = surface;
    stepTimes.set(step.id, { start, end: start + total, type: step.type });
    t = start + total;
  });
  if (t > LESSON_LIMITS.duration) {
    const over = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    throw Error(`This lesson runs ${over(t)}; a lesson can be up to ${LESSON_LIMITS.duration / 60} minutes. Shorten some steps or remove a few.`);
  }
  if (teacherT < t - 1e-3) addBeat('idle', t - teacherT, facing.talk);
  if (down) projector.shown![projector.shown!.length - 1][1] = Math.min(LESSON_LIMITS.duration, t + ROLL_TIME);
  const standAt = at(path[0], 0.45);
  const project = {
    kind: 'ara-studio', version: 2, lesson: true, title: lesson.title, template: lesson.set, aspect: lesson.aspect, caption: false,
    camera: 'locked', view: { azimuth: 0, elevation: 4, zoom: 1 },
    actors: [{ id: 'teacher', character: teacherFor(lesson.teacher), detail: 'medium', x: +standAt.x.toFixed(3), y: 0, z: +standAt.z.toFixed(3), yaw: (facing.talk + place.yaw + 540) % 360 - 180, beats }],
    shots, texts, boards: usesProjector ? [board, projector] : [board], audio: { speech, effects: [], music: { track: 'none' } },
  };
  // Studio measures a character's travel from a placement in the middle of it, in their own facing: ask it where the
  // teacher starts, and move the placement so they start where they should.
  const draft = parseProject(JSON.stringify(project)), actor = draft.actors[0], o = offsetAt(timelineAt(draft, 0, actor), 1), a = (actor.yaw * Math.PI) / 180;
  actor.x = +(standAt.x - (o.x * Math.cos(a) + o.z * Math.sin(a))).toFixed(3);
  actor.z = +(standAt.z - (-o.x * Math.sin(a) + o.z * Math.cos(a))).toFixed(3);
  return parseProject(JSON.stringify(draft));
}
export { DEFAULT_INK };
