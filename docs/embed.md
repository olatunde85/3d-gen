# Embed a character (`<ara-character>`)

Put a live, animated character on any web page with one script and one tag. It works in plain HTML, WordPress, Webflow, Squarespace, Notion-style site builders, and frameworks such as React, Vue and Svelte. There's nothing to install and no 3D code to write.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/ara3d@0/dist/embed.js"></script>

<ara-character preset="The Female Executive" animation="model_walk"></ara-character>
```

The script includes three.js and the [ara3d library](library.md) (about 750 KB compressed), and the character data loads from jsDelivr. Visitors can drag to turn the character.

**The quickest way:** design a character in the [builder](https://ara3dgen.com/app/), choose **Share**, then **Copy embed code**, and paste it into your page.

## Choosing the character

Use one of these:

| Attribute | Example | |
|---|---|---|
| `preset` | `preset="The Bride"` | One of the 50 presets. Without any of these attributes, the element shows The Soldier |
| `share` | `share="https://ara3dgen.com/app/#c=…"` | A share link from the builder: the character exactly as designed |
| `random` | `random="42"` | A random character; the same number always gives the same person |
| `src` | `src="/characters/hero.json"` | A character file: an `ara-character` file (`npx ara3d new hero`) or a `params.json` from an export |
| `model` | `model="/models/hero.fbx"` | A rigged model from another tool (GLB, glTF, VRM or FBX), with its textures beside it. It keeps its own look and plays Ara's animations, with any weapon, carried item or vehicle; see [Your own characters](import-characters.md). It's converted by a second script, loaded from beside `embed.js` the first time a model is shown |

## Everything else

| Attribute | Example | |
|---|---|---|
| `animation` | `animation="texting"` | The clip that plays (default `idle`), or several in a row, such as `walk 3s, look_around, talk_gestures` (see below). The [playground](https://ara3dgen.com/developers/#playground) lists all 262 with their IDs |
| `expression` | `expression="laughing"` | neutral, happy, laughing, angry, sad, crying, surprised, afraid or determined |
| `weapon` | `weapon="rifle"` | rifle, pistol, sword, knife or grenade |
| `carry` | `carry="briefcase"` | Something to carry; `none` takes away a preset's own bag. A `texting` or `phone_call` animation brings the phone, in place of a preset's bag, unless you set `carry` |
| `vehicle` | `vehicle="motorcycle"` | A vehicle fitted to the rider. Without an `animation`, it plays the riding clip |
| `colors` | `colors="outfit: #1d2a44; carry: #8a1c1c"` | New colours for `outfit`, `top`, `jacket`, `bottom`, `shoes`, `carry` and `vehicle` (see [Colours](library.md#colours)) |
| `detail` | `detail="low"` | `low`, `medium` or `high`. Use `low` when a page shows many characters |
| `background` | `background="#20283a"` | A background colour. Without it the element is transparent, so the page shows through |
| `look-at` | `look-at="pointer"` | `pointer` turns the character's head towards the visitor's pointer, wherever it is on the page. `camera` makes it look at the viewer |
| `auto-rotate` | `auto-rotate` | Turns the character slowly |
| `orbit` | `orbit="false"` | Stops visitors from turning the character |
| `zoom` | `zoom` | Lets visitors zoom with the mouse wheel or a pinch. It's off by default, so the page still scrolls over the character |
| `packs` | `packs="https://…/salsa.ara-pack.json"` | [Content packs](packs.md) whose animations `animation` and `clips` can use, as `salsa/basic`; several addresses go comma- or space-separated |
| `assets-url` | `assets-url="/ara3d-assets/"` | Serve the character data yourself (see [Hosting the data](library.md#hosting-the-data)) |

## Chaining animations

List clips in `animation`, separated by commas, and they play one after another, blending into each other, then start again:

```html
<ara-character preset="The Adventurer" animation="run 2s, vault_over, run 2s, ledge_climb_up"></ara-character>
```

A clip that loops (walk, idle, run) plays one cycle unless you give it a length, such as `walk 3s`. A one-off move (vault_over, jump, punch_combo) plays once, or as many times as you ask, such as `vault_over x2`.

## Updating

While a character loads, the element shows a wireframe figure with a soft light passing over it, and it shows again whenever the character is rebuilt. Change an attribute and the character updates. `expression` applies at once, and so does a new order of animations it has already loaded. A new character, props, colours or an animation it hasn't loaded rebuild it, which takes a second or two.

## Size

The element fills the width of its container, with a 3:4 (portrait) shape. Set its size with CSS like any other element:

```html
<ara-character preset="The Priest" style="width: 320px; height: 480px"></ara-character>
<ara-character preset="The Soldier" vehicle="motorcycle" style="aspect-ratio: 4 / 3"></ara-character>
```

## From JavaScript

The element fires `load` when its character is ready and `error` when something goes wrong, such as an unknown preset. The message also shows inside the element.

```js
const el = document.querySelector('ara-character');
el.addEventListener('load', (event) => console.log('Ready:', event.detail.params.name));
el.addEventListener('error', (event) => console.warn(event.detail.message));

el.setAttribute('animation', 'phone_call');
el.character.setMouth('viseme_aa'); // the full library API, once loaded
```

`el.character` is the loaded character, with everything the [library](library.md#what-you-get-back) returns: faces, lip-sync, clips and the GLB file.

With a bundler, `import 'ara3d/embed'` registers the element. TypeScript knows its type.

## Good to know

- **Versions:** `ara3d@0` follows the newest 0.x release, though browsers that already have the file can keep their copy for up to a week. To stay on one release, or to get a new one at once, use the full version, such as `ara3d@0.9.0`.
- **Many characters:** each element draws only while it's on screen, and the character data downloads once for the whole page. Browsers allow about 16 3D views per page, so for crowds use the [library](library.md#crowds-rigs-and-other-animations) in a single scene.
- **Content-Security-Policy:** sites with a strict policy need to allow `https://cdn.jsdelivr.net` for scripts and connections, and `blob:` addresses for workers, images and connections.
- **Phones:** a sideways swipe turns the character and an up-or-down swipe scrolls the page.
- **Removing an element** frees its memory.
- **Styling the loading figure:** it's exposed as `::part(figure)`, and the error message as `::part(status)`, for example `ara-character::part(status) { top: 12px; bottom: auto; }`.
- **Testing on your computer:** open the page through a web server, such as `npx serve`, not by double-clicking the file. Browsers block the embed on pages opened as files, and it says so.
