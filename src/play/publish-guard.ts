/**
 * What a game may contain to be published online. Shared by Ara Play, which checks before anything is uploaded, and
 * by the publishing service, which checks again so a modified page cannot get around it. No imports: the service
 * bundles this file on its own.
 */
export const PUBLISH_LIMITS = { files: 1000, fileBytes: 5 * 1024 * 1024, totalBytes: 200 * 1024 * 1024, projectBytes: 512_000 } as const;

type Params = { name?: unknown; gender?: unknown; outfit?: unknown; top?: unknown; jacket?: unknown; bottom?: unknown; underwear?: unknown };
/** Characters wearing an 18+ option: no underwear, nothing on the bottom half, or a woman with nothing on top. */
export function adultReason(params: Params | undefined): string | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const p = params, name = typeof p.name === 'string' && p.name ? p.name : 'A character', dressed = typeof p.outfit === 'string' && p.outfit !== 'none';
  if (p.underwear === false) return `${name} has underwear switched off`;
  if (!dressed && p.bottom === 'none') return `${name} has nothing on the bottom half`;
  if (!dressed && p.top === 'none' && (p.jacket === undefined || p.jacket === 'none') && typeof p.gender === 'number' && p.gender < 0.5) return `${name} is topless`;
  return undefined;
}

type Raw = Record<string, unknown>;
const characters = (game: Raw): unknown[] => {
  const people: unknown[] = [game.character];
  for (const e of Array.isArray(game.enemies) ? game.enemies : []) people.push((e as Raw)?.character);
  people.push((game.companion as Raw | undefined)?.character);
  return people;
};
/** Every character in the game and its chapters, as saved in project.json. */
export function gameCharacters(project: unknown): unknown[] {
  if (!project || typeof project !== 'object') return [];
  const root = project as Raw, list = characters(root);
  for (const c of Array.isArray(root.chapters) ? root.chapters : []) if (c && typeof c === 'object') list.push(...characters(c as Raw).slice(1));
  return list;
}
/** Why a game cannot be published, or undefined when it can. */
export function publishBlock(projectText: string): string | undefined {
  if (projectText.length > PUBLISH_LIMITS.projectBytes) return 'This game setup is too large to publish.';
  let project: unknown;
  try { project = JSON.parse(projectText); } catch { return 'This game setup could not be read.'; }
  if (!project || typeof project !== 'object' || (project as Raw).kind !== 'ara-play') return 'Only Ara Play games can be published.';
  for (const c of gameCharacters(project)) {
    const params = c && typeof c === 'object' ? ((c as Raw).params ?? c) as Params : undefined, reason = adultReason(params);
    if (reason) return `${reason}. Games with 18+ characters can be downloaded but not published online.`;
  }
  return undefined;
}
/** Paths a published game may contain: the player, its data and its media, nothing executable on the server. */
export function allowedPath(path: string): boolean {
  return /^\/[A-Za-z0-9._\-/]+$/.test(path) && !path.includes('..') && !path.includes('//') && (path === '/_parts.json' || !/\/[_.]/.test(path))
    && /\.(html|js|css|json|txt|pack|png|jpg|jpeg|webp|ktx2|mp3|ogg|wav|mp4|webm|glb|bin|part\d+)$/i.test(path);
}
