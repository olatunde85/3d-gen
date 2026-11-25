# Ara's Studio sets

Ara's own sets for Studio are modelled, textured and lit in Blender by Python scripts, then baked and exported by the
**Export for Ara Studio** add-on in [`ara_set_export/`](ara_set_export), the same way as a set made by hand (see
[Your own sets](../docs/studio-sets.md) for the add-on, the set file and its limits). Each script builds one set:

```sh
blender -b --python studio-sets/warehouse.py -- preview   # Cycles stills from Studio's cameras, with a stand-in character
blender -b --python studio-sets/warehouse.py -- bake      # bakes the set and writes studio-sets/out/old-factory.glb
```

`SAMPLES` sets the bake's samples (192 by default; the lightmaps are denoised). A bake takes about 20 minutes on an M1
Pro. `preview` also takes `SHOTS` (wide, medium, reverse, establishing), `EXPOSURE` and `HAZE`.

Set files are plug-in data, imported into Studio with **Import a set…**: they stay out of the repository
(`studio-sets/out/` and `.cache/` are ignored).

## How a set script works

- **`ara_set.py`** holds the modelling helpers: boxes, planes and beams; CC0 textures and models from
  [Poly Haven](https://polyhaven.com) (downloaded into `.cache/`), mapped at real-world scale; a physical sky, the sun
  and lamps; and Cycles previews.
- **Pieces:** objects are joined into one mesh per piece (a wall, a rack, a crate stack), not one per set: fewer
  meshes to draw, and Studio's staging map measures each piece's footprint. Dense models are simplified to 6,000
  faces, and most textures are 1K.
- **Export:** the script fills in the add-on's settings (the set's details, lightmap groups and sizes, glass, the
  materials whose colour is baked, the room, seats and preview camera) and calls its export.
- **Walls the camera films through** are one-sided: seen from inside, see-through from outside.

## In Studio

The set is drawn first in its baked light (the cast's lights off), then the cast over it in lights matched to the
bake's sun, with an invisible floor catching the cast's shadows. The scene's environment adds a soft sheen to both,
shaped by the surfaces' normal and roughness maps. Studio reads set files in `src/studio/set-files.ts` and keeps them
in the browser in `src/studio/set-store.ts`.

## Limits

- A set file should stay under 25 MB, so it can be hosted on the site later.
- Textures are uncompressed on the graphics card: the factory's take about 150 megapixels, fine on a laptop but heavy
  for phones.
- Light shafts in dusty air show in Cycles previews only; Studio doesn't draw them yet.
