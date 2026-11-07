# Animations

There are 161 clips. The character loads playing **Idle**. The animation bar at the top of the viewport has quick buttons (Bind pose, Idle, Walk, Run), previous / next, and **All animations**, a drawer with search and categories that keeps the character in view.

| Category | Clips |
| --- | --- |
| Idle & stance | Idle, Crouch idle (loops) |
| Locomotion | Walk, Slouch walk, Model walk (catwalk), Run, Walk backwards, Strafe left/right (loops; in place, or with root motion) |
| Sitting & lying | Sit down, Sit idle, Stand up (on a chair; Idle → Sit down → Sit idle → Stand up → Idle chain without a jump); Lie down, Sleep (on the back; they chain into Get up (from back)) |
| Actions | Jump, Fall, Punch, Low punch, Hit reaction (one-shots); Jump start, Jump (in air) (loop), Jump land and Running jump, split for engine character controllers; sword idle (guard), sword slash, sword block |
| Interaction | Pick up (ground), Put down / drop (ground), Use / press, Open door, Push (one-shots); Carry idle and Carry walk (loops) |
| Emotes | Wave, Cheer, Laugh, Cry, Talk (loops) |
| Turns | Left/right 45° and 90°, full 360° (recorded turn-in-place steps at 2× speed) |
| Shooter | Pistol idle (low ready), aim (two hands or one hand), fire, walk, run, sprint and strafe left/right. Rifle idle (low ready), aim idle, fire single, fire full-auto, reload, aiming walk / walk back / strafe left / strafe right, run, sprint, crouch aim and crouch walk. Throw grenade. |
| Aerial | Skydive, activate/deploy parachute, glide/use parachute, land parachute |
| Reactions | Hit from front / back / left / right, knockdown, death (fall forward), death (fall backward), get up (from back), get up (from front) (one-shots). Knockdown ends where Get up (from back) starts, and Death (fall forward) ends where Get up (from front) starts, so they chain without a pop |
| Vehicles | Drive car, sit (passenger), ride bicycle, ride motorcycle, ride horse (trot), paddle canoe, paddle kayak, row boat, drive boat (helm), pilot helicopter (loops); pickup, tank and jet, with jet taxi, take-off, landing and bail-out, a helicopter parachute jump and the tank machine gunner; plus 36 boarding/alighting one-shots and 13 vehicle stunt rolls. Each vehicle has its own group (for example **Vehicles · Jet aircraft**) holding all of its clips |

Feet are grounded automatically (crouch, landing, steps), and switching clips in the viewer crossfades over 0.25 s.

## Motion capture

