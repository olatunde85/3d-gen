# Animations

There are 77 clips. The character loads playing **Idle**. The animation bar at the top of the viewport has quick buttons (Bind pose, Idle, Walk, Run), previous / next, and **All animations**, a drawer with search and categories that keeps the character in view.

| Category | Clips |
| --- | --- |
| Idle & stance | Idle, Crouch idle (loops) |
| Locomotion | Walk, Slouch walk, Model walk (catwalk), Run, Walk backwards, Strafe left/right (loops; in place, or with root motion) |
| Sitting & lying | Sit down, Sit idle, Stand up (on a chair; Idle → Sit down → Sit idle → Stand up → Idle chain without a jump); Lie down, Sleep (on the back; they chain into Get up (from back)) |
| Actions | Jump, Fall, Punch, Low punch, Hit reaction (one-shots); Jump start, Jump (in air) (loop), Jump land and Running jump, split for engine character controllers; sword idle (guard), sword slash, sword block |
| Interaction | Pick up (ground), Use / press, Open door, Push (one-shots); Carry idle and Carry walk (loops) |
| Emotes | Wave, Cheer, Laugh, Cry, Talk (loops) |
| Turns | Left/right 45° and 90°, full 360° (one-shots: hip yaw with stepping feet) |
| Shooter | Pistol idle (low ready), aim and fire. Rifle idle (low ready), aim idle, fire single, fire full-auto, reload, aiming walk / walk back / strafe left / strafe right, run, sprint, crouch aim and crouch walk. Throw grenade. |
| Reactions | Hit from front / back / left / right, knockdown, death (fall forward), death (fall backward), get up (from back), get up (from front) (one-shots). Knockdown ends where Get up (from back) starts, and Death (fall forward) ends where Get up (from front) starts, so they chain without a pop |
| Vehicles | Drive car, sit (passenger), ride bicycle, ride motorcycle, ride horse (trot), paddle canoe, paddle kayak, row boat, drive boat (helm) (loops) |

Feet are grounded automatically (crouch, landing, steps), and switching clips in the viewer crossfades over 0.25 s.

## Motion capture

