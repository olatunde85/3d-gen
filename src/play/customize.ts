/**
 * Game-wide presentation: the game's name and its How to play text. Both start from defaults made from the game
 * itself (the first chapter's title, and short guidance for the modes it uses) and are saved only once edited.
 */
import { gameProjects, type PlayProject } from './project';

export const GAME_NAME_MAX = 60, HOW_TO_PLAY_MAX = 1200;
/** The name players see in the title bar, the browser tab and the published address. */
export const gameNameOf = (p: Pick<PlayProject, 'gameName' | 'identity'>) => p.gameName?.trim() || p.identity.title || 'Ara Play game';

/** Short guidance for each mode the game uses, in play order. */
export function defaultHowToPlay(project: PlayProject): string {
  const games = gameProjects(project), modes = new Set(games.map((g) => g.mode ?? 'mission')), armed = games.some((g) => g.mode === 'runner' && g.runner?.obstacles.includes('gunman'));
  const parts: string[] = [];
  if (modes.has('mission')) parts.push('Missions: move with W A S D or the joystick on a phone, hold Shift to run and press E to interact. Follow the gold marker on the map to each objective. Press C to crouch behind cover and 1, 2 or 3 to holster or switch weapons.');
  if (modes.has('race')) parts.push('Races: W accelerates, S brakes and A and D steer. Hold Space to drift through corners and press Shift for nitro. On a phone the car accelerates by itself: drag to steer.');
  if (modes.has('runner')) parts.push(`Runs: A and D change lane and turn at corners, W or Space jumps and S slides. On a phone, swipe instead.${armed ? ' Press F or tap Shoot to fire down your lane before the enemies fire first.' : ''}`);
  parts.push(games.length > 1 ? 'Press Esc to pause. Your progress through the chapters is saved on this device.' : 'Press Esc to pause.');
  return parts.join('\n\n');
}
export function parseGameName(raw: unknown) { if (typeof raw !== 'string' || !raw.trim() || raw.length > GAME_NAME_MAX) throw Error(`gameName must be 1 to ${GAME_NAME_MAX} characters.`);return raw.trim(); }
export function parseHowToPlay(raw: unknown) { if (typeof raw !== 'string' || !raw.trim() || raw.length > HOW_TO_PLAY_MAX) throw Error(`howToPlay must be 1 to ${HOW_TO_PLAY_MAX} characters.`);return raw.trim(); }

let original: Node[] | undefined;
/** Show custom How to play text in the game's instructions, or put back the built-in guide. */
export function applyHowToPlay(text?: string) {
  const form = document.querySelector('#instructions form');if (!form) return;
  const head = form.querySelector('.dialog-head');original ??= [...form.childNodes].filter((n) => n !== head);
  for (const n of [...form.childNodes]) if (n !== head) n.remove();
  if (!text) { form.append(...original);return; }
  const title = document.createElement('h2');title.textContent = 'How to play';form.append(title);
  for (const block of text.split(/\n\s*\n/)) { const p = document.createElement('p');p.textContent = block.trim();p.style.whiteSpace = 'pre-line';form.append(p); }
}
