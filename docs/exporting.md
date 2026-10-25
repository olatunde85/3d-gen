# Exporting

The export bar always shows what you're about to get, for example `📦 FBX · Rigged + 3 anims`, with a Download button named after the exact file. Click the summary to open the **Export panel**:

1. **What to export**
   - **Static model:** mesh + textures.
   - **Rigged model:** + skeleton and skin weights.
   - **Rigged + animations:** + the clips you pick.
2. **Skeleton:** game rig (65 bones, Mixamo names), lite (25) or full MakeHuman (163); an A- or T-pose bind; optional jaw and eye bones; facial blend shapes and speech mouth shapes (see [Faces](faces.md)).
3. **Animations:** tick clips by category (▶ previews each one), then choose **One file, all clips inside** or **Zip: one file per clip**.
   - **Per-clip files** follow Unity's `model@clip.fbx` convention. They're skeleton-only unless "Include the mesh" is on.
   - **Root motion** makes walk, run and strafe travel instead of playing in place.
   - **Loop names:** *Mark looping clips in their names* names them `Walk-loop` and so on.
4. **Weapon** (when the character holds one):
   - **In the hand:** one file, with the weapon skinned to `WeaponR`.
   - **Separate prop file:** the character without the weapon, plus `<name>_<weapon>.glb/.fbx`. The prop's origin is at the grip, so it attaches to `WeaponR` with zero offset.
5. **Format:** GLB, FBX, OBJ (static only; disabled for rigged modes), or All formats (zip).
6. **You will download:** the exact file name and every file in it, each with a description: triangles, textures, bones and pose, which clips, and whether it's skeleton-only. Notes explain any adjustment, for example that OBJ can't hold a rig.

The plan is computed by `planExport()` (`src/export/plan.ts`) and executed by `runExport()`, so the download always matches the list. Zips also contain:
- `params.json`, to regenerate the character
- `rig.json`
- a README listing the files
- the licence
- a preview image

## Formats

| Format | Units | Notes |
| --- | --- | --- |
| `.glb` | metres | glTF 2.0, PBR materials, textures embedded, alpha mask for hair and lashes |
| `.fbx` | centimetres | Binary FBX 7.4, quad topology, textures embedded (Unity, Unreal, Blender) |
| OBJ (`_obj.zip`) | metres | `.obj` + `.mtl` + `textures/`, quad topology |
| `.zip` | — | All of the above plus `params.json` (to regenerate), `preview.png`, README and LICENSE |

All formats use +Y up, with the character facing +Z and the feet at y = 0. `scripts/blender_check.py` imports exports into Blender and renders previews.

For per-engine advice, see [Using characters in your engine](engines.md).
