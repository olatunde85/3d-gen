# Animations

There are 70 clips. The character loads playing **Idle**. The animation bar at the top of the viewport has quick buttons (Bind pose, Idle, Walk, Run), previous / next, and **All animations**, a drawer with search and categories that keeps the character in view.

| Category | Clips |
| --- | --- |
| Idle & stance | Idle, Crouch idle (loops) |
| Locomotion | Walk, Slouch walk, Run, Walk backwards, Strafe left/right (loops; in place, or with root motion) |
| Sitting & lying | Sit down, Sit idle, Stand up (on a chair; Idle → Sit down → Sit idle → Stand up → Idle chain without a jump); Lie down, Sleep (on the back; they chain into Get up (from back)) |
| Actions | Jump, Fall, Punch, Low punch, Hit reaction (one-shots); Jump start, Jump (in air) (loop), Jump land and Running jump, split for engine character controllers; sword idle (guard), sword slash, sword block |
| Emotes | Wave, Cheer, Laugh, Cry, Talk (loops) |
| Turns | Left/right 45° and 90°, full 360° (one-shots: hip yaw with stepping feet) |
| Shooter | Pistol idle (low ready), aim and fire. Rifle idle (low ready), aim idle, fire single, fire full-auto, reload, aiming walk / walk back / strafe left / strafe right, run, sprint, crouch aim and crouch walk. Throw grenade. |
| Reactions | Hit from front / back / left / right, knockdown, death (fall forward), death (fall backward), get up (from back), get up (from front) (one-shots). Knockdown ends where Get up (from back) starts, and Death (fall forward) ends where Get up (from front) starts, so they chain without a pop |
| Vehicles | Drive car, sit (passenger), ride bicycle, ride motorcycle, ride horse (trot), paddle canoe, paddle kayak, row boat, drive boat (helm) (loops) |

Feet are grounded automatically (crouch, landing, steps), and switching clips in the viewer crossfades over 0.25 s.

## Motion capture

These clips are recorded performances from the [CMU motion capture database](http://mocap.cs.cmu.edu), retargeted onto each character:
- Walk, Slouch walk, Run and Strafe left/right
- Jump and Low punch
- Cry
- Sit down and Sit idle (Stand up is Sit down in reverse)

The retargeting:
- **Alignment:** limbs are aligned to the recording's rest pose.
- **Calibration for the body:** arm hang, stance width, flat planted feet, and each actor's neutral head position.
- **Loops:** close seamlessly.
- **Floor contact:** the feet keep it, and the toes bend instead of dipping through the floor.

The takes and cuts are listed in `scripts/mocap-takes.ts`. `npm run build-mocap` bakes them into compact data (`src/core/anim/clips/mocap-data.ts`), so the app, the exporters and the tests have them without the source files.

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
