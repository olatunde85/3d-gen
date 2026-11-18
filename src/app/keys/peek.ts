/**
 * Facts about a character, film or game while its JSON is still arriving, read with simple patterns (the JSON is
 * incomplete, so it can't be parsed yet). Shown while the visitor waits.
 */
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
const value = (text: string, key: string) => new RegExp(`"${key}"\\s*:\\s*"([^"]{1,80})"`).exec(text)?.[1];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const words = (id: string) => id.replace(/[_-]+/g, ' ');

export function peekFilm(text: string, locationName: (id: string) => string | undefined): string[] {
  const out: string[] = [];
  const title = value(text, 'title'), template = value(text, 'template');
  if (title) out.push(`“${title}”`);
  if (template) out.push(locationName(template) ?? words(template));
  const cast = count(text, /"beats"\s*:/g), actions = count(text, /"clip"\s*:/g), lines = count(text, /"voice"\s*:\s*"/g), shots = count(text, /"shot"\s*:\s*"/g), effects = count(text, /"sound"\s*:\s*"/g);
  if (cast) out.push(plural(cast, 'character'));
  if (actions) out.push(plural(actions, 'action'));
  if (shots) out.push(plural(shots, 'shot'));
  if (lines) out.push(plural(lines, 'line') + ' of dialogue');
  if (effects) out.push(plural(effects, 'sound effect'));
  const music = value(text, 'track');
  if (music && music !== 'none') out.push('music');
  return out;
}

export function peekCharacter(text: string): string[] {
  const out: string[] = [];
  const name = value(text, 'name'), preset = value(text, 'preset'), age = /"ageYears"\s*:\s*(\d+)/.exec(text)?.[1], hair = value(text, 'hair'), outfit = value(text, 'outfit') ?? value(text, 'top');
  if (name) out.push(name);
  if (preset) out.push(`from ${preset}`);
  if (age) out.push(`${age} years old`);
  if (hair && hair !== 'none') out.push(`${words(hair)} hair`);
  if (outfit && outfit !== 'none') out.push(words(outfit));
  for (const key of ['carry', 'weapon', 'vehicle']) { const v = value(text, key); if (v && v !== 'none') out.push(words(v)); }
  return out;
}

export function peekGame(text: string): string[] {
  const out: string[] = [];
  const name = value(text, 'gameName'), mode = value(text, 'mode'), location = value(text, 'location');
  if (name) out.push(`“${name}”`);
  if (mode) out.push(words(mode));
  if (location) out.push(words(location));
  const chapters = count(text, /"id"\s*:\s*"chapter/g), lines = count(text, /"trigger"\s*:/g);
  if (chapters) out.push(plural(chapters + 1, 'chapter'));
  if (lines) out.push(plural(lines, 'story line'));
  return out;
}
