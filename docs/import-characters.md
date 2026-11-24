# Your own characters

A rigged character made in another tool, such as a Mixamo, Ready Player Me or VRoid character or one rigged in Blender, opens in the builder as an imported character. Every one of Ara's animations and any [content pack](packs.md) plays on it, and the Export panel writes it as GLB or FBX with the animations baked in. Together with content packs, Ara works as a bridge: anyone's animations on Ara's characters, and Ara's animations on anyone's characters.

## Open a character

In the builder, **Open character** takes a GLB, glTF, VRM (VRoid and other VRM avatars, 0.x and 1.0) or FBX file, or drop the file on the view. Ara converts it in the background, usually in a second or two, and shows it with its stats: height, bones and how many Ara animates, its rest pose and any face shapes it has.

While it opens, the view says what's happening: reading the file, matching the skeleton, preparing the mesh and textures. The character is kept in the browser, so it opens again after a reload, and **Your characters**, under Open character, lists every character imported in this browser to open with one click. Its panel renames it and removes it; **Back to Ara characters** returns to the character builder.

On the command line, `--model` exports one:

```sh
npx ara3d export --model hero.fbx --animations locomotion,emotes --formats glb,fbx
npx ara3d export --model hero.glb --pack salsa.ara-pack.json --animations idle,salsa
```

## What a model needs

- **A skeleton:** the model must be rigged. A model without one is refused; Mixamo's free auto-rigger rigs a humanoid in a few minutes (upload it at mixamo.com and download it as FBX).
- **A humanoid skeleton:** Ara finds the hips, spine, neck, head, arms, legs, hands, feet, fingers and toes by their names and the skeleton's shape. It knows Mixamo's and Ara's names, CMU's, Character Creator's and iClone's, Unreal's mannequin, Daz Genesis, VRoid, MMD and Blender's (CATS included, where the thigh is just `Left_leg`), with any prefix, and sides written as L/R, left/right or `.L`/`_l`. Twist, helper and IK bones are skipped. Where names don't say the side (`ARM001`, `ARM002`), the side a limb is on decides, and a foot held by a control outside the leg's chain is found below the shin. The hips, head, arms, legs, hands and feet are required; bones Ara doesn't animate, such as hair, tails or accessories, are kept and follow their parents.
- **Textures inside the file:** embedded textures come with the model (GLB and VRM hold them; for FBX, export with embedded media). An FBX that only names image files kept beside it, as Unity packages ship them, shows in plain colours, and its panel says so; open the package's VRM or GLB instead if it has one.
- **Up to 50 MB in the builder**, as it runs in your browser and phones run out of memory on bigger models. Smaller textures shrink a model most: `npx @gltf-transform/cli optimize model.glb smaller.glb`. The command line takes models up to 200 MB, and so can your own copy of Ara (see [Self-hosting](self-hosting.md#bigger-character-models)).

The model can face any way, lie along any axis and be measured in any unit: Ara stands it up, turns it to face forward (by its feet, which point forward, so rigs that name left and right from the viewer's side still face the right way), measures it in metres, puts its feet on the floor and centres it over its hips. It keeps its own height, unless that is under 0.3 m or over 3 m, which means another unit or scale: then it's brought to 1.8 m, and its panel says so.

## Faces

Face shapes named like Apple's ARKit ones, which Ready Player Me avatars and many others have, and Character Creator's (`Eye_Blink_L`, `Mouth_Smile_L`, its `V_` visemes) and VRM's expressions (blinks, the vowels A, I, U, E, O, joy and sorrow) are used for expressions, blinking and lip-sync. Shapes split into left and right halves (`mouthSmileLeft` and `mouthSmileRight`) are combined where Ara uses one. A model without face shapes keeps a still face.

Surfaces a model's own materials make invisible, such as the empty occlusion layers some tools put over the eyes, are left out.

## How it works

The model's mesh, skin weights, materials, textures and face shapes become an Ara character. Its bones that Ara recognises take Ara's names and Ara's bone frames, from their positions in the model's rest pose, so every animation drives them exactly as it drives Ara's own rig. An Ara character exported as GLB and opened again moves within half a centimetre of the original in every animation.

The model's file is kept in the browser and converted again each time it opens, so a character imported earlier gets any improvements to the conversion.

## Limits

- **Its look stays as modelled:** Ara's body, face, clothing and hair controls shape Ara's own characters, so they step aside for an imported one.
- **Props:** weapons, carried items and vehicles fit Ara's characters and aren't added to imported ones.
- **The builder for now:** Share links, Studio and Play use Ara's own characters. An imported character lives in the browser it was opened in.
