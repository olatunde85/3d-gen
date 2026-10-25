# Faces, expressions and lip-sync

Every character has **34 facial blend shapes** (morph targets): 20 for expressions and 14 for speech. They're built from MakeHuman's CC0 expression data and blended by the character's ethnicity mix, so they fit every face.

The expression shapes follow Apple's ARKit names where they match:
- **Eyes:** `eyeBlinkLeft/Right`, `eyeWideLeft/Right`, `eyeSquintLeft/Right`
- **Brows:** `browDownLeft/Right`, `browInnerUp`, `browOuterUpLeft/Right`
- **Jaw and mouth:** `jawOpen`, `mouthSmile`, `mouthFrown`, `mouthPucker`, `mouthPress`, `mouthStretch`, `mouthUpperUp`
- **Nose:** `noseSneerLeft/Right`

## Expressions

Nine expressions: neutral, happy, laughing, angry, sad, crying, surprised, afraid and determined. The chosen expression is the resting face in the viewer and in every exported clip: the blend shapes' default weights in GLB and FBX, baked into the mesh for OBJ.

## Teeth and tongue

MakeHuman's CC0 teeth (six variants, picked under *Expression*) and tongue.
- **Upper teeth:** fixed to the skull.
- **Lower teeth and tongue:** they rotate with the jaw whenever a shape opens it (`jawOpen`, the open speech shapes). They're skinned to the Jaw bone, so they also follow an animated jaw in an engine.
- **Closed lips:** faces that rest with the lips slightly apart get them closed, so a neutral face never shows the teeth.

## A living face

- **Blinks and glances:** clips blink and glance around with the eye bones.
- **Faces that match the action:** many clips also show it on the face:
  - effort when jumping or getting up, and pain when hit
  - a squinting aiming eye with rifles and pistols
  - smiles when waving, cheering and laughing, and sobbing when crying
  - half-closed eyes after a death
- **Blinks close fully on every face:** each character's blink is calibrated so the lids just meet. MakeHuman's closure would otherwise overshoot and fold the lid.
- **Blinks in exported clips** sit inside clips of 1.8 s or longer, so loops stay seamless. The live preview blinks on every clip. In an engine, short loops (walk, run) can get blinks from a separate face layer.

## In the exports

- **GLB:** sparse morph targets with `extras.targetNames` and animated `weights`.
- **FBX:** a BlendShape deformer with one channel per shape and `DeformPercent` curves.

Blender, Unity, Unreal, Godot and three.js read both.

Turn off *Facial blend shapes* in the Export panel to leave them out; the expression is then baked into the mesh. *Speech mouth shapes* can be left out on their own: they add about 0.7 MB per medium-detail GLB, or 1.5 MB at high detail.

## Talking and lip-sync

The 14 speech shapes (visemes) use the Oculus / Meta names that lip-sync tools output:

| Shape | Sounds |
| --- | --- |
| `viseme_PP` | M, B, P |
| `viseme_FF` | F, V |
| `viseme_TH` | TH |
| `viseme_DD` | D, T |
| `viseme_kk` | K, G |
| `viseme_CH` | CH, J, SH |
| `viseme_SS` | S, Z |
| `viseme_nn` | N, L |
| `viseme_RR` | R |
| `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U` | vowels |

Rest (`sil`) is every shape at zero. The jaw, lower teeth and tongue open with the shapes. The **Talk** clip (Emotes) loops a stretch of babble with head nods and brow raises on stressed syllables, for background chatter and previews.

To lip-sync real dialogue, drive the shapes from audio:

- **Tools that output Oculus visemes** (for example Meta's lip-sync plugin for Unity and Unreal, or Ready Player Me-style pipelines): map each viseme to the blend shape of the same name, `viseme_<name>`.
- **Rhubarb Lip Sync** (offline, from an audio file; works with any engine, including Godot): map its mouth cues A → `viseme_PP`, B → `viseme_kk` (or `viseme_SS`), C → `viseme_E`, D → `viseme_aa`, E → `viseme_O`, F → `viseme_U`, G → `viseme_FF`, H → `viseme_nn`, X → rest.
- **Vowel-based tools** (for example uLipSync in Unity, which detects A, I, U, E, O and N): map A → `viseme_aa`, I → `viseme_I`, U → `viseme_U`, E → `viseme_E`, O → `viseme_O`, N → `viseme_nn`.

Blend between shapes over about 50–80 ms rather than switching, and keep each weight at 1 or below; the Talk clip does the same.

The full set of 52 ARKit shapes for iPhone face capture is planned: see [issue #11](https://github.com/olatunde85/3d-gen/issues/11).
