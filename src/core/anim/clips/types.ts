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

export interface Sample {
  bones: Record<string, Ch>;
  root: Root;
  ik?: { Left?: HandTarget; Right?: HandTarget };
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
  blend?: { sample: Sample; w: number };
}

export type ClipCategory = 'Idle & stance' | 'Locomotion' | 'Turns' | 'Actions' | 'Emotes' | 'Shooter' | 'Vehicles' | 'Reactions' | 'Sitting & lying';

export interface Clip {
  id: string;
  name: string;
  category: ClipCategory;
  duration: number;
  loop: boolean;
  /** Root-motion velocity (metres/second at 1.8 m height, character frame: +X left, +Z forward). */
  travel?: [number, number, number];
  sample(t: number): Sample;
}
