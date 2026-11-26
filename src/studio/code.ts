/**
 * Code on a board (Ara Educate): a small syntax highlighter for the languages lessons teach, and drawing code that
 * types itself out, with highlighted lines, errors underlined in red and fixed, and a terminal whose commands type
 * and whose output follows. On a screen it is an editor window; on a whiteboard or chalkboard it is handwritten.
 */
export const CODE_LANGUAGES = ['javascript', 'python', 'html', 'css', 'sql', 'text'] as const;
export type CodeLanguage = typeof CODE_LANGUAGES[number];
export type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'tag' | 'attr' | 'punct' | 'plain';
export interface Token { kind: TokenKind; text: string }

const KEYWORDS: Record<CodeLanguage, string[]> = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'of', 'in', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'true', 'false', 'null', 'undefined', 'this', 'typeof', 'instanceof'],
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'pass', 'break', 'continue', 'True', 'False', 'None', 'global', 'yield', 'async', 'await', 'print'],
  html: [],
  css: ['@media', '@import', '!important'],
  sql: ['select', 'from', 'where', 'and', 'or', 'not', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop', 'join', 'left', 'right', 'inner', 'on', 'group', 'by', 'order', 'asc', 'desc', 'limit', 'as', 'count', 'sum', 'avg', 'min', 'max', 'distinct', 'null', 'primary', 'key', 'int', 'text', 'varchar'],
  text: [],
};

