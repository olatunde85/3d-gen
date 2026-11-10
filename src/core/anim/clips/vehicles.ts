/** Vehicle riders: car, passenger, bicycle, motorcycle, horse, canoe, kayak, rowing, boat helm. */
import { type Ch, type Clip, type HandTarget, type Sample } from './types';
import { cyc, fingers, fist, FISTS, grip, normV, side, track, v } from './helpers';
import { skydive } from './aerial';
import { BAILOUT_PATHS,CRASH_PATH,CRASH_DURATION,CRASH_FALL_PATH,CRASH_FALL_DURATION,CRASH_VEHICLES } from '../../props/vehicle-motion';
import { ON_BACK } from './reactions';
import { VEHICLE_TRANSITIONS,VEHICLE_STUNTS } from '../../props/vehicle-actions';
import { TROT, trotBob } from '../../props/horse-gait';
import { idle } from './basic';

// The rider only: the game supplies the vehicle and attaches the character to its seat.
// Seated clips keep the feet on the floor (car, boats); bike and horse clips hold the hips at
// saddle height. Hands are placed by IK on the controls (wheel, bars, reins, paddle, oars).

type V3 = [number, number, number];
const add3 = (a: V3, b: V3): V3 => v(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
const mul3 = (a: V3, k: number): V3 => v(a[0] * k, a[1] * k, a[2] * k);

/** Seated legs: thighs forward, shins down, slight spread. */
function seatedLegs(out: Record<string, Ch>, thigh = 85, knee = -85, foot = 4, spread = 6) {
  side(out, 'UpLeg', [thigh, 0, spread], [thigh, 0, spread]);
  side(out, 'Leg', [knee, 0, 0], [knee, 0, 0]);
  side(out, 'Foot', [foot, 0, 0], [foot, 0, 0]);
}

/**
 * Hands on a steering wheel (car or boat) at 9 and 3 o'clock, turned by `steer` degrees.
 * The wheel faces the driver, its top tilted away by `tilt` degrees.
 */
export function wheelHands(centre: V3, radius: number, tilt: number, steer: number): { Left: HandTarget; Right: HandTarget } {
  const tr = (tilt * Math.PI) / 180;
  const n = v(0, Math.sin(tr), -Math.cos(tr)); // wheel normal, toward the driver
  const up = v(0, Math.cos(tr), Math.sin(tr)); // in the wheel plane, toward its top
  const across = v(1, 0, 0);
  const hand = (phi: number, s: 1 | -1): HandTarget => {
    const a = phi + (steer * Math.PI) / 180;
    const radial = add3(mul3(across, Math.cos(a)), mul3(up, Math.sin(a)));
    const tangent = add3(mul3(across, -Math.sin(a)), mul3(up, Math.cos(a)));
    return {
      pos: add3(centre, mul3(radial, radius)),
      pole: v(s, -1, -0.3),
      // Fingers forward around the rim, palm toward the wheel's centre.
      dir: normV(add3(mul3(tangent, 0.35 * s), mul3(n, -1))),
      palm: mul3(radial, -1),
    };
  };
  return { Left: hand(0, 1), Right: hand(Math.PI, -1) };
}

const driveCar: Clip = {
  id: 'drive_car', name: 'Drive car', category: 'Vehicles', duration: 4, loop: true,
  sample: (t) => {
    const a = (t / 4) * Math.PI * 2;
    const steer = 14 * Math.sin(a) + 5 * Math.sin(3 * a + 1);
    const out: Record<string, Ch> = {
      Spine: [-10, 0, 0], Spine1: [2, 0, 0], Spine2: [2, 0, 0],
      Neck: [4, 0, 0], Head: [6 + Math.sin(a * 2), 6 * Math.sin(a + 0.6) + 0.3 * steer, 0],
    };
    seatedLegs(out, 78, -72, 2, 7);
    side(out, 'Leg', [-80, 0, 0], [-62, 0, 0]); // right foot forward on the pedal
    side(out, 'Foot', [6, 0, 0], [-6, 0, 0]);
    grip(out, 'Left');
    grip(out, 'Right');
    return { bones: out, root: { ground: true }, thumbs: { Left: 0.5, Right: 0.5 }, ik: wheelHands(v(0, -0.34, 0.42), 0.18, 28, steer) };
  },
};

const sitPassenger: Clip = {
  id: 'sit_passenger', name: 'Sit (passenger)', category: 'Vehicles', duration: 6, loop: true,
  sample: (t) => {
    const a = (t / 6) * Math.PI * 2;
    const look = 22 * Math.sin(a) * Math.max(0, Math.sin(a)); // glances out of the window now and then
    const out: Record<string, Ch> = {
      Spine: [-12 + Math.sin(a * 3) * 0.8, 0, 0], Spine1: [2, 0, 0], Spine2: [1.5 * Math.sin(a * 3), 0, 0],
      Neck: [2, 0.3 * look, 0], Head: [2, 0.7 * look, 2 * Math.sin(a)],
    };
    seatedLegs(out, 86, -84, 2, 5);
    fingers(out, 18);
    // Hands resting on the thighs.
    const lap = (s: 1 | -1, dz: number): HandTarget => ({ pos: v(0.15 * s, -0.5, 0.3 + dz), pole: v(s, -0.6, -0.5), dir: v(0.05 * s, -0.25, 1), palm: v(0, -1, 0) });
    return { bones: out, root: { ground: true }, ik: { Left: lap(1, 0.01 * Math.sin(a * 3)), Right: lap(-1, 0.03) } };
  },
};

const rideBicycle: Clip = {
  id: 'ride_bicycle', name: 'Ride bicycle', category: 'Vehicles', duration: 1.0, loop: true,
  sample: (t) => {
    const c = (t / 1.0) * Math.PI * 2; // crank angle: one pedal revolution per loop
    const out: Record<string, Ch> = {
      Spine: [24, 0, 0], Spine1: [12, 0, 0], Spine2: [6, 1.5 * Math.sin(c), 0],
      Neck: [-16, 0, 0], Head: [-20, 0, 0], Hips: [0, 2 * Math.sin(c), 1.5 * Math.sin(c)],
    };
    // Pedalling: thigh highest and knee most bent with the pedal at the top.
    const leg = (ph: number): [Ch, Ch, Ch] => {
      const top = Math.cos(ph); // 1 = pedal at the top
      const fwd = Math.sin(ph); // 1 = pedal forward
      return [[52 + 26 * top + 6 * fwd, 0, 3], [-58 - 34 * top + 10 * fwd, 0, 0], [6 - 14 * fwd, 0, 0]];
    };
    const [lu, ll, lf] = leg(c), [ru, rl, rf] = leg(c + Math.PI);
    side(out, 'UpLeg', lu, ru);
    side(out, 'Leg', ll, rl);
    side(out, 'Foot', lf, rf);
    grip(out, 'Left');
    grip(out, 'Right');
    // Hands fixed on the handlebar (floor space), so they stay on the bar while the body pedals.
    const bar = (s: 1 | -1): HandTarget => ({ space: 'floor', pos: v(0.24 * s, 0.918, 0.437), pole: v(s, -0.39, -0.76), dir: v(0.25 * s, -0.85, 0.58), palm: v(-0.35 * s, -0.74, -0.67) });
    return { bones: out, root: { y: -0.02 + 0.006 * Math.sin(2 * c) }, thumbs: { Left: 0.6, Right: 0.6 }, ik: { Left: bar(1), Right: bar(-1) } };
  },
};

const rideMotorcycle: Clip = {
  id: 'ride_motorcycle', name: 'Ride motorcycle', category: 'Vehicles', duration: 3, loop: true,
  sample: (t) => {
    const a = (t / 3) * Math.PI * 2;
    const hum = 0.003 * Math.sin(t * 2 * Math.PI * 12); // engine vibration
    const out: Record<string, Ch> = {
      Spine: [20, 0, 0], Spine1: [10, 0, 0], Spine2: [4, 0, 0],
      Neck: [-14, 0, 0], Head: [-16, 5 * Math.sin(a), 0], Hips: [0, 0, 3 * Math.sin(a)],
    };
    // Astride the tank, feet back on the pegs.
    side(out, 'UpLeg', [58, 0, 14], [58, 0, 14]);
    side(out, 'Leg', [-92, 0, 0], [-92, 0, 0]);
    side(out, 'Foot', [18, 0, 0], [18, 0, 0]);
    grip(out, 'Left');
    grip(out, 'Right');
    const bar = (s: 1 | -1): HandTarget => ({ pos: v(0.34 * s, -0.22, 0.38 + 0.01 * s * Math.sin(a)), pole: v(s, -0.7, -0.4), dir: v(0.3 * s, -0.2, 1), palm: v(-0.3 * s, -1, 0) });
    return { bones: out, root: { y: -0.16 + hum }, thumbs: { Left: 0.6, Right: 0.6 }, ik: { Left: bar(1), Right: bar(-1) } };
  },
};

const rideHorse: Clip = {
  id: 'ride_horse', name: 'Ride horse (trot)', category: 'Vehicles', duration: TROT.duration, loop: true,
  sample: (t) => {
    const ph = (t / TROT.duration) * Math.PI * 2;
    const post = Math.max(0, Math.sin(ph)); // rising trot: up on every other beat
    const out: Record<string, Ch> = {
      Spine: [8 + 4 * post, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0], Head: [-6 - 3 * post, 0, 0],
    };
    // Legs around the horse's barrel: lower legs hang against its sides, heels down in the stirrups.
    side(out, 'UpLeg', [42 - 12 * post, 0, 26], [42 - 12 * post, 0, 26]);
    side(out, 'Leg', [-62 + 22 * post, 0, -36], [-62 + 22 * post, 0, -36]);
    side(out, 'Foot', [16, 0, 0], [16, 0, 0]);
    fist(out);
    const reins = (s: 1 | -1): HandTarget => ({ pos: v(0.09 * s, -0.42 + 0.04 * post, 0.34), pole: v(s, -1, -0.4), dir: v(-0.2 * s, -0.1, 1), palm: v(-s, 0, 0) });
    // The seat follows the horse's back; posting lifts the rider out of it on one diagonal.
    return { bones: out, root: { y: 0.42 + 0.1 * post + trotBob(t) }, thumbs: FISTS, ik: { Left: reins(1), Right: reins(-1) } };
  },
};

/** A paddle or oar stroke: positions through catch -> pull -> exit -> recovery (looping keys). */
const loop3 = (keys: V3[]) => {
  const xs = cyc(keys.map((k) => k[0])), ys = cyc(keys.map((k) => k[1])), zs = cyc(keys.map((k) => k[2]));
  return (p: number): V3 => v(xs(p), ys(p), zs(p));
};

const paddleCanoe: Clip = {
  id: 'paddle_canoe', name: 'Paddle canoe', category: 'Vehicles', duration: 1.8, loop: true,
  sample: (t) => {
    const p = t / 1.8;
    // Single-blade stroke on the right: catch forward, pull to the hip, lift out, swing forward.
    // Floor-space contacts keep the shaft outside the gunwale throughout the stroke.
    // Both hands stay on the same rigid paddle; the lower hand clears the right hull.
    const low = loop3([v(-.55,.60,.60),v(-.55,.58,.35),v(-.54,.60,.10),v(-.52,.81,.20),v(-.53,.80,.55)]);
    const top = loop3([v(-.13,1.10,.46),v(-.16,1.06,.40),v(-.16,1.04,.31),v(-.10,1.15,.33),v(-.10,1.16,.46)]);
    const twist = cyc([14, 4, -10, -4, 10])(p); // torso winds up for the catch
    const out: Record<string, Ch> = {
      Spine: [10, twist * 0.4, 0], Spine1: [6, twist * 0.6, -3], Spine2: [4, 0, 0], Neck: [-6, -twist * 0.6, 0], Head: [-8, -twist * 0.3, 0],
    };
    // Sitting on the canoe's bench, feet tucked back under it.
    seatedLegs(out, 82, -104, 12, 10);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Right: { space:'floor',pos: low(p), pole: v(-1, -0.6, -0.5), dir: v(0.5, 0.1, 0.85), palm: v(0.6, 0, -0.5) },
        Left: { space:'floor',pos: top(p), pole: v(0.6, -1, 0), dir: v(-1, -0.1, 0.3), palm: v(0, -0.6, 1) },
      },
    };
  },
};

