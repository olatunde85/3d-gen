/**
 * The film and game guides that Studio and Play give AI assistants, split into topics for the MCP server: a whole
 * guide is larger than many assistants accept from one tool call. A section starts at a heading line in capitals.
 * No answer is longer than LIMIT characters: the overview hands its largest sections out as topics, and a long topic
 * comes in numbered parts (JSON is split into valid pieces, each saying where in the whole it belongs).
 */
export interface GuidePart { key: string; title: string; text: string }

/** The longest single answer, in characters (about 7–10k tokens: inside every assistant's tool-result limit). */
export const LIMIT = 20_000;
/** Sections at least this long are separate topics; shorter ones (core rules) stay in the overview. */
const TOPIC_MIN = 4000;
const HEADING = /^[A-Z0-9][A-Z0-9 ,'’()\-—/&:.]{5,}$/;
const keyOf = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The overview (introduction and short sections) and the topics an assistant can ask for. */
export function splitGuide(text: string): { overview: string; topics: GuidePart[] } {
  const lines = text.split('\n'), sections: { title: string; text: string }[] = [];
  let start = 0, title = '';
  const flush = (end: number) => { const body = lines.slice(start, end).join('\n');if (body.trim()) sections.push({ title, text: body }); };
  lines.forEach((line, i) => { const t = line.trim();if (i > 0 && HEADING.test(t) && t === t.toUpperCase()) { flush(i);start = i;title = t.replace(/:$/, ''); } });
  flush(lines.length);
  const topic = new Set(sections.filter((s) => s.title && s.text.length >= TOPIC_MIN));
  // Keep the overview within one answer: its largest titled sections become topics too.
  const size = () => sections.filter((s) => !topic.has(s)).reduce((n, s) => n + s.text.length + 1, 0) + 1500;
  for (const s of [...sections].filter((s) => s.title && !topic.has(s)).sort((a, b) => b.text.length - a.text.length)) { if (size() <= LIMIT) break;topic.add(s); }
  return {
    overview: sections.filter((s) => !topic.has(s)).map((s) => s.text).join('\n'),
    topics: sections.filter((s) => topic.has(s)).map((s) => ({ key: keyOf(s.title), title: s.title, text: s.text })),
  };
}

type Path = (string | number)[];
const where = (path: Path) => (path.length ? path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '') : 'the top level');

/** Pieces of a JSON value no longer than `max`, each with the path it sits at in the whole. */
function jsonPieces(value: unknown, max: number, path: Path = []): { path: Path; value: unknown }[] {
  if (JSON.stringify(value).length <= max || !value || typeof value !== 'object') return [{ path, value }];
  const pieces: { path: Path; value: unknown }[] = [], array = Array.isArray(value);
  let group: [string | number, unknown][] = [], used = 2;
  const close = () => { if (group.length) pieces.push({ path, value: array ? group.map(([, v]) => v) : Object.fromEntries(group) });group = [];used = 2; };
  const entries: [string | number, unknown][] = array ? (value as unknown[]).map((v, i) => [i, v]) : Object.entries(value as object);
  for (const [k, v] of entries) {
    const n = JSON.stringify(v).length + String(k).length + 4;
    if (n > max) { close();pieces.push(...jsonPieces(v, max, [...path, k]));continue; }
    if (used + n > max) close();
    group.push([k, v]);used += n;
  }
  close();
  return pieces;
}

/** Split one long line: JSON into labelled valid pieces, prose at sentence ends. */
function splitLine(line: string, max: number): string[] {
  const trimmed = line.trim();
  if (/^[[{]/.test(trimmed)) {
    try {
      const value = JSON.parse(trimmed);
      return jsonPieces(value, max - 200).map((p) => (p.path.length ? `JSON at ${where(p.path)} (${Array.isArray(p.value) ? 'items of that array' : 'entries of that object'}): ` : '') + JSON.stringify(p.value));
    } catch { /* Not JSON: split as prose. */ }
  }
  const out: string[] = [];let rest = line;
  while (rest.length > max) { let cut = rest.lastIndexOf('. ', max);if (cut < max / 2) cut = max;out.push(rest.slice(0, cut + 1));rest = rest.slice(cut + 1); }
  return [...out, rest];
}

/** A text in parts no longer than LIMIT, broken between lines (and inside a line only when it must be). */
export function textParts(text: string, max = LIMIT - 400): string[] {
  const parts: string[] = [];let cur: string[] = [], used = 0;
  for (const line of text.split('\n').flatMap((l) => (l.length > max ? splitLine(l, max) : [l]))) {
    if (used + line.length + 1 > max && cur.length) { parts.push(cur.join('\n'));cur = [];used = 0; }
    cur.push(line);used += line.length + 1;
  }
  if (cur.length) parts.push(cur.join('\n'));
  return parts;
}

/** One answer from a guide: the overview with a list of topics, or one topic (or one part of a long topic). */
export function guideAnswer(text: string, topic: unknown, tool: string, extra = '', intro?: string): string {
  const split = splitGuide(text);
  // With a short intro, the guide's own overview becomes the core-rules topic.
  const topics = intro ? [{ key: 'core-rules', title: 'CORE RULES (the full staging rules, several scenes and character reference)', text: split.overview }, ...split.topics] : split.topics;
  const overview = intro ?? split.overview;
  const keys = topics.map((t) => ({ t, parts: textParts(t.text) }));
  if (topic === undefined || topic === '') {
    return `${overview}${extra}\n\nMORE TOPICS (call ${tool} with { "topic": "<key>" } for each one you need; a topic in parts continues in <key>-2, <key>-3 and so on)\n${keys.map(({ t, parts }) => `- ${t.key}: ${t.title.toLowerCase()} (${Math.round(t.text.length / 1000)}k characters${parts.length > 1 ? `, ${parts.length} parts` : ''})`).join('\n')}`;
  }
  const match = /^(.*?)(?:-(\d+))?$/.exec(String(topic))!;
  for (const [key, n] of [[String(topic), 1], [match[1], Number(match[2] ?? 1)]] as const) {
    const found = keys.find(({ t }) => t.key === key);
    if (!found || n < 1 || n > found.parts.length) continue;
    const many = found.parts.length > 1;
    return `${many && n > 1 ? `${found.t.title} (part ${n} of ${found.parts.length})\n` : ''}${found.parts[n - 1]}${many ? `\n\n(Part ${n} of ${found.parts.length}.${n < found.parts.length ? ` Continue with topic "${found.t.key}-${n + 1}".` : ''})` : ''}`;
  }
  throw Error(`Unknown topic "${String(topic)}". Use one of: ${keys.map(({ t, parts }) => (parts.length > 1 ? `${t.key} (then ${t.key}-2${parts.length > 2 ? ` to ${t.key}-${parts.length}` : ''})` : t.key)).join(', ')}.`);
}
