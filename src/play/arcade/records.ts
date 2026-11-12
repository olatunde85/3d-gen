/**
 * Local records for arcade modes: best times and scores, runner progression, daily challenges and ghost laps small
 * enough to share in a link. Storage is optional; every reader tolerates missing or damaged data.
 */
import type { GhostFrame } from './race';
import type { CustomTrack } from './track';

export interface RaceRecord { medal?: number; bestLap?: number; bestRace?: number; ghost?: string; top: { time: number; position: number; date: string }[] }
/** Runner medals are kept per stage, keyed by the chapter index. */
export interface RunnerRecord { medals?: Record<string, number>; stage?: number; best: number; bestDistance: number; top: { score: number; distance: number; coins: number; date: string }[]; bank: number; upgrades: Record<string, number>; missions: number[]; missionLevel: number; runners: string[]; runner?: string; daily: Record<string, number> }
export interface CupRecord { round: number; points: Record<string, number>; cash: number; garage: string[]; car?: string; paint?: string; complete: boolean }

const read = <T>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key);return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional storage */ } };
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function hash(text: string) { let h = 2166136261;for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i);h = Math.imul(h, 16777619); } return h >>> 0; }
/** The same daily seed on every device, so friends can compare the day's run. */
export const dailySeed = (game: string, date = today()) => hash(`${game}|${date}`) % 2_147_483_647;
export const trackKey = (track: string | CustomTrack) => (typeof track === 'string' ? track : `custom-${hash(JSON.stringify(track.points)).toString(36)}`);

export const raceRecord = (game: string, track: string) => read<RaceRecord>(`ara.play.race.${game}.${track}`, { top: [] });
export function saveRace(game: string, track: string, record: RaceRecord) { record.top = record.top.sort((a, b) => a.time - b.time).slice(0, 10);write(`ara.play.race.${game}.${track}`, record); }
export const runnerRecord = (game: string) => read<RunnerRecord>(`ara.play.runner.${game}`, { best: 0, bestDistance: 0, top: [], bank: 0, upgrades: {}, missions: [0, 0, 0], missionLevel: 0, runners: [], daily: {} });
export function saveRunner(game: string, record: RunnerRecord) { record.top = record.top.sort((a, b) => b.score - a.score).slice(0, 10);write(`ara.play.runner.${game}`, record); }
export const cupRecord = (game: string) => read<CupRecord>(`ara.play.cup.${game}`, { round: 0, points: {}, cash: 0, garage: [], complete: false });
export const saveCup = (game: string, record: CupRecord) => write(`ara.play.cup.${game}`, record);

// Ghosts: 10 Hz frames quantised to 10 cm and 1/256 of a turn, delta-encoded as zig-zag varints in base64url.
const zig = (n: number) => (n << 1) ^ (n >> 31);
const unzig = (n: number) => (n >>> 1) ^ -(n & 1);
export function encodeGhost(lap: number, frames: GhostFrame[]): string {
  const bytes: number[] = [], push = (v: number) => { v >>>= 0;while (v > 127) { bytes.push((v & 127) | 128);v >>>= 7; } bytes.push(v); };
  push(1);push(Math.round(lap * 1000));push(frames.length);
  let px = 0, pz = 0, pyaw = 0;
  for (const f of frames) {
    const x = Math.round(f.x * 10), z = Math.round(f.z * 10), yaw = Math.round((((f.yaw / (Math.PI * 2)) % 1) + 1) % 1 * 256) & 255;
    push(zig(x - px));push(zig(z - pz));push(zig(((yaw - pyaw + 384) % 256) - 128));px = x;pz = z;pyaw = yaw;
  }
  let text = '';for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeGhost(code: string): { lap: number; frames: GhostFrame[] } | undefined {
  try {
    const text = atob(code.replace(/-/g, '+').replace(/_/g, '/')), bytes = Array.from(text, (c) => c.charCodeAt(0));let i = 0;
    const pull = () => { let v = 0, shift = 0, b = 0;do { if (i >= bytes.length) throw Error('short');b = bytes[i++];v |= (b & 127) << shift;shift += 7; } while (b & 128 && shift < 35);return v >>> 0; };
    if (pull() !== 1) return;
    const lap = pull() / 1000, count = pull();if (count > 6000 || lap <= 0 || lap > 3600) return;
    const frames: GhostFrame[] = [];let x = 0, z = 0, yaw = 0;
    for (let k = 0; k < count; k++) { x += unzig(pull());z += unzig(pull());yaw = (yaw + unzig(pull()) + 256) % 256;frames.push({ t: k / 10, x: x / 10, z: z / 10, yaw: (yaw / 256) * Math.PI * 2 }); }
    return { lap, frames };
  } catch { return undefined; }
}
/** A shareable link to this game with the ghost attached: `#ghost=<track>.<code>`. */
export function ghostLink(track: string, code: string, base = location.href) { const url = new URL(base);url.hash = `ghost=${track}.${code}`;return url.href; }
export function linkedGhost(track: string, hashText = location.hash) {
  const value = new URLSearchParams(hashText.slice(1)).get('ghost');if (!value) return;
  const dot = value.indexOf('.');if (dot < 0 || value.slice(0, dot) !== track) return;
  return decodeGhost(value.slice(dot + 1));
}
