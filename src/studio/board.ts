/**
 * Boards for lessons (Ara Educate): a whiteboard, chalkboard or screen that stands in the set or fills the frame, and
 * what appears on it over time. Writing is handwritten letter by letter, shapes draw themselves, slides build up
 * bullet by bullet, and a clear wipes the board. Drawn the same way in the preview, stills and video.
 *
 * Positions on a board run from 0 to 1 across (x) and down (y); sizes are in board pixels of a 1600 × 900 surface.
 */
import { parseExpression } from './expression';
import { FILM_LIMITS, type SceneLimits } from './limits';
import { CODE_LANGUAGES, diffEnd, drawCode, drawTerminal, type CodeItem, type CodeLanguage, type TerminalItem } from './code';
export type { CodeItem, TerminalItem } from './code';

export const BOARD_KINDS = ['whiteboard', 'chalkboard', 'screen', 'projector'] as const;
export type BoardKind = typeof BOARD_KINDS[number];
export const BOARD_KIND_LABELS: Record<BoardKind, string> = { whiteboard: 'Whiteboard', chalkboard: 'Chalkboard', screen: 'Screen', projector: 'Projector screen' };
/** Boards that show what's put on them (a screen on a stand, a pull-down projector screen) rather than being written on. */
export const isProjected = (kind: BoardKind) => kind === 'screen' || kind === 'projector';
/** Handwriting fonts (SIL Open Font License, in public/fonts), and plain type for screens. A page loads only the fonts its boards use. */
export const BOARD_FONTS = {
  kalam: { label: 'Kalam', family: 'Ara Kalam', file: 'fonts/kalam.woff2', weight: 400 },
  caveat: { label: 'Caveat', family: 'Ara Caveat', file: 'fonts/caveat.woff2', weight: 600 },
  'patrick-hand': { label: 'Patrick Hand', family: 'Ara Patrick Hand', file: 'fonts/patrick-hand.woff2', weight: 400 },
  sans: { label: 'Plain type', family: '"Helvetica Neue", Arial, sans-serif', file: '', weight: 600 },
} as const;
export type BoardFont = keyof typeof BOARD_FONTS;
export const SHAPES = ['line', 'arrow', 'underline', 'box', 'circle', 'tick', 'cross', 'axes', 'graph'] as const;
export type Shape = typeof SHAPES[number];
export const BOARD_W = 1600, BOARD_H = 900;
export const MAX_BOARDS = 4;

type Point = [number, number];
interface Timed { id: string; start: number; duration: number }
export interface WriteItem extends Timed { type: 'write'; text: string; x: number; y: number; size: number; color?: string; align: 'left' | 'center' }
export interface ShapeItem extends Timed { type: 'shape'; shape: Shape; from: Point; to: Point; color?: string; width: number; fn?: string; range?: [number, number, number, number] }
export interface SlideItem extends Timed { type: 'slide'; title: string; bullets: string[] }
export interface ClearItem extends Timed { type: 'clear' }
/** A region of an image: x, y, width and height, each 0 to 1 of the image. */
export type Region = [number, number, number, number];
/** What happens to an image over time: zoom into a region, highlight one (the rest dimmed), or zoom back out. */
export interface ImageFocus { at: number; kind: 'zoom' | 'highlight' | 'all'; region?: Region }
/** A picture (a diagram, a photo) shown in a box on the board, fitted inside it; its pixels come from setBoardImage. */
export interface ImageItem extends Timed { type: 'image'; image: string; x: number; y: number; w: number; h: number; focus: ImageFocus[] }
export type BoardItem = WriteItem | ShapeItem | SlideItem | ClearItem | CodeItem | TerminalItem | ImageItem;

// ---- Images ----

const images = new Map<string, CanvasImageSource & { width: number; height: number }>();
/** Gives a board image its pixels (decoded already); boards draw an empty frame for an image not given yet. */
export function setBoardImage(id: string, image: CanvasImageSource & { width: number; height: number }) { images.set(id, image); }
export const hasBoardImage = (id: string) => images.has(id);
/** Standing in the set (metres, facing `yaw` degrees, `width` metres across) or filling the frame. */
export type BoardPlace = { x: number; z: number; yaw: number; width: number } | 'frame';
export interface Board { id: string; kind: BoardKind; font: BoardFont; place: BoardPlace; items: BoardItem[];
  /** A projector screen's times down, [from, to] seconds: it rolls down just before and back up just after (see boardRoll). */
  shown?: [number, number][] }
/** Seconds a projector screen takes to roll down or up. */
export const ROLL_TIME = 1.1;
/** How far down a projector screen is at `time` (0 rolled up, 1 down); other boards are always there. */
export function boardRoll(board: Board, time: number): number {
  if (board.kind !== 'projector' || !board.shown) return 1;
  let r = 0;
  for (const [from, to] of board.shown) r = Math.max(r, Math.min(1, Math.max(0, (time - (from - ROLL_TIME)) / ROLL_TIME), Math.max(0, (to + ROLL_TIME - time) / ROLL_TIME)));
  return r * r * (3 - 2 * r);
}

/** The ink a board writes in when an item doesn't choose one. */
export const DEFAULT_INK: Record<BoardKind, string> = { whiteboard: '#1f3a93', chalkboard: '#f4f1e6', screen: '#f5f6f8', projector: '#f5f6f8' };
export const defaultFont = (kind: BoardKind): BoardFont => (isProjected(kind) ? 'sans' : 'kalam');

// ---- Reading boards from a film ----