const paddleKayak: Clip = {
  id: 'paddle_kayak', name: 'Paddle kayak', category: 'Vehicles', duration: 1.6, loop: true,
  sample: (t) => {
    const p = t / 1.6;
    // Double-bladed paddle: right stroke in the first half, left in the second. The stroke-side
    // hand sweeps low from front to hip while the other pushes forward at shoulder height.
    // Closed, smooth hand paths keep the paddle continuous at side changes and the loop seam.
    const L=loop3([v(.22,-.08,.30),v(.22,-.06,.37),v(.22,-.08,.44),v(.26,-.14,.48),v(.30,-.36,.48),v(.30,-.36,.26),v(.28,-.20,.10),v(.24,-.08,.20)])(p);
    const R=loop3([v(-.30,-.36,.48),v(-.30,-.36,.26),v(-.28,-.20,.10),v(-.24,-.08,.20),v(-.22,-.08,.30),v(-.22,-.06,.37),v(-.22,-.08,.44),v(-.26,-.14,.48)])(p);
    const twist = 16 * Math.sin(p * Math.PI * 2 + Math.PI / 2) * -1;
    const out: Record<string, Ch> = {
      Spine: [6, twist * 0.4, 0], Spine1: [4, twist * 0.6, 0], Neck: [0, -twist * 0.5, 0], Head: [-4, -twist * 0.4, 0],
    };
    // Sitting low, legs stretched forward with bent knees.
    seatedLegs(out, 70, -32, 6, 10);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Left: { pos: L, pole: v(1, -0.8, -0.3), dir: v(-0.2, 0, 1), palm: v(0, -1, 0) },
        Right: { pos: R, pole: v(-1, -0.8, -0.3), dir: v(0.2, 0, 1), palm: v(0, -1, 0) },
      },
    };
  },
};

