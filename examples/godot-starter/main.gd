extends Node3D
## An Ara character in Godot: it loads the first GLB in res://characters/, walks it around with WASD or the
## arrow keys (Shift to run), and sets its face: keys 1-9 choose an expression, and it blinks on its own.
## Drag with the right mouse button to orbit the camera, and scroll to zoom.

## Natural speeds of the walk and run clips for a character 1.78 m tall, in metres per second. Taller
## characters take longer strides, so these scale with height.
const WALK_SPEED := 1.5
const RUN_SPEED := 3.7
const TURN_SPEED := 10.0
const BLEND := 0.25

## The expressions as face-shape weights (the same ones as the library's setExpression).
const EXPRESSIONS := {
	"neutral": {"eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
	"happy": {"mouthSmile": 0.85, "eyeSquintLeft": 0.35, "eyeSquintRight": 0.35, "browOuterUpLeft": 0.15, "browOuterUpRight": 0.15, "eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
	"laughing": {"mouthSmile": 1.0, "jawOpen": 0.45, "mouthUpperUp": 0.45, "eyeSquintLeft": 0.65, "eyeSquintRight": 0.65, "browOuterUpLeft": 0.25, "browOuterUpRight": 0.25, "eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
	"angry": {"browDownLeft": 1.0, "browDownRight": 1.0, "mouthPress": 0.65, "mouthUpperUp": 0.2, "mouthFrown": 0.25, "noseSneerLeft": 0.6, "noseSneerRight": 0.6, "eyeSquintLeft": 0.35, "eyeSquintRight": 0.35, "eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
	"sad": {"browInnerUp": 0.85, "mouthFrown": 0.75, "eyeBlinkLeft": 0.18, "eyeBlinkRight": 0.18},
	"crying": {"browInnerUp": 1.0, "mouthFrown": 0.85, "mouthStretch": 0.35, "jawOpen": 0.12, "eyeSquintLeft": 0.55, "eyeSquintRight": 0.55, "noseSneerLeft": 0.2, "noseSneerRight": 0.2, "eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
	"surprised": {"browInnerUp": 0.7, "browOuterUpLeft": 0.8, "browOuterUpRight": 0.8, "eyeWideLeft": 0.75, "eyeWideRight": 0.75, "jawOpen": 0.35},
	"afraid": {"browInnerUp": 0.9, "eyeWideLeft": 0.6, "eyeWideRight": 0.6, "mouthStretch": 0.55, "jawOpen": 0.15},
	"determined": {"browDownLeft": 0.65, "browDownRight": 0.65, "mouthPress": 0.55, "eyeSquintLeft": 0.3, "eyeSquintRight": 0.3, "eyeBlinkLeft": 0.16, "eyeBlinkRight": 0.16},
}
const EXPRESSION_KEYS := ["neutral", "happy", "laughing", "angry", "sad", "crying", "surprised", "afraid", "determined"]

var hero: Node3D
var anim: AnimationPlayer
var faces: Array[MeshInstance3D] = []
var face := {}
var walk_speed := WALK_SPEED
var run_speed := RUN_SPEED

var camera: Camera3D
var yaw := 0.0
var pitch := -0.25
var distance := 4.5
var help: Label

var blink_wait := 2.0
var blink_time := -1.0

## With "-- --demo" on the command line, a short scripted walk, run and change of faces plays instead of
## reading the keyboard (used to check the example).
var demo := OS.get_cmdline_user_args().has("--demo")
var demo_time := 0.0


func _ready() -> void:
	_build_stage()
	var path := _find_character()
	if path.is_empty():
		help.text = "No character yet. In this folder, run:\n\nnpx ara3d export --preset \"The Adventurer\" --animations idle,walk,run --out characters\n\nthen run the project again."
		return
	hero = (load(path) as PackedScene).instantiate()
	add_child(hero)
	anim = hero.find_children("*", "AnimationPlayer", true, false)[0]
	for mesh: MeshInstance3D in hero.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh and mesh.mesh.get_blend_shape_count() > 0:
			faces.append(mesh)
	_prepare_clips()
	var height := _height()
	walk_speed = WALK_SPEED * height / 1.78
	run_speed = RUN_SPEED * height / 1.78
	set_expression("neutral")
	anim.play(_clip("idle"))


## glTF has no loop flag, so the looping clips are set to loop here. The clips also carry the character's
## face as it was exported (its expression and blinks), which would replace the face set from code each
## frame, so those tracks come off and this script drives the face instead.
func _prepare_clips() -> void:
	for name in anim.get_animation_list():
		var clip := anim.get_animation(name)
		if name.to_lower() in ["idle", "walk", "run"]:
			clip.loop_mode = Animation.LOOP_LINEAR
		for track in range(clip.get_track_count() - 1, -1, -1):
			if clip.track_get_type(track) == Animation.TYPE_BLEND_SHAPE:
				clip.remove_track(track)


## The clip's name in the file (Idle, Walk, Run) from its ID.
func _clip(id: String) -> String:
	for name in anim.get_animation_list():
		if name.to_lower() == id:
			return name
	return ""


## Sets an expression: one of EXPRESSION_KEYS.
func set_expression(id: String) -> void:
	face = {}
	for shape in ["mouthSmile", "jawOpen", "mouthUpperUp", "mouthFrown", "mouthPress", "mouthStretch", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "eyeBlinkLeft", "eyeBlinkRight", "browInnerUp", "browDownLeft", "browDownRight", "browOuterUpLeft", "browOuterUpRight", "noseSneerLeft", "noseSneerRight"]:
		face[shape] = 0.0
	face.merge(EXPRESSIONS[id], true)
	help.text = "WASD or arrow keys to move, Shift to run. 1-9: expression (%s). Right-drag to orbit, scroll to zoom." % id
	_apply_face(0.0)


## Writes the face to the character's blend shapes, with a blink on top (0 = open, 1 = closed).
func _apply_face(closed: float) -> void:
	for mesh in faces:
		for shape in face:
			var index := mesh.find_blend_shape_by_name(shape)
			if index < 0:
				continue
			var weight: float = face[shape]
			if closed > 0.0 and shape.begins_with("eyeBlink"):
				weight = max(weight, closed)
			elif closed > 0.0 and (shape.begins_with("eyeWide") or shape.begins_with("eyeSquint")):
				weight *= 1.0 - closed
			mesh.set_blend_shape_value(index, weight)


func _process(delta: float) -> void:
	if hero == null:
		return
	var input := _demo_input(delta) if demo else _keyboard_input()
	var move: Vector2 = input[0]
	var running: bool = input[1]

	# Move relative to the camera, and turn to face the way the character goes.
	var direction := Vector3(move.x, 0, move.y).rotated(Vector3.UP, yaw)
	var speed := 0.0
	if direction.length() > 0.01:
		speed = run_speed if running else walk_speed
		hero.position += direction.normalized() * speed * delta
		hero.rotation.y = lerp_angle(hero.rotation.y, atan2(direction.x, direction.z), min(1.0, TURN_SPEED * delta))
	var clip := _clip("run" if speed >= run_speed else "walk" if speed > 0.0 else "idle")
	if anim.current_animation != clip:
		anim.play(clip, BLEND)

	# A blink every 2-6 seconds: the lids close in 0.07 s, stay shut for 0.04 s and open in 0.1 s.
	var closed := 0.0
	if blink_time < 0.0:
		blink_wait -= delta
		if blink_wait <= 0.0:
			blink_time = 0.0
			blink_wait = randf_range(2.0, 6.0)
	else:
		blink_time += delta
		closed = blink_time / 0.07 if blink_time < 0.07 else 1.0 if blink_time < 0.11 else 1.0 - (blink_time - 0.11) / 0.1
		if blink_time >= 0.21:
			blink_time = -1.0
			closed = 0.0
	_apply_face(clamp(closed, 0.0, 1.0))

	# The camera follows the character, aiming at the face when close and the body when further out.
	var height := walk_speed / WALK_SPEED * 1.78
	var target := hero.position + Vector3(0, lerp(height * 0.93, height * 0.55, clamp((distance - 1.3) / 3.0, 0.0, 1.0)), 0)
	var offset := Vector3(0, 0, distance).rotated(Vector3.RIGHT, pitch).rotated(Vector3.UP, yaw)
	camera.position = camera.position.lerp(target + offset, min(1.0, 8.0 * delta))
	camera.look_at(target)


func _keyboard_input() -> Array:
	var move := Vector2(
		float(Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT)),
		float(Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP)))
	return [move, Input.is_physical_key_pressed(KEY_SHIFT)]


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and hero:
		var number: int = event.physical_keycode - KEY_1
		if number >= 0 and number < EXPRESSION_KEYS.size():
			set_expression(EXPRESSION_KEYS[number])
	elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_RIGHT:
		yaw -= event.relative.x * 0.005
		pitch = clamp(pitch - event.relative.y * 0.005, -1.2, 0.3)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			distance = max(1.0, distance - 0.3)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			distance = min(12.0, distance + 0.3)


## The scripted demo: stand, walk a curve, run, stop, and change faces.
func _demo_input(delta: float) -> Array:
	demo_time += delta
	var t := demo_time
	var faces_at := {0.0: "happy", 6.5: "determined", 10.5: "laughing", 12.5: "surprised"}
	for at in faces_at:
		if t - delta <= at and t > at:
			set_expression(faces_at[at])
	if t >= 10.0:
		# Come round to the front and in close for the faces.
		distance = lerp(distance, 1.3, min(1.0, 2.0 * delta))
		yaw = lerp_angle(yaw, hero.rotation.y + 0.35, min(1.0, 2.0 * delta))
		return [Vector2.ZERO, false]
	if t < 1.5:
		return [Vector2.ZERO, false]
	var angle := (t - 1.5) * 0.5
	return [Vector2(sin(angle), -cos(angle)), t >= 6.0]


func _height() -> float:
	var top := 0.0
	for mesh in faces:
		top = max(top, mesh.get_aabb().end.y)
	return top if top > 0.5 else 1.78


## The first .glb in res://characters/ (exported games list imported files with a .import or .remap suffix).
func _find_character() -> String:
	var dir := DirAccess.open("res://characters")
	if dir == null:
		return ""
	for file in dir.get_files():
		var name := file.trim_suffix(".import").trim_suffix(".remap")
		if name.get_extension().to_lower() == "glb":
			return "res://characters/" + name
	return ""


## Ground, light, sky and camera.
func _build_stage() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = Sky.new()
	environment.sky.sky_material = ProceduralSkyMaterial.new()
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color(0.62, 0.66, 0.72)
	environment.fog_density = 0.015
	environment.fog_sky_affect = 0.0
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.shadow_enabled = true
	add_child(sun)

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(400, 400)
	# Grey with a line every metre, so movement shows.
	var shader := Shader.new()
	shader.code = """
shader_type spatial;
void fragment() {
	vec2 cell = abs(fract((INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xz) - 0.5);
	ALBEDO = mix(vec3(0.30, 0.32, 0.34), vec3(0.42, 0.44, 0.46), step(0.485, max(cell.x, cell.y)));
	ROUGHNESS = 0.9;
}
"""
	var material := ShaderMaterial.new()
	material.shader = shader
	plane.material = material
	ground.mesh = plane
	add_child(ground)

	camera = Camera3D.new()
	camera.fov = 45
	camera.position = Vector3(0, 1.6, distance)
	add_child(camera)

	help = Label.new()
	help.position = Vector2(16, 16)
	help.add_theme_color_override("font_shadow_color", Color.BLACK)
	var layer := CanvasLayer.new()
	layer.add_child(help)
	add_child(layer)