const record = (v: unknown, label: string) => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${label} must be an object.`);return v as Record<string, unknown>; };
const only = (v: Record<string, unknown>, keys: string[], label: string) => { for (const k of Object.keys(v)) if (!keys.includes(k)) throw Error(`${label}: unsupported field ${k}.`); };
const num = (v: unknown, min: number, max: number, label: string, fallback?: number) => {
  const n = v ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw Error(`${label}: use a number from ${min} to ${max}.`);
  return n;
};
const text = (v: unknown, max: number, label: string) => { if (typeof v !== 'string' || v.length > max) throw Error(`${label}: use text of up to ${max} characters.`);return v; };
const colour = (v: unknown, label: string) => { if (v === undefined) return undefined;if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw Error(`${label}: colour needs #RRGGBB.`);return v; };
const point = (v: unknown, label: string): Point => {
  if (!Array.isArray(v) || v.length !== 2) throw Error(`${label}: use [x, y], each from 0 to 1.`);
  return [num(v[0], 0, 1, label), num(v[1], 0, 1, label)];
};
const ID = /^[a-zA-Z0-9_-]{1,50}$/;

/** Checks a scene's boards. Items appear from `start` over `duration` seconds and stay until a clear. */
export function parseBoards(raw: unknown, limits: SceneLimits = FILM_LIMITS, stage = 40): Board[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_BOARDS) throw Error(`Use at most ${MAX_BOARDS} boards.`);
  const ids = new Set<string>();let total = 0;
  return raw.map((rawBoard, i) => {
    const b = record(rawBoard, `Board ${i + 1}`), label = `Board ${i + 1}`;
    only(b, ['id', 'kind', 'font', 'place', 'items', 'shown'], label);
    const id = b.id ?? `board-${i}`;
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) throw Error('Board IDs must be unique: letters, numbers, - and _.');
    ids.add(id);
    const kind = (b.kind ?? 'whiteboard') as BoardKind;
    if (!BOARD_KINDS.includes(kind)) throw Error(`${label}: choose ${BOARD_KINDS.join(', ')}.`);
    const font = (b.font ?? defaultFont(kind)) as BoardFont;
    if (!(font in BOARD_FONTS)) throw Error(`${label}: choose a font: ${Object.keys(BOARD_FONTS).join(', ')}.`);
    let place: BoardPlace;
    if (b.place === undefined || b.place === 'frame') place = b.place === 'frame' ? 'frame' : { x: 0, z: -1.5, yaw: 0, width: 2 };
    else {
      const p = record(b.place, `${label} place`);only(p, ['x', 'z', 'yaw', 'width'], `${label} place`);
      place = { x: num(p.x, -stage, stage, `${label} x`, 0), z: num(p.z, -stage, stage, `${label} z`, -1.5), yaw: num(p.yaw, -180, 180, `${label} yaw`, 0), width: num(p.width, 0.8, 6, `${label} width`, 2) };
    }
    if (!Array.isArray(b.items)) throw Error(`${label}: items is a list.`);
    total += b.items.length;
    if (total > limits.boardItems) throw Error(`Use at most ${limits.boardItems} board items in a scene.`);
    const itemIds = new Set<string>();
    const items = b.items.map((rawItem, j): BoardItem => {
      const it = record(rawItem, `${label} item ${j + 1}`), where = `${label} item ${j + 1}`;
      const itemId = it.id ?? `${id}-${j}`;
      if (typeof itemId !== 'string' || !ID.test(itemId) || itemIds.has(itemId)) throw Error(`${where}: item IDs must be unique.`);
      itemIds.add(itemId);
      const start = num(it.start, 0, limits.duration - 0.1, `${where} start`, 0);
      const timed = { id: itemId, start, duration: num(it.duration, 0, limits.duration, `${where} duration`, 1) };
      if (timed.start + timed.duration > limits.duration + 1e-7) throw Error(`${where}: finish within the scene.`);
      switch (it.type) {
        case 'write':
          only(it, ['id', 'type', 'start', 'duration', 'text', 'x', 'y', 'size', 'color', 'align'], where);
          if (it.align !== undefined && it.align !== 'left' && it.align !== 'center') throw Error(`${where}: align is left or center.`);
          return { ...timed, type: 'write', text: text(it.text, 2000, where), x: num(it.x, 0, 1, `${where} x`, 0.06), y: num(it.y, 0, 1, `${where} y`, 0.12), size: num(it.size, 12, 300, `${where} size`, 64), color: colour(it.color, where), align: (it.align as 'left' | 'center') ?? 'left' };
        case 'shape': {
          only(it, ['id', 'type', 'start', 'duration', 'shape', 'from', 'to', 'color', 'width', 'fn', 'range'], where);
          if (!SHAPES.includes(it.shape as Shape)) throw Error(`${where}: choose a shape: ${SHAPES.join(', ')}.`);
          const shape = it.shape as Shape;
          const item: ShapeItem = { ...timed, type: 'shape', shape, from: point(it.from, `${where} from`), to: point(it.to, `${where} to`), color: colour(it.color, where), width: num(it.width, 1, 40, `${where} width`, 6) };
          if (shape === 'graph') {
            item.fn = text(it.fn, 200, `${where} fn`);
            parseExpression(item.fn);
            const r = it.range ?? [-5, 5, -5, 5];
            if (!Array.isArray(r) || r.length !== 4 || r.some((v) => typeof v !== 'number' || !Number.isFinite(v)) || r[0] >= r[1] || r[2] >= r[3]) throw Error(`${where}: range is [xMin, xMax, yMin, yMax].`);
            item.range = r as [number, number, number, number];
          } else if (it.fn !== undefined || it.range !== undefined) throw Error(`${where}: fn and range are for graphs.`);
          return item;
        }
        case 'slide': {
          only(it, ['id', 'type', 'start', 'duration', 'title', 'bullets'], where);
          const bullets = it.bullets ?? [];
          if (!Array.isArray(bullets) || bullets.length > 8) throw Error(`${where}: up to 8 bullets.`);
          return { ...timed, type: 'slide', title: text(it.title ?? '', 120, `${where} title`), bullets: bullets.map((v, k) => text(v, 160, `${where} bullet ${k + 1}`)) };
        }
        case 'clear':
          only(it, ['id', 'type', 'start', 'duration'], where);
          return { ...timed, type: 'clear' };
        case 'code': {
          only(it, ['id', 'type', 'start', 'duration', 'text', 'lang', 'x', 'y', 'width', 'size', 'title', 'lineNumbers', 'highlights', 'errors', 'diff'], where);
          const code = text(it.text, 6000, where), count = code.split('\n').length;
          if (count > 40) throw Error(`${where}: up to 40 lines of code.`);
          const lang = (it.lang ?? 'javascript') as CodeLanguage;
          if (!CODE_LANGUAGES.includes(lang)) throw Error(`${where}: lang is ${CODE_LANGUAGES.join(', ')}.`);
          if (it.lineNumbers !== undefined && typeof it.lineNumbers !== 'boolean') throw Error(`${where}: lineNumbers is true or false.`);
          const line = (v: unknown, label: string) => Math.round(num(v, 1, count, label));
          const list = (v: unknown, label: string) => { if (v === undefined) return [];if (!Array.isArray(v) || v.length > 40) throw Error(`${label}: a list of up to 40.`);return v.map((x, n) => record(x, `${label} ${n + 1}`)); };
          const highlights = list(it.highlights, `${where} highlights`).map((h, n) => {
            const at = `${where} highlight ${n + 1}`;only(h, ['from', 'to', 'start', 'duration'], at);
            const from = line(h.from, `${at} from`), to = h.to === undefined ? from : line(h.to, `${at} to`);
            if (to < from) throw Error(`${at}: to comes after from.`);
            return { from, to, start: num(h.start, 0, limits.duration, `${at} start`), ...(h.duration === undefined ? {} : { duration: num(h.duration, 0.1, limits.duration, `${at} duration`) }) };
          });
          const errors = list(it.errors, `${where} errors`).map((e, n) => {
            const at = `${where} error ${n + 1}`;only(e, ['line', 'start', 'message', 'fix', 'fixAt'], at);
            const start = num(e.start, 0, limits.duration, `${at} start`);
            return { line: line(e.line, `${at} line`), start, ...(e.message === undefined ? {} : { message: text(e.message, 80, `${at} message`) }), ...(e.fix === undefined ? {} : { fix: text(e.fix, 200, `${at} fix`) }), ...(e.fixAt === undefined ? {} : { fixAt: num(e.fixAt, start, limits.duration, `${at} fixAt`) }) };
          });
          let diff: CodeItem['diff'];
          if (it.diff !== undefined) {
            const d = record(it.diff, `${where} diff`);only(d, ['from', 'at'], `${where} diff`);
            const from = text(d.from, 6000, `${where} diff from`);
            if (from.split('\n').length > 40) throw Error(`${where} diff: up to 40 lines of code before the change.`);
            diff = { from, at: num(d.at, timed.start, limits.duration, `${where} diff at`) };
          }
          return { ...timed, ...(diff ? { diff } : {}), type: 'code', text: code, lang, x: num(it.x, 0, 1, `${where} x`, 0.05), y: num(it.y, 0, 1, `${where} y`, 0.08), width: num(it.width, 0.1, 1, `${where} width`, 0.9), size: num(it.size, 12, 120, `${where} size`, 34), ...(it.title === undefined ? {} : { title: text(it.title, 60, `${where} title`) }), lineNumbers: it.lineNumbers !== false, highlights, errors };
        }
        case 'terminal': {
          only(it, ['id', 'type', 'start', 'duration', 'text', 'x', 'y', 'width', 'size'], where);
          const out = text(it.text, 4000, where);
          if (out.split('\n').length > 30) throw Error(`${where}: up to 30 lines.`);
          return { ...timed, type: 'terminal', text: out, x: num(it.x, 0, 1, `${where} x`, 0.05), y: num(it.y, 0, 1, `${where} y`, 0.6), width: num(it.width, 0.1, 1, `${where} width`, 0.9), size: num(it.size, 12, 120, `${where} size`, 30) };
        }
        case 'image': {
          only(it, ['id', 'type', 'start', 'duration', 'image', 'x', 'y', 'w', 'h', 'focus'], where);
          if (typeof it.image !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(it.image)) throw Error(`${where}: image is the image's ID.`);
          const region = (v: unknown, at: string): Region => {
            if (!Array.isArray(v) || v.length !== 4 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) || v[2] < 0.02 || v[3] < 0.02) throw Error(`${at}: region is [x, y, width, height], each 0 to 1.`);
            return v as Region;
          };
          const focus = it.focus ?? [];
          if (!Array.isArray(focus) || focus.length > 30) throw Error(`${where}: focus is a list of up to 30.`);
          return { ...timed, type: 'image', image: it.image, x: num(it.x, 0, 1, `${where} x`, 0.05), y: num(it.y, 0, 1, `${where} y`, 0.05), w: num(it.w, 0.05, 1, `${where} w`, 0.9), h: num(it.h, 0.05, 1, `${where} h`, 0.9),
            focus: focus.map((raw, n) => {
              const f = record(raw, `${where} focus ${n + 1}`), at = `${where} focus ${n + 1}`;only(f, ['at', 'kind', 'region'], at);
              if (f.kind !== 'zoom' && f.kind !== 'highlight' && f.kind !== 'all') throw Error(`${at}: kind is zoom, highlight or all.`);
              return { at: num(f.at, 0, limits.duration, `${at} at`), kind: f.kind, ...(f.kind === 'all' ? {} : { region: region(f.region, at) }) };
            }) };
        }
        default: throw Error(`${where}: type is write, shape, slide, code, terminal, image or clear.`);
      }
    });
    let shown: [number, number][] | undefined;
    if (b.shown !== undefined) {
      if (kind !== 'projector' || !Array.isArray(b.shown) || b.shown.length > 100) throw Error(`${label}: shown is for projector screens: a list of [from, to] times.`);
      shown = b.shown.map((r, k) => { if (!Array.isArray(r) || r.length !== 2) throw Error(`${label} shown ${k + 1}: [from, to].`);const from = num(r[0], 0, limits.duration, label), to = num(r[1], from, limits.duration, label);return [from, to] as [number, number]; });
    }
    return { id, kind, font, place, items, ...(shown ? { shown } : {}) };
  });
}