const rowBoat: Clip = {
  id: 'row_boat', name: 'Row boat', category: 'Vehicles', duration: 2.4, loop: true,
  sample: (t) => {
    const p = t / 2.4;
    // Catch (leaning forward, arms long) -> drive (lean back, pull to the chest) -> recovery
    // (hands drop to lift the blades, then reach forward again).
    const lean = cyc([30, 12, -16, -12, 6, 24])(p);
    const hand = (s: 1 | -1) => loop3([v(0.3 * s, -0.42, 0.56), v(0.28 * s, -0.34, 0.4), v(0.26 * s, -0.36, 0.12), v(0.27 * s, -0.46, 0.16), v(0.29 * s, -0.5, 0.38), v(0.3 * s, -0.47, 0.52)])(p);
    const out: Record<string, Ch> = {
      Spine: [lean * 0.55, 0, 0], Spine1: [lean * 0.3, 0, 0], Spine2: [lean * 0.15, 0, 0], Neck: [-lean * 0.4, 0, 0], Head: [-lean * 0.3, 0, 0],
    };
    // Fixed seat, feet braced against the stretcher.
    seatedLegs(out, 74, -58, 10, 9);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Left: { pos: hand(1), pole: v(1, -0.6, -0.6), dir: v(0.15, 0, 1), palm: v(0, -1, 0) },
        Right: { pos: hand(-1), pole: v(-1, -0.6, -0.6), dir: v(-0.15, 0, 1), palm: v(0, -1, 0) },
      },
    };
  },
};

