/**
 * Writing lessons with an AI assistant: the guide it follows, Ara's checks on what it writes, and what to look over
 * before building it. Used by Assist in Ara Educate and by the ara3d MCP server (so nothing here needs a browser).
 */
import { PRESETS } from '../core/params';
import { CODE_LANGUAGES } from '../studio/code';
import { EXPRESSION_FUNCTIONS } from '../studio/expression';
import { BOARD_FONTS } from '../studio/board';
import { LESSON_SETS, MAX_STEPS, WRITING_BOARDS, compileLesson, lessonLength, parseLesson, reviewLesson, stepTimes, type Lesson } from './lesson';
import { TEMPLATES } from './templates';

/** Teachers that suit a lesson, by the look of their clothes. */
export const TEACHERS = ['The Doctor', 'The Lab Scientist', 'Businesswoman', 'The Female Executive', 'The Corporate High-Flier', 'The Nurse', 'The Chef', 'The Photographer', 'The Airline Pilot', 'The Explorer', 'The Adventurer', 'Athletic man', 'Athletic woman', 'The Gym Instructor', 'The Paramedic'].filter((n) => PRESETS[n]);
const isMan = (preset: string) => (PRESETS[preset]?.gender ?? 0.5) >= 0.5;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A lesson's JSON without what the guide doesn't need (images, its view). */
const bare = (lesson: Lesson) => JSON.stringify({ ...lesson, view: undefined, steps: lesson.steps.map(({ id: _id, ...s }) => s) });

