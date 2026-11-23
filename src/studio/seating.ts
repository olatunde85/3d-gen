/** Seated performances use the set's own furniture: characters are placed on the nearest free seat. */
import { timelineAt, type ActorTrack, type StudioProject } from './project';
import type { Seat } from './sets/builder';

export const SEATED = ['sit_down', 'sit_idle', 'stand_up'];
export const isSeated = (clip: string) => SEATED.includes(clip);
/** How far the sitting hips may be from a seat's centre and still use it. */
export const SEAT_REACH = 0.35;

/** The character a seat needs: its scale and where its hips sit, in its own frame, in the sitting pose. */
export interface Sitter { scale: number; hips: readonly [number, number, number] }

/** Where the track's first seated action happens, or undefined if it never sits. */
export function seatedAt(project: StudioProject, track: ActorTrack) {
  const index = track.beats.findIndex(b => isSeated(b.clip));
  if (index < 0) return;
  return timelineAt(project, track.beats.slice(0, index).reduce((sum, b) => sum + b.duration, 0) + 1e-4, track);
}

/** World position of the sitting hips for a placement and travel offset. */
export function hipsAt(track: Pick<ActorTrack, 'x' | 'z' | 'yaw'>, at: { x: number; z: number; turn?: number; fx?: number; fz?: number }, sitter: Sitter) {
  const yaw = track.yaw * Math.PI / 180, c = Math.cos(yaw), s = Math.sin(yaw), t = (at.turn ?? 0) * Math.PI / 180;
  // The hips are in the sitter's own frame, which has turned by the action's facing.
  const hx = sitter.hips[0] * Math.cos(t) + sitter.hips[2] * Math.sin(t), hz = -sitter.hips[0] * Math.sin(t) + sitter.hips[2] * Math.cos(t);
  const ox = at.x * sitter.scale + (at.fx ?? 0) + hx, oz = at.z * sitter.scale + (at.fz ?? 0) + hz;
  return { x: track.x + ox * c + oz * s, z: track.z - ox * s + oz * c };
}

export function nearestSeat(seats: readonly Seat[], x: number, z: number, exclude: readonly Seat[] = []) {
  let best: Seat | undefined, distance = Infinity;
  for (const seat of seats) {
    if (exclude.includes(seat)) continue;
    const d = Math.hypot(seat.x - x, seat.z - z);
    if (d < distance) { best = seat; distance = d; }
  }
  return best && { seat: best, distance };
}

/**
 * Moves every character with a seated action onto the nearest free seat, facing the way the seat faces.
 * Returns the ids of characters it moved. Characters already on a seat stay put.
 */
export function seatCast(project: StudioProject, seats: readonly Seat[], sitters: ReadonlyMap<string, Sitter>) {
  const moved: string[] = [], taken: Seat[] = [];
  for (const track of project.actors) {
    const at = seatedAt(project, track), sitter = sitters.get(track.id);
    if (!at || !sitter) continue;
    const hips = hipsAt(track, at, sitter), found = nearestSeat(seats, hips.x, hips.z, taken);
    if (!found) continue;
    taken.push(found.seat);
    const yaw = Math.round(found.seat.yaw * 180 / Math.PI);
    if (found.distance < 0.02 && Math.abs(((track.yaw + at.turn - yaw) % 360 + 540) % 360 - 180) < 1) continue;
    // Solve the placement that puts the sitting hips on the seat. A character whose actions set their own facing
    // turns to the seat on the seated action; otherwise the whole track turns.
    const faced = track.beats.some(b => b.face !== undefined);
    if (faced) track.beats[at.index].face = yaw;
    const sat = faced ? seatedAt(project, track)! : at, placed = { ...track, x: 0, z: 0, yaw: faced ? track.yaw : yaw }, offset = hipsAt(placed, sat, sitter);
    track.x = round(found.seat.x - offset.x); track.z = round(found.seat.z - offset.z); if (!faced) track.yaw = yaw;
    moved.push(track.id);
  }
  return moved;
}
const round = (v: number) => Math.round(v * 1000) / 1000;
