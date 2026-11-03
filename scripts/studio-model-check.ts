/** Recipe and timeline contracts that protect project portability and deterministic rendering. */
import assert from 'node:assert/strict';
import { newProject, parseProject, timelineAt, durationOf } from '../src/studio/project';
import { decodeCharacter } from '../src/app/share';

for (const template of ['portrait', 'runway', 'courtyard'] as const) {
  const p = newProject(template);
  const copy = parseProject(JSON.stringify(p));
  assert.equal(copy.template, template); assert.equal(copy.character, p.character);
  assert.equal(copy.detail, 'medium'); assert.ok(decodeCharacter(copy.character, copy.detail));
  assert.equal(durationOf(copy), durationOf(p));
  assert.equal(timelineAt(p, -10).time, 0);
  assert.equal(timelineAt(p, 1000).time, durationOf(p));
  let start = 0;
  p.beats.forEach((beat, index) => {
    const at = timelineAt(p, start + 0.001); assert.equal(at.index, index); assert.ok(at.local < 0.002);
    start += beat.duration;
  });
  for (let t = 0; t <= durationOf(p); t += 0.1) assert.deepEqual(timelineAt(p, t), timelineAt(p, t));
}
const runway = newProject('runway'), boundary = runway.beats[0].duration;
const before = timelineAt(runway, boundary - 1e-6), after = timelineAt(runway, boundary + 1e-6);
assert.ok(Math.abs(before.z - after.z) < 0.0001, 'root travel jumps at a camera cut');
assert.ok(Math.abs(before.phase - after.phase) < 0.0001, 'same action restarts at a camera cut');
const p = newProject();
for (const change of [
  { version: 99 }, { character: 'invalid' }, { beats: [] }, { beats: [{ ...p.beats[0], clip: 'does-not-exist' }] },
  { camera: 'unknown' }, { aspect: 'square' }, { beats: [{ ...p.beats[0], duration: -1 }] },
  { beats: Array.from({ length: 6 }, () => ({ ...p.beats[0], duration: 6 })) },
  { beats: [{ ...p.beats[0], duration: '3' }] }, { detail: 'extreme' },
]) assert.throws(() => parseProject(JSON.stringify({ ...p, ...change })));
assert.throws(() => parseProject(' '.repeat(100001)));
assert.throws(() => parseProject('null'));
const title = parseProject(JSON.stringify({ ...p, title: '<img src=x onerror=alert(1)>' }));
assert.equal(title.title, '<img src=x onerror=alert(1)>'); // Rendered as text, never interpreted as markup.
console.log('Studio model: templates, serialization, invalid inputs, cut continuity and deterministic timeline passed.');
