# Using characters in your engine

No Blender round trip is needed: the exports load directly.

| Engine | Use | Notes |
| --- | --- | --- |
| **Unity** | FBX | Imports natively; the Mixamo bone names map to the Humanoid rig. Tick *Loop Time* on looping clips. GLB in Unity needs the glTFast package. For lip-sync, see [Faces](faces.md#talking-and-lip-sync) (uLipSync, Meta's lip-sync plugin). |
| **Unreal 5** | FBX | The skeleton has no separate root bone above Hips (like Mixamo), so Unreal's root-motion setup may need one added. Blend shapes import as morph targets. |
| **Godot 4** | GLB | Loads the rigged, animated GLB directly. Tick *Mark looping clips in their names* in the Export panel: clips are then named `Walk-loop` and so on, which Godot imports as looping automatically. Rhubarb Lip Sync works for dialogue. |
| **Web** (three.js, Babylon.js, PlayCanvas) | GLB | Loads directly. `npm run test:gltf` proves this for three.js: it exports through the real pipeline, loads the file with the stock `GLTFLoader` + `AnimationMixer` in headless Chrome, and checks every bone of every clip against the generator. Results for all four rig variants: within 0.04°, with exact root positions, and the skinned mesh deforms. |
| **Blender** | GLB or FBX | Both import with the rig, animations and shape keys. `scripts/blender_*.py` show scripted imports. |

**Every engine:**
- **Looping:** glTF has no loop flag, so set looping clips to loop.
- **Root motion:** loops play in place unless you export with Root motion.
- **Props:** parent weapons and other props to the `WeaponR` bone (see [Rigging](rigging.md#weapon-socket)).
- **Vehicles:** parent the character to the vehicle's seat (see [Animations](animations.md#vehicles-and-props)).
- **Blinks:** short loops (walk, run) don't blink on their own, so blinks can come from a separate face layer (see [Faces](faces.md#a-living-face)).

Notes for other engines and tools are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).
