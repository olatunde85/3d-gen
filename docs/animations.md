# Animations

There are 187 clips. The character loads playing **Idle**. The animation bar at the top of the viewport has quick buttons (Bind pose, Idle, Walk, Run), previous / next, and **All animations**, a drawer with search and categories that keeps the character in view.

| Category | Clips |
| --- | --- |
| Idle & stance | Idle, Crouch idle (loops) |
| Locomotion | Walk, Slouch walk, Model walk (catwalk), Run, Walk backwards, Strafe left/right (loops; in place, or with root motion) |
| Turns | Left/right 45° and 90°, full 360° |
| Actions | Jump, Fall, Punch, Low punch, Hit reaction; Jump start, Jump (in air) (loop), Jump land and Running jump for engine character controllers; Forward roll, Side dodge left/right; Sword idle (guard), Sword slash, Sword block |
| Reactions | Hit from front / back / left / right, Knockdown, Death (fall forward / backward), Get up (from back / front) |
| Interaction | Pick up (ground), Put down / drop (ground), Use / press, Open door, Push; Carry idle, Carry walk, Head-load idle, Head-load walk (loops) |
| Everyday | Talk with gestures, Phone call, Texting, Lean on wall, Look around, Sweep (loops) |
| Emotes | Wave, Cheer, Laugh, Talk, Cry, Clap, Dance (groove), Dance (party bounce) (loops); Point, Thumbs up, Bow |
| Sitting & lying | Sit down, Sit idle, Stand up (on a chair); Lie down, Sleep (on the back) |
| Swimming | Tread water, Swim forward (front crawl), Swim breaststroke, Swim backstroke (loops); Dive into water, Climb out of water |
| Shooter | Pistol idle (low ready), aim (two hands or one hand), fire, walk, run, sprint and strafe left/right. Rifle idle (low ready), aim idle, fire single, fire full-auto, reload, aiming walk / walk back / strafe left / strafe right, run, sprint, crouch aim and crouch walk. Throw grenade |
| Aerial | Skydive, Activate parachute (deploy), Use parachute (glide), Land parachute |
| Vehicles | Riding, driving and piloting for fourteen vehicles, with boarding/alighting, stunt rolls, crash escapes, jet runway manoeuvres, parachute bail-outs and the tank gunner. Each vehicle has its own group (for example **Vehicles · Jet aircraft**) |

Clips that end where another begins chain without a pop: Idle → Sit down → Sit idle → Stand up → Idle; Lie down, Sleep and Knockdown → Get up (from back); Death (fall forward) → Get up (from front); Pick up → Carry idle. Feet are grounded automatically (crouch, landing, steps), and switching clips in the viewer crossfades over 0.25 s.

## Motion capture