/** When an item is done: its drawing, and for code its highlights and errors (fixes included). */
export function boardItemEnd(item: BoardItem): number {
  let end = item.start + item.duration;
  if (item.type === 'image') for (const f of item.focus) end = Math.max(end, f.at + 1);
  if (item.type === 'code') {
    for (const h of item.highlights) end = Math.max(end, h.start + (h.duration ?? 0.4));
    for (const e of item.errors) end = Math.max(end, e.fix !== undefined ? (e.fixAt ?? e.start + 1.5) + 0.8 : e.start + 0.6);
    end = Math.max(end, diffEnd(item));
  }
  return end;
}

// ---- Where the action is ----

/** The middle of an item on the board, 0 to 1 across and down (writing's size is estimated from its letters). */
function itemCentre(item: BoardItem, time = Infinity): [number, number] {
  if (item.type === 'write') {
    const lines = item.text.split('\n'), longest = Math.max(...lines.map((l) => [...l].length)), w = (longest * item.size * 0.5) / BOARD_W, h = (lines.length * item.size * 1.25) / BOARD_H;
    return [item.align === 'center' ? item.x : item.x + w / 2, item.y + h / 2];
  }
  if (item.type === 'shape') return [(item.from[0] + item.to[0]) / 2, (item.from[1] + item.to[1]) / 2];
  if (item.type === 'image') {
    // Where the image's latest highlight or zoom is, on the board (the middle of the image before either).
    const view = imageView(item, time), mark = [...item.focus].reverse().find((f) => f.at <= time && f.kind === 'highlight');
    const box = fitted(item);
    if (!mark?.region) return [box.x + box.w / 2, box.y + box.h / 2];
    const [rx, ry, rw, rh] = mark.region, u = (rx + rw / 2 - view[0]) / view[2], v = (ry + rh / 2 - view[1]) / view[3];
    return [box.x + u * box.w, box.y + v * box.h];
  }
  if (item.type === 'code' || item.type === 'terminal') { const n = item.text.split('\n').length;return [item.x + item.width / 2, item.y + (n * item.size * 1.5 + item.size * 2) / BOARD_H / 2]; }
  if (item.type === 'slide') {
    // A slide's newest point (as drawSlide lays them out), or its title before any point is shown.
    const steps = 1 + item.bullets.length, each = item.duration / steps, gap = Math.min(62 * 1.75, (BOARD_H * 0.68) / Math.max(1, item.bullets.length)) / BOARD_H;
    const shown = item.bullets.filter((_, i) => time >= item.start + (i + 1) * each).length;
    return shown ? [0.2, 0.4 + (shown - 1) * gap - 0.02] : [0.25, 0.17];
  }
  return [0.5, 0.5];
}
/**
 * Where a close shot of the board looks at `time`: the item being written, or the last one written, gliding from one
 * to the next as each begins. A board cleared and empty is looked at in its middle.
 */
