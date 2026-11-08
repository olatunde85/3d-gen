/** Stage props: the fixed objects some clips are authored against (a ladder, a vault obstacle, a ledge wall, low cover). */
export type StageProp = 'ladder' | 'obstacle' | 'ledge' | 'cover';
export const STAGE_PROP_LABELS: Record<StageProp, string> = { ladder: 'Ladder', obstacle: 'Vault obstacle', ledge: 'Ledge wall', cover: 'Cover wall' };

const PROP_FOR_CLIP: Record<string, StageProp> = {
  ladder_up: 'ladder', ladder_down: 'ladder', vault_over: 'obstacle', ledge_hang: 'ledge', ledge_climb_up: 'ledge',
  take_cover: 'cover', cover_idle: 'cover', cover_fire: 'cover',
};

/** The prop a clip is authored against, or undefined for clips without one. */
export const stagePropFor = (clipId: string): StageProp | undefined => PROP_FOR_CLIP[clipId];