These clips are recorded performances from the [CMU motion capture database](http://mocap.cs.cmu.edu), retargeted onto each character:
- Walk, Slouch walk, Run and Strafe left/right (Carry walk reuses the recorded Walk with a two-hand IK layer; Model walk is the recorded Walk with the legs closed, so the feet land on one line and the swinging leg passes round the standing one)
- Jump and Low punch
- Cry
- Sit down and Sit idle (Stand up is Sit down in reverse)

The retargeting:
- **Alignment:** limbs are aligned to the recording's rest pose.
- **Calibration for the body:** arm hang, stance width, flat planted feet, and each actor's neutral head position.
- **Loops:** close seamlessly.
- **Floor contact:** the feet keep it, and the toes bend instead of dipping through the floor.

The takes and cuts are listed in `scripts/mocap-takes.ts`. `npm run build-mocap` bakes them into compact data (`src/core/anim/clips/mocap-data.ts`), so the app, the exporters and the tests have them without the source files.

## Interaction

The **Interaction** category contains six clips. They animate the character; your game supplies the box, button, door or other object.

- **Pick up (ground)** (3.4 s): look down, reach forward, squat with the hands clear of the knees, close both hands on a low object, then lift with the legs. Grip at about 1.5 s; the clip ends in the first pose of **Carry idle**, so the two chain without a pop.
- **Use / press** (1.65 s): reach with the right hand, press with the extended index finger around 0.88 s, then retract.
- **Open door** (2.8 s): reach for a handle on the right, turn the latch around 1.0 s, pull through a 32° arc, release and return. The door hinge is to the character's right, so the pull clears the torso. Animate your door to match the handle path; this is a pull-open action.
- **Push** (2.6 s): reach with both open palms, brace in a staggered stance and drive forward, then recover. The main effort is between 1.15 and 1.65 s.
- **Carry idle** (3.6 s loop): a balanced two-hand hold with restrained breathing.
- **Carry walk**: the existing recorded Walk with a cadence about 15% slower, retaining its footfalls, hip motion and stride distance. The arms use IK instead of swinging; both wrists stay at the sides of the same object. Root motion travels the recorded stride distance per loop; turn it off when your controller supplies movement.

The carry clips hold a roughly 40 cm-wide object in front of the torso. Wrist targets are 46 cm apart, with fingers forward and palms facing inward (scaled to the character's height). Parent your prop to a hand or drive it from the midpoint of the two wrists. These clips do not add a box to the character or export an interaction prop. The existing handbag and briefcase props remain one-hand accessories.

Interaction hands use chest-space IK; the pickup reach uses floor-space targets that account for the body’s grounding offset while it squats. The door hand follows the forearm with a small latch twist, avoiding a forced sideways wrist bend. Actions ease in from and back to the relaxed pose, except pickup, which ends holding the object. Timings are authoring references for game events, not an automatic object-attachment system.

## Vehicles and props

The vehicle clips animate the rider only, like the shooter set: your game supplies the vehicle and parents the character to its seat.
- **Car, passenger and boat:** the feet stay on the floor at seat height.
- **Bicycle, motorcycle and horse:** the hips stay at saddle height. For an average adult, that's about 0.93 m on a bicycle, 0.78 m on a motorcycle and 1.4 m on a horse.
- **Hands:** placed by IK on the controls (wheel at 9 and 3, handlebars, reins, paddle, oars), so they fit every body shape.

**Bicycle prop:** under *Props*, choose *Ride: Bicycle*. It plays Ride bicycle and shows a bicycle fitted to the character, measured from the clip:
- the saddle under the hips and the grips in the closed fists
- the frame clear of the thighs
- the wheels and pedals turning in time with the feet

The hands are pinned to the bar, so they hold it firmly while the body pedals. The bicycle is a preview prop for now and isn't included in exports.

## Weapons

**Bags:** under *Props*, *Bag* picks a straw tote, a structured handbag or a leather briefcase (carried in the left hand, bound to the hand bone, its fingers closed round the handle in every clip) or a canvas backpack (worn). Each bag has its own colours: the straw and trim of the tote; the leather (smooth, patent on the handbag, or grained) and hardware of the handbag and briefcase; and the canvas and accent of the backpack.

Pick an assault rifle, pistol, sword or combat knife under *Props*. It's held in the right hand on the `WeaponR` socket (see [Rigging](rigging.md#weapon-socket)), and the viewer switches to the matching idle.

- **Aiming:** firearms are fitted to the aiming pose. The barrel lines up with the chest's forward axis, and the rifle's handguard sits under the support hand.
- **Your own props:** the shooter clips also work without a weapon, with your own prop parented to `WeaponR`.
- **Hands stay on the weapon:** two-bone arm IK places the right hand first, then the left hand onto the rifle's handguard wherever the rifle actually is. The left hand slides along the handguard if a pose would over-stretch the arm, so the hands stay on the weapon on every body shape and skeleton.
- **Grips:** fingers curl toward the palm, which is detected from each hand's joints, so fists and grips close correctly on A- and T-pose binds.

## How clips work

- **Keyframed clips** are defined once (`src/core/anim/clips/`, one file per set). Each bone is posed in its own frame (X = flex forward, Y = twist, Z = side), on an "animation rest" with relaxed arms and nearly straight elbows.
- **Hand targets** can be given relative to the chest (most clips) or to the floor (`HandTarget.space: 'floor'`, for hands on something fixed, like handlebars).
- **One evaluator:** `src/core/anim/evaluate.ts` drives the viewer and both exporters. So one clip works on every skeleton type and on A- or T-pose binds, and the preview matches the export exactly.

In the exports, GLB has one glTF animation per clip (30 fps, rotation channels plus root translation), and FBX has one AnimationStack (take) per clip. `scripts/blender_anim_check.py` imports the files into Blender and renders key frames of every action.

To add a clip, see [CONTRIBUTING.md](../CONTRIBUTING.md#adding-an-animation).