export function boardFocus(board: Board, time: number): [number, number] {
  let previous: [number, number] = [0.5, 0.5], current: [number, number] = [0.5, 0.5], since = Infinity;
  for (const item of board.items) {
    if (item.start > time) break;
    const centre = item.type === 'clear' ? [0.5, 0.5] as [number, number] : itemCentre(item, time);
    previous = current;current = centre;since = time - item.start;
  }
  const t = smooth(since / 0.8);
  return [previous[0] + (current[0] - previous[0]) * t, previous[1] + (current[1] - previous[1]) * t];
}

/** The board's surface in the set: its width and height and the height of its middle above the floor, in metres. */
export const BOARD_CENTRE = 1.3;
export function boardSurface(board: Board) {
  const width = board.place === 'frame' ? 2 : board.place.width, height = width * (BOARD_H / BOARD_W);
  return { width, height, centre: Math.max(BOARD_CENTRE, height / 2 + 0.55) + (board.kind === 'projector' ? 0.14 : 0) };
}
/** A point on a standing board (0 to 1 across and down) in the set, `out` metres in front of its surface. */
export function boardWorld(board: Board, u: number, v: number, out = 0): [number, number, number] {
  const place = board.place === 'frame' ? { x: 0, z: 0, yaw: 0, width: 2 } : board.place, { width, height, centre } = boardSurface(board);
  const a = (place.yaw * Math.PI) / 180, lx = (u - 0.5) * width, lz = 0.012 + out;
  return [place.x + lx * Math.cos(a) + lz * Math.sin(a), centre + (0.5 - v) * height, place.z - lx * Math.sin(a) + lz * Math.cos(a)];
}

/**
 * Where the pen is at `time` (0 to 1 across and down), whether it is drawing, and for how long it has been still. It
 * moves through each letter, along each line and round each circle as they draw, and rests where it stopped.
 */
