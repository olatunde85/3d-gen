# Rigging

Characters are rigged automatically, with no markers to place:
1. The skeleton is built on the generated body's joints.
2. MakeHuman's CC0 skin weights are mapped onto it.
3. Every clothing, hair and accessory vertex then gets weights: proxies through their reference vertices, and garments through the base mesh or the nearest body vertices.

Weights follow through subdivision.

| Option | Choices |
| --- | --- |
| Skeleton | **Game rig** (65 bones, Mixamo names; retargets to Mixamo / Unity Humanoid / Unreal), **lite** (25 bones, no fingers), **full MakeHuman** (163 bones incl. face), none. Each also gets a `WeaponR` socket bone (below). |
| Facial bones | jaw + eyes (on by default; the eyes glance around in every clip) |
| Rest pose | A-pose (natural) or T-pose (re-posed with linear blend skinning) |

These options live in the Export panel.

## Weapon socket

Every rig has a `WeaponR` bone under the right hand, centred in the closed grip. Its +Y axis runs out of the top of the fist (the grip and blade axis), and +Z points toward the knuckles. Parenting a prop to it is how games usually attach weapons, so you can swap weapons in the engine without re-exporting the character.

## What's exported

- **GLB:** a joint hierarchy, inverse bind matrices, and `JOINTS_0` / `WEIGHTS_0`.
- **FBX:** LimbNodes, Skin/Cluster deformers and a bind pose.
- **ZIP:** adds `<name>.rig.json`, the bind pose in an engine-neutral form.

`scripts/blender_rig_check.py` imports the exports into Blender and checks that posing deforms the mesh correctly.
