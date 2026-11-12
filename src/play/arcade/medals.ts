/**
 * Bronze, silver and gold medals for each race and runner stage. Races award them for the podium places; runs
 * award them for score targets the creator can change, and a stage with a goal must reach it first. The best medal
 * for each stage is kept with the game's local records.
 */
export type Medal = 0 | 1 | 2 | 3;
export const MEDAL_NAMES = ['None', 'Bronze', 'Silver', 'Gold'] as const;
export interface RunnerMedals { bronze: number; silver: number; gold: number }
export const DEFAULT_RUNNER_MEDALS: RunnerMedals = { bronze: 1500, silver: 4000, gold: 8000 };

export const raceMedal = (position: number): Medal => (position >= 1 && position <= 3 ? (4 - position) as Medal : 0);
export function runnerMedal(score: number, targets: RunnerMedals, goalMet = true): Medal {
  if (!goalMet) return 0;
  return score >= targets.gold ? 3 : score >= targets.silver ? 2 : score >= targets.bronze ? 1 : 0;
}

/** Medal targets in points: false switches medals off, and each target must be higher than the one before. */
export function parseRunnerMedals(raw: unknown): RunnerMedals | false {
  if (raw === false) return false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('runner.medals: use false or {"bronze", "silver", "gold"} score targets.');
  const m = raw as Record<string, unknown>;
  for (const key of Object.keys(m)) if (!['bronze', 'silver', 'gold'].includes(key)) throw Error(`Unsupported runner.medals setting: ${key}.`);
  const value = (key: keyof RunnerMedals) => {
    const v = m[key] ?? DEFAULT_RUNNER_MEDALS[key];
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 1_000_000) throw Error(`runner.medals.${key}: use a whole score from 1 to 1000000.`);
    return v as number;
  };
  const out = { bronze: value('bronze'), silver: value('silver'), gold: value('gold') };
  if (!(out.bronze < out.silver && out.silver < out.gold)) throw Error('runner.medals: bronze must be below silver, and silver below gold.');
  return out;
}