/** Splits one line of code into coloured pieces. Block comments and strings that span lines aren't followed across lines. */
export function highlight(line: string, lang: CodeLanguage): Token[] {
  if (lang === 'text') return [{ kind: 'plain', text: line }];
  const out: Token[] = [], push = (kind: TokenKind, text: string) => { if (text) out.push({ kind, text }); };
  if (lang === 'html') {
    // Tags, their attributes and values; text between them is plain.
    const re = /(<!--.*?-->)|(<\/?)([a-zA-Z][\w-]*)|([a-zA-Z-:]+)(?==)|("[^"]*"|'[^']*')|(\/?>)|([^<"']+?(?=<|$)|.)/g;
    let inTag = false;
    for (const m of line.matchAll(re)) {
      if (m[1]) push('comment', m[1]);
      else if (m[3]) { push('punct', m[2]);push('tag', m[3]);inTag = true; }
      else if (m[4] && inTag) push('attr', m[4]);
      else if (m[5] && inTag) push('string', m[5]);
      else if (m[6]) { push('punct', m[6]);inTag = false; }
      else push(inTag && /^\s*=\s*$/.test(m[0]) ? 'punct' : 'plain', m[0]);
    }
    return out;
  }
  const comment = lang === 'python' ? /#.*/y : lang === 'sql' ? /--.*/y : /\/\/.*|\/\*.*?\*\//y;
  const words = new Set(lang === 'sql' ? KEYWORDS.sql : KEYWORDS[lang]);
  let i = 0;
  const at = (re: RegExp) => { re.lastIndex = i;const m = re.exec(line);return m ? m[0] : ''; };
  while (i < line.length) {
    let m: string;
    if ((m = at(comment))) push('comment', m);
    else if ((m = at(/"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|`(?:\\.|[^`\\])*`?/y))) push('string', m);
    else if ((m = at(/\d+(?:\.\d+)?(?:px|em|rem|%|s|ms|vh|vw)?\b/y))) push('number', m);
    else if (lang === 'css' && (m = at(/[#.]?[a-zA-Z_-][\w-]*(?=\s*[{,])/y))) push('tag', m);
    else if (lang === 'css' && (m = at(/[a-zA-Z-]+(?=\s*:)/y))) push('attr', m);
    else if (lang === 'css' && (m = at(/#[0-9a-fA-F]{3,8}\b/y))) push('number', m);
    else if ((m = at(/@?[A-Za-z_$][\w$]*!?/y))) {
      const word = lang === 'sql' ? m.toLowerCase() : m;
      push(words.has(word) ? 'keyword' : /^\s*\(/.test(line.slice(i + m.length)) ? 'function' : 'plain', m);
    } else if ((m = at(/\s+/y))) push('plain', m);
    else { m = line[i];push('punct', m); }
    i += m.length;
  }
  return out;
}

/** Colours for each kind of piece: an editor's dark theme on a screen, coloured inks on boards. */
export const CODE_THEMES = {
  screen: { keyword: '#c792ea', string: '#c3e88d', comment: '#697098', number: '#f78c6c', function: '#82aaff', tag: '#f07178', attr: '#ffcb6b', punct: '#89ddff', plain: '#e6e9f0' },
  whiteboard: { keyword: '#7b2fa8', string: '#1e7a35', comment: '#7c8494', number: '#c45a10', function: '#1f3a93', tag: '#c0262d', attr: '#a1660a', punct: '#3a3f4a', plain: '#1b1b1b' },
  chalkboard: { keyword: '#f3a6ff', string: '#b9f0a0', comment: '#9fb3a6', number: '#ffc58a', function: '#9fd2ff', tag: '#ff9e9e', attr: '#ffe58a', punct: '#e8eadf', plain: '#f4f1e6' },
} as const;

// ---- Code items on a board ----

/** A line highlighted from `start` (for `duration` seconds, or to the end): lines counted from 1, `to` included. */
export interface CodeHighlight { from: number; to: number; start: number; duration?: number }
/** An error underlined on a line from `start`, with an optional message; with a fix, the line is retyped as `fix` at `fixAt`. */
export interface CodeError { line: number; start: number; message?: string; fix?: string; fixAt?: number }
interface Timed { id: string; start: number; duration: number }
/** A change to the code: it shows `from` first (typed out over the item's time), and changes to its text at `at`. */
export interface CodeDiff { from: string; at: number }
export interface CodeItem extends Timed { type: 'code'; text: string; lang: CodeLanguage; x: number; y: number; width: number; size: number; title?: string; lineNumbers: boolean; highlights: CodeHighlight[]; errors: CodeError[]; diff?: CodeDiff }
/** A terminal: lines starting with "$ " are commands, typed out; the lines after each command appear once it has run. */
export interface TerminalItem extends Timed { type: 'terminal'; text: string; x: number; y: number; width: number; size: number }

export const MONO = 'Menlo, "SF Mono", Consolas, "DejaVu Sans Mono", monospace';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => { const t = clamp(v, 0, 1);return t * t * (3 - 2 * t); };
type Kind = keyof typeof CODE_THEMES;

/** The lines a code item shows at `time`: errors fixed by then have their fixed text. */
function linesAt(item: CodeItem, time: number) {
  const lines = item.text.split('\n');
  for (const e of item.errors) if (e.fix !== undefined && time >= (e.fixAt ?? e.start + 1.5)) lines[e.line - 1] = e.fix;
  return lines;
}

// ---- Changes to code ----

/** One line of a change: kept, taken out (only in the code before) or put in (only in the code after). */
export interface DiffRow { kind: 'same' | 'del' | 'add'; text: string }
/** The lines that changed from `a` to `b`, in order: the longest run of lines the two share stays put. */
export function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length, m = b.length, keep = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) keep[i][j] = a[i] === b[j] ? keep[i + 1][j + 1] + 1 : Math.max(keep[i + 1][j], keep[i][j + 1]);
  const rows: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { rows.push({ kind: 'same', text: a[i] });i++;j++; }
    else if (j < m && (i >= n || keep[i][j + 1] >= keep[i + 1][j])) {
      // Taken-out lines come before the lines put in their place.
      if (i < n && keep[i + 1][j] === keep[i][j]) { rows.push({ kind: 'del', text: a[i] });i++; }
      else { rows.push({ kind: 'add', text: b[j] });j++; }
    } else { rows.push({ kind: 'del', text: a[i] });i++; }
  }
  return rows;
}
const diffs = new WeakMap<CodeDiff, DiffRow[]>();
const rowsOf = (item: CodeItem & { diff: CodeDiff }) => {
  let rows = diffs.get(item.diff);
  if (!rows) diffs.set(item.diff, (rows = diffLines(item.diff.from.split('\n'), item.text.split('\n'))));
  return rows;
};
/** A change's moments, in seconds from its start: lines going are marked, then fold away as new ones open up and type in. */
const MARK = 0.6, SWAP = 0.8, BANDS = 1.4;
const typeTime = (rows: DiffRow[]) => Math.min(2.5, Math.max(0.5, rows.reduce((s, r) => s + (r.kind === 'add' ? r.text.trim().length : 0), 0) * 0.035));
/** When a change has played out, its colours gone: the code after it is all that shows. */
export function diffEnd(item: CodeItem): number {
  if (!item.diff) return item.start + item.duration;
  return item.diff.at + MARK + SWAP + typeTime(rowsOf(item as CodeItem & { diff: CodeDiff })) + BANDS;
}
/** Seconds a change takes from `at` until its colours have gone (its new lines are typed BANDS seconds before). */
export function diffTime(before: string, after: string): number {
  return MARK + SWAP + typeTime(diffLines(before.split('\n'), after.split('\n'))) + BANDS;
}

/** A line as drawn: its text, its height (0 to 1 of a line, as it opens or folds), how much of it is typed. */
interface Row { text: string; h: number; show: number; kind: DiffRow['kind']; band: number; number?: number }

/** The rows a code item shows at `time`. */
function rowsAt(item: CodeItem, time: number, p: number): Row[] {
  const typed = (lines: string[]) => {
    let left = Math.floor(p * lines.reduce((s, l) => s + l.length, 0) + 1e-6);
    // A line's number shows once the typing has reached it.
    return lines.map((text, n): Row => { const reached = left > 0 || n === 0 || p >= 1, show = Math.min(text.length, Math.max(0, left));left -= text.length;return { text, h: 1, show, kind: 'same', band: 0, ...(reached ? { number: n + 1 } : {}) }; });
  };
  if (!item.diff) return typed(linesAt(item, time)).map((r, n) => ({ ...r, show: fixedShow(item, n, time) ?? r.show }));
  if (time < item.diff.at) return typed(item.diff.from.split('\n'));
  const diff = rowsOf(item as CodeItem & { diff: CodeDiff }), u = time - item.diff.at, total = typeTime(diff), done = MARK + SWAP + total;
  if (u >= done + BANDS) return typed(linesAt(item, time)).map((r, n) => ({ ...r, show: fixedShow(item, n, time) ?? r.show }));
  // The new lines type in one after another, over the typing time.
  const chars = diff.reduce((s, r) => s + (r.kind === 'add' ? r.text.length : 0), 0);
  let budget = Math.floor(chars * smooth((u - MARK - SWAP) / total) + 1e-6);
  const fade = 1 - smooth((u - done - 0.8) / 0.6), folded = smooth((u - MARK) / SWAP);
  let before = 0, after = 0;
  return diff.map((r): Row => {
    if (r.kind === 'same') { before++;after++;return { text: r.text, h: 1, show: r.text.length, kind: 'same', band: 0, number: u < MARK ? before : after }; }
    if (r.kind === 'del') { before++;return { text: r.text, h: 1 - folded, show: r.text.length, kind: 'del', band: smooth(u / 0.3), number: u < MARK ? before : undefined }; }
    const show = Math.min(r.text.length, Math.max(0, budget));budget -= r.text.length;after++;
    return { text: r.text, h: folded, show: u < MARK + SWAP ? 0 : show, kind: 'add', band: folded * fade, number: u < MARK ? undefined : after };
  });
}
/** How much of a line fixed by `time` is retyped, if it's one. */
function fixedShow(item: CodeItem, n: number, time: number) {
  const fixed = item.errors.find((e) => e.line === n + 1 && e.fix !== undefined && time >= (e.fixAt ?? e.start + 1.5));
  return fixed ? Math.round(fixed.fix!.length * smooth((time - (fixed.fixAt ?? fixed.start + 1.5)) / 0.8)) : undefined;
}

/**
 * Draws a code item. `p` is how far the typing has got (0 to 1); `handFont` is the board's handwriting, used on
 * whiteboards and chalkboards (a screen shows an editor window in a monospaced font). A change (`diff`) shows the code
 * before it first, then marks the lines going in red, folds them away as the new lines open in green and type in.
 */
export function drawCode(g: CanvasRenderingContext2D, item: CodeItem, time: number, p: number, k: number, W: number, H: number, kind: Kind, handFont: string) {
  const screen = kind === 'screen', theme = CODE_THEMES[kind], rows = rowsAt(item, time, p);
  const size = item.size * k, lineH = size * (screen ? 1.55 : 1.4), x0 = item.x * W, y0 = item.y * H, width = item.width * W;
  const font = screen ? `500 ${size}px ${MONO}` : handFont.replace('{size}', String(size));
  const header = screen ? size * 1.9 : 0, gutter = screen && item.lineNumbers ? size * 2.6 : 0, pad = screen ? size * 0.9 : 0;
  const height = header + pad * 2 + rows.reduce((s, r) => s + r.h, 0) * lineH;
  if (screen) {
    // The editor window: a title bar with its three dots and the file's name.
    g.fillStyle = '#1b1f2b';g.beginPath();g.roundRect(x0, y0, width, height, size * 0.5);g.fill();
    g.fillStyle = '#232838';g.beginPath();g.roundRect(x0, y0, width, header, [size * 0.5, size * 0.5, 0, 0]);g.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c;g.beginPath();g.arc(x0 + size * (0.95 + i * 0.75), y0 + header / 2, size * 0.22, 0, Math.PI * 2);g.fill(); });
    if (item.title) { g.fillStyle = '#9aa3bd';g.font = `500 ${size * 0.72}px ${MONO}`;g.textBaseline = 'middle';g.textAlign = 'center';g.fillText(item.title, x0 + width / 2, y0 + header / 2);g.textAlign = 'left'; }
  }
  g.font = font;g.textBaseline = 'alphabetic';
  const top = y0 + header + pad, left = x0 + (screen ? pad + gutter : 0), right = x0 + width - (screen ? pad * 0.5 : 0);
  // Where each row starts, and where each line of the code (as it ends up) is, for highlights and errors.
  const tops: number[] = [], lineTop: number[] = [];
  rows.reduce((y, r) => { tops.push(y);if (r.kind !== 'del') lineTop.push(y);return y + r.h * lineH; }, top);
  const base = (n: number) => (lineTop[n] ?? top + lineH * n) + size * 1.02;
  // Highlights sweep across their lines like a marker pen.
  for (const h of item.highlights) {
    if (time < h.start || (h.duration !== undefined && time > h.start + h.duration)) continue;
    const sweep = smooth((time - h.start) / 0.35), fade = h.duration === undefined ? 1 : smooth((h.start + h.duration - time) / 0.3);
    g.fillStyle = screen ? `rgba(130,170,255,${0.18 * fade})` : kind === 'chalkboard' ? `rgba(255,229,138,${0.22 * fade})` : `rgba(255,226,64,${0.5 * fade})`;
    const y = (lineTop[h.from - 1] ?? top) + lineH * 0.06, w = (width - (left - x0) - (screen ? pad : 0)) * sweep;
    g.fillRect(left - size * 0.3, y, w + size * 0.3, (lineTop[h.to - 1] ?? y) + lineH - y - lineH * 0.12);
  }
  // A change's colours: red behind lines going, green behind lines coming, with a − or + beside them.
  const bands = { del: screen ? [255, 83, 112, 0.2] : kind === 'chalkboard' ? [255, 140, 140, 0.24] : [224, 49, 49, 0.16], add: screen ? [126, 211, 106, 0.18] : kind === 'chalkboard' ? [170, 240, 150, 0.22] : [34, 160, 70, 0.16] };
  rows.forEach((r, n) => {
    if (r.kind === 'same' || r.band <= 0.01 || r.h <= 0.01) return;
    const [cr, cg, cb, ca] = bands[r.kind];
    g.fillStyle = `rgba(${cr},${cg},${cb},${ca * r.band})`;g.fillRect(x0 + (screen ? size * 0.25 : -size * 0.3), tops[n], right - x0 - (screen ? size * 0.25 : -size * 0.3), r.h * lineH);
    g.save();g.globalAlpha = r.band * r.h * r.h;g.fillStyle = r.kind === 'del' ? (screen ? '#ff5370' : '#c92a2a') : (screen ? '#7ed36a' : kind === 'chalkboard' ? '#b9f0a0' : '#1e7a35');
    if (r.h < 1) { g.beginPath();g.rect(x0 - size * 2, tops[n], width + size * 4, r.h * lineH);g.clip(); }
    g.fillText(r.kind === 'del' ? '−' : '+', screen ? x0 + size * 0.5 : x0 - size * 0.9, tops[n] + size * 1.02);g.restore();
  });
  // The text: typed so far; lines folding or opening are clipped to their height.
  let caret: [number, number] | undefined;
  const typing = rows.find((r) => r.show < r.text.length && (r.show > 0 || r.kind === 'add')) ?? rows.find((r) => r.show < r.text.length);
  rows.forEach((r, n) => {
    if (r.h <= 0.01) return;
    const y = tops[n] + size * 1.02;
    g.save();
    if (r.h < 1) { g.beginPath();g.rect(x0 - size * 2, tops[n], width + size * 4, r.h * lineH);g.clip(); }
    if (r.h < 1) g.globalAlpha = r.h * r.h;
    if (screen && item.lineNumbers && r.number !== undefined) { g.fillStyle = r.kind === 'add' && r.band > 0.05 ? '#7ed36a' : r.kind === 'del' ? '#ff5370' : '#4b5370';g.textAlign = 'right';g.fillText(String(r.number), left - size * 0.9, y);g.textAlign = 'left'; }
    let x = left, drawn = 0;
    for (const t of highlight(r.text, item.lang)) {
      if (drawn >= r.show) break;
      const text = t.text.slice(0, r.show - drawn);
      g.fillStyle = theme[t.kind];g.fillText(text, x, y);
      x += g.measureText(text).width;drawn += text.length;
    }
    // Taken out: struck through as it goes.
    if (r.kind === 'del' && r.band > 0.5) { const lead = g.measureText(r.text.slice(0, r.text.length - r.text.trimStart().length)).width;g.strokeStyle = screen ? 'rgba(255,83,112,0.8)' : '#c92a2a';g.lineWidth = Math.max(1.5, size * 0.06);g.beginPath();g.moveTo(left + lead, y - size * 0.32);g.lineTo(left + lead + (x - left - lead) * smooth((r.band - 0.5) * 2), y - size * 0.32);g.stroke(); }
    g.restore();
    if (r === typing) caret = [x, y];
  });
  // The cursor while typing.
  if (caret && typing && typing.show < typing.text.length) { g.fillStyle = screen ? '#82aaff' : theme.plain;g.fillRect(caret[0] + 1, caret[1] - size * 0.85, Math.max(2, size * 0.08), size * 1.05); }
  // Errors: a red wavy underline under the line, and the message beside it, until fixed.
  const lines = linesAt(item, time);
  for (const e of item.errors) {
    const fixedAt = e.fix !== undefined ? e.fixAt ?? e.start + 1.5 : Infinity;
    if (time < e.start || time >= fixedAt) continue;
    const line = lines[e.line - 1] ?? '', lead = line.length - line.trimStart().length;
    const xa = left + g.measureText(line.slice(0, lead)).width, xb = left + g.measureText(line).width, y = base(e.line - 1) + size * 0.22;
    const reach = xa + (xb - xa) * smooth((time - e.start) / 0.3);
    g.strokeStyle = '#ff5370';g.lineWidth = Math.max(1.5, size * 0.07);g.beginPath();
    for (let x = xa, i = 0; x <= reach; x += size * 0.18, i++) { const yy = y + (i % 2 ? size * 0.09 : -size * 0.04);if (x === xa) g.moveTo(x, yy);else g.lineTo(x, yy); }
    g.stroke();
    if (e.message && time - e.start > 0.3) {
      const ms = Math.max(size * 0.78, 18 * k);g.font = `600 ${ms}px ${screen ? MONO : '"Helvetica Neue", Arial, sans-serif'}`;
      const mw = g.measureText(e.message).width + ms * 1.2, mx = Math.min(xb + size, x0 + width - mw - size * 0.3), my = base(e.line - 1) - ms * 1.05;
      g.globalAlpha = smooth((time - e.start - 0.3) / 0.25);
      g.fillStyle = screen ? '#3a1f2a' : '#ffe9ec';g.beginPath();g.roundRect(mx, my - ms * 0.15, mw, ms * 1.45, ms * 0.3);g.fill();
      g.fillStyle = '#ff5370';g.fillText(e.message, mx + ms * 0.6, my + ms * 0.95);
      g.globalAlpha = 1;g.font = font;
    }
  }
}

/** A terminal: each command types out in turn, and the output under it appears once it has typed. */
export function drawTerminal(g: CanvasRenderingContext2D, item: TerminalItem, p: number, k: number, W: number, H: number) {
  const lines = item.text.split('\n'), size = item.size * k, lineH = size * 1.5, x0 = item.x * W, y0 = item.y * H, width = item.width * W;
  const header = size * 1.6, pad = size * 0.8, height = header + pad * 2 + lines.length * lineH;
  g.fillStyle = '#0d0f14';g.beginPath();g.roundRect(x0, y0, width, height, size * 0.45);g.fill();
  g.fillStyle = '#1a1d26';g.beginPath();g.roundRect(x0, y0, width, header, [size * 0.45, size * 0.45, 0, 0]);g.fill();
  g.fillStyle = '#8a91a8';g.font = `500 ${size * 0.7}px ${MONO}`;g.textBaseline = 'middle';g.fillText('Terminal', x0 + pad, y0 + header / 2);
  g.font = `500 ${size}px ${MONO}`;g.textBaseline = 'alphabetic';
  // Commands share the typing time; output shows as soon as the command before it is typed.
  const commands = lines.map((l, i) => [l, i] as const).filter(([l]) => l.startsWith('$ '));
  const typed = commands.reduce((s, [l]) => s + l.length - 2, 0);
  let budget = p * typed, open = true, caret: [number, number] | undefined;
  lines.forEach((line, n) => {
    if (!open) return;
    const y = y0 + header + pad + lineH * n + size * 1.02;
    if (line.startsWith('$ ')) {
      const cmd = line.slice(2), shown = Math.min(cmd.length, Math.floor(budget + 1e-6));budget -= cmd.length;
      g.fillStyle = '#28c840';g.fillText('$', x0 + pad, y);
      g.fillStyle = '#e6e9f0';g.fillText(cmd.slice(0, shown), x0 + pad + size * 1.3, y);
      if (shown < cmd.length) { caret = [x0 + pad + size * 1.3 + g.measureText(cmd.slice(0, shown)).width, y];open = false; }
    } else { g.fillStyle = /error|fail|traceback/i.test(line) ? '#ff5370' : '#b4bccf';g.fillText(line, x0 + pad, y); }
  });
  if (caret) { g.fillStyle = '#e6e9f0';g.fillRect(caret[0] + 1, caret[1] - size * 0.85, size * 0.55, size * 1.05); }
}
