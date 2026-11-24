# Content packs

A content pack adds animations made anywhere, such as Mixamo, Blender, another 3D tool or a motion capture session, to the builder, Ara Studio, Ara Play, the [library](library.md), the [embed](embed.md), the [command line](cli.md) and the [MCP server](mcp.md). Ara retargets each animation onto its own rig, so it plays on every character like the built-in clips: in the viewer, in films and in GLB and FBX exports.

To play Ara's animations on a character made elsewhere instead, see [Your own characters](import-characters.md).

A pack is one `.ara-pack.json` file holding data only, never code. Every app checks a pack before using it, so opening anyone's pack is safe.

Everything a pack adds is named `<pack>/<animation>`, such as `salsa/basic`. Pack names never clash with Ara's own clips or with other packs, and a film or game that uses a pack's animations lists the pack, so it can load the pack wherever it opens.

## Import animations

**In the builder, Studio or Play:** open **Add animations…** and drop animation files, or a whole folder of them, into the Packs window, or choose them with **Choose files…**. They are converted in the browser in a few seconds and appear straight away. A dropped folder becomes a pack named after it; other files go into the pack chosen under **Into** (a new one is called "My animations").

**On the command line:** one command turns a folder (or a list of files) into a pack:

```sh
npx ara3d pack salsa
```

This writes `salsa.ara-pack.json` next to the folder and lists each animation with its group and whether it loops. `--name` names the pack and `--out` chooses where it goes. Add the file in the Packs window (drop it in like an animation), give it to the library, or pass it to `ara3d export --pack`.

Either way there's nothing to fill in:

