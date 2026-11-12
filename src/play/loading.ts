/**
 * The first screen while a game's cast and scenes load. It is drawn from the game itself (its mode, title, briefing
 * and circuit, course or location) before anything is validated, so a fresh page or reload names the game being
 * prepared instead of a generic depot. The backdrop is plain CSS: nothing renders in 3D until the game is ready.
 */
import { arcadeTitle, gameTitle, RUNNER_THEME_NAMES, type PlayMode, type RaceSettings, type RunnerSettings, type RunnerTheme } from './arcade/modes';
import { LOCATIONS } from './locations';

interface LoadingGame { mode: PlayMode; title: string; story: string; facts: string[]; label: string; note: string; place: string }
type Raw = { mode?: PlayMode; identity?: { title?: string; briefing?: string }; race?: RaceSettings; runner?: RunnerSettings; mission?: { location?: string; lives?: number }; enemies?: unknown[]; chapters?: unknown[]; character?: { params?: { name?: string } } };

const plural = (n: number, one: string, many = one + 'S') => `${n} ${n === 1 ? one : many}`;

/** Read what the loading card needs from a saved or exported game; anything unreadable falls back to the defaults. */
export function loadingGame(input: unknown): LoadingGame {
  const raw = (input && typeof input === 'object' ? input : {}) as Raw, mode: PlayMode = raw.mode === 'race' || raw.mode === 'runner' ? raw.mode : 'mission';
  const chapters = 1 + (Array.isArray(raw.chapters) ? raw.chapters.length : 0), briefing = typeof raw.identity?.briefing === 'string' ? raw.identity.briefing.trim() : '';
  const title = (() => { try { return gameTitle({ mode, race: raw.race, runner: raw.runner, identity: { title: raw.identity?.title ?? '' } }) || 'Ara Play'; } catch { return 'Ara Play'; } })();
  if (mode === 'race') {
    const race = raw.race, place = (() => { try { return arcadeTitle({ mode, race }); } catch { return 'Circuit'; } })(), laps = Number(race?.laps) || 3, cars = 1 + (Number(race?.opponents) || 0);
    return { mode, title, place, story: briefing || `Line up on ${place} and race for the podium.`, facts: [plural(laps, 'LAP'), plural(cars, 'CAR'), ...(chapters > 1 ? [plural(chapters, 'RACE')] : [])], label: 'Warming up the grid…', note: 'Building your racers, cars and circuit.' };
  }
  if (mode === 'runner') {
    const theme = raw.runner?.theme, place = theme && theme in RUNNER_THEME_NAMES ? RUNNER_THEME_NAMES[theme as RunnerTheme] : 'The course';
    return { mode, title, place, story: briefing || `Run ${place.toLowerCase()} as far as you can. Dodge, jump, slide and grab every coin.`, facts: ['ENDLESS RUN', ...(raw.runner?.chaser ? ['1 CHASER'] : []), ...(chapters > 1 ? [plural(chapters, 'STAGE')] : [])], label: 'Laying out the course…', note: 'Building your runner and the course ahead.' };
  }
  const location = LOCATIONS.find((l) => l.id === raw.mission?.location) ?? LOCATIONS[0], enemies = Array.isArray(raw.enemies) ? raw.enemies.length : 1, lives = Number(raw.mission?.lives) || 3;
  return { mode, title, place: location.name, story: briefing || location.description, facts: [plural(enemies, 'ENEMY', 'ENEMIES'), plural(lives, 'LIFE', 'LIVES'), ...(chapters > 1 ? [plural(chapters, 'CHAPTER')] : [])], label: `Preparing ${location.name.toLowerCase()}…`, note: 'Building your Ara characters.' };
}

/** The saved draft's game, read straight from storage. */
export function savedGame(key: string): unknown {
  try { const saved = localStorage.getItem(key);return saved ? JSON.parse(saved) : undefined; } catch { return undefined; }
}

/** Fill the briefing card and stage with the loading state for this game. */
export function paintLoading(input: unknown) {
  const g = loadingGame(input), stage = document.getElementById('stage'), brief = document.getElementById('brief');
  if (!stage || !brief) return;
  stage.dataset.loading = g.mode;brief.dataset.ready = '';
  const kicker = brief.querySelector('.eyebrow'), facts = brief.querySelector('.mission-facts:not(.loading-facts)');
  if (kicker) kicker.textContent = `LOADING · ${g.mode === 'race' ? 'ARCADE RACE' : g.mode === 'runner' ? 'ENDLESS RUN' : 'MISSION'} · ${g.place.toUpperCase()}`;
  const set = (id: string, text: string) => { const el = document.getElementById(id);if (el) el.textContent = text; };
  set('brief-title', g.title);set('brief-story', g.story);set('load-label', g.label);set('load-note', g.note);
  // The game's own facts row keeps its live counters; a separate row stands in for it while loading.
  brief.querySelector('.loading-facts')?.remove();
  const row = document.createElement('div');row.className = 'mission-facts loading-facts';row.append(...g.facts.map((f) => { const s = document.createElement('span');s.textContent = f;return s; }));
  facts?.before(row);
}

/** Hand the stage back to the game, which repaints the card for play. */
export function finishLoading() {
  const stage = document.getElementById('stage');if (stage) delete stage.dataset.loading;document.getElementById('brief')?.setAttribute('data-ready', '');
  document.querySelector('#brief .loading-facts')?.remove();
}
