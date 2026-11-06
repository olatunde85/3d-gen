# Location staging maps

Studio's maps come from the geometry recipes that render all 66 sets. In **LLM Assist**, choose **Location for this film**, then copy the guide or save the map as JSON. The guide contains an index of every set and the selected set’s full contract. **All location maps** downloads the collection. These are reference documents; do not add their fields to a film project.

## Reading a map

Coordinates are world metres. Rectangles use `[minX,minZ,maxX,maxZ]`. Yaw is in degrees: 0 faces +Z, 90 faces +X, 180 faces −Z, −90 faces −X.

- `bounds`: the mapped performance area; generally ±180 m outdoors, actual rooms or conservative stage bounds indoors.
- `land`: those bounds excluding `water`. A floor mesh under a water surface is not navigable land.
- `water`: exact rendered surface rectangles, including shoreline and far/side extents. Remain inside the mapped performance area too.
- `regions`: rendered walkway, road, court, stage and dock footprints. A dock restores walkable land over water. Clearance does not imply a traffic rule or permission to drive through a venue.
- `obstacles`: conservative geometry envelopes with `bottom` and `top` heights, including walls, furniture, vegetation and barriers. Overpasses retain their clearance. Cutaway walls still count as barriers.
- `seats`: actual registered seating positions and facing; Y is the seat-top height. Studio retains nearest-free-seat fitting.
- `routes`: checked reference start/end poses, travel mode and clearance. Stop at the endpoint; an extension is unverified.
- `starts`: separated, checked reference world starting options for pedestrians and supported vehicles.
- `boarding`: verified reference dock approaches, standing gates, waiting vessel origins and departure endpoints. An empty array means no boarding anchor was verified.

Lanes and anchors assume rig scale and anatomical boarding scale of 1. These scales can differ on real characters. Vehicle envelopes include fitted reference geometry. Check custom cast sizes and tight contacts after building. Conservative rectangles overestimate some curved props and furniture; the maps do not model water depth, buoyancy, traffic or physics. Pools are not automatically verified boating locations.

Boat shoreline/dock checks inset the conservative envelope by **15 cm** to tolerate minor edge contact and rectangular hull-corner overestimation. Boats no longer receive the former extra 1.5 cm outward padding. Larger overlaps and paths across land or the interior of a dock still warn. Static obstacles, map limits and land-actor water checks retain their normal rules. Reference routes and starts are still verified without the docking allowance. Downloaded maps expose this policy as `validation.boatEdgeTolerance` in metres.

## Travel is centred over the whole track

Actor X/Z is the centre of its complete enabled travel, not its start. Let `D` be the sum of each enabled local travel vector multiplied by its beat duration. Nominal displacement at time `t` is `cumulativeTravel(t) − D/2`. Multiply by rig scale, rotate by authored yaw, then add actor X/Z. To start at world `S`, solve `actorXZ = S + rotate(scale × D/2)`.

For local `(x,z)` and yaw `a`, rotation gives `(x cos(a) + z sin(a), −x sin(a) + z cos(a))`. Speed overrides affect vehicle travel, not animation cadence. Rowing travels local −Z. Adding later travel can shift earlier positions. Turn clips animate the skeleton but do not change the track's travel axes. JSON has no waypoints or per-action heading/position fields.

Vehicle doorways and shared occupants modify the nominal path. An exit carries its standing offset into the next ground span. A new vehicle waits at the end of that span minus its boarding offset, from frame zero. Reusing a vehicle identity returns to its parked position; Studio adjusts the connecting span to meet the real doorways. Passengers inherit the operator’s transform. Recalculate the whole track after edits.

## Harbour boarding contract

The shoreline runs east–west at **z = −7.5**, with land toward +Z and water toward −Z. Water spans x = −300..300, z = −327.5..−7.5; mapped travel stays within ±180. The walkable pier spans **x = −1.2..1.2, z = −14..−4**, through an opening in the rail. Decorative moored hulls sit near x = ±9, z = −11.

The reference motorboat anchor uses yaw 180 throughout:

| Pose | X | Y | Z |
| --- | ---: | ---: | ---: |
| Land approach | 0.85 | 0 | −3 |
| Standing boarding gate on pier | 0.85 | 0 | −11.5 |
| Waiting motorboat origin | 2.47 | 0 | −11.92 |
| Water departure endpoint | 2.47 | 0 | −45 |

The local motorboat standing offset is `(1.62, −0.42)` multiplied by anatomical boarding scale. These are world coordinates, distinct from centred actor placement. Solve the whole track, including the preceding motorcycle exit and run. Native locomotion has a small lateral component; do not assume it follows a perfectly straight local-Z line.

Keep the motorcycle on land, the approach on the pier, and the future boat fully in water at frame zero. Stop the operator throughout every boarding interval. Shared passengers use one vehicle identity and stagger use of its single gate. The reference anchor does not certify every custom character’s approach or stepping contact.

## Check the whole film

**Check staging & location map** uses the loaded characters’ scales, fitted props and boarding root footwork. It reports both sides of every action transition. Travel uses swept footprints, detecting thin barriers or water between safe endpoints. Boarding footwork and helicopter altitude are sampled at 30 fps. Parked and future vehicles are checked from frame zero. Raising an ordinary actor’s Y does not turn water into ground.

The reply preview in LLM Assist performs a provisional reference-body check. After building, run the fitted check and save its report for your assistant to correct. Each finding identifies an entity, time range and reason; selecting it seeks to that time. The report also exports each actor’s rig scale, anatomical boarding scale, height and operator-owned vehicle envelopes. With **Start from my current film** enabled, the guide includes these fitted measurements and positions for the unchanged cast; new or redesigned characters require a fresh fitted check.

Checks are advisory against static scenery and conservative body/prop envelopes. They do not stop playback, solve routes, move the cast, simulate hand/foot collisions or check person-to-person and prop-to-prop avoidance. Furniture overlap during seated clips is intentional. Review tight contacts, boarding gaps and moving cast visually before export.

## Maintaining maps

`npm run build:studio-maps` regenerates data from real recipes before material batching. The production build does this too. Node skips canvas painting while preserving geometry, transforms and registered seats. Shorelines and furniture coordinates are not independently hand-maintained.

`npm run test:studio:spatial` checks committed data against the recipes, every reference lane/start, continuous path tests and fitted transfers. `node --import tsx scripts/studio-check.ts --spatial` covers downloads, review, reload and mobile layout in Chrome.