const driveBoat: Clip = {
  id: 'drive_boat', name: 'Drive boat (helm)', category: 'Vehicles', duration: 5, loop: true,
  sample: (t) => {
    const a = (t / 5) * Math.PI * 2;
    const roll = 4 * Math.sin(a) + 1.5 * Math.sin(2 * a + 1); // the deck rolls with the waves
    const steer = 22 * Math.sin(a + 0.8);
    const out: Record<string, Ch> = {
      Hips: [0, 0, roll], Spine: [2, 0, -roll * 0.7], Spine1: [2, 0, -roll * 0.3], Neck: [0, 0, -roll * 0.2], Head: [-2, 0.25 * steer, 0],
    };
    // Wide, soft-kneed stance for balance.
    side(out, 'UpLeg', [10, 0, 10], [10, 0, 10]);
    side(out, 'Leg', [-16 + 4 * Math.sin(a), 0, 0], [-16 - 4 * Math.sin(a), 0, 0]);
    side(out, 'Foot', [6, 0, -6], [6, 0, -6]);
    grip(out, 'Left');
    grip(out, 'Right');
    return { bones: out, root: { ground: true, x: 0.01 * Math.sin(a) }, thumbs: { Left: 0.5, Right: 0.5 }, ik: wheelHands(v(0, -0.3, 0.44), 0.2, 35, steer) };
  },
};