export function boardPen(board: Board, time: number): { at: [number, number]; drawing: boolean; still: number } {
  let at: [number, number] = [0.5, 0.5], still = Infinity;
  for (const item of board.items) {
    if (item.start > time || item.type === 'slide') continue;
    const p = progress(item, time), end = item.start + item.duration;
    const point = penOn(item, p, time);
    if (point) { at = point;still = time >= end ? time - end : 0; }
  }
  return { at, drawing: still === 0, still };
}
function penOn(item: BoardItem, p: number, time: number): [number, number] | undefined {
  // A little up-and-down as letters are formed.
  const scribble = (size: number) => (Math.sin(time * 15) * size * 0.16) / BOARD_H;
  switch (item.type) {
    case 'write': {
      const lines = item.text.split('\n'), total = lines.reduce((s, l) => s + [...l].length, 0);
      let left = p * total, n = 0;
      while (n < lines.length - 1 && left > [...lines[n]].length) { left -= [...lines[n]].length;n++; }
      const charW = (item.size * 0.5) / BOARD_W, width = [...lines[n]].length * charW;
      const x0 = item.align === 'center' ? item.x - width / 2 : item.x;
      return [x0 + Math.min(left, [...lines[n]].length) * charW, item.y + ((n + 0.55) * item.size * 1.25) / BOARD_H + (p < 1 ? scribble(item.size) : 0)];
    }
    case 'shape': {
      const [ax, ay] = item.from, [bx, by] = item.to;
      if (item.shape === 'circle') {
        const cx = (ax + bx) / 2, cy = (ay + by) / 2, rx = Math.abs(bx - ax) / 2 * 1.16 + 18 / BOARD_W, ry = Math.abs(by - ay) / 2 * 1.32 + 16 / BOARD_H, a = -Math.PI * 0.6 + p * Math.PI * 2.1;
        return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
      }
      if (item.shape === 'box') {
        const w = bx - ax, h = by - ay, per = 2 * (Math.abs(w) + Math.abs(h)), d = p * per;
        if (d < Math.abs(w)) return [ax + Math.sign(w) * d, ay];
        if (d < Math.abs(w) + Math.abs(h)) return [bx, ay + Math.sign(h) * (d - Math.abs(w))];
        if (d < 2 * Math.abs(w) + Math.abs(h)) return [bx - Math.sign(w) * (d - Math.abs(w) - Math.abs(h)), by];
        return [ax, by - Math.sign(h) * (d - 2 * Math.abs(w) - Math.abs(h))];
      }
      return [ax + (bx - ax) * p, ay + (by - ay) * p];
    }
    case 'code': case 'terminal': {
      const lines = item.text.split('\n'), total = lines.reduce((s, l) => s + l.length, 0);
      let left = p * total, n = 0;
      while (n < lines.length - 1 && left > lines[n].length) { left -= lines[n].length;n++; }
      const charW = (item.size * 0.6) / BOARD_W;
      return [item.x + Math.min(left, lines[n].length) * charW + 0.03, item.y + ((n + 1.6) * item.size * 1.5) / BOARD_H];
    }
    case 'clear': return [0.05 + 0.9 * smooth(p), 0.5 + Math.sin(time * 9) * 0.18];
    default: return undefined;
  }
}

// ---- Drawing images ----

/** The image's box on the board (0 to 1), shrunk to the image's own shape so it fits without stretching. */
function fitted(item: ImageItem) {
  const img = images.get(item.image), aspect = img ? img.width / img.height : 16 / 9, boxAspect = (item.w * BOARD_W) / (item.h * BOARD_H);
  const w = aspect > boxAspect ? item.w : (item.h * BOARD_H * aspect) / BOARD_W, h = aspect > boxAspect ? (item.w * BOARD_W) / aspect / BOARD_H : item.h;
  return { x: item.x + (item.w - w) / 2, y: item.y + (item.h - h) / 2, w, h };
}
/** The part of the image in view at `time`, as a region: easing from one zoom to the next over 0.9 seconds. */
function imageView(item: ImageItem, time: number): Region {
  let from: Region = [0, 0, 1, 1], to: Region = [0, 0, 1, 1], since = Infinity;
  for (const f of item.focus) {
    if (f.at > time || f.kind === 'highlight') continue;
    from = currentView(from, to, since);to = f.kind === 'zoom' ? aspectRegion(item, f.region!) : [0, 0, 1, 1];since = time - f.at;
  }
  return currentView(from, to, since);
}
const currentView = (from: Region, to: Region, since: number): Region => { const t = smooth(since / 0.9);return from.map((v, i) => v + (to[i] - v) * t) as Region; };
/** A zoom region widened to the image's own shape, so a zoom never stretches it. */
function aspectRegion(item: ImageItem, r: Region): Region {
  const [x, y, w, h] = r, cx = x + w / 2, cy = y + h / 2;
  const ww = Math.min(1, Math.max(w, h)), hh = ww;
  return [Math.min(1 - ww, Math.max(0, cx - ww / 2)), Math.min(1 - hh, Math.max(0, cy - hh / 2)), ww, hh];
  void item;
}
/** An image: fading in, zooming as its focus says, with its highlights ringed and the rest dimmed. */
function drawImage(g: CanvasRenderingContext2D, item: ImageItem, time: number, p: number, W: number, H: number, kind: BoardKind) {
  const box = fitted(item), x = box.x * W, y = box.y * H, w = box.w * W, h = box.h * H, img = images.get(item.image);
  g.globalAlpha = smooth(p * 1.4);
  g.save();g.beginPath();g.roundRect(x, y, w, h, Math.min(w, h) * 0.012);g.clip();
  if (img) {
    const [vx, vy, vw, vh] = imageView(item, time);
    g.drawImage(img, vx * img.width, vy * img.height, vw * img.width, vh * img.height, x, y, w, h);
  } else { g.fillStyle = 'rgba(128,128,128,0.25)';g.fillRect(x, y, w, h); }
  // The latest highlight: the rest of the picture dimmed, the region ringed.
  const mark = [...item.focus].reverse().find((f) => f.at <= time && f.kind !== 'zoom');
  if (mark?.kind === 'highlight' && mark.region) {
    const a = smooth((time - mark.at) / 0.5), view = imageView(item, time), [rx, ry, rw, rh] = mark.region;
    const hx = x + ((rx - view[0]) / view[2]) * w, hy = y + ((ry - view[1]) / view[3]) * h, hw = (rw / view[2]) * w, hh = (rh / view[3]) * h, pad = Math.min(w, h) * 0.015;
    g.fillStyle = `rgba(8,10,16,${0.55 * a})`;
    g.beginPath();g.rect(x, y, w, h);g.roundRect(hx - pad, hy - pad, hw + pad * 2, hh + pad * 2, pad * 1.5);g.fill('evenodd');
    g.strokeStyle = kind === 'whiteboard' ? '#c0262d' : kind === 'chalkboard' ? '#ffe58a' : '#6d8dff';g.lineWidth = Math.max(3, W * 0.003);g.globalAlpha *= a;
    g.beginPath();g.roundRect(hx - pad, hy - pad, hw + pad * 2, hh + pad * 2, pad * 1.5);g.stroke();
  }
  g.restore();g.globalAlpha = 1;
}