These clips are recorded performances from the [CMU motion capture database](http://mocap.cs.cmu.edu), retargeted onto each character:
- Walk, Walk backwards (the same performance reversed), Slouch walk, Run and Strafe left/right. Strafes keep their recorded feet and pelvis with a more upright upper body. Carry walk and armed locomotion reuse these recordings with arm IK layers; Model walk uses the recorded Walk with the legs closed.
- All five turns use CMU 69_17's recorded turn-in-place steps. Right turns mirror the performance; 45° turns adapt the quarter-turn heading. The full turn preserves the recorded sequence of four quarter-turns. The named angles are exact and finish standing in the new direction. All turns play at twice the captured speed: 0.95 seconds for 45°/90° turns and 3.6 seconds for a full turn.
- Jump and Low punch, including their recovery. Jump, Running jump and Low punch finish in the upright Idle pose instead of holding a crouch.
- Cry
- Sit down and Sit idle (Stand up is Sit down in reverse)

The retargeting:
- **Alignment:** limbs are aligned to the recording's rest pose.
- **Calibration for the body:** arm hang, stance width, flat planted feet, and each actor's neutral head position.
- **Loops:** close seamlessly.
- **Floor contact:** the feet keep it, and the toes bend instead of dipping through the floor.

The takes and cuts are listed in `scripts/mocap-takes.ts`. `npm run build-mocap` bakes them into compact data (`src/core/anim/clips/mocap-data.ts`), so the app, the exporters and the tests have them without the source files.

## Interaction

The **Interaction** category contains seven clips. Choose **Carry: Box / parcel** to include a fitted box for pickup and carry. Your game supplies other interaction objects such as buttons and doors.

- **Pick up (ground)** (3.4 s): look down, reach forward, squat with the hands clear of the knees, close both hands on a low object, then lift with the legs. Grip at about 1.5 s; the clip ends in the first pose of **Carry idle**, so the two chain without a pop.
- **Put down / drop (ground)** (3.4 s): the matching reverse of pickup. Start holding the parcel, lower it to the floor around 1.6 s, release it, then return upright. Chain Carry idle/walk → Put down → Idle. The parcel stays on the floor after release.
- **Use / press** (1.65 s): reach with the right hand, press with the extended index finger around 0.88 s, then retract.
- **Open door** (2.8 s): reach for a handle on the right, turn the latch around 1.0 s, pull through a 32° arc, release and return. The door hinge is to the character's right, so the pull clears the torso. Animate your door to match the handle path; this is a pull-open action.
- **Push** (2.6 s): reach with both open palms, brace in a staggered stance and drive forward, then recover. The main effort is between 1.15 and 1.65 s.
- **Carry idle** (3.6 s loop): a balanced two-hand hold with restrained breathing.
- **Carry walk**: the existing recorded Walk with a cadence about 15% slower, retaining its footfalls, hip motion and stride distance. The arms use IK instead of swinging; both wrists stay at the sides of the same object. Root motion travels the recorded stride distance per loop; turn it off when your controller supplies movement.

The carry clips hold a roughly 40 cm-wide object in front of the torso. Wrist targets are 46 cm apart, with fingers forward and palms facing inward (scaled to the character's height). The **Box / parcel** is 42 × 32 × 34 cm at reference height, with configurable cardboard/tape colours and a shipping label. When equipped, it automatically stays in a two-hand grip during ordinary Walk, Run, backwards/slouch/model walk, strafes, turns, Idle, Talk and Laugh. These keep their original footwork and speed. Pickup starts with the box on the floor and ends exactly at Carry idle's box position. The dedicated carry clips are still available. Its rigid **Parcel** bone and mesh export in GLB/FBX/OBJ; GLB and FBX also contain its animation. Set **Weapon: None** for the two-hand grip. In Studio, Put down / drop releases it: the box stays on the ground as the actor walks away, and stays released when you seek or reload. Return the actor to the box before using Pick up again. Combat, jumps, gestures, sitting/lying and vehicle performances keep their original arm poses rather than this carry layer. Arbitrary set props are not grabbed automatically. With your own box, drive its centre from the two wrists. Handbags and briefcases remain one-hand accessories.

Interaction hands use chest-space IK; the pickup reach uses floor-space targets that account for the body’s grounding offset while it squats. The door hand follows the forearm with a small latch twist, avoiding a forced sideways wrist bend. Actions ease in from and back to the relaxed pose, except pickup, which ends holding the object, and put-down, which starts there. The parcel stays part of the exported character rig; game engines manage attachment/detachment themselves. Animator callers can use parcelGrounded to play an ordinary clip with the parcel released. Studio derives that state and the dropped position from the timeline, including during scrubbing and offline rendering. Timings are authoring references for game events, not automatic interaction with set props.

## Vehicles and props

Choose a riding or driving **animation** to add its matching vehicle automatically, in both the builder and Studio. There is no separate model selector. Use **Drive modern sports car / Sit (sports car passenger)** or **Drive SUV / Sit (SUV passenger)** for the enclosed cars. **Show vehicle** controls visibility; in Studio it applies to the selected action. Fourteen procedural models cover eighteen riding/driving actions, plus 36 boarding/alighting actions, including both car occupant roles.

| Vehicle | Compatible clips | Moving components |
| --- | --- | --- |
| Bicycle | `ride_bicycle` | Wheels, crank and level pedals |
| Classic convertible | `drive_car`, `sit_passenger` | Wheels, hinged doors and driver steering wheel |
| Modern sports car | `drive_sports_car`, `sit_sports_car_passenger` | Wheels, hinged doors and driver steering wheel |
| SUV | `drive_suv`, `sit_suv_passenger` | Wheels, hinged doors and driver steering wheel |
| Pickup | `drive_pickup`, `sit_pickup_passenger` | Wheels, hinged doors and steering wheel |
| Military tank | `drive_tank`, `gun_tank` | Tracks, road wheels, lever contacts and a shielded roof machine gun |
| Jet | `fly_jet`, `taxi_jet`, `takeoff_jet`, `land_jet`, `bailout_jet` | Hinged canopy, fitted cockpit controls, retractable gear and exhaust glow |
| Motorcycle | `ride_motorcycle` | Wheels and handlebars |
| Horse | `ride_horse` | Diagonal trot, tail, reins and stirrups |
| Canoe | `paddle_canoe` | Single-bladed paddle |
| Kayak | `paddle_kayak` | Double-bladed paddle with continuous side changes |
| Rowing boat | `row_boat` | Two oars passing through the rowlocks |
| Motorboat | `drive_boat` | Helm wheel and outboard propeller; two aft passenger seats |
| Helicopter / chopper | `fly_helicopter` | Upright pilot, cyclic/collective controls, four doors, animated main/tail rotors and landing skids |

Body/coat, trim/mane and seats/tack colours, paint finish and classic/sport variants are saved in `vehicleStyle`. The coupe has a rounded two-door cabin, solid rear pillars, a split grille and alloy wheels. The SUV has an upright five-door cabin, separate rounded rectangular windows, circular LED headlights, flared arches, running boards and a rear spare wheel. Choosing one with untouched colours applies its teal coupe or red SUV factory appearance; edited colours are preserved. Fitting measures the rider’s existing hips, palms, knees, feet and headroom; it never stretches limbs or changes the original rider pose. Car and boat fittings raise the complete rider onto their cabin/deck floor. The clips still work without a vehicle, using their original grounding.

Exports include a **separate vehicle prop** by default when a ride is selected; turn this off in the export panel if you only need the rider. GLB/FBX can contain the matching animated controls, wheels and tack as rigid joints; OBJ is static. Animated exports include props for selected vehicle clips. In static or rigged mode, the builder uses the currently previewed vehicle action to choose and fit the prop. Driver and passenger car clips have separately fitted assets.

Place the rider and vehicle at the **same origin and transform**, and play their matching clips together. Rider animation exports include the fitted cabin/deck elevation whenever a compatible vehicle is selected. Static and rigged-only characters remain in their bind pose until a riding/driving clip is applied. To supply your own game vehicle, uncheck Show vehicle and use the original rider animations with your seat transform.

The motorboat has room for its helm operator and two passengers. In Studio, choose the operator’s vehicle in the action’s **Vehicle** selector and assign **Passenger left/right**. Seat placement, body fit, travel and entry/exit are handled by the shared vehicle. Cars, the SUV, motorcycle, canoe and rowing boat also offer their supported passenger seats. See [shared vehicles](studio.md#share-a-vehicle). These film seat settings do not add new builder animation IDs; game exports retain the native rider and prop clips.

In Studio, enable **Move through the set** on a vehicle action and optionally set **Travel speed (m/s)**. The whole rider/vehicle group travels together while the original animation cadence stays the same; wheels roll with the distance travelled. Turning the option off keeps it in place. Movement follows actor yaw and is centred on its placement, like walking. Linked passengers inherit the operator’s travel automatically. Default vehicle travel is now three times the former values; a saved explicit travel speed is preserved. Travel does not add navigation, road collision or water simulation. Add the explicit boarding/alighting actions for entry/exit. In Studio, review clearance against set furniture and other actors. Use Carry: None to leave the hands available. Equipped weapons now use mounted wielding poses.

## Weapons

Pistol walk, run, sprint and left/right strafes use recorded locomotion beneath their weapon holds. **Pistol aim (one hand)** keeps the free arm relaxed. Rifle walk, backwards walk, run, sprint and strafes use the same recorded mechanics; sprint retimes the recorded run, including root velocity, to preserve stride distance. Crouch walk retains its separate low gait.

Wave keeps the head and eyes facing forward. Laugh plays at half speed (4.8 seconds per loop), with matching facial timing.

**Bags:** under *Props*, *Carry* picks a straw tote, a structured handbag or a leather briefcase (carried in the left hand, bound to the hand bone, its fingers closed round the handle in every clip) or a canvas backpack (worn). Each bag has its own colours: the straw and trim of the tote; the leather (smooth, patent on the handbag, or grained) and hardware of the handbag and briefcase; and the canvas and accent of the backpack.

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

### Boarding and alighting

Search **Board** or **Alight** under Vehicles. Entry and exit now play at twice their former speed (1.6–2.2 seconds), with the same poses and limb paths. Jet entry/exit takes 2.8 seconds, from the pilot’s right, where the canopy opens. Tank entry/exit takes 4.2 seconds: the driver climbs the tread steps onto the hull and lowers through the roof hatch, which closes over them. Every vehicle has a one-shot pair; the convertible, coupe, SUV and pickup have separate driver/passenger pairs. The motorboat opens its side boarding gate. Entry starts upright beside the vehicle, moves over the saddle or gunwale or through a hinged car door, and ends in that rig’s fitted riding pose. Exit follows the reverse path and finishes upright. Limbs retain their original lengths on all three rigs and both bind poses.

Use **Board SUV → Drive SUV → Alight from SUV**, for example. Give each entry/exit its full clip length with movement off; use optional movement/speed only on the riding beat. A whole riding loop makes the cleanest join into exit. In Studio, the vehicle remains parked after exit while the actor walks away. Every scheduled vehicle waits at its first entry from frame zero and stays parked after exit, including during transfers to other vehicles. Shared seats support passenger boarding/alighting with synchronized physical doors or the boat’s gate. This is authored choreography, not navigation or a reach-to-any-vehicle system.

Human clips and matching prop animations export together in GLB/FBX. Each fitted vehicle/occupant role is one prop file, containing its selected riding and door animations. Keep human and vehicle origins aligned, play matching clips together, and preserve the authored lateral root movement even when optional locomotion root motion is off.

### Armed riders

Equip a pistol, rifle, sword or knife and choose an ordinary riding/driving action. Mounted wielding applies automatically in the builder, Studio and character animation exports. It preserves the riding root, seat, leg motion and left control hand. Car windows lower; both horse reins stay in the left hand. Canoe, kayak and rowing strokes pause while armed; hide the weapon to resume two-hand paddling.

Studio’s **Weapon action** selector adds Wield, Aim / present, Fire (guns only) and Hide weapon. **Aim (°)** controls heading: 0 forward, positive left, negative right, from −110° to +110°. Defaults aim out the driver/passenger window or to the side of the animal; custom directions need visual clearance review. Fire supplies repeating recoil, without automatic sound, bullets or muzzle flashes. Add timed sound effects separately. Boarding/alighting automatically hide the weapon; it reappears for riding and ordinary actions. Hiding it on other beats is also supported. The equipped model stays in the character recipe; visibility and mounted pose are timed per action.

Builder/game exports use the default mounted wield pose. Studio’s optional `weaponPose` and `weaponYaw` belong to film beats. Code using `Animator.frame`/`bake` may also supply those options directly.

## Helicopter

Choose **Fly helicopter** for a fitted pilot at the controls, or **Board helicopter / Alight from helicopter** for step-through cabin entry and exit. Both transitions last 2.2 seconds, keep limb lengths unchanged, and return to the exact standing/pilot endpoints. Quick Build’s Vehicle choices include the helicopter and its three matching actions; body, trim, seats, finish and style remain customizable.

The Studio helicopter carries a pilot and three shared passengers. **Flight height** is available on the pilot’s flight action: leave it blank for 3 m when moving or 0 m when stationary, set a positive value to hover, or choose 0 to stay on the ground. A continuous flight sequence takes off once and lands once. Forward travel defaults to 12 m/s. Boarding/alighting require a stationary, grounded aircraft; assign different doors/seats for simultaneous entries. The parked aircraft remains after everyone exits.

GLB/FBX exports retain the fitted pilot and transition poses, doors and rotor joints/clips. World travel and altitude are Studio direction, so a game engine supplies its own aircraft movement. No aviation physics or automatic obstacle clearance is implied.

### Expanded fleet and stunt rolls

The pickup adds an enclosed two-seat cabin and open cargo bed; the military tank has an enclosed hull with the driver seated under a closed roof hatch, fitted lever controls and animated tracks (weapons stay hidden inside); the jet has a single pilot cockpit, hinged canopy and retractable gear. Use their matching board/drive-or-fly/alight clips. The jet clips play their own motion in the builder and in exported animations: **Taxi jet on runway** rolls along on its wheels, **Take off jet** accelerates, rotates and climbs to a demonstration height with the gear folding, **Pilot jet** flies with gentle banking, and **Land jet** descends, flares and rolls out. Studio replaces that motion with the film’s route and Flight height. **Take off jet** and **Land jet** are 6-second runway manoeuvres: in Studio the take-off accelerates, rotates, lifts off and climbs while the gear folds, and the landing descends, flares, touches down and brakes to a stop. In flight the jet pitches with its climb and banks gently with the stick. Studio flight height works for both aircraft; height 0 lets the jet taxi. The jet needs a wide clear route.

Mechanical vehicles also have `tumble_MODEL` actions. These are controlled, three-second, 360° stunt rolls with a rigidly attached rider, returning to the original upright driving pose. They are authored animation, not crash physics. Keep movement off and leave extra clearance. The animation browser separates road vehicles, tracks, aircraft, watercraft, horse, boarding/alighting and tumbles.

Pistol aim (one hand) uses a lower wrist and relaxed shoulder. Studio supports per-action left/right weapon yaw and up/down pitch for mounted and pistol/rifle performances. Positive pitch aims up; negative pitch aims down. Grenade is a fitted prop: `throw_grenade` releases it at 0.82 seconds, follows an animated arc and recovers upright over 2.2 seconds. No explosion or damage simulation.

### Parachuting

The Aerial category contains `skydive`, `parachute_deploy`, `parachute_glide` and `parachute_land`. Equip `carry:parachute` for the pack, fitted harness, striped canopy and suspension lines. Deployment takes 2.4 seconds; landing takes three seconds and ends in the exact upright idle pose. Use original timing. Game engines supply altitude/physics; Studio supplies editable descent height. Only the canopy and line joints scale; the character skeleton keeps its original dimensions.

### Parachute jumps from aircraft and the tank gunner

**Bail out of jet with parachute** and **Jump from helicopter with parachute** (2.6 seconds each) take the occupant from the seat, out through the open right-hand side and clear of the airframe, turning belly-down into the free-fall pose that **Skydive** continues. Equip **Carry: Parachute / skydiving rig**. In the builder the aircraft hovers at a safe height while the jet flies on; in Studio the empty aircraft flies on and leaves the shot, and free fall starts just below it.

**Fire tank machine gun** stands the tank driver in the open roof hatch, both hands on the spade grips of a pintle machine gun. Only the head and shoulders show above the gun shield. The gun traverses slowly and fires in short bursts with a muzzle flash. Personal weapons stay hidden.

### Dodge, roll and crash escapes

In **Actions**: **Forward roll** (`roll_forward`, 1.3 s) crouches, tucks and rolls over the back to standing; **Side dodge left/right** (`dodge_left`, `dodge_right`, 0.9 s) push off and land low on the near leg with the guard up. All three carry root motion (`travel`), so engines can play them in place or moving.

Each road vehicle has **Crash and roll out** (`crash_car`, `crash_sports_car`, `crash_suv`, `crash_pickup`, `crash_motorcycle`, `crash_bicycle`, 3.6 s). The driver's door opens, the driver dives out to the left, shoulder-rolls along the ground and stands about 3 m away, facing the original heading. The empty vehicle slides on, rolls over away from them and comes to rest upside down. Like the stunt rolls, this is authored choreography, not crash physics; the vehicle's motion is exported on its prop joints.