/** Upright cockpit posture: right hand on cyclic, left on collective, feet on the pedals. */
const flyHelicopter:Clip={
 id:'fly_helicopter',name:'Pilot helicopter (fly / hover)',category:'Vehicles',duration:6,loop:true,
 sample:t=>{
  const a=t/6*Math.PI*2,bones:Record<string,Ch>={Spine:[-3,0,0],Spine1:[2,0,0],Neck:[1,0,0],Head:[0,3*Math.sin(a),0]};
  seatedLegs(bones,82,-82,0,6);grip(bones,'Left');grip(bones,'Right');
  return{bones,root:{ground:true},thumbs:{Left:.6,Right:.6},ik:{
   Right:{pos:v(-.13,-.43,.38+.006*Math.sin(a)),pole:v(-1,-.7,-.3),dir:v(0,-.10,1),palm:v(1,0,0)},
   Left:{pos:v(.29,-.53,.08),pole:v(1,-.7,-.3),dir:v(0,0,1),palm:v(0,-1,0)}
  }};
 }
};

/** Seated, upright operators with controls inside a real cockpit. */
const driveTank:Clip={id:'drive_tank',name:'Drive military tank',category:'Vehicles',duration:4,loop:true,sample:t=>{
 const bones:Record<string,Ch>={Spine:[-3,0,0],Spine1:[2,0,0],Head:[0,Math.sin(t*Math.PI/2)*3,0]};seatedLegs(bones,80,-82,2,9);grip(bones,'Left');grip(bones,'Right');
 const hand=(s:1|-1):HandTarget=>({pos:v(.23*s,-.43,.28+.008*s*Math.sin(t*Math.PI/2)),pole:v(s,-1,-.25),dir:v(0,-.1,1),palm:v(-s,0,0)});
 return {bones,root:{ground:true},ik:{Left:hand(1),Right:hand(-1)},thumbs:{Left:.6,Right:.6}};
}};
/** Jet pilot: right hand on the centre stick, left on the throttle. `stick` and `throttle` are small offsets in metres. */
const jetPilot=(t:number,stick:[number,number],throttle:number)=>{
 const s=flyHelicopter.sample(t);return {...s,ik:{Right:{pos:v(-.12+stick[0],-.43,.32+stick[1]),pole:v(-1,-.8,-.2),dir:v(0,-.1,1),palm:v(1,0,0)},Left:{pos:v(.26,-.46,.14+throttle),pole:v(1,-.8,-.2),dir:v(0,0,1),palm:v(0,-1,0)}}};
};
// Small, continuous stick inputs; Studio banks the airborne jet a beat behind them.
const flyJet:Clip={...flyHelicopter,id:'fly_jet',name:'Pilot jet (fly / taxi)',sample:t=>{const a=t/6*Math.PI*2;return jetPilot(t,[.014*Math.sin(a),.006*Math.sin(2*a)],.03);}};
const ease=(x:number)=>{const u=Math.max(0,Math.min(1,x));return u*u*(3-2*u);};
const takeoffJet:Clip={...flyJet,id:'takeoff_jet',name:'Take off jet',loop:false,sample:t=>{const u=t/6;return jetPilot(t,[0,-.035*ease((u-.38)/.08)+.025*ease((u-.62)/.2)],.06*ease(u/.08));}};
const landJet:Clip={...flyJet,id:'land_jet',name:'Land jet',loop:false,sample:t=>{const u=t/6;return jetPilot(t,[0,-.03*ease((u-.42)/.12)+.03*ease((u-.62)/.1)],.03-.06*ease((u-.3)/.25));}};
const taxiJet:Clip={...flyJet,id:'taxi_jet',name:'Taxi jet on runway',sample:t=>jetPilot(t,[.005*Math.sin(t/6*Math.PI*2),0],0)};

