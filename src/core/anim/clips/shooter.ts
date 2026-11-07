/** Shooter set: rifle and pistol holds, firing, reload, grenade, death. */
import { type Ch, type Clip, type HandTarget, type Sample } from './types';
import { grip, lerp3, side, track, v } from './helpers';
import { gait, WALK, type Gait } from './gait';
import { armLayer, pace, recordedWalk, recordedRun, recordedStrafeLeft, recordedStrafeRight, walkBack } from './recorded';

// --- Shooter (rifle) -----------------------------------------------------------------------
// Hands are placed by IK in chest space; the weapon itself is supplied by the game
// (attach it to RightHand). Right-handed, rifle along +Z.

type Hold = { Left: HandTarget; Right: HandTarget };

// Shouldered aim: stock in the right shoulder pocket, grip below the bore, support hand on the handguard.
const AIM: Hold = {
  Right: { pos: v(-0.13, -0.19, 0.22), pole: v(-1, -0.9, -0.2), dir: v(0.1, -0.55, 0.83), palm: v(1, 0, 0) },
  Left: { pos: v(-0.01, -0.13, 0.5), pole: v(0.4, -1, 0), dir: v(-0.35, 0.2, 0.91), palm: v(0, 1, 0), support: 'rifle' },
};
// Low ready: same hold, muzzle angled down ~40 degrees.
const READY: Hold = {
  Right: { pos: v(-0.15, -0.36, 0.17), pole: v(-1, -0.6, -0.4), dir: v(0.1, -0.75, 0.65), palm: v(1, 0, 0) },
  Left: { pos: v(0.03, -0.42, 0.4), pole: v(0.6, -1, 0), dir: v(-0.35, 0.05, 0.93), palm: v(0, 1, 0), support: 'rifle' },
};
// Sprint: rifle carried diagonally across the chest.
const SPRINT: Hold = {
  Right: { pos: v(-0.17, -0.42, 0.13), pole: v(-1, -0.5, -0.5), dir: v(0.3, -0.75, 0.55), palm: v(1, 0, 0) },
  Left: { pos: v(0.12, -0.2, 0.27), pole: v(0.8, -1, 0), dir: v(-0.6, 0.35, 0.7), palm: v(0, 1, 0), support: 'rifle' },
};

/** Upper body for a rifle hold: shoulders square, head on the sights when aiming. */
function rifleUpper(out: Record<string, Ch>, aiming: boolean, breathe = 0) {
  out.Spine1 = [(aiming ? 4 : 2) + breathe, (out.Spine1?.[1] ?? 0), 0];
  out.Spine2 = [(aiming ? 3 : 1) + breathe * 0.5, (out.Spine2?.[1] ?? 0), 0];
  out.Neck = [aiming ? 6 : 0, aiming ? -6 : 0, 0];
  out.Head = [aiming ? 10 : 4, aiming ? -8 : 0, aiming ? -4 : 0];
  grip(out, 'Right', true);
  grip(out, 'Left');
}

/** Bladed shooter stance (left foot forward). */
function stance(out: Record<string, Ch>, crouch = false) {
  if (crouch) {
    side(out, 'UpLeg', [72, 0, 4], [65, 0, 2]);
    side(out, 'Leg', [-105, 0, 0], [-120, 0, 0]);
    side(out, 'Foot', [30, 0, 0], [40, 0, 0]);
    out.Spine = [16, 0, 0];
  } else {
    side(out, 'UpLeg', [8, 0, -1], [-6, 0, 0]);
    side(out, 'Leg', [-8, 0, 0], [-4, 0, 0]);
    side(out, 'Foot', [2, 0, 0], [0, 0, 0]);
  }
}

const hold = (h: Hold, recoil = 0): Sample['ik'] => ({
  Right: { ...h.Right, pos: v(h.Right.pos[0], h.Right.pos[1] + recoil * 0.015, h.Right.pos[2] - recoil * 0.035) },
  Left: { ...h.Left, pos: v(h.Left.pos[0], h.Left.pos[1] + recoil * 0.02, h.Left.pos[2] - recoil * 0.03) },
});

