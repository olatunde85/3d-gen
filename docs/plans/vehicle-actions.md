# Vehicle and action expansion

Tracking: https://github.com/olatunde85/3d-gen/issues/51

Three stacked implementation branches preserve reviewable checkpoints:

1. `feature/weapon-aim-and-animation-groups`: shared vehicle subcategories; lowered one-hand pistol aim; saved yaw/pitch aiming with natural elbow targets; equipped grenade and timed release.
2. `feature/expanded-vehicle-actions`: customizable pickup, tracked tank and jet; fitted controls and reversible entry/exit; deterministic vehicle tumbles; Studio travel, shared-vehicle, spatial and export integration.
3. `feature/aerial-action-props`: skydiving, parachute deployment/glide/landing; wearable pack and animated canopy; Studio and LLM documentation.

Each phase must preserve old project JSON, rig bone lengths, original unarmed control contacts and vehicle persistence. Validate game, lite and full rigs; sample endpoints and intermediate frames; inspect rendered views; exercise schema, equipment, project round trips and export paths. Run the production build at the final checkpoint. New choreography is authored procedural animation, not motion capture or a physical crash simulation.