/**
 * Bail out with a parachute: from the seat, out through the open side and clear of the airframe, turning
 * belly-down into the free-fall pose (Skydive continues from here). Hands move from the controls to free fall.
 */
const lerp3=(a:V3,b:V3,w:number):V3=>v(a[0]+(b[0]-a[0])*w,a[1]+(b[1]-a[1])*w,a[2]+(b[2]-a[2])*w);
const mixHand=(a:HandTarget|undefined,b:HandTarget|undefined,w:number):HandTarget|undefined=>!a||!b?(w<.5?a:b):{pos:lerp3(a.pos,b.pos,w),pole:lerp3(a.pole,b.pole,w),...(a.dir&&b.dir?{dir:lerp3(a.dir,b.dir,w)}:{}),...(a.palm&&b.palm?{palm:lerp3(a.palm,b.palm,w)}:{})};
const bailout=(id:string,name:string,ride:Clip):Clip=>({id,name,category:'Vehicles',duration:2.6,loop:false,sample:t=>{
 const P=BAILOUT_PATHS[id],k=(a:number[])=>track(P.T,a)(t),w=ease((t-P.pose[0])/P.pose[1]),a=ride.sample(0),b=skydive.sample(0),bones:Record<string,Ch>={};
 for(const key of new Set([...Object.keys(a.bones),...Object.keys(b.bones)]))bones[key]=lerp3(a.bones[key]??[0,0,0],b.bones[key]??[0,0,0],w);
 return {bones,root:{ground:true,lift:k(P.lift),x:k(P.x),pitch:k(P.pitch)},ik:{Left:mixHand(a.ik?.Left,b.ik?.Left,w),Right:mixHand(a.ik?.Right,b.ik?.Right,w)},thumbs:w<.5?a.thumbs:b.thumbs,gaze:[0,0]};
}});
const bailoutJet=bailout('bailout_jet','Bail out of jet with parachute',flyJet),bailoutHelicopter=bailout('bailout_helicopter','Jump from helicopter with parachute',flyHelicopter);

/**
 * Crash escape: from the seat, turn to the driver's door, dive out to the left, shoulder-roll along the ground
 * (a forward roll in the dive direction) and stand, turning back to the original heading. The vehicle crash
 * itself (slide and roll-over) is the prop's motion.
 */