function rifleLoop(id: string, name: string, duration: number, legs: (t: number) => Sample | null, h: Hold, aiming: boolean, travel?: [number, number, number], crouch = false): Clip {
  return {
    id, name, category: 'Shooter', duration, loop: true, travel,
    sample: (t) => {
      const base = legs(t);
      const out: Record<string, Ch> = {};
      if (base) for (const [k, ch] of Object.entries(base.bones)) if (/(UpLeg|Leg|Foot|ToeBase|Hips|Spine$)/.test(k)) out[k] = ch;
      if (!base) stance(out, crouch);
      if (crouch && base) {
        // Crouched stepping: deepen the knees on top of the gait.
        for (const s of ['Left', 'Right']) {
          out[`${s}UpLeg`] = [(out[`${s}UpLeg`]?.[0] ?? 0) * 0.5 + 62, 0, 4 * (s === 'Left' ? 1 : -1)];
          out[`${s}Leg`] = [(out[`${s}Leg`]?.[0] ?? 0) * 0.5 - 100, 0, 0];
          out[`${s}Foot`] = [(out[`${s}Foot`]?.[0] ?? 0) * 0.5 + 28, 0, 0];
        }
        out.Spine = [16, out.Spine?.[1] ?? 0, 0];
      }
      // Keep the chest (and the rifle) facing forward while the hips swing.
      const hipYaw = out.Hips?.[1] ?? 0;
      out.Spine1 = [0, -hipYaw * 0.6, 0];
      out.Spine2 = [0, -hipYaw * 0.4, 0];
      const breathe = Math.sin((t / duration) * Math.PI * 2) * (base ? 0 : 1);
      rifleUpper(out, aiming, breathe);
      return { bones: out, root: base ? { ...base.root, ground: true } : { ground: true }, ik: hold(h) };
    },
  };
}

const still = () => null;
const gaitOf = (g: Gait, d: number, reverse = false) => (t: number) => gait(g, t / d, reverse);
const CROUCH_WALK: Gait = { ...WALK, thigh: WALK.thigh.map((x) => x * 0.8), knee: WALK.knee.map((x) => x * 0.6), bob: WALK.bob.map(() => 0) };

function armedMotion(id:string,name:string,base:Clip,h:Sample['ik'],kind:'rifle'|'pistol',aiming:boolean):Clip{
  const sides=(['Left','Right']as const).filter(side=>h?.[side]);
  return {...base,id,name,category:'Shooter',sample:t=>{
    const s=armLayer(base.sample(t),sides);
    if(kind==='rifle')rifleUpper(s.bones,aiming);else pistolUpper(s.bones,aiming);
    // A free support arm keeps its recorded swing and relaxed fingers during a pistol sprint.
    if(!h?.Left)for(const key of Object.keys(s.bones))if(key.startsWith('LeftHand'))delete s.bones[key];
    return {...s,ik:h,gaze:[0,0]};
  }};
}
const SPRINT_GAIT=pace(recordedRun,.82);

const rifleFire = (auto: boolean): Clip => ({
  id: auto ? 'rifle_fire_auto' : 'rifle_fire', name: auto ? 'Rifle fire (full auto)' : 'Rifle fire (single)', category: 'Shooter',
  duration: auto ? 0.4 : 0.45, loop: auto,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    // Recoil kick: sharp rise, quick settle (4 shots per loop for auto).
    const ph = auto ? (t % 0.1) / 0.1 : t / 0.45;
    const kick = auto ? Math.exp(-ph * 5) * 0.8 : track([0, 0.04, 0.12, 0.45], [0, 1, 0.35, 0])(t);
    rifleUpper(out, true);
    out.Spine2 = [3 - 3 * kick, 0, 0];
    out.Head = [10 - 3 * kick, -8, -4];
    return { bones: out, root: { ground: true }, ik: hold(AIM, kick) };
  },
});

