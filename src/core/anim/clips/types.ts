/**
 * Animation clips, defined procedurally against the game-rig bone names.
 *
 * Channels are degrees about each bone's own axes in the "animation rest"
 * (relaxed arms): X = flex (+ swings the bone's tip forward: thigh forward,
 * spine lean forward, elbow bend, toes up; knee bend is negative), Y = twist
 * (+ turns left on vertical bones), Z = side (+ raises the left arm out).
 * Right-side values are written as the mirror of the left via `side()`.
 */
export type Ch = [number, number, number];

export interface Root {
  /** Metres (scaled to the character's height), in the character's rest frame. */
  x?: number;
  y?: number;
  z?: number;
  /** Degrees about world up (+ = turn left) and world X (+ = pitch forward). */
  yaw?: number;
  pitch?: number;
  /** 0..1: lowers the hips from standing height to lying height. */
  drop?: number;
  /** Keep the lowest foot on the floor (adjusts hip height after posing). */
  ground?: boolean;
  /** Metres added after grounding (jumps). */
  lift?: number;
  /** Lift the body so no joint sinks below the floor (lying, crawling, getting up). */
  floor?: boolean;
  /**
   * Raise the body (never lower it) until the hands can reach their floor-space targets with the arms just short of
   * straight, so a hang fits every body's arm length.
   */
  reach?: boolean;
}

/**
 * Hand IK target in "chest space": metres (at 1.8 m height) from the base of
 * the neck, axes following the chest (+X character's left, +Y up, +Z forward).
 * The shoulder joints sit about 0.1 m below and 0.2 m to each side of it.
 */
export interface HandTarget {
  pos: [number, number, number];
  /** Direction the elbow should point (chest space). */
  pole: [number, number, number];
  /** Optional hand orientation: direction from wrist to fingers, and palm normal (chest space). */
  dir?: [number, number, number];
  palm?: [number, number, number];
  /** `pos` is the tip of a straight index finger (pointing along `dir`), not the wrist: placed with the rig's own finger length. */
  tip?: boolean;
  /**
   * Support hand on a weapon held in the other hand's WeaponR socket: the target is taken
   * from where the weapon actually is (pos/dir/palm above are only a fallback).
   */
  support?: 'rifle';
  /**
   * 'floor': pos is in the character's floor space (metres at 1.8 m height, from the floor under
   * the character, +Z forward) and the directions are too, so the hand stays put while the chest
   * moves: hands on handlebars and other fixed things.
   */
  space?: 'floor';
}

/** Ankle target in floor space; `rise` (0..1) is how much of a Root.reach lift it follows (feet braced on a wall rise with the body, feet on a ledge stay). */
export interface FootTarget {
  pos: [number, number, number]; pole: [number, number, number]; rise?: number;
  /** How firmly the ankle follows the target (0..1, default 1): eases a foot from its FK pose onto a hold. */
  weight?: number;
}

export interface Sample {
  bones: Record<string, Ch>;
  root: Root;
  ik?: { Left?: HandTarget; Right?: HandTarget };
  /**
   * Ankle targets in floor space (metres at 1.8 m, from the character's origin), for feet on rungs or ledges:
   * the leg is solved to reach them with the knee towards `pole`. Like floor-space hands, they move with root motion.
   */
  /**
   * Planted feet (0..1 per side): the ankle stays where it stood in the clip's first frame on this body, so turning
   * hips and twisting stances don't slide it. For clips that don't travel; fade a foot out before it steps or kicks.
   */
  plant?: { Left?: number; Right?: number };
  /** How firmly each hand follows its IK target (0..1, default 1): fades a hand onto or off a contact. */
  ikWeight?: { Left?: number; Right?: number };
  feet?: { Left?: FootTarget; Right?: FootTarget };
  /** A hand-held prop on its own joint (the phone), placed in chest space: centre, screen normal (+X) and top (+Z). */
  prop?: { pos: [number, number, number]; x: [number, number, number]; z: [number, number, number] };
  /** 0..1: wrap the thumb across the front of the index/middle fingers (fists). */
  thumbs?: { Left?: number; Right?: number };
  /** Facial blend-shape weights added on top of the character's expression (see core/face.ts). */
  face?: Partial<Record<string, number>>;
  /** Where the eyes look, degrees: [left (+) / right (-), up (+) / down (-)]. Replaces automatic glances. */
  gaze?: [number, number];
  /** Motion capture (test): retargeted by the evaluator onto the rig (see anim/mocap.ts). */
  mocap?: import('../mocap').MocapSample;
  /** Blend the solved pose toward another sample's (w: 0 = this pose, 1 = the other), e.g. easing a
   * captured clip into a keyframed rest pose. */
  blend?: { sample: Sample; w: number; /** Keep interpolated feet from sinking below the floor. */ ground?: boolean };
}

/**
 * Where a bullet hits, for blood effects: at clip time `t`, on `bone` (game-rig name), travelling along `dir`
 * (character frame: +X left, +Y up, +Z forward), so blood sprays out along it. `pool`: the clip time a pool starts
 * spreading under that bone once the body is down.
 */
export interface Wound { t: number; bone: 'Head' | 'Spine2' | 'Spine' | 'LeftUpLeg' | 'RightArm'; dir: [number, number, number]; pool?: number }
export type ClipCategory = 'Aerial' | 'Idle & stance' | 'Locomotion' | 'Turns' | 'Actions' | 'Emotes' | 'Shooter' | 'Vehicles' | 'Reactions' | 'Sitting & lying' | 'Interaction' | 'Swimming' | 'Everyday' | 'Climbing' | 'Combat';

export interface Clip {
  id: string;
  name: string;
  category: ClipCategory;
  duration: number;
  loop: boolean;
  /** Rigid vehicle/rider stunt transform, applied after solving control contacts. */
  vehicleStunt?:{model:string;ride:string};
  /** Share (0..1) of the vehicle floor height applied at time t: 1 in the seat, 0 once the rider is on the ground. */
  liftWeight?:(t:number)=>number;
  /** Fitted, non-looping entry/exit, solved against this rig's actual riding pose. */
  vehicleTransition?: import('../../props/vehicle-actions').VehicleTransition;
  /** Root-motion velocity (metres/second at 1.8 m height, character frame: +X left, +Z forward). */
  travel?: [number, number, number];
  /** Bullet hits (gunshot reactions). */
  wounds?: Wound[];
  sample(t: number): Sample;
}