const crash=(model:string,ride:string):Clip=>({id:`crash_${model}`,name:`Crash and roll out (${model.replace(/_/g,' ')})`,category:'Vehicles',duration:CRASH_DURATION,loop:false,
 liftWeight:t=>track(CRASH_PATH.T,CRASH_PATH.floor)(t),sample:t=>{
 const k=(a:number[])=>track(CRASH_PATH.T,a)(t),bones:Record<string,Ch>={Spine:[k([0,10,0,15,40,50,45,30,20,8,0]),0,0],Spine1:[k([0,5,0,10,25,30,28,20,10,4,0]),0,0],Neck:[k([0,0,-10,10,35,40,30,15,5,0,0]),0,0],Head:[k([0,0,-10,5,20,25,15,5,0,0,0]),0,0]};
 side(bones,'UpLeg',[k([80,70,10,30,110,125,130,100,80,30,0]),0,6],[k([80,70,10,30,110,125,130,100,80,30,0]),0,6]);
 side(bones,'Leg',[k([-80,-60,-10,-40,-120,-130,-135,-115,-100,-40,-3]),0,0],[k([-80,-60,-10,-40,-120,-130,-135,-115,-100,-40,-3]),0,0]);
 side(bones,'Foot',[k([0,10,-20,10,25,25,30,30,25,10,0]),0,0],[k([0,10,-20,10,25,25,30,30,25,10,0]),0,0]);
 const arm=k([10,40,120,100,70,60,45,40,40,20,5]),out=k([5,10,15,15,15,20,20,15,15,8,4]),fore=k([40,30,10,30,50,60,50,40,35,20,12]);
 side(bones,'Arm',[arm,0,out],[arm,0,out]);side(bones,'ForeArm',[fore,0,0],[fore,0,0]);fingers(bones,k([20,25,10,15,25,25,20,20,18,15,14]));
 const s:Sample={bones,root:{x:k(CRASH_PATH.x),y:k(CRASH_PATH.y),yaw:k(CRASH_PATH.yaw),pitch:k(CRASH_PATH.pitch),drop:k(CRASH_PATH.drop),floor:true},gaze:[0,0]};
 // Leave the seat from the exact riding pose.
 if(t<.5)s.blend={sample:VEHICLES.find(c=>c.id===ride)!.sample(0),w:1-ease(t/.5)};return s;
}});
/** Crash and fall down: thrown clear, landing hard and tumbling onto the back, limp (Get up (from back) follows). */
const crashFall=(model:string,ride:string):Clip=>({id:`crash_fall_${model}`,name:`Crash and fall down (${model.replace(/_/g,' ')})`,category:'Vehicles',duration:CRASH_FALL_DURATION,loop:false,
 liftWeight:t=>track(CRASH_FALL_PATH.T,CRASH_FALL_PATH.floor)(t),sample:t=>{
 const P=CRASH_FALL_PATH,k=(a:number[])=>track(P.T,a)(t),b=ON_BACK,end=(a:number[],v:number)=>k([...a,v,v,v]);
 const bones:Record<string,Ch>={Spine:[end([0,10,-10,-20,-10,-5,-3],b.spine[0]),0,0],Spine1:[end([0,5,-6,-12,-6,-3,-2],b.spine[1]),0,0],
  Neck:[end([0,0,-10,15,10,0,-4],b.spine[2]),0,0],Head:[end([0,0,-10,15,10,0,-5],b.spine[3]),k([0,0,10,-10,15,20,15,12,12,12]),0]};
 for(const [i,name]of (['Left','Right']as const).entries()){
  // Flailing arms thrown out, then the limp lying pose (the right side mirrored by sign, as `side` does).
  const m=i?-1:1;
  bones[`${name}UpLeg`]=[end([80,70,40,60,40,20,10],b.upLeg[i]),0,m*end([6,6,15,20,12,8,8],i?10:8)];
  bones[`${name}Leg`]=[end([-80,-60,-30,-70,-40,-20,-12],b.leg[i]),0,0];bones[`${name}Foot`]=[end([0,10,-10,-10,-20,-20,-20],b.foot[i]),0,0];
  bones[`${name}Arm`]=[end([10,40,100,140,60,10,0],b.arm[i]),0,m*end([5,10,40,60,50,35,28],b.armOut[i])];bones[`${name}ForeArm`]=[end([40,30,20,40,30,15,10],b.foreArm[i]),0,0];
 }
 fingers(bones,k([20,25,10,15,25,22,20,18,18,18]));
 const s:Sample={bones,root:{x:k(P.x),y:k(P.y),z:k(P.z),yaw:k(P.yaw),pitch:k(P.pitch),drop:k(P.drop),floor:true},gaze:[0,0]};
 if(t<.5)s.blend={sample:VEHICLES.find(c=>c.id===ride)!.sample(0),w:1-ease(t/.5)};return s;
}});
export const VEHICLE_CRASHES:Clip[]=CRASH_VEHICLES.flatMap(([model,ride])=>[crash(model,ride),crashFall(model,ride)]);