const reload: Clip = {
  id: 'rifle_reload', name: 'Rifle reload', category: 'Shooter', duration: 2.2, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    rifleUpper(out, false);
    // Rifle canted up a little; left hand: handguard -> magazine -> pouch -> magazine -> slap -> handguard.
    const T = [0, 0.3, 0.6, 1.0, 1.35, 1.6, 1.75, 2.2];
    const right = lerp3(READY.Right.pos, v(-0.13, -0.3, 0.24), track([0, 0.3, 1.9, 2.2], [0, 1, 1, 0])(t));
    const mag = v(-0.05, -0.44, 0.3), pouch = v(0.13, -0.68, 0.1), slap = v(-0.04, -0.36, 0.28);
    const pts = [READY.Left.pos, READY.Left.pos, mag, pouch, mag, slap, READY.Left.pos, READY.Left.pos];
    const lp = v(track(T, pts.map((p) => p[0]))(t), track(T, pts.map((p) => p[1]))(t), track(T, pts.map((p) => p[2]))(t));
    out.Head = [track([0, 0.3, 1.8, 2.2], [4, 22, 22, 4])(t), track([0, 0.3, 1.8, 2.2], [0, -10, -10, 0])(t), 0];
    const open = track([0, 0.5, 0.65, 0.9, 1.0, 1.6, 1.75], [1, 1, 0.3, 0.3, 1, 1, 1])(t);
    grip(out, 'Left', false, open);
    return {
      bones: out, root: { ground: true },
      ik: {
        Right: { ...READY.Right, pos: right },
        Left: { pos: lp, pole: v(0.5, -1, -0.2), dir: v(-0.3, -0.2, 0.9), palm: v(-0.2, 1, 0) },
      },
    };
  },
};

/** Overarm throw: planted step, compact wind-up, release, follow-through and upright recovery. */
const grenade:Clip={id:'throw_grenade',name:'Throw grenade',category:'Shooter',duration:2.2,loop:false,sample:t=>{
 const T=[0,.35,.65,.82,1.12,1.55,2.2],k=(v:number[])=>track(T,v)(t),bones:Record<string,Ch>={
  Hips:[0,k([0,-12,-18,8,14,5,0]),0],Spine:[k([0,-3,-5,6,12,4,0]),0,0],Spine1:[0,k([0,-12,-18,12,14,4,0]),0],Neck:[0,0,0],Head:[0,0,0]};
 stance(bones);side(bones,'Arm',[k([0,12,18,22,12,4,0]),0,8],[0,0,0]);side(bones,'ForeArm',[16,0,0],[0,0,0]);
 const points=[v(-.23,-.4,.14),v(-.36,-.05,.08),v(-.34,.13,-.12),v(-.20,.14,.38),v(-.18,-.25,.46),v(-.23,-.43,.15),v(-.23,-.45,.08)];
 const pos=v(...[0,1,2].map(i=>track(T,points.map(p=>p[i]))(t))as [number,number,number]);
 grip(bones,'Right',false,k([1,1,1,.05,0,0,0]));
 return {bones,root:{ground:true},ik:{Right:{pos,pole:v(-1,-.5,-.45),dir:v(0,.1,1),palm:v(1,0,0)}},thumbs:{Right:k([.8,.8,.8,.05,0,0,0])},gaze:[0,0]};
}};


// --- Pistol --------------------------------------------------------------------------------
// Two-handed isosceles grip: arms extended, support hand wrapped around the firing hand.
const PISTOL_AIM: Hold = {
  Right: { pos: v(-0.05, -0.14, 0.5), pole: v(-0.6, -1, 0), dir: v(0.05, -0.25, 0.97), palm: v(1, 0, 0) },
  Left: { pos: v(0.03, -0.17, 0.47), pole: v(0.6, -1, 0), dir: v(-0.45, -0.2, 0.87), palm: v(-0.6, 0.4, 0.2) },
};
const PISTOL_READY: Hold = {
  Right: { pos: v(-0.05, -0.46, 0.3), pole: v(-0.6, -1, 0), dir: v(0.05, -0.75, 0.66), palm: v(1, 0, 0) },
  Left: { pos: v(0.03, -0.48, 0.27), pole: v(0.6, -1, 0), dir: v(-0.45, -0.6, 0.6), palm: v(-0.6, 0.4, 0.2) },
};
function pistolUpper(out: Record<string, Ch>, aiming: boolean) {
  out.Spine1 = [aiming ? 6 : 3, 0, 0];
  out.Neck = [aiming ? 6 : 0, 0, 0];
  out.Head = [aiming ? 6 : 6, 0, 0];
  grip(out, 'Right', true);
  grip(out, 'Left');
}
const pistolIdle: Clip = {
  id: 'pistol_idle', name: 'Pistol idle (low ready)', category: 'Shooter', duration: 3, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    pistolUpper(out, false);
    out.Spine = [Math.sin((t / 3) * Math.PI * 2), 0, 0];
    return { bones: out, root: { ground: true }, ik: PISTOL_READY };
  },
};
const pistolAim: Clip = {
  id: 'pistol_aim', name: 'Pistol aim', category: 'Shooter', duration: 2.5, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    pistolUpper(out, true);
    out.Spine = [0.8 * Math.sin((t / 2.5) * Math.PI * 2), 0, 0];
    return { bones: out, root: { ground: true }, ik: PISTOL_AIM };
  },
};
const pistolFire: Clip = {
  id: 'pistol_fire', name: 'Pistol fire', category: 'Shooter', duration: 0.5, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    pistolUpper(out, true);
    // Muzzle flip: hands rise and rotate up, then settle.
    const k = track([0, 0.04, 0.14, 0.5], [0, 1, 0.3, 0])(t);
    const flip = (h: HandTarget, up: number): HandTarget => ({
      ...h, pos: v(h.pos[0], h.pos[1] + 0.03 * k, h.pos[2] - 0.02 * k), dir: v(h.dir![0], h.dir![1] + up * k, h.dir![2]),
    });
    return { bones: out, root: { ground: true }, ik: { Right: flip(PISTOL_AIM.Right, 0.45), Left: flip(PISTOL_AIM.Left, 0.3) } };
  },
};