/** Everything an AI assistant needs to write a lesson, with the description (and the lesson open now, to revise it). */
export function lessonGuide(brief: string, current?: Lesson): string {
  const example = TEMPLATES.find((t) => t.id === 'equation')!.lesson;
  return `You are writing a lesson for Ara Educate, which turns it into a video: a 3D teacher in a room writes on a board, shows slides and code on a projector screen that rolls down when needed, points at things and speaks every line. Reply with ONE JSON object and nothing else (no commentary, no code fences).

THE LESSON TO WRITE
${brief.trim() || '(No description given: write a short, friendly lesson on a topic of your choice.)'}
${current ? `\nREVISE THIS LESSON (the one open now). Keep what the description doesn't ask to change:\n${bare(current)}\n` : ''}
FORMAT
{
  "kind": "ara-lesson", "version": 1,
  "title": "up to 80 characters",
  "set": one of ${Object.keys(LESSON_SETS).map((s) => `"${s}"`).join(', ')},
  "board": { "kind": ${WRITING_BOARDS.map((b) => `"${b}"`).join(' or ')}, "font": ${Object.keys(BOARD_FONTS).map((f) => `"${f}"`).join(', ')} (handwriting; "kalam" is a good default) },
  "teacher": { "preset": one of ${TEACHERS.map((t) => `"${t}" (${isMan(t) ? 'man' : 'woman'})`).join(', ')} },
  "voice": "F1" or "F2" for a woman, "M1" or "M2" for a man (match the teacher),
  "captions": true, "aspect": "landscape",
  "steps": [ ...up to ${MAX_STEPS} steps, in order... ]
}

STEPS
Every step can have "say": what the teacher says while it happens (up to 600 characters), and "pause": seconds to wait after it.
- {"type":"write","text":"..."}: handwriting on the board. Short: up to 3 lines (use \\n), each up to 22 characters. Formulas and key words, not sentences. Use real symbols: × ÷ − ² ³ √ π ≤ ≥ ≠ →, and write fractions on one line (3/8). Optional "color": "#c0262d" (red), "#1e8a3a" (green), "#1f3a93" (blue).
- {"type":"shape","shape":"underline"|"circle"|"box"|"tick"|"cross"}: marks the writing just before it.
- {"type":"shape","shape":"graph","fn":"2*x+1","range":[-5,5,-5,5]}: axes with a curve. fn is in x with + - * / ^, parentheses, pi, e and ${EXPRESSION_FUNCTIONS.join(', ')}. range is [xMin, xMax, yMin, yMax]. {"type":"shape","shape":"axes"} draws empty axes.
- {"type":"shape","shape":"arrow"|"line","from":[x,y],"to":[x,y]}: positions from 0 to 1 across and down the board. Only when you know the layout; prefer the marks above.
- {"type":"slide","title":"...","bullets":["...", "..."]}: on the projector screen. A title up to 40 characters, up to 5 bullets of up to 50 characters, revealed one by one.
- {"type":"code","lang":${CODE_LANGUAGES.map((l) => `"${l}"`).join('|')},"fileName":"main.py","text":"..."}: code typed into an editor on the screen. Up to 25 lines, each up to 60 characters. Optional "highlights":[{"from":2,"to":3}] (lines lit up after typing), "errors":[{"line":1,"message":"SyntaxError: expected ':'","fix":"the corrected line"}] (a mistake underlined, then fixed), and "before":"the code before" to show it as a change (lines going turn red, new lines green; use the previous code step's exact text to change the code on screen).
- {"type":"terminal","text":"$ python main.py\\nHello"}: a terminal on the screen. Lines starting with "$ " are typed commands; the lines after are their output. It joins code already on the screen.
- {"type":"point"}: the teacher points at what was just written.
- {"type":"talk","say":"..."}: the teacher just talks to the class.
- {"type":"clear"}: wipes the board. The board holds about 10 short lines (two columns); wipe it before starting a new part.
No image steps: the person adds their own pictures after.

HOW TO TEACH WELL
- Open with why it matters, in a sentence or two. Then one idea at a time: write the key point, explain it, give an example, check it. End with a short recap.
- Write the words to be spoken as they are said aloud: "two x plus three equals eleven", not "2x + 3 = 11"; "ten percent", not "10%". Never read code symbols out; say what the code does.
- The board shows the key words; the teacher says the rest. Don't make the teacher read the board word for word.
- Keep each "say" to one or two sentences for a write or mark, a little more for a slide or talk. Speech runs at about 150 words a minute; a lesson can run up to 10 minutes. Aim for the length the description asks for (2 to 3 minutes if it doesn't say).
- Plain, warm, accurate. No made-up facts, quotes or statistics; if you're unsure of something, leave it out.

EXAMPLE (a short lesson in this format)
${bare(example)}
`;
}

/** Reads a lesson an assistant wrote: Ara's own checks, and fixes that need no asking (a voice that suits the teacher). */
export function parseAssistLesson(json: string): Lesson {
  const raw = JSON.parse(json) as Record<string, unknown>;
  // Studio films and other things aren't lessons.
  if (raw.kind !== 'ara-lesson') throw Error('Write an Ara Educate lesson: an object with "kind": "ara-lesson" and "version": 1.');
  const lesson = parseLesson(json);
  if (lesson.steps.some((s) => s.type === 'image')) throw Error('Leave out image steps: the person adds their own pictures after.');
  const preset = lesson.teacher.preset ?? 'The Doctor';
  if (!PRESETS[preset]) throw Error(`teacher.preset is one of ${TEACHERS.join(', ')}.`);
  if (!/^[FM][12]$/.test(lesson.voice) || (lesson.voice[0] === 'M') !== isMan(preset)) lesson.voice = isMan(preset) ? 'M1' : 'F1';
  // Ara's own checks on everything drawn and said (and the 10-minute limit).
  const kept = new Map(stepTimes);
  try { compileLesson(lesson); } finally { stepTimes.clear();kept.forEach((v, k) => stepTimes.set(k, v)); }
  return lesson;
}

/** What to look over before building: the lesson's length and parts, and anything that may not look or sound right. */
export function describeLesson(lesson: Lesson) {
  const count = (type: string) => lesson.steps.filter((s) => s.type === type).length;
  const parts = [['write', 'written on the board'], ['shape', 'marks and graphs'], ['slide', 'slides'], ['code', 'code'], ['terminal', 'terminals'], ['talk', 'talks']]
    .map(([type, label]) => [count(type), label] as const).filter(([n]) => n).map(([n, label]) => `${n} ${label}`);
  const length = lessonLength(lesson), warnings = reviewLesson(lesson);
  lesson.steps.forEach((s, i) => {
    if (s.type === 'write' && (s.text ?? '').split('\n').some((l) => [...l].length > 26)) warnings.push(`Step ${i + 1}: long writing is written small. Keep board writing short and say the rest.`);
    if (s.type === 'slide' && ((s.bullets?.length ?? 0) > 5 || (s.bullets ?? []).some((b) => b.length > 60))) warnings.push(`Step ${i + 1}: a busy slide. Up to 5 short points read best.`);
    if ((s.say?.length ?? 0) > 450) warnings.push(`Step ${i + 1}: a long speech (about ${Math.round((s.say!.split(/\s+/).length * 0.36))} seconds) over one step. Splitting it keeps the board moving.`);
    if (s.type !== 'talk' && s.type !== 'clear' && s.type !== 'shape' && !s.say?.trim()) warnings.push(`Step ${i + 1}: the teacher says nothing here.`);
  });
  if (length < 30) warnings.push('Under half a minute long.');
  return {
    headline: `${lesson.title} · ${fmt(length)}`,
    facts: [`${lesson.steps.length} steps: ${parts.join(', ')}`, `${LESSON_SETS[lesson.set]?.label ?? lesson.set}, ${lesson.board.kind}`, `${(lesson.teacher.preset ?? 'The Doctor').replace(/^The /, '')}, voice ${lesson.voice}`, 'Check facts, figures and spelling before you share it'],
    // In step order, the first eight.
    warnings: warnings.sort((a, b) => (Number(a.match(/^Step (\d+)/)?.[1]) || 1e9) - (Number(b.match(/^Step (\d+)/)?.[1]) || 1e9)).slice(0, 8),
  };
}

