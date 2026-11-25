# Your own sets

Ara Studio films in its own 71 sets, and in sets you import: places modelled, textured and lit in Blender, with their light baked in, so a set looks like a rendered film still and still plays smoothly in the browser.

A set is one `.glb` file. It holds data only, never code, and Studio checks it before using it.

## Import a set

In Studio, choose **Import a set…** under the set search, or drop the file on the set list. The set joins the list with its picture, marked with its author's name, and the film switches to it. Studio keeps it in this browser, so it's there next time; **Remove** under the search takes it out again.

A film saves the set's ID, such as `yourname/old-garage`, not the set itself. Opened in a browser that doesn't have the set, the film shows a plain stage and names the set to import.

Imported sets work like Studio's own: characters stand on the floor, sit on the set's seats, and are lit to match its light, and Assist plans films in the set from its staging note and its staging map, which Studio measures when the set is imported.

## Make a set in Blender

The **Export for Ara Studio** add-on (Blender 5.0 or later) bakes a scene's light and writes the set file. It's in the repository at [`studio-sets/ara_set_export`](../studio-sets/ara_set_export). To install it, build it into a zip and add it in Blender under **Edit → Preferences → Get Extensions → Install from Disk**:

```sh
blender --command extension build --source-dir studio-sets/ara_set_export
```

This writes `ara_set_export-<version>.zip` in the folder you run it from. On a Mac, `blender` is `/Applications/Blender.app/Contents/MacOS/Blender` unless you've added it to your path.

Then:

1. **Model the place** in metres, the floor at height 0. Anything goes: your own models, CC0 assets, textures at real-world scale. The front of the set (where Studio's camera usually stands) is toward Blender's −Y.
2. **Light it** with a sun (the cast's light follows it), a sky or world, and any lamps. Cycles bakes them all, bounces included.
3. **Fill in the Ara tab** in the 3D view's sidebar:
   - **Set:** an ID (`author/set`, in lower case), a name, a line about it, the author, a licence (such as CC-BY-4.0), a release (such as 1.0), a category, a kind of place and a time of day. The staging note tells Assist where things are, in metres, in Studio's axes (x across, z toward the front, which is Blender's −Y).
   - **Light on the cast:** the sun's colour and strength, a fill, the exposure and the background colour. Characters are lit live, so set these to sit them in the baked light.
   - **Room and seats:** select the floor and choose **Room from selection**; place the 3D cursor where a character would sit and choose **Add seat**, then turn the seat so its −Y axis points the way a seated character faces, and set its height to the seat's.
   - **Selected:** tick **Glass** for see-through panes (not baked), **Leave out** for helpers and stand-ins, and **Bake its colour** for a material whose colour comes from nodes (noise, mixes without an image), which glTF can't carry.
4. **Check** shows what the set will cost Studio and anything to fix. **Export set** bakes a copy of your file in the background, so you can keep working; the status bar shows its progress, and Esc stops it. The set file goes next to your `.blend`, named after the set, unless you choose another place.

### Lightmaps

The light is baked into lightmaps: images laid over the set through a second UV map the add-on makes. Objects in the same top-level collection share a lightmap. **Group** (under **Selected**) puts an object in another, and **Size** fixes a lightmap's size; otherwise it's sized for **Pixels a metre** (128 by default). Larger lightmaps give crisper shadows and cost more memory.

**Samples** sets how carefully Cycles bakes. The bake is denoised, so 192 is plenty; a large set takes 20 minutes or so on a recent laptop.

## Check a set file

`ara3d set check old-garage.glb` (see [the command line](cli.md)) checks a set file as Studio does when it's imported, without opening Studio: its details, what it costs to play against the limits below, and its staging map. `--json` prints them as JSON, and `ara3d schema set` prints the schema of the set's details.

AI assistants that use Ara's [MCP server](mcp.md) write films in your set when you give them its file: `film_guide` and `create_film` take set files in `set_files`, so the assistant plans from the set's staging note and map and `create_film` checks the film against it. Import the same file in Studio to watch the film.

## Limits

Studio takes a set of up to:

| | |
|---|---|
| Triangles | 300,000 |
| Separate meshes (one per material on each object) | 400 |
| Textures, lightmaps included | 200 megapixels |
| File | 64 MB |

Fewer is better for phones. Join small objects that belong together into one mesh (fewer meshes, and each piece still keeps its own footprint on the staging map), simplify dense models, and use 1K textures for small props.

Shadows of the set's lamps and sun are baked, so they don't move; characters cast their own shadows live. Volumes (fog, light shafts) and animated parts of the set don't carry over.

## The set file

A set file is a binary glTF (`.glb`) that any glTF viewer opens. Its `extras.ara_set` holds the set's details:

| Field | |
|---|---|
| `kind`, `version` | `"ara-studio-set"`, `1` |
| `id` | `author/set`, in lower case letters, digits and hyphens |
| `name`, `subtitle` | As Studio lists the set |
| `author`, `license`, `release` | Who made it, its licence, and its version (such as `"1.2"`) |
| `category`, `family`, `mood` | Studio's category, kind of place and time of day (`day`, `sunset` or `night`) |
| `staging` | Optional: where things are, for Assist |
| `room` | The floor, `[minX, minZ, maxX, maxZ]` in metres |
| `seats` | `{ x, y, z, yaw }`: position (y is the seat's height) and the way it faces, in degrees (0 faces +Z) |
| `light` | `sun` (`direction` of travel, `color`, `intensity`), `fill` (`color`, `intensity`), `exposure` and `background` |
| `lightmaps` | By name: `image` (an index into the GLB's images) and `scale` |
| `preview` | Optional: the index of the set's picture among the GLB's images |

Coordinates are glTF's: Y up, the front toward +Z. Each mesh names its lightmap in its extras as `ara_lightmap`, and glass is marked `ara_glass`. A lightmap holds the light falling on the surfaces, without their colour, divided by its `scale` and stored as sRGB; Studio multiplies the scale back. The lightmap follows the mesh's second UV map.

The add-on is licensed under the GPL (version 3 or later), as Blender add-ons are. Sets you make with it are yours, under the licence you give them.