const pistolOneHand:Clip={
  ...pistolAim,id:'pistol_aim_one_hand',name:'Pistol aim (one hand)',sample:t=>{
    const s=pistolAim.sample(t);
    for(const key of Object.keys(s.bones))if(key.startsWith('LeftHand'))delete s.bones[key];
    side(s.bones,'Arm',[0,0,3],[0,0,0]);side(s.bones,'ForeArm',[12,0,0],[0,0,0]);
    s.bones.Spine1=[0,0,0];s.bones.Neck=[0,0,0];s.bones.Head=[0,0,0];
    return {...s,ik:{Right:{...PISTOL_AIM.Right,pos:v(-.23,-.16,.46),pole:v(-1,-.8,-.25)}},gaze:[0,0]};
  },
};
const PISTOL_SPRINT:Sample['ik']={Right:{...PISTOL_READY.Right,pos:v(-.21,-.36,.17)}};

export const PISTOL: Clip[] = [
  pistolIdle,
  pistolAim,
  pistolFire,
  pistolOneHand,
  armedMotion('pistol_walk','Pistol walk',recordedWalk,PISTOL_AIM,'pistol',true),
  armedMotion('pistol_run','Pistol run',recordedRun,PISTOL_READY,'pistol',false),
  armedMotion('pistol_sprint','Pistol sprint',SPRINT_GAIT,PISTOL_SPRINT,'pistol',false),
  armedMotion('pistol_strafe_left','Pistol strafe left',recordedStrafeLeft,PISTOL_AIM,'pistol',true),
  armedMotion('pistol_strafe_right','Pistol strafe right',recordedStrafeRight,PISTOL_AIM,'pistol',true),
];

export const RIFLE: Clip[] = [
  rifleLoop('rifle_idle', 'Rifle idle (low ready)', 3, still, READY, false),
  rifleLoop('rifle_aim', 'Rifle aim idle', 2.5, still, AIM, true),
  rifleFire(false),
  rifleFire(true),
  reload,
  armedMotion('rifle_walk','Rifle walk (aiming)',recordedWalk,AIM,'rifle',true),
  armedMotion('rifle_walk_back','Rifle walk back (aiming)',walkBack,AIM,'rifle',true),
  armedMotion('rifle_strafe_left','Rifle strafe left (aiming)',recordedStrafeLeft,AIM,'rifle',true),
  armedMotion('rifle_strafe_right','Rifle strafe right (aiming)',recordedStrafeRight,AIM,'rifle',true),
  armedMotion('rifle_run','Rifle run',recordedRun,READY,'rifle',false),
  armedMotion('rifle_sprint','Rifle sprint',SPRINT_GAIT,SPRINT,'rifle',false),
  rifleLoop('rifle_crouch_aim', 'Crouch aim idle', 2.5, still, AIM, true, undefined, true),
  rifleLoop('rifle_crouch_walk', 'Crouch walk (aiming)', 1.2, gaitOf(CROUCH_WALK, 1.2), AIM, true, [0, 0, 0.8], true),
  grenade,
];