/**
 * Tank machine gunner: standing on the driver's floor, head and shoulders out of the open hatch behind the gun
 * shield, both hands on the spade grips. The gun traverses slowly and fires in short bursts.
 */
export const TANK_GUN={pivot:.72,traverse:14,burst:[1.5,.6]as const};
export const tankGunFiring=(t:number)=>t%TANK_GUN.burst[0]<TANK_GUN.burst[1];
const gunTank:Clip={id:'gun_tank',name:'Fire tank machine gun',category:'Vehicles',duration:6,loop:true,sample:t=>{
 const bones:Record<string,Ch>={Spine:[6,0,0],Spine1:[3,0,0],Neck:[-5,0,0],Head:[-4,0,0]};grip(bones,'Left');grip(bones,'Right');
 const yaw=TANK_GUN.traverse*Math.sin(t/6*Math.PI*2)*Math.PI/180,kick=tankGunFiring(t)?.012*Math.abs(Math.sin(t*55)):0;
 const hand=(s:1|-1):HandTarget=>{const x=s*.11,z=.40-kick-TANK_GUN.pivot;return {pos:v(x*Math.cos(yaw)+z*Math.sin(yaw),-.12,TANK_GUN.pivot-x*Math.sin(yaw)+z*Math.cos(yaw)),pole:v(s,-.8,-.3),dir:v(0,-.15,1),palm:v(-s,0,0)};};
 bones.Spine[1]=yaw*180/Math.PI*.6;
 return {bones,root:{y:.15},ik:{Left:hand(1),Right:hand(-1)},thumbs:{Left:.6,Right:.6},gaze:[0,0]};
}};
export const VEHICLES: Clip[] = [driveCar, sitPassenger,
 {...driveCar,id:'drive_sports_car',name:'Drive modern sports car'},
 {...sitPassenger,id:'sit_sports_car_passenger',name:'Sit (sports car passenger)'},
 {...driveCar,id:'drive_suv',name:'Drive SUV'},
 {...sitPassenger,id:'sit_suv_passenger',name:'Sit (SUV passenger)'}, {...driveCar,id:'drive_pickup',name:'Drive pickup truck'},{...sitPassenger,id:'sit_pickup_passenger',name:'Sit (pickup passenger)'},driveTank,gunTank,taxiJet,flyJet,takeoffJet,landJet,bailoutJet, rideBicycle, rideMotorcycle, rideHorse, paddleCanoe, paddleKayak, rowBoat, driveBoat, flyHelicopter,bailoutHelicopter];

/** Exact contact poses are fitted by Animator, shared by previews and exports. */
export const BOARDING: Clip[] = VEHICLE_TRANSITIONS.flatMap(([id, ride, name, duration]) =>
 (['board','alight'] as const).map(direction => ({
  id:`${direction}_${id}`, name: `${direction==='board'?'Board':'Alight from'} ${name}`,
  category:'Vehicles' as const, duration, loop:false, vehicleTransition:{ride,direction}, sample:()=>idle.sample(0),
 })),
);

/** Controlled, complete stunt rolls; they return to the exact native driving pose. */
export const VEHICLE_TUMBLES:Clip[]=VEHICLE_STUNTS.map(([model,ride])=>({
 id:`tumble_${model}`,name:`Tumble ${model.replace(/_/g,' ')} (stunt roll)`,category:'Vehicles',duration:3,loop:false,
 vehicleStunt:{model,ride},sample:()=>VEHICLES.find(c=>c.id===ride)!.sample(0),
}));
