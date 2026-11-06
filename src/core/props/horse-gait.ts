/** The horse's working trot. The rider clip and the horse share it so the saddle and seat rise and fall together. */
export const TROT={duration:.8,duty:.42,speed:1.6,bob:.026}as const;
/** Right fore and left hind are mid-stance at this phase; the other diagonal half a stride later. */
const MID=TROT.duty/2;
const wave=(phase:number)=>-Math.cos(4*Math.PI*(phase-MID));
/** Height change of the horse's back (in rider-height units), zero at the start of the loop so mounting lines up. */
export function trotBob(time:number){return TROT.bob*(wave(time/TROT.duration)-wave(0));}
/** Nose-up pitch (radians) as each diagonal pushes off. */
export function trotPitch(time:number){return .012*Math.sin(4*Math.PI*(time/TROT.duration-MID));}