These clips are recorded performances from the [CMU motion capture database](http://mocap.cs.cmu.edu), retargeted onto each character:

- Walk, Walk backwards (the same performance reversed), Slouch walk, Run and Strafe left/right. Strafes keep their recorded feet and pelvis with a more upright upper body. Carry walk, Head-load walk and armed locomotion use these recordings with arm IK layers; Model walk uses the recorded Walk with the legs closed.
- All five turns use CMU 69_17's turn-in-place steps, played at twice the captured speed: 0.95 seconds for 45°/90° turns and 3.6 seconds for a full turn. Right turns mirror the performance; 45° turns adapt the quarter-turn heading. The named angles are exact and finish standing in the new direction.
- Jump and Low punch, including their recovery. Jump, Running jump and Low punch finish in the upright Idle pose.
- Cry.
- Sit down and Sit idle (Stand up is Sit down in reverse).

The retargeting:

- **Alignment:** limbs are aligned to the recording's rest pose.
- **Calibration for the body:** arm hang, stance width, flat planted feet, and each actor's neutral head position.
- **Loops:** close seamlessly.
- **Floor contact:** the feet keep it, and the toes bend rather than dipping through the floor.

The takes and cuts are listed in `scripts/mocap-takes.ts`. `npm run build-mocap` bakes them into compact data (`src/core/anim/clips/mocap-data.ts`), so the app, the exporters and the tests have them without the source files.

## Interaction and carried props

Choose a prop under **Carry**. Props that clips hold have their own rigid joint, export in GLB/FBX/OBJ, and animate in GLB and FBX. Set **Weapon: None** for two-hand holds.

- **Pick up (ground)** (3.4 s): look down, reach forward, squat with the hands clear of the knees, close both hands on a low object, then lift with the legs. Grip at about 1.5 s; the clip ends in the first pose of **Carry idle**.
- **Put down / drop (ground)** (3.4 s): the reverse of pickup. Lower the object to the floor around 1.6 s, release it, then return upright. Chain Carry idle/walk → Put down → Idle.
- **Use / press** (1.65 s): reach with the right hand, press with the extended index finger around 0.88 s, then retract.
- **Open door** (2.8 s): reach for a handle on the right, turn the latch around 1.0 s, pull through a 32° arc, release and return. The hinge is to the character's right. Animate your door to match the handle path.
- **Push** (2.6 s): reach with both open palms, brace in a staggered stance and drive forward, then recover. The main effort is between 1.15 and 1.65 s.
- **Carry idle** (3.6 s loop) and **Carry walk**: a two-hand hold of a roughly 40 cm-wide object in front of the torso, wrists 46 cm apart with palms facing inward (scaled to the character's height). Carry walk is the recorded Walk about 15% slower, with its footfalls, hips and stride distance.

**Box / parcel** is 42 × 32 × 34 cm at reference height, with cardboard and tape colours and a shipping label. When equipped, ordinary Walk, Run, backwards/slouch/model walk, strafes, turns, Idle, Talk and Laugh hold it in both hands at their normal speed. Pickup starts with the box on the floor and ends at Carry idle's box position. In Studio, Put down / drop leaves the box on the ground as the actor walks away; return to it before picking it up again. Combat, jumps, gestures, sitting/lying and vehicle performances keep their own arm poses. With your own box, drive its centre from the two wrists; `Animator.frame` accepts `parcelGrounded` to play a clip with the parcel released.

**Head load (basin)** is an enamel basin of produce on a rolled cloth pad, fitted on the crown over the hair and rigid with the head. **Head-load idle** and **Head-load walk** keep the head level with the right hand on the rim; the walk is the recorded Walk at a steadier pace with the left arm swinging. Carrying on the head is common across Africa and elsewhere.

**Mobile phone** is a smartphone on its own joint. In **Phone call** it rests against the left ear and cheek with the palm on its back; in **Texting** it lies in the left palm while the right index finger taps the screen. It appears only in those two clips.

**Broom** appears only in **Sweep**: both fists hold the handle with the thumbs up it and the bristles on the floor.

**Bags:** a straw tote, structured handbag or leather briefcase is carried in the left hand, bound to the hand bone with the fingers closed round the handle in every clip. A canvas backpack and the parachute rig are worn. Each bag has its own colours.

Interaction hands use chest-space IK; the pickup reach uses floor-space targets that follow the body while it squats. Actions ease in from and back to the relaxed pose, except pickup, which ends holding the object, and put-down, which starts there. Timings are references for game events; the game supplies doors, buttons and other objects.

## Everyday and emotes

**Talk with gestures**, **Phone call**, **Texting**, **Look around** and **Sweep** are loops for background characters. **Lean on wall** folds the arms, rests one foot on the wall and expects a wall about 20 cm behind the heels.

**Clap**, **Dance (groove)** (a step-touch at 120 bpm) and **Dance (party bounce)** (alternating raised hands) loop. **Point** and **Thumbs up** raise the hand and hold; **Bow** goes down and back up. Wave keeps the head and eyes facing forward. Laugh loops every 4.8 seconds with matching facial timing.

## Swimming

The water surface is the floor plane: swimmers float with the body below it and only the head and shoulders above. The builder shows see-through water while a swimming clip plays, and weapons are hidden.

- **Tread water** stays in place. **Swim forward (front crawl)**, **Swim breaststroke** and **Swim backstroke** carry their speed in `travel`: 1.1, 0.75 and 0.9 m/s (backstroke travels head first).
- **Dive into water** (2 s) crouches on the bank, springs out head first, glides underwater and surfaces, about 3.5 m forward.
- **Climb out of water** (2.4 s) starts treading water facing the bank: hands on the edge, press up, knee on and stand, about 0.9 m forward onto a bank at water level.

The dive and climb-out move around an even `travel`, so they line up with root motion and stay close to place without it.

## Weapons

Pick an assault rifle, pistol, sword, combat knife or grenade under *Props*. Weapons are held in the right hand on the `WeaponR` socket (see [Rigging](rigging.md#weapon-socket)), and the viewer switches to the matching idle.

- **Aiming:** firearms are fitted to the aiming pose. The barrel lines up with the chest's forward axis, and the rifle's handguard sits under the support hand. **Pistol aim (one hand)** uses a lower wrist, a relaxed shoulder and a relaxed free arm.
- **Locomotion:** pistol and rifle walk, run, sprint and strafes use recorded locomotion beneath their weapon holds. Sprint retimes the recorded run, including root velocity, to keep the stride distance. Crouch walk has its own low gait.
- **Hands stay on the weapon:** two-bone arm IK places the right hand first, then the left hand onto the rifle's handguard wherever the rifle is. The left hand slides along the handguard if a pose would over-stretch the arm, so the hands stay on the weapon on every body and skeleton.
- **Grips:** fingers curl toward the palm, detected from each hand's joints, so fists and grips close correctly on A- and T-pose binds.
- **Grenade:** `throw_grenade` (2.2 s) releases the grenade at 0.82 seconds; it follows an arc to the ground while the thrower recovers upright.
- **Your own props:** the shooter clips work without a weapon, with your own prop parented to `WeaponR`.

## Vehicles

Choose a riding or driving animation and its vehicle appears, fitted to the rider, in the builder and Studio. **Show vehicle** controls visibility. Fourteen models cover eighteen riding, driving and piloting actions:

| Vehicle | Clips | Moving parts |
| --- | --- | --- |
| Bicycle | `ride_bicycle` | Wheels, crank and pedals |
| Classic convertible | `drive_car`, `sit_passenger` | Wheels, hinged doors and steering wheel |
| Modern sports car | `drive_sports_car`, `sit_sports_car_passenger` | Wheels, hinged doors and steering wheel |
| SUV | `drive_suv`, `sit_suv_passenger` | Wheels, hinged doors and steering wheel |
| Pickup | `drive_pickup`, `sit_pickup_passenger` | Wheels, hinged doors and steering wheel |
| Military tank | `drive_tank`, `gun_tank` | Tracks, road wheels, levers, roof hatch and a shielded machine gun |
| Jet | `fly_jet`, `taxi_jet`, `takeoff_jet`, `land_jet`, `bailout_jet` | Hinged canopy, cockpit controls, retractable gear and exhaust glow |
| Motorcycle | `ride_motorcycle` | Wheels and handlebars |
| Horse | `ride_horse` | Diagonal trot, tail, reins and stirrups |
| Canoe | `paddle_canoe` | Single-bladed paddle |
| Kayak | `paddle_kayak` | Double-bladed paddle with side changes |
| Rowing boat | `row_boat` | Two oars in the rowlocks |
| Motorboat | `drive_boat` | Helm wheel, outboard propeller and side boarding gate |
| Helicopter | `fly_helicopter`, `bailout_helicopter` | Cyclic/collective, four doors, main/tail rotors and skids |

Body/coat, trim/mane and seats/tack colours, paint finish and classic/sport variants are saved in `vehicleStyle`. Choosing the sports car, SUV, pickup, tank, jet or helicopter with untouched colours applies its factory appearance; edited colours are kept. Fitting measures the rider's hips, palms, knees, feet and headroom and builds the vehicle around them; limbs are never stretched. Car and boat fittings raise the rider onto the cabin or deck floor. The clips also work without a vehicle.

Exports include a **separate vehicle prop** when a ride is selected; turn it off in the export panel if you only need the rider. GLB and FBX contain the animated controls, wheels, doors and tack as rigid joints; OBJ is static. Static and rigged-only exports use the currently previewed vehicle action to choose and fit the prop. Place the rider and vehicle at the **same origin and transform** and play their matching clips together. To use your own game vehicle, uncheck Show vehicle and use the rider animations with your seat transform.

### Boarding and alighting

Search **Board** or **Alight**. Every vehicle has an entry/exit pair (1.6–2.2 seconds); the convertible, sports car, SUV and pickup have separate driver and passenger pairs. Entry starts upright beside the vehicle, moves over the saddle or gunwale, through a hinged car door or the motorboat's gate, and ends in the fitted riding pose. Exit reverses it and finishes upright.

- **Jet** (2.8 s): from the pilot's right, where the canopy opens.
- **Tank** (4.2 s): up the tread steps onto the hull and down through the roof hatch, which closes over the driver.

Use **Board SUV → Drive SUV → Alight from SUV**, for example. Give entries and exits their full clip length with movement off. Limbs keep their lengths on all three rigs and both bind poses. Human clips and matching prop animations export together; each fitted vehicle/occupant role is one prop file containing its riding and door animations.

### Armed riders

Equip a pistol, rifle, sword or knife and choose a riding or driving action. Mounted wielding keeps the seat, legs and left control hand; car windows lower and both horse reins stay in the left hand. Canoe, kayak and rowing strokes pause while armed. Boarding and alighting hide the weapon. The tank driver, swimmers and aerial actions keep weapons hidden. Builder and game exports use the default wield pose; Studio adds per-action aim and fire (see [Armed riding](studio.md#armed-riding)), and code can pass `weaponPose`, `weaponYaw` and `weaponPitch` to `Animator.frame`/`bake`.

### Aircraft

**Helicopter:** **Fly helicopter** seats the pilot at the controls; the cabin has four doors for a pilot and three passengers in Studio.

**Jet:** the jet clips carry their own motion in the builder and exports. **Taxi jet on runway** rolls along on its wheels; **Take off jet** (6 s) accelerates, rotates and climbs to a demonstration height while the gear folds; **Pilot jet** flies with gentle banking; **Land jet** (6 s) descends with the gear down, flares and rolls to a stop. In Studio the jet follows the film's route and Flight height instead.

**Bail-outs:** **Bail out of jet with parachute** and **Jump from helicopter with parachute** (2.6 s) take the occupant out through the open right-hand side, clear of the airframe, and turn them belly-down into the pose that **Skydive** continues. Equip the parachute rig. In the builder the aircraft holds a safe height while the occupant leaves it.

Game engines supply aircraft movement and altitude; the exports carry the pilot pose, controls, doors, rotors and gear.

### Tank

The driver sits enclosed under the closed roof hatch with hands on the levers, and the tracks run. **Fire tank machine gun** stands the driver in the open hatch with both hands on the spade grips of a roof-mounted machine gun. Only the head and shoulders show above the gun shield; the gun traverses slowly and fires in short bursts with a muzzle flash.

### Stunt rolls and crashes

Each mechanical vehicle has `tumble_MODEL` (3 s): a controlled 360° roll with the rider attached, returning to the upright riding pose. Keep movement off and leave extra clearance.

Road vehicles (convertible, sports car, SUV, pickup, motorcycle, bicycle) have two crash escapes. In both, the driver's door opens and the empty vehicle slides on, rolls over away from the driver and comes to rest upside down; its motion is exported on the prop joints.

- **Crash and roll out** (`crash_MODEL`, 3.6 s): the driver dives out to the left, shoulder-rolls and stands about 3 m away, facing the original heading.
- **Crash and fall down** (`crash_fall_MODEL`, 3.4 s): the driver is thrown out, lands hard and tumbles onto their back, ending in the starting pose of **Get up (from back)**.

## Parachuting

The **Aerial** category has `skydive`, `parachute_deploy`, `parachute_glide` and `parachute_land`. Equip `carry:parachute` for the pack, a harness fitted over the clothes with straps over both shoulders, a striped canopy and suspension lines. Deployment takes 2.4 seconds; landing takes three seconds and ends in the upright idle pose. Only the canopy and line joints scale; the skeleton keeps its dimensions. Game engines supply altitude and physics; Studio supplies an editable descent.

## Dodge and roll

**Forward roll** (`roll_forward`, 1.3 s) crouches, tucks and rolls over the back to standing. **Side dodge left/right** (`dodge_left`, `dodge_right`, 0.9 s) push off and land low on the near leg with the guard up. All three carry root motion in `travel`, so engines can play them in place or moving.

## How clips work

- **Keyframed clips** are defined once (`src/core/anim/clips/`, one file per set). Each bone is posed in its own frame (X = flex forward, Y = twist, Z = side), on an "animation rest" with relaxed arms and nearly straight elbows.
- **Hand targets** are given relative to the chest (most clips) or to the floor (`HandTarget.space: 'floor'`, for hands on something fixed, like handlebars or a broom). `HandTarget.tip` targets the index fingertip instead of the wrist, using the rig's own finger length.
- **One evaluator:** `src/core/anim/evaluate.ts` drives the viewer and both exporters, so one clip works on every skeleton type and on A- or T-pose binds, and the preview matches the export exactly.

GLB has one glTF animation per clip (30 fps, rotation channels plus root translation), and FBX has one AnimationStack (take) per clip. `scripts/blender_anim_check.py` imports the files into Blender and renders key frames of every action.

To add a clip, see [CONTRIBUTING.md](../CONTRIBUTING.md#adding-an-animation).