// ---- Fonts ----

const loading = new Map<BoardFont, Promise<void>>();
/** Loads the handwriting fonts these boards use (once per page); draws wait for them in exports. */
export function loadBoardFonts(boards: readonly Board[], base = import.meta.env?.BASE_URL ?? '/'): Promise<void> {
  const wanted = [...new Set(boards.map((b) => b.font))].filter((f) => BOARD_FONTS[f].file);
  return Promise.all(wanted.map((f) => {
    let p = loading.get(f);
    if (!p) {
      const { family, file, weight } = BOARD_FONTS[f];
      const face = new FontFace(family, `url(${base}${file})`, { weight: String(weight) });
      p = face.load().then((loaded) => { document.fonts.add(loaded); }, () => { loading.delete(f); });
      loading.set(f, p);
    }
    return p;
  })).then(() => undefined);
}

// ---- Drawing ----

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => { const t = clamp(v, 0, 1);return t * t * (3 - 2 * t); };
/** How far through its drawing an item is at `time` (0 before it starts, 1 once drawn). */
const progress = (item: Timed, time: number) => (time < item.start ? 0 : item.duration <= 0 ? 1 : clamp((time - item.start) / item.duration, 0, 1));
/** A steady wobble for a hand-drawn line, the same every frame for the same item. */
function wobble(id: string) { let h = 2166136261;for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);return ((h >>> 0) % 1000) / 1000 - 0.5; }

const surfaces = new Map<string, HTMLCanvasElement>();
/** The board's surface, without content: made once per kind and size. */
function surface(kind: BoardKind, W: number, H: number) {
  const key = `${kind}:${W}x${H}`;let c = surfaces.get(key);
  if (c) return c;
  c = document.createElement('canvas');c.width = W;c.height = H;
  const g = c.getContext('2d')!;
  if (kind === 'whiteboard') {
    const grad = g.createLinearGradient(0, 0, W, H);grad.addColorStop(0, '#fbfbf8');grad.addColorStop(1, '#eef0ee');
    g.fillStyle = grad;g.fillRect(0, 0, W, H);
    // Faint ghosts of earlier lessons, as a real board keeps.
    g.globalAlpha = 0.018;g.strokeStyle = '#46506a';g.lineWidth = W * 0.004;
    for (let i = 0; i < 7; i++) { const y = H * (0.15 + i * 0.12);g.beginPath();g.moveTo(W * (0.08 + (i % 3) * 0.1), y);g.bezierCurveTo(W * 0.35, y - H * 0.03, W * 0.55, y + H * 0.03, W * (0.6 + (i % 2) * 0.2), y);g.stroke(); }
    g.globalAlpha = 1;
  } else if (kind === 'chalkboard') {
    g.fillStyle = '#26382d';g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    let seed = 7;const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < d.length; i += 4) { const n = (rand() - 0.5) * 14;d[i] += n;d[i + 1] += n;d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    // Faint streaks where earlier lessons were wiped away.
    g.filter = `blur(${Math.round(W * 0.012)}px)`;
    for (let i = 0; i < 7; i++) {
      g.fillStyle = `rgba(232,238,226,${0.025 + rand() * 0.025})`;
      g.beginPath();g.ellipse(rand() * W, (0.1 + rand() * 0.8) * H, (0.15 + rand() * 0.2) * W, (0.03 + rand() * 0.04) * H, (rand() - 0.5) * 0.12, 0, Math.PI * 2);g.fill();
    }
    g.filter = 'none';
  } else {
    const grad = g.createLinearGradient(0, 0, 0, H);grad.addColorStop(0, '#1d2230');grad.addColorStop(1, '#12151d');
    g.fillStyle = grad;g.fillRect(0, 0, W, H);
  }
  surfaces.set(key, c);
  return c;
}
let grain: CanvasPattern | null | undefined;
/** Chalk lets the board show through its strokes. */
function chalkGrain(g: CanvasRenderingContext2D) {
  if (grain !== undefined) return grain;
  const c = document.createElement('canvas');c.width = c.height = 128;
  const x = c.getContext('2d')!, img = x.createImageData(128, 128);
  let seed = 11;const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i + 3] = rand() < 0.22 ? 150 + rand() * 105 : 0; }
  x.putImageData(img, 0, 0);
  return (grain = g.createPattern(c, 'repeat'));
}
let layer: HTMLCanvasElement | undefined;