- **Names** come from the files: `goalkeeper body block (2).fbx` becomes "Goalkeeper body block 2". Mixamo names every animation "mixamo.com", so the file's name is used instead.
- **Groups** are guessed from the names: jogs and strafes go to Locomotion, kicks, headers and goalkeeping to Sports, punches to Combat, dances to Emotes, idles to Idle & stance. Anything else goes to Actions.
- **Loops** are found from the motion: a walk, jog, idle or dance that ends in the pose it starts with repeats; one-off moves such as a catch or a kick play once and hold their last pose.
- **Copies** are skipped: a file identical to another (Mixamo's `walk (2).fbx` downloaded twice) is imported once. Files that hold a pose rather than an animation, such as a character in a T-pose, are left out, and the Packs window and the command say why.
- **Clashes** are told apart: a pack named like one of Ara's groups or another pack is listed as, for example, "Sports (import)", and an animation named like another shows its pack's name, such as "Idle (Soccer)".

In the Packs window, **Edit** on an imported pack renames it, renames and regroups its animations, and removes any. **Download** saves the pack file, to host it or share it.

### Set everything yourself

For a pack to share, or a skeleton Ara doesn't recognise, list the animations in a `pack.json` and build from it:

```sh
npx ara3d pack new salsa      # writes salsa/pack.json, filled in as above
npx ara3d pack build salsa    # or: npx ara3d pack salsa (a folder with a pack.json is built from it)
```

`npx ara3d pack check salsa.ara-pack.json` lists what a pack holds.

### Where animations come from

- **Mixamo:** download each animation as **FBX Binary**, with or without the skin. Ara reads Mixamo's skeleton by its bone names, fingers included. Tick **In Place** for clips that should stay on the spot; otherwise Ara keeps the forward travel as root motion, like its own walks and runs.
- **Blender and other tools:** export glTF or GLB (or FBX) with the armature. Bones named like Mixamo's or Ara's (`Hips`, `Spine`, `LeftArm`, `LeftUpLeg` and so on, with or without a prefix such as `mixamorig:`) are recognised. For other names, add a `bones` map to the animation in `pack.json`.
- **Motion capture:** BVH files. The CMU skeleton is recognised, and Ara applies the same corrections as its own CMU clips.

The skeleton can face any way and lie along any axis: Ara turns it upright and forwards from its rest pose before converting.

### pack.json

| Field | Meaning |
|---|---|
| `id` | The pack's ID: 2 to 40 lower-case letters, digits and hyphens, such as `salsa-moves` |
| `name` | The name shown in the apps, such as `Salsa moves` |
| `author`, `license`, `homepage`, `description` | Shown under the pack in the Packs window. `license` is an SPDX ID such as `CC-BY-4.0`, or a short licence name |
| `animations` | The animations, below |

Each animation:

| Field | Meaning |
|---|---|
| `file` | The file, next to `pack.json` |
| `clip` | Which animation in the file, by name, when it holds several (the default is the first) |
| `id` | Its ID in the pack: lower-case letters, digits and underscores (the default comes from the file name) |
| `name` | The name shown in the apps |
| `category` | The group it joins: `Idle & stance`, `Locomotion`, `Turns`, `Actions`, `Emotes`, `Reactions`, `Sitting & lying`, `Interaction`, `Everyday`, `Combat`, `Sports` or `Fitness` |
| `loop` | Whether it repeats. Without it, Ara checks whether the last pose matches the first |
| `start`, `end` | Seconds into the recording to start and end |
| `fps` | Frames a second to keep, 24 to 60 (the default is the file's own rate) |
| `hands` | `"fist"` closes the hands of a recording without fingers (the default is relaxed hands) |
| `ground` | `true` keeps the lowest foot on the floor in every frame, for seated and lying clips |
| `mirror` | BVH only: plays the recording mirrored left to right |
| `armSpread`, `legSpread` | Degrees to turn the arms or legs out from the body, for recordings whose limbs press into Ara's bodies |
| `bones` | A map from the file's joint names to Ara's bone names, such as `{ "pelvis": "Hips", "thigh_l": "LeftUpLeg" }`, for skeletons Ara doesn't recognise |

Editors check `pack.json` against [pack-source.v1.json](https://ara3dgen.com/schemas/pack-source.v1.json), named in its `$schema` field.

The other categories (aerial, climbing, swimming, vehicles and shooter) bring props, water and seats that only Ara's own clips are made for, so pack animations can't join them.

### How the conversion works

Ara reads the skeleton's rest pose and each frame's rotations, then retargets them onto its rig the way it retargets its own motion capture. Each bone keeps its motion relative to the rest pose, so skeletons of other proportions play correctly on Ara's bodies, from children to tall adults. The hips keep their height in leg lengths, and the lowest step of the clip rests on the floor. Fingers are kept when the file has them.

The motion is stored as 16-bit rotations per bone and frame. A one-second clip at 30 frames a second with fingers is about 16 KB, and an animation decodes the first time it plays, so a large pack opens quickly.

## Host a pack

Put the `.ara-pack.json` file anywhere that lets other sites read it (CORS), such as:

- a GitHub repository, through jsDelivr: `https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/salsa.ara-pack.json`
- your own site, with the `Access-Control-Allow-Origin: *` header

Pack addresses start with `https://`. A pack can be up to 32 MB and hold up to 400 animations of up to 120 seconds each.

Read the source's terms before sharing a pack: some services let you use their animations in your own work but not pass the files on. Packs you only use yourself can stay on your computer.

## Use a pack

### In the builder, Studio and Play

**Add animations…** (at the top of the builder's animation browser, and under Studio's performance picker) opens the Packs window. Drop animation files or pack files into it, or open **Add a pack by its address** and paste one. Its animations then appear under the pack's name in the builder's animation browser and Export panel, and in Studio's performance picker and category menu.

Packs stay in the browser, shared by the builder, Studio and Play, and work offline. Importing asks the browser to keep them when space runs low; clearing the site's data removes them, so **Download** keeps a copy of an imported pack. The Packs window lists each pack's author, licence and source, and removes packs. A pack that your Studio film uses can't be removed until its animations are taken out of the film. Adding a pack again, or a new version of it, replaces the one there.

### In films and games

A Studio film that uses a pack's animations lists the pack when it is saved, shared as a link or downloaded:

```json
"packs": [{ "id": "salsa", "name": "Salsa", "url": "https://cdn.jsdelivr.net/gh/me/moves@1.0/salsa.ara-pack.json" }]
```

Opening the film loads any listed pack the browser doesn't have yet, and keeps it. A pack added from a file has no address, so a film that uses it opens only where the pack has been added; host the pack to share such films. Play renders an attached film's animations into its video, so a published game plays without the pack.

### In the library and the embed

```js
const hero = await createCharacter('The Soldier', {
  packs: ['https://cdn.jsdelivr.net/gh/me/moves@1.0/salsa.ara-pack.json'],
  animations: ['idle', 'salsa/basic'],
});
new THREE.AnimationMixer(hero.scene).clipAction(hero.clip('salsa/basic')).play();
```

`packs` takes addresses (relative ones are read against the page) or packs already read. In `animations`, a pack's ID takes all its animations, and `'all'` takes Ara's clips and those of the packs given. `readPack(address)` lists a pack's animations with their IDs, groups, lengths and whether they loop.

The embed takes the same addresses in its `packs` attribute:

```html
<ara-character preset="The Soldier" packs="https://…/salsa.ara-pack.json" animation="salsa/basic"></ara-character>
```

### On the command line and with AI assistants

```sh
npx ara3d export --preset "The Soldier" --pack salsa.ara-pack.json --animations idle,salsa
npx ara3d animations --pack salsa.ara-pack.json
```

`--pack` takes a file or an address, and can be repeated. In exported files, an animation named like another (a pack's "Walk" beside Ara's) carries the pack's name too, such as `Walk (Salsa)`.

The MCP tools `create_character`, `list_animations` and `create_film` take a `packs` list of files or addresses, and films can list their packs as above.

## The pack file

`ara3d pack build` writes the file; [pack.v1.json](https://ara3dgen.com/schemas/pack.v1.json) describes it. `kind` is `"ara-pack"` and `version` is `1`. Each animation holds its `id`, `name`, `category` and its `motion`: the length, whether it loops, its root-motion travel, the frame count, the bones it moves, the rotations and hips positions as base64, and each limb's rest direction. The apps check every field, including that the data matches the frame and bone counts, before a pack's animations join the lists.
