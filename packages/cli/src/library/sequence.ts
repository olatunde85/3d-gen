/** Animation sequences, such as "walk 3s, wave, cheer x2": the steps the library's playSequence() and the embed play. */

/** One step: a clip ID, with an optional length in seconds or a number of times to play it. */
export type SequenceStep = string | { clip: string; seconds?: number; times?: number };

export interface ParsedStep { id: string; seconds?: number; times?: number }

/** Reads "walk 3s, wave, cheer x2" (or an array of steps) into clip IDs with their lengths or counts. */
export function parseSteps(steps: string | readonly SequenceStep[]): ParsedStep[] {
  const list = typeof steps === 'string' ? steps.split(',') : steps;
  const parsed: ParsedStep[] = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      if (!item || typeof item.clip !== 'string') throw Error('Each step needs a clip, such as { clip: "wave" }.');
      parsed.push({ id: item.clip, ...(item.seconds !== undefined ? { seconds: item.seconds } : {}), ...(item.times !== undefined ? { times: item.times } : {}) });
      continue;
    }
    const [id, ...rest] = item.trim().split(/\s+/);
    if (!id) continue;
    const step: ParsedStep = { id };
    for (const word of rest) {
      const seconds = /^(\d+(?:\.\d+)?)s$/.exec(word), times = /^x(\d+)$/.exec(word);
      if (seconds) step.seconds = Number(seconds[1]);
      else if (times) step.times = Number(times[1]);
      else throw Error(`Can't read "${word}" in "${item.trim()}". Give a length such as 3s or a count such as x2.`);
    }
    parsed.push(step);
  }
  for (const step of parsed) {
    if (step.seconds !== undefined && !(step.seconds > 0)) throw Error(`The length for "${step.id}" must be more than 0 seconds.`);
    if (step.times !== undefined && !(Number.isInteger(step.times) && step.times > 0)) throw Error(`The count for "${step.id}" must be a whole number, such as x2.`);
  }
  return parsed;
}
