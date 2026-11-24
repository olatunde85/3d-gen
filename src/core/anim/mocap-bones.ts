/** The bones motion capture and content packs drive, without the code that plays them (so checking a pack stays light). */
/** The game-rig bones a recording can drive: the body and the fingers (toes and the jaw stay our own). */
export const MOCAP_BONES: readonly string[] = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  ...['Left', 'Right'].flatMap((s) => [
    'Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot',
    ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((k) => `Hand${f}${k}`)),
  ].map((n) => s + n)),
];
/** Bones every recording must drive, so a body never moves with a limb left in its rest pose. */
export const REQUIRED_MOCAP_BONES: readonly string[] = ['Hips', 'Head', ...['Left', 'Right'].flatMap((s) => ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'].map((n) => s + n))];
