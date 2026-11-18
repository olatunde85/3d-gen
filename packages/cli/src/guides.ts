/**
 * The film and game guides that Studio and Play give AI assistants, split into topics for the MCP server: a whole
 * guide is larger than many assistants accept from one tool call. A section starts at a heading line in capitals.
 */
export interface GuidePart { key: string; title: string; text: string }

/** Sections at least this long are separate topics; shorter ones (core rules) stay in the overview. */
const TOPIC_MIN = 4000;
const HEADING = /^[A-Z0-9][A-Z0-9 ,'’()\-—/&:.]{5,}$/;

/** The overview (introduction and short sections) and the topics an assistant can ask for. */
export function splitGuide(text: string): { overview: string; topics: GuidePart[] } {
  const lines = text.split('\n'), sections: { title: string; text: string }[] = [];
  let start = 0, title = '';
  const flush = (end: number) => { const body = lines.slice(start, end).join('\n');if (body.trim()) sections.push({ title, text: body }); };
  lines.forEach((line, i) => { const t = line.trim();if (i > 0 && HEADING.test(t) && t === t.toUpperCase()) { flush(i);start = i;title = t.replace(/:$/, ''); } });
  flush(lines.length);
  const topics: GuidePart[] = [], overview: string[] = [];
  for (const s of sections) {
    if (s.title && s.text.length >= TOPIC_MIN) topics.push({ key: s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title: s.title, text: s.text });
    else overview.push(s.text);
  }
  return { overview: overview.join('\n'), topics };
}

/** One answer from a guide: the overview with a list of topics, or one topic. */
export function guideAnswer(text: string, topic: unknown, tool: string): string {
  const { overview, topics } = splitGuide(text);
  if (topic === undefined || topic === '') return `${overview}\n\nMORE TOPICS (call ${tool} with { "topic": "<key>" } for each one you need)\n${topics.map((t) => `- ${t.key}: ${t.title.toLowerCase()} (${Math.round(t.text.length / 1000)}k characters)`).join('\n')}`;
  const found = topics.find((t) => t.key === topic);
  if (!found) throw Error(`Unknown topic "${String(topic)}". Use one of: ${topics.map((t) => t.key).join(', ')}.`);
  return found.text;
}