/** Draws a board as it stands at `time` onto a W × H canvas: its surface and every item shown by then. */
export function drawBoard(ctx: CanvasRenderingContext2D, board: Board, time: number, W: number, H: number) {
  ctx.save();
  ctx.drawImage(surface(board.kind, W, H), 0, 0, W, H);
  // Items before the last clear are gone, or wiping away while the clear runs.
  let from = 0, wipe: { index: number; p: number } | undefined;
  board.items.forEach((item, i) => {
    if (item.type !== 'clear' || time < item.start) return;
    const p = progress(item, time);
    if (p >= 1) { from = i + 1;wipe = undefined; } else wipe = { index: i, p };
  });
  // Content goes on its own layer, so chalk can be grained without graining the board.
  layer ??= document.createElement('canvas');
  if (layer.width !== W || layer.height !== H) { layer.width = W;layer.height = H; }
  const g = layer.getContext('2d')!;
  g.clearRect(0, 0, W, H);
  const k = W / BOARD_W, ink = DEFAULT_INK[board.kind];
  const font = BOARD_FONTS[board.font];
  for (let i = from; i < board.items.length; i++) {
    const item = board.items[i];
    // The eraser sweeps left to right, wiping what was written before it; what comes after it is written on top.
    if (i === wipe?.index) g.clearRect(0, 0, smooth(wipe.p) * W, H);
    if (item.type === 'clear' || time < item.start) continue;
    const p = progress(item, time);
    g.save();
    if (item.type === 'write') drawWrite(g, item, p, k, W, H, font, ink);
    else if (item.type === 'shape') drawShape(g, item, p, k, W, H, ink);
    else if (item.type === 'code') drawCode(g, item, time, p, k, W, H, board.kind === 'projector' ? 'screen' : board.kind, `${font.weight} {size}px ${font.file ? `"${font.family}"` : font.family}`);
    else if (item.type === 'terminal') drawTerminal(g, item, p, k, W, H);
    else if (item.type === 'image') drawImage(g, item, time, p, W, H, board.kind);
    else drawSlide(g, item, time, k, W, H, font, ink, board.kind);
    g.restore();
  }
  if (board.kind === 'chalkboard') {
    g.globalCompositeOperation = 'destination-out';g.fillStyle = chalkGrain(g) ?? 'transparent';g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function lineHeight(size: number) { return size * 1.25; }
function setFont(g: CanvasRenderingContext2D, font: typeof BOARD_FONTS[BoardFont], size: number) {
  g.font = `${font.weight} ${size}px ${font.file ? `"${font.family}"` : font.family}`;
}

/** Writing: letter by letter, the letter being written revealed left to right as the pen moves through it. */
function drawWrite(g: CanvasRenderingContext2D, item: WriteItem, p: number, k: number, W: number, H: number, font: typeof BOARD_FONTS[BoardFont], ink: string) {
  const size = item.size * k, lines = item.text.split('\n');
  setFont(g, font, size);
  g.fillStyle = item.color ?? ink;g.textBaseline = 'alphabetic';
  const total = lines.reduce((s, l) => s + [...l].length, 0);
  let left = p * total;
  lines.forEach((line, n) => {
    if (left <= 0) return;
    const chars = [...line], shown = Math.min(chars.length, left);left -= chars.length;
    const width = g.measureText(line).width, x0 = item.align === 'center' ? item.x * W - width / 2 : item.x * W, y = item.y * H + size * 0.8 + n * lineHeight(size);
    const whole = Math.floor(shown), part = shown - whole;
    const done = chars.slice(0, whole).join(''), doneW = g.measureText(done).width;
    if (whole >= chars.length) { g.fillText(line, x0, y);return; }
    g.fillText(done, x0, y);
    if (part > 0) {
      // The letter in progress: drawn whole, shown only as far as the pen has gone.
      const next = chars[whole], nextW = g.measureText(next).width;
      g.save();g.beginPath();g.rect(x0 + doneW, y - size * 1.2, nextW * part, size * 1.6);g.clip();g.fillText(next, x0 + doneW, y);g.restore();
    }
  });
}

/** A shape traced out over its duration. */
function drawShape(g: CanvasRenderingContext2D, item: ShapeItem, p: number, k: number, W: number, H: number, ink: string) {
  const [ax, ay] = [item.from[0] * W, item.from[1] * H], [bx, by] = [item.to[0] * W, item.to[1] * H];
  g.strokeStyle = item.color ?? ink;g.fillStyle = item.color ?? ink;g.lineWidth = item.width * k;g.lineCap = 'round';g.lineJoin = 'round';
  const bow = wobble(item.id) * 0.04;
  // Builds the path, then shows the first p of its length.
  const trace = (path: (c: CanvasRenderingContext2D) => number, amount = p) => {
    const length = path(g);
    g.setLineDash([Math.max(0.001, length * amount), length + 1]);g.stroke();g.setLineDash([]);
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => (c: CanvasRenderingContext2D) => {
    const mx = (x0 + x1) / 2 - (y1 - y0) * bow, my = (y0 + y1) / 2 + (x1 - x0) * bow;
    c.beginPath();c.moveTo(x0, y0);c.quadraticCurveTo(mx, my, x1, y1);
    return Math.hypot(x1 - x0, y1 - y0) * (1 + Math.abs(bow));
  };
  const head = (x0: number, y0: number, x1: number, y1: number, show: number) => {
    if (show <= 0) return;
    const a = Math.atan2(y1 - y0, x1 - x0), s = Math.min(Math.hypot(x1 - x0, y1 - y0) * 0.3, 18 * k + g.lineWidth * 2.2) * show;
    g.beginPath();g.moveTo(x1 - Math.cos(a - 0.45) * s, y1 - Math.sin(a - 0.45) * s);g.lineTo(x1, y1);g.lineTo(x1 - Math.cos(a + 0.45) * s, y1 - Math.sin(a + 0.45) * s);g.stroke();
  };
  switch (item.shape) {
    case 'line': trace(line(ax, ay, bx, by));break;
    case 'underline': {
      g.lineWidth *= 0.8;
      trace((c) => { c.beginPath();c.moveTo(ax, ay);const n = 6;for (let i = 1; i <= n; i++) { const t = i / n;c.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t + Math.sin(t * 9 + bow * 20) * 2.2 * k); }return Math.hypot(bx - ax, by - ay); });
      break;
    }
    case 'arrow': trace(line(ax, ay, bx, by), clamp(p / 0.8, 0, 1));head(ax, ay, bx, by, clamp((p - 0.8) / 0.2, 0, 1));break;
    case 'box': trace((c) => { c.beginPath();c.moveTo(ax, ay);c.lineTo(bx, ay + bow * 6 * k);c.lineTo(bx, by);c.lineTo(ax, by - bow * 6 * k);c.closePath();return 2 * (Math.abs(bx - ax) + Math.abs(by - ay)); });break;
    case 'circle': {
      // A circle goes round its box with room to spare: an ellipse through the box's corners would touch the words in
      // them, so it is drawn wider still, with padding.
      const cx = (ax + bx) / 2, cy = (ay + by) / 2, rx = (Math.abs(bx - ax) / 2) * 1.16 + 18 * k, ry = (Math.abs(by - ay) / 2) * 1.32 + 16 * k;
      // A hand-drawn circle overshoots where it started.
      trace((c) => { c.beginPath();c.ellipse(cx, cy, rx, ry, bow, -Math.PI * 0.6, Math.PI * 1.5);return Math.PI * 1.05 * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))); });
      break;
    }
    case 'tick': trace((c) => { const w = bx - ax, h = by - ay;c.beginPath();c.moveTo(ax, ay + h * 0.55);c.lineTo(ax + w * 0.35, by);c.lineTo(bx, ay);return Math.hypot(w * 0.35, h * 0.45) + Math.hypot(w * 0.65, h); });break;
    case 'cross': trace(line(ax, ay, bx, by), clamp(p * 2, 0, 1));if (p > 0.5) trace(line(bx, ay, ax, by), clamp(p * 2 - 1, 0, 1));break;
    case 'axes': drawAxes(g, item, p, ax, ay, bx, by, trace, line, head);break;
    case 'graph': {
      drawAxes(g, item, clamp(p / 0.35, 0, 1), ax, ay, bx, by, trace, line, head);
      const [x0, x1, y0, y1] = item.range ?? [-5, 5, -5, 5], f = parseExpression(item.fn ?? 'x');
      const px = (v: number) => ax + ((v - x0) / (x1 - x0)) * (bx - ax), py = (v: number) => by - ((v - y0) / (y1 - y0)) * (by - ay);
      const q = clamp((p - 0.35) / 0.65, 0, 1);
      if (q <= 0) break;
      g.save();g.beginPath();g.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));g.clip();
      g.lineWidth = item.width * k * 1.1;g.beginPath();
      const steps = 240, last = Math.round(steps * q);let pen = false;
      for (let i = 0; i <= last; i++) {
        const v = x0 + ((x1 - x0) * i) / steps, w = f(v);
        if (!Number.isFinite(w) || Math.abs(w) > (y1 - y0) * 50) { pen = false;continue; }
        if (pen) g.lineTo(px(v), py(w));else { g.moveTo(px(v), py(w));pen = true; }
      }
      g.stroke();g.restore();
      break;
    }
  }
}

