# Ara character, Godot starter

A character in Godot 4 that you walk around with the keyboard. It switches between idle, walk and run, turns the way it moves, blinks on its own, and changes expression with the number keys.

## Run it

1. Copy this folder. In it, make a character with the [ara3d command-line tool](https://ara3dgen.com/docs/cli/) (Node 20 or newer):

   ```bash
   npx ara3d export --preset "The Adventurer" --animations idle,walk,run --out characters
   ```

   Any preset, seed or character file works, as long as it has the idle, walk and run clips. See `npx ara3d presets`.
2. Open the folder in Godot 4.3 or newer (Import, then pick `project.godot`). Godot imports the character.
3. Press Play (F5).

| Control | Does |
|---|---|
| WASD or the arrow keys | Walk |
| Shift | Run |
| 1 to 9 | Neutral, happy, laughing, angry, sad, crying, surprised, afraid, determined |
| Right-drag, scroll | Orbit and zoom the camera |

## How it works

Everything is in `main.gd`:

- **Loading:** the first `.glb` in `characters/` is instanced from its imported scene. Swap characters by replacing the file.
- **Looping:** glTF has no loop flag, so the script sets the idle, walk and run clips to loop.
- **Moving:** the character moves at the walk and run clips' natural speeds (1.5 and 3.7 m/s for a 1.78 m character, scaled by height), so the feet keep pace with the ground. `AnimationPlayer.play()` blends between the clips over 0.25 s.
- **Faces:** the character has ARKit-style blend shapes (`mouthSmile`, `jawOpen`, `eyeBlinkLeft` and so on). The script sets them with `set_blend_shape_value()`: an expression, with blinks on top.
- **Face tracks:** the exported clips also hold the face the character was exported with, and that would override the script's face every frame. The script removes those tracks when it loads the clips. To keep a clip's own facial animation instead, leave its tracks in.

Run `godot --path . -- --demo` for a short scripted walk, run and change of faces.

Characters are CC0 (MakeHuman data) and the code is MIT. See [Using characters in your engine](https://ara3dgen.com/docs/engines/) for Unity, Unreal and Blender.
