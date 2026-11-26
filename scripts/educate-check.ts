/**
 * Checks Ara Educate's lesson format without a browser: every template opens, plays clean (nothing written over
 * anything else) and keeps to the published schema; the schema knows every field Educate reads; the guide for AI
 * assistants offers only what Educate can do; and what an assistant writes is checked and fixed as Assist does.
 *   npx tsx scripts/educate-check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LESSON_SETS, STEP_FIELDS, compileLesson, lessonLength, parseLesson, reviewLesson } from '../src/educate/lesson';
import { lessonSchema } from '../src/educate/schema';
import { TEMPLATES } from '../src/educate/templates';
import { describeLesson, lessonGuide, parseAssistLesson } from '../src/educate/guide';
import { SHAPES } from '../src/studio/board';

type Schema = Record<string, any>;
/** Enough of JSON Schema for the lesson schema: types, const, enum, lengths, counts, ranges, patterns, properties. */
function validate(value: unknown, schema: Schema, at = 'lesson'): string[] {
  const problems: string[] = [];
  if ('const' in schema && value !== schema.const) problems.push(`${at}: should be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${at}: ${JSON.stringify(value)} isn't one of the choices`);
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'number' && Number.isInteger(value) && schema.type === 'integer' ? 'integer' : typeof value;
  if (schema.type && schema.type !== type && !(schema.type === 'number' && type === 'number')) problems.push(`${at}: should be ${schema.type}`);
  if (typeof value === 'string') {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${at}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${at}: doesn't match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${at}: fewer than ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at}: more than ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => problems.push(...validate(v, schema.items, `${at}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) problems.push(`${at}: needs ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (schema.properties?.[k]) problems.push(...validate(v, schema.properties[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) problems.push(`${at}: ${k} isn't a field`);
      else if (typeof schema.additionalProperties === 'object') problems.push(...validate(v, schema.additionalProperties, `${at}.${k}`));
    }
  }
  return problems;
}

const schema: Schema = lessonSchema(), step = schema.properties.steps.items;
// The schema knows every field Educate reads, top level and step.
assert.deepEqual(Object.keys(step.properties).sort(), [...STEP_FIELDS].sort(), 'step fields in the schema match Educate\'s');
for (const k of ['kind', 'version', 'title', 'set', 'board', 'teacher', 'voice', 'captions', 'aspect', 'view', 'steps', 'images']) assert.ok(schema.properties[k], `schema has ${k}`);
console.log('OK the schema covers every field Educate reads');

// Every template opens, keeps to the schema, plays clean and fits the time.
for (const t of TEMPLATES) {
  assert.deepEqual(validate(t.lesson, schema), [], `${t.id} keeps to the schema`);
  const lesson = parseLesson(JSON.stringify(t.lesson));
  compileLesson(lesson);
  assert.deepEqual(reviewLesson(lesson), [], `${t.id} has nothing written over anything else`);
  assert.deepEqual(describeLesson(lesson).warnings, [], `${t.id} has nothing worth a look`);
  const length = lessonLength(lesson);
  assert.ok(length > 30 && length < 600, `${t.id} runs ${length}s`);
}
console.log(`OK ${TEMPLATES.length} templates open, keep to the schema and play clean`);
assert.ok(TEMPLATES.some((t) => t.id === 'masterclass' && lessonLength(t.lesson) > 240), 'the masterclass runs about five minutes');

// The guide offers what Educate has, and holds the brief and a lesson to revise.
const guide = lessonGuide('Photosynthesis for 12-year-olds', TEMPLATES[1].lesson);
assert.match(guide, /Photosynthesis for 12-year-olds/);assert.match(guide, /REVISE THIS LESSON/);
for (const set of Object.keys(LESSON_SETS)) assert.ok(guide.includes(`"${set}"`), `the guide offers ${set}`);
for (const shape of SHAPES) assert.ok(guide.includes(shape), `the guide explains ${shape}`);
assert.doesNotMatch(guide, /"type":"image"/, 'the guide doesn\'t ask for images');
console.log('OK the guide offers what Educate has');

// What an assistant writes: checked, its voice suited to the teacher, its mistakes named.
const written = parseAssistLesson(JSON.stringify({ ...TEMPLATES[1].lesson, teacher: { preset: 'The Nurse' }, voice: 'M2' }));
assert.match(written.voice, /^F[12]$/, 'a woman teacher gets a woman\'s voice');
assert.throws(() => parseAssistLesson(JSON.stringify({ title: 'A film', actors: [] })), /ara-lesson/);
assert.throws(() => parseAssistLesson(JSON.stringify({ ...TEMPLATES[1].lesson, steps: [{ type: 'image', image: 'x' }] })), /image steps/);
assert.throws(() => parseAssistLesson(JSON.stringify({ ...TEMPLATES[1].lesson, teacher: { preset: 'The Nobody' } })), /preset/);
const crowded = { ...TEMPLATES[1].lesson, steps: Array.from({ length: 14 }, (_, i) => ({ type: 'write', text: `Line ${i + 1}`, say: 'A line.' })) };
assert.match(describeLesson(parseAssistLesson(JSON.stringify(crowded))).warnings.join('\n'), /Step 13: the board is full/);
const long = { ...TEMPLATES[1].lesson, steps: [{ type: 'talk', say: 'Long. '.repeat(400).slice(0, 590) }, ...Array.from({ length: 70 }, () => ({ type: 'talk', say: 'And again, a little more about this, at some length, so it keeps on going for quite a while. '.repeat(6) }))] };
assert.throws(() => parseAssistLesson(JSON.stringify(long)), /10 minutes/, 'a lesson over 10 minutes is refused');
console.log('OK assistant lessons checked, voices suited, mistakes named, the board and time limits kept');
// The example in the docs is a lesson that keeps to the schema and opens.
const docs = readFileSync(new URL('../docs/educate.md', import.meta.url), 'utf8'), example = JSON.parse(/```json\n([^]*?)\n```/.exec(docs)![1]);
assert.deepEqual(validate(example, schema), [], 'the docs example keeps to the schema');
assert.equal(example.$schema, 'https://ara3dgen.com/schemas/educate-lesson.v1.json');
compileLesson(parseLesson(JSON.stringify(example)));
console.log('OK the docs example opens');
console.log('Educate checks passed.');