function drawAxes(g: CanvasRenderingContext2D, item: ShapeItem, p: number, ax: number, ay: number, bx: number, by: number,
  trace: (path: (c: CanvasRenderingContext2D) => number, amount?: number) => void,
  line: (x0: number, y0: number, x1: number, y1: number) => (c: CanvasRenderingContext2D) => number,
  head: (x0: number, y0: number, x1: number, y1: number, show: number) => void) {
  // The axes cross at zero when the range includes it, otherwise at the lower left.
  const [x0, x1, y0, y1] = item.range ?? [-5, 5, -5, 5];
  const ox = ax + clamp((0 - x0) / (x1 - x0), 0, 1) * (bx - ax), oy = by - clamp((0 - y0) / (y1 - y0), 0, 1) * (by - ay);
  const width = g.lineWidth;g.lineWidth = width * 0.7;
  trace(line(ax, oy, bx, oy), clamp(p * 2, 0, 1));head(ax, oy, bx, oy, clamp(p * 2 - 0.8, 0, 1));
  trace(line(ox, by, ox, ay), clamp(p * 2 - 1, 0, 1));head(ox, by, ox, ay, clamp((p - 0.9) * 10, 0, 1));
  g.lineWidth = width;
}

/** The accent of slides: Ara's blue on a screen, the ink's own colour on a board. */
const SLIDE_ACCENT: Record<BoardKind, string> = { screen: '#6d8dff', projector: '#6d8dff', whiteboard: '#c0262d', chalkboard: '#ffe58a' };
/** A slide: its title with a rule under it, then each bullet in turn across its duration. */
function drawSlide(g: CanvasRenderingContext2D, item: SlideItem, time: number, k: number, W: number, H: number, font: typeof BOARD_FONTS[BoardFont], ink: string, kind: BoardKind) {
  const steps = 1 + item.bullets.length, each = item.duration / steps;
  const shown = (i: number) => smooth(item.duration <= 0 ? 1 : (time - item.start - i * each) / Math.max(0.25, Math.min(each, 0.5)));
  const left = W * 0.08, accent = SLIDE_ACCENT[kind];
  g.textBaseline = 'alphabetic';
  // The title, fitted to the width.
  let titleSize = 104 * k;setFont(g, font, titleSize);
  while (g.measureText(item.title).width > W * 0.84 && titleSize > 40 * k) { titleSize -= 4 * k;setFont(g, font, titleSize); }
  const a0 = shown(0), titleY = H * 0.2;
  g.globalAlpha = a0;g.fillStyle = ink;g.fillText(item.title, left, titleY + (1 - a0) * 12 * k);
  g.fillStyle = accent;g.fillRect(left, titleY + titleSize * 0.32, Math.min(W * 0.12, 150 * k) * a0, Math.max(4, 8 * k));
  // Bullets share the space below the title.
  let size = 62 * k;setFont(g, font, size);
  while (item.bullets.some((b) => g.measureText(b).width > W * 0.8) && size > 30 * k) { size -= 2 * k;setFont(g, font, size); }
  const gap = Math.min(size * 1.75, (H * 0.68) / Math.max(1, item.bullets.length));
  let y = H * 0.4;
  item.bullets.forEach((b, i) => {
    const a = shown(i + 1);if (a <= 0) return;
    g.globalAlpha = a;const dx = (1 - a) * 18 * k;
    g.fillStyle = accent;g.fillRect(left + dx, y - size * 0.42, size * 0.24, size * 0.24);
    g.fillStyle = ink;g.fillText(b, left + size * 0.62 + dx, y);
    y += gap;
  });
  g.globalAlpha = 1;
}
