"""
Studio set: an industrial warehouse in the afternoon. Low sun through high factory windows lays shafts of light across
the open floor; a roller door stands half open on daylight. Brick walls, steel trusses, a corrugated roof with
skylights, pallet racks, crates, a car under a dust cover, barrels, a workbench corner and hanging lamps, on worn,
stained concrete with painted lanes.

Blender's axes: Z up, the back wall toward +Y (Studio's -Z), the open front toward -Y, where the camera is.
The middle of the floor (x -5..5, y -7..3) is kept clear for the cast.

  blender -b --python warehouse.py -- preview     stills from Studio's usual camera, with a stand-in character
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ara_set as A  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

random.seed(7)
W, BACK, FRONT, EAVE, PEAK = 10.0, 7.0, -9.0, 7.0, 9.0   # half width, back and front walls, eave and ridge heights
WIN_LOW, WIN_HIGH, WIN_W = 3.9, 6.2, 2.4                 # factory windows in the side walls
WINDOWS = [-6.4, -2.8, 0.8, 4.4]                         # their centres along the side walls
DOOR_X, DOOR_W, DOOR_H, DOOR_GAP = -2.6, 4.6, 4.4, 1.1   # the roller door in the back wall, open at the bottom
BAYS = [-9.0, -5.4, -1.8, 1.8, 5.4, 7.0]                 # truss and column lines


def materials():
    return {
        'floor': A.grimy('Concrete floor', 'concrete_floor_worn_001', 'concrete_floor_02', size=3.0, dirt_size=3.5),
        'brick': A.textured('Brick', 'factory_brick', size=2.2, resolution='2k'),
        'plinth': A.textured('Concrete plinth', 'concrete_wall_003', size=2.5, tint=(0.8, 0.78, 0.74)),
        'roof': A.textured('Corrugated iron', 'corrugated_iron', size=1.6, tint=(0.62, 0.64, 0.66), metallic=0.6),
        'rust': A.textured('Rusty steel', 'rusty_metal_02', size=1.5, metallic=0.4),
        'steel': A.textured('Painted steel', 'metal_plate', size=1.2, tint=(0.24, 0.3, 0.34), metallic=0.5, roughness_scale=0.9),
        'planks': A.textured('Crate planks', 'weathered_brown_planks', size=1.0, tint=(0.95, 0.88, 0.78)),
        'pallet': A.textured('Pallet wood', 'weathered_brown_planks', size=0.8, tint=(1.0, 0.9, 0.75)),
        'door': A.textured('Roller door', 'corrugated_iron', size=0.9, tint=(0.45, 0.5, 0.52), metallic=0.5),
        'rack': A.plain('Rack orange', (0.75, 0.26, 0.05), roughness=0.45, metallic=0.3),
        'rack_blue': A.plain('Rack blue', (0.07, 0.17, 0.33), roughness=0.5, metallic=0.4),
        'cardboard': A.plain('Cardboard', (0.55, 0.4, 0.25), roughness=0.92),
        'wrap': A.plain('Shrink wrap', (0.5, 0.52, 0.54), roughness=0.1, alpha=0.22),
        'tape': A.plain('Tape', (0.7, 0.6, 0.42), roughness=0.4),
        'paint_yellow': A.plain('Floor paint', (0.8, 0.58, 0.06), roughness=0.75),
        'rubber': A.plain('Rubber', (0.025, 0.025, 0.025), roughness=0.85),
        'dark_steel': A.plain('Dark steel', (0.06, 0.065, 0.07), roughness=0.4, metallic=0.85),
        'lamp_shade': A.plain('Lamp shade', (0.13, 0.17, 0.15), roughness=0.45, metallic=0.7),
        'bulb': A.plain('Bulb', (1, 0.85, 0.6), roughness=0.3, emission=(1.0, 0.7, 0.38), strength=80.0),
        'glass': A.plain('Window glass', (0.42, 0.46, 0.44), roughness=0.25, alpha=0.42),
        'ground': A.textured('Yard ground', 'concrete_floor_worn_001', size=4.0, tint=(0.9, 0.88, 0.84)),
        'puddle': A.plain('Puddle', (0.02, 0.022, 0.025), roughness=0.04),
    }


def _beam(name, a, b, thickness, material):
    """A square beam from point a to point b."""
    from mathutils import Vector
    a, b = Vector(a), Vector(b)
    d = b - a
    obj = A.box(name, (thickness, thickness, d.length), (a + b) / 2, material)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return obj


def walls(m):
    parts = []
    length, mid = BACK - FRONT, (BACK + FRONT) / 2
    # Side walls: a solid lower wall over a concrete plinth, piers between the windows, a band above them.
    for side in (-1, 1):
        x = side * (W + 0.18)
        parts.append(A.box(f'Wall low {side}', (0.36, length, WIN_LOW - 0.7), (x, mid, 0.7 + (WIN_LOW - 0.7) / 2), m['brick']))
        parts.append(A.box(f'Plinth {side}', (0.42, length, 0.7), (x, mid, 0.35), m['plinth']))
        parts.append(A.box(f'Wall top {side}', (0.36, length, EAVE - WIN_HIGH), (x, mid, (WIN_HIGH + EAVE) / 2), m['brick']))
        edges = [FRONT] + [c for w in WINDOWS for c in (w - WIN_W / 2, w + WIN_W / 2)] + [BACK]
        for a, b in zip(edges[0::2], edges[1::2]):
            parts.append(A.box(f'Pier {side} {a:.0f}', (0.36, b - a, WIN_HIGH - WIN_LOW), (x, (a + b) / 2, (WIN_LOW + WIN_HIGH) / 2), m['brick']))
        for i, w in enumerate(WINDOWS):
            for k in range(5):
                yy = w - WIN_W / 2 + k * WIN_W / 4
                parts.append(A.box(f'Mullion {side} {i} {k}', (0.08, 0.06, WIN_HIGH - WIN_LOW), (x - side * 0.05, yy, (WIN_LOW + WIN_HIGH) / 2), m['dark_steel']))
            for k in range(4):
                zz = WIN_LOW + k * (WIN_HIGH - WIN_LOW) / 3
                parts.append(A.box(f'Transom {side} {i} {k}', (0.08, WIN_W, 0.06), (x - side * 0.05, w, zz), m['dark_steel']))
            parts.append(A.box(f'Sill {side} {i}', (0.5, WIN_W + 0.2, 0.08), (x - side * 0.2, w, WIN_LOW - 0.04), m['plinth']))
    # The back wall round the roller door, and its gable.
    left, right, y = DOOR_X - DOOR_W / 2, DOOR_X + DOOR_W / 2, BACK + 0.18
    parts.append(A.box('Back left', (left + W, 0.36, EAVE), ((left - W) / 2, y, EAVE / 2), m['brick']))
    parts.append(A.box('Back right', (W - right, 0.36, EAVE), ((right + W) / 2, y, EAVE / 2), m['brick']))
    parts.append(A.box('Back lintel', (DOOR_W, 0.36, EAVE - DOOR_H), (DOOR_X, y, (DOOR_H + EAVE) / 2), m['brick']))
    parts.append(A.box('Back plinth left', (left + W, 0.42, 0.7), ((left - W) / 2, y, 0.35), m['plinth']))
    parts.append(A.box('Back plinth right', (W - right, 0.42, 0.7), ((right + W) / 2, y, 0.35), m['plinth']))
    parts.append(A.mesh_object('Back gable', _gable, m['brick'], (0, y, 0)))
    # The roller door, rolled up into a drum, its curtain stopping short of the floor.
    parts.append(A.box('Door curtain', (DOOR_W - 0.1, 0.08, DOOR_H - DOOR_GAP), (DOOR_X, y - 0.1, DOOR_GAP + (DOOR_H - DOOR_GAP) / 2), m['door']))
    parts.append(A.box('Door bar', (DOOR_W - 0.1, 0.12, 0.1), (DOOR_X, y - 0.14, DOOR_GAP + 0.05), m['dark_steel']))
    parts.append(A.cylinder('Door drum', 0.36, DOOR_W + 0.3, (DOOR_X, y - 0.42, DOOR_H + 0.42), m['steel'], rotation=(0, math.pi / 2, 0)))
    for s in (-1, 1):
        parts.append(A.box(f'Door guide {s}', (0.14, 0.2, DOOR_H), (DOOR_X + s * (DOOR_W / 2 + 0.02), y - 0.12, DOOR_H / 2), m['dark_steel']))
    # The front wall, with two windows: seen only from inside, so the camera can film from beyond it.
    # Single surfaces facing inward (no outer face for the camera to see from beyond the wall).
    front = A.one_sided(m['brick'])
    inward = (math.pi / 2, 0, math.pi)  # a plane turned upright, its face toward +Y
    for a, b in [(-W, -6.0), (-3.6, 3.6), (6.0, W)]:
        parts.append(A.plane(f'Front {a}', (b - a, EAVE), ((a + b) / 2, FRONT, EAVE / 2), front, rotation=inward))
    for a, b in [(-6.0, -3.6), (3.6, 6.0)]:
        parts.append(A.plane(f'Front under {a}', (b - a, WIN_LOW), ((a + b) / 2, FRONT, WIN_LOW / 2), front, rotation=inward))
        parts.append(A.plane(f'Front over {a}', (b - a, EAVE - WIN_HIGH), ((a + b) / 2, FRONT, (WIN_HIGH + EAVE) / 2), front, rotation=inward))
    parts.append(A.mesh_object('Front gable', _front_gable, front, (0, FRONT, 0)))
    parts.append(A.box('Side door', (1.0, 0.1, 2.2), (6.2, BACK - 0.02, 1.1), m['rack_blue']))
    parts.append(A.box('Side door frame', (1.2, 0.14, 2.32), (6.2, BACK + 0.02, 1.16), m['dark_steel']))
    return parts


def _gable(bm):
    t = 0.18
    v = [bm.verts.new(p) for p in [(-W, -t, EAVE), (W, -t, EAVE), (0, -t, PEAK), (-W, t, EAVE), (W, t, EAVE), (0, t, PEAK)]]
    for face in ([v[0], v[1], v[2]], [v[5], v[4], v[3]], [v[0], v[3], v[4], v[1]], [v[1], v[4], v[5], v[2]], [v[2], v[5], v[3], v[0]]):
        bm.faces.new(face)


def _front_gable(bm):
    v = [bm.verts.new(p) for p in [(W, 0, EAVE), (-W, 0, EAVE), (0, 0, PEAK)]]
    bm.faces.new(v)  # wound to face +Y, into the hall


SKYLIGHTS = [(-5.0, -3.8), (0.2, 1.4)]


def roof(m):
    parts = []
    slope, half = math.atan2(PEAK - EAVE, W), math.hypot(W, PEAK - EAVE)
    for side in (-1, 1):
        cx, cz = side * W / 2, (EAVE + PEAK) / 2 + 0.12
        edges = [FRONT - 0.3] + [c for r in SKYLIGHTS for c in r] + [BACK + 0.3]
        for a, b in zip(edges[0::2], edges[1::2]):
            sheet = A.box(f'Roof {side} {a:.0f}', (half + 0.4, b - a, 0.05), (cx, (a + b) / 2, cz), m['roof'])
            sheet.rotation_euler = (0, side * slope, 0)
            parts.append(sheet)
    # Trusses on every bay line, purlins along them.
    for i, y in enumerate(BAYS):
        parts.append(_beam(f'Chord {i}', (-W, y, EAVE), (W, y, EAVE), 0.16, m['rust']))
        for side in (-1, 1):
            parts.append(_beam(f'Rafter {i} {side}', (side * W, y, EAVE), (0, y, PEAK), 0.18, m['rust']))
            for k in range(1, 4):
                x, top = side * W * k / 4, EAVE + (PEAK - EAVE) * (1 - k / 4)
                parts.append(_beam(f'Post {i} {side} {k}', (x, y, EAVE), (x, y, top), 0.08, m['rust']))
                xn, topn = (side * W * (k + 1) / 4, EAVE + (PEAK - EAVE) * (1 - (k + 1) / 4)) if k < 3 else (0, PEAK)
                parts.append(_beam(f'Brace {i} {side} {k}', (x, y, EAVE), (xn, y, topn), 0.06, m['rust']))
    for side in (-1, 1):
        for k in range(5):
            x, z = side * W * k / 5, PEAK - (PEAK - EAVE) * k / 5 - 0.12
            parts.append(_beam(f'Purlin {side} {k}', (x, FRONT, z), (x, BACK, z), 0.12, m['steel']))
        for y in BAYS:
            x = side * (W - 0.25)
            parts.append(A.box(f'Column web {side} {y}', (0.08, 0.3, EAVE), (x, y, EAVE / 2), m['steel']))
            for f in (-1, 1):
                parts.append(A.box(f'Column flange {side} {y} {f}', (0.3, 0.03, EAVE), (x, y + f * 0.15, EAVE / 2), m['steel']))
    return parts


def glazing(m):
    """Window and skylight glass, dusty: drawn see-through rather than baked."""
    panes = []
    for side in (-1, 1):
        x = side * (W + 0.18) - side * 0.05
        for i, w in enumerate(WINDOWS):
            for r in range(3):
                for c in range(4):
                    if (side, i, r, c) in {(-1, 1, 1, 2), (-1, 2, 0, 0), (1, 3, 2, 1)}:
                        continue  # broken panes
                    yy, zz = w - WIN_W / 2 + (c + 0.5) * WIN_W / 4, WIN_LOW + (r + 0.5) * (WIN_HIGH - WIN_LOW) / 3
                    panes.append(A.box(f'Pane {side} {i} {r} {c}', (0.01, WIN_W / 4 - 0.06, (WIN_HIGH - WIN_LOW) / 3 - 0.06), (x, yy, zz), m['glass']))
    slope, half = math.atan2(PEAK - EAVE, W), math.hypot(W, PEAK - EAVE)
    for side in (-1, 1):
        for a, b in SKYLIGHTS:
            pane = A.box(f'Skylight {side} {a}', (half, b - a, 0.02), (side * W / 2, (a + b) / 2, (EAVE + PEAK) / 2 + 0.12), m['glass'])
            pane.rotation_euler = (0, side * slope, 0)
            panes.append(pane)
    return panes


def floor(m):
    f = A.plane('Floor', (2 * W, BACK - FRONT), (0, (BACK + FRONT) / 2, 0), m['floor'])
    lines = []
    for x in (-6.6, 6.4):
        lines.append(A.plane(f'Lane {x}', (0.12, BACK - FRONT - 2), (x, (BACK + FRONT) / 2 - 0.5, 0.004), m['paint_yellow']))
    bx, by = DOOR_X, BACK - 2.3
    for dx in (-2.6, 2.6):
        lines.append(A.plane(f'Bay side {dx}', (0.12, 4.2), (bx + dx, by, 0.004), m['paint_yellow']))
    lines.append(A.plane('Bay front', (5.32, 0.12), (bx, by - 2.1, 0.004), m['paint_yellow']))
    for k in range(6):
        stripe = A.plane(f'Hatch {k}', (0.12, 1.5), (bx - 2.0 + k * 0.8, by - 1.15, 0.004), m['paint_yellow'])
        stripe.rotation_euler = (0, 0, math.radians(45))
        lines.append(stripe)
    puddle = A.mesh_object('Puddle', lambda bm: _blob(bm, 1.2, 0.8), m['puddle'], (DOOR_X + 1.1, BACK - 1.3, 0.006))
    outside = A.plane('Yard', (60, 60), (0, 0, -0.02), m['ground'])
    return f, lines + [puddle, outside]


def _blob(bm, rx, ry, points=24):
    verts = []
    for k in range(points):
        a = 2 * math.pi * k / points
        r = 1 + 0.18 * math.sin(3 * a) + 0.1 * math.sin(5 * a + 1)
        verts.append(bm.verts.new((math.cos(a) * rx * r, math.sin(a) * ry * r, 0)))
    bm.faces.new(verts)


def crate(name, size, location, m, rotation=0.0):
    """A wooden crate: planked faces with battens round the edges."""
    sx, sy, sz = size
    x, y, z = location
    parts = [A.box(f'{name} body', size, (x, y, z + sz / 2), m['planks'], bevel=0.01)]
    t = 0.05
    for dx in (-1, 1):
        for dy in (-1, 1):
            parts.append(A.box(f'{name} post', (t, t, sz + 0.01), (x + dx * (sx / 2 - t / 2 + 0.005), y + dy * (sy / 2 - t / 2 + 0.005), z + sz / 2), m['planks']))
    for dz in (0.02, sz - 0.02):
        for dy in (-1, 1):
            parts.append(A.box(f'{name} batten', (sx + 0.02, t, t), (x, y + dy * (sy / 2 + 0.005), z + dz), m['planks']))
    obj = A.join(parts, name)
    obj.rotation_euler = (0, 0, rotation)
    return obj


def pallet(name, location, m, rotation=0.0, load=None):
    """A wooden pallet (deck boards on three runners), optionally loaded with shrink-wrapped boxes."""
    x, y, z = location
    parts = []
    for k in range(7):
        parts.append(A.box(f'{name} board', (1.2, 0.1, 0.022), (x, y - 0.5 + k * 0.1667, z + 0.133), m['pallet']))
    for dx in (-0.55, 0, 0.55):
        parts.append(A.box(f'{name} runner', (0.1, 1.0, 0.1), (x + dx, y, z + 0.072), m['pallet']))
    for k in range(3):
        parts.append(A.box(f'{name} base', (1.2, 0.1, 0.022), (x, y - 0.45 + k * 0.45, z + 0.011), m['pallet']))
    if load:
        rows, height = load
        for i in range(rows):
            for j in range(2):
                for level in range(height):
                    parts.append(A.box(f'{name} carton', (0.58, 0.48, 0.4), (x - 0.3 + i * 0.6, y - 0.25 + j * 0.5, z + 0.144 + 0.2 + level * 0.41), m['cardboard'], bevel=0.006))
        parts.append(A.box(f'{name} wrap', (1.22, 1.02, height * 0.41 + 0.05), (x, y, z + 0.144 + (height * 0.41) / 2), m['wrap']))
    obj = A.join(parts, name)
    obj.rotation_euler = (0, 0, rotation)
    return obj


def props(m):
    parts = []
    # Pallet racks along the right wall: blue uprights, orange beams, three levels of boxes.
    for i, y in enumerate([-7.2, -4.4, -1.6, 1.2]):
        for dy in (-1.35, 1.35):
            for dx in (-0.5, 0.5):
                parts.append(A.box(f'Upright {i} {dy} {dx}', (0.09, 0.09, 5.0), (8.8 + dx, y + dy, 2.5), m['rack_blue']))
        for level in (0.15, 1.8, 3.45):
            for dx in (-0.5, 0.5):
                parts.append(A.box(f'Beam {i} {level} {dx}', (0.07, 2.7, 0.14), (8.8 + dx, y, level + 0.07), m['rack']))
            parts.append(A.box(f'Rack pallet {i} {level}', (1.05, 2.5, 0.12), (8.8, y, level + 0.2), m['pallet']))
            for b in range(random.randint(2, 4)):
                w, h = random.uniform(0.6, 0.95), random.uniform(0.5, 1.1)
                by = y - 0.95 + b * 0.65 + random.uniform(-0.05, 0.05)
                box = A.box(f'Box {i} {level} {b}', (w, 0.58, h), (8.75 + random.uniform(-0.1, 0.1), by, level + 0.26 + h / 2), m['cardboard'], bevel=0.008)
                box.rotation_euler = (0, 0, random.uniform(-0.06, 0.06))
                parts.append(box)
                parts.append(A.box(f'Tape {i} {level} {b}', (w + 0.004, 0.07, 0.004), (box.location.x, by, level + 0.26 + h + 0.002), m['tape']))
    # Crate stacks at the back left, and pallets: some loaded and wrapped, some stacked empty.
    stacks = [((-8.4, 5.4), 3), ((-7.0, 5.7), 2), ((-8.6, 3.6), 2), ((-5.9, 6.1), 1)]
    for k, ((x, y), height) in enumerate(stacks):
        z = 0.0
        for level in range(height):
            s = random.uniform(1.0, 1.2)
            parts.append(crate(f'Crate {k} {level}', (s, s * random.uniform(0.85, 1.0), s * 0.86), (x + random.uniform(-0.06, 0.06), y, z), m, random.uniform(-0.12, 0.12)))
            z += s * 0.86
    parts.append(pallet('Pallet load 1', (6.2, -5.2, 0), m, math.radians(8), load=(2, 3)))
    parts.append(pallet('Pallet load 2', (6.4, -3.6, 0), m, math.radians(-4), load=(2, 2)))
    for k in range(5):
        parts.append(pallet(f'Pallet stack {k}', (-8.6, -1.2, k * 0.145), m, math.radians(random.uniform(-4, 4))))
    for k in range(3):
        parts.append(pallet(f'Pallet stack b {k}', (2.0, 5.6, k * 0.145), m, math.radians(90 + random.uniform(-5, 5))))
    # A workbench under the left windows.
    bench = [A.box('Bench top', (0.8, 2.4, 0.06), (-9.3, -5.0, 0.92), m['planks'])]
    for dy in (-1.1, 1.1):
        for dx in (-0.32, 0.32):
            bench.append(A.box('Bench leg', (0.06, 0.06, 0.9), (-9.3 + dx, -5.0 + dy, 0.45), m['steel']))
    bench.append(A.box('Bench shelf', (0.7, 2.3, 0.03), (-9.3, -5.0, 0.25), m['steel']))
    bench.append(A.box('Vice', (0.2, 0.3, 0.16), (-9.0, -5.8, 1.03), m['dark_steel']))
    parts.append(A.join(bench, 'Workbench'))
    return parts


def dressing():
    """CC0 models from Poly Haven: the detailed things the camera comes close to."""
    P = []

    def put(asset, at, turn=0.0, scale=1.0):
        P.extend(A.model(asset, at, math.radians(turn), scale))

    put('covered_car', (-5.6, 1.6, 0), 108)
    for asset, at, turn in [('Barrel_01', (4.3, 6.3, 0), 20), ('Barrel_02', (5.0, 6.55, 0), 75), ('barrel_03', (4.65, 5.6, 0), 140), ('Barrel_01', (3.6, 6.55, 0), 210)]:
        put(asset, at, turn)
    put('old_tyre', (5.4, 5.4, 0.3), 30)
    put('metal_tool_chest', (-9.35, -2.9, 0), 90)
    put('Drill_01', (-9.25, -4.6, 0.95), 60)
    put('boombox', (-9.4, -5.5, 0.95), 95)
    put('power_box_01', (-9.62, -0.4, 1.7), 90)
    put('plastic_monobloc_chair_01', (-7.4, -7.3, 0), 40)
    put('plastic_monobloc_chair_01', (-6.0, -6.4, 0), 215)
    put('wooden_crate_01', (-6.7, -6.9, 0), 15)
    put('steel_frame_shelves_01', (1.6, BACK - 0.55, 0), 0, 0.1)
    put('security_camera_01', (-0.1, BACK - 0.3, 5.2), 200)
    put('WetFloorSign_01', (DOOR_X + 2.4, BACK - 1.9, 0), 200)
    put('concrete_road_barrier', (DOOR_X - 4.0, BACK - 1.5, 0), 8)
    put('metal_trash_can', (8.0, BACK - 0.6, 0), 180)
    for x, y, turn in [(-4.4, 5.9, 10), (-3.95, 5.6, 40), (-4.2, 6.3, -25)]:
        put('cardboard_box_01', (x, y, 0), turn)
    put('cardboard_box_01', (-4.25, 5.95, 0.33), 70)
    return P


def lamps(m):
    parts, lights = [], []
    for x in (-5.0, 0.0, 5.0):
        for y in (-5.4, 1.8):
            z = 5.3
            parts.append(A.cylinder(f'Shade top {x} {y}', 0.14, 0.12, (x, y, z + 0.4), m['lamp_shade'], segments=24))
            parts.append(A.mesh_object(f'Shade {x} {y}', _cone, m['lamp_shade'], (x, y, z + 0.16)))
            parts.append(A.cylinder(f'Cable {x} {y}', 0.012, EAVE - z - 0.45, (x, y, (EAVE + z + 0.45) / 2), m['rubber'], segments=8))
            parts.append(A.cylinder(f'Bulb {x} {y}', 0.08, 0.16, (x, y, z + 0.04), m['bulb'], segments=16))
            lights.append(A.point(f'Lamp {x} {y}', (x, y, z - 0.1), 450, colour=(1.0, 0.7, 0.42), radius=0.1))
    for k, (x, y, length) in enumerate([(-2.2, -1.8, 3.0), (3.0, 5.4, 2.4)]):
        links = []
        for i in range(int(length / 0.085)):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.045, minor_radius=0.011, major_segments=12, minor_segments=6,
                                             location=(x, y, EAVE - 0.1 - i * 0.085), rotation=(math.pi / 2, 0, (i % 2) * math.pi / 2))
            link = bpy.context.active_object
            link.data.materials.append(m['dark_steel'])
            links.append(link)
        links.append(A.box(f'Hook {k}', (0.05, 0.16, 0.2), (x, y, EAVE - 0.2 - length), m['dark_steel']))
        parts.append(A.join(links, f'Chain {k}'))
    return parts, lights


def _cone(bm):
    import bmesh
    bmesh.ops.create_cone(bm, cap_ends=False, cap_tris=False, segments=32, radius1=0.4, radius2=0.14, depth=0.36)


def build():
    A.reset()
    m = materials()
    A.sky(sun_elevation=24, sun_rotation=-80, strength=0.38)
    A.sun('Sun', elevation=24, rotation=-82, strength=9.5, colour=(1.0, 0.8, 0.58), angle=0.5)
    structure = walls(m) + roof(m) + props(m)
    lamp_parts, _ = lamps(m)
    structure += lamp_parts
    f, decals = floor(m)
    panes = glazing(m)
    for obj in structure + decals + [f] + panes:
        A.box_uv(obj)
    models = dressing()
    return {'structure': structure, 'floor': f, 'decals': decals, 'panes': panes, 'models': models}


def group_key(o):
    """Which piece an object belongs to, so pieces join into one mesh each (see A.group)."""
    n = o.name
    side = 'left' if ' -1' in n else 'right' if ' 1' in n else ''
    # Pieces that reach into the room stay apart from the walls: staging measures each piece by its bounding box.
    if n.startswith('Column'):
        return f'column {" ".join(n.split()[2:4])}'
    if n.startswith('Pane'):
        return f'{side} glass'
    if n.startswith('Skylight'):
        return 'skylights'
    for prefix, piece in [(('Wall low', 'Plinth', 'Wall top', 'Pier', 'Mullion', 'Transom', 'Sill'), f'{side} wall'),
                          (('Door',), 'roller door'), (('Side door',), 'side door'), (('Back',), 'back wall'), (('Front',), 'front wall'),
                          (('Roof', 'Chord', 'Rafter', 'Post', 'Brace', 'Purlin'), 'roof'), (('Shade', 'Cable', 'Bulb', 'Chain'), 'lamps')]:
        if n.startswith(prefix):
            return piece
    for prefix in ('Upright', 'Beam', 'Rack pallet', 'Box', 'Tape'):
        if n.startswith(prefix):
            return f'rack {n.split()[1] if prefix != "Rack pallet" else n.split()[2]}'
    if n.startswith('Crate'):
        return f'crates {n.split()[1]}'
    if n.startswith('Pallet stack b'):
        return 'pallets back'
    if n.startswith('Pallet stack'):
        return 'pallets left'
    return n


def bake(out):
    """Sets the factory up for the Export for Ara Studio add-on, as a creator would in its panel, then exports it with
    the add-on: the set file out/old-factory.glb (see README.md)."""
    import ara_set_export
    from ara_set_export import pipeline
    parts = build()
    scene = bpy.context.scene
    if not hasattr(bpy.types.Scene, 'ara_set'):
        ara_set_export.register()
    structure = A.group(parts['structure'], group_key)
    lines, (puddle, yard) = parts['decals'][:-2], parts['decals'][-2:]
    floor = [parts['floor']] + A.group(lines, lambda o: 'floor paint') + [puddle]
    glass = A.group(parts['panes'], group_key)
    groups = {'floor': (floor, 4096), 'structure': (structure, 4096), 'props': (parts['models'], 2048), 'yard': ([yard], 512)}
    for name, (objects, size) in groups.items():
        for o in objects:
            o.ara_set.lightmap, o.ara_set.lightmap_size = name, str(size)
    for o in glass:
        o.ara_set.glass = True
    # The floor's wear is procedural: its colour is baked too.
    for m in parts['floor'].data.materials:
        m.ara_set.bake_colour = True
    kept = {o.name for objects, _ in groups.values() for o in objects} | {o.name for o in glass}
    for o in scene.objects:
        if o.type == 'MESH' and o.name not in kept:
            o.ara_set.skip = True
    s = scene.ara_set
    s.set_id, s.name, s.author, s.license, s.release = 'ara/old-factory', 'Old factory', 'Ara', 'All rights reserved', '1.0'
    s.category, s.family, s.mood = 'City', 'warehouse', 'day'
    s.subtitle, s.staging = 'Brick, steel trusses and afternoon sun through factory windows.', STAGING
    # The light on the cast, matched to the bake.
    s.sun = bpy.data.objects['Sun']
    s.sun_colour, s.sun_intensity = (1.0, 0xd6 / 255, 0xa0 / 255), 2.6
    s.fill_colour, s.fill_intensity = (0x9f / 255, 0xb4 / 255, 0xc8 / 255), 0.55
    s.exposure, s.background = 1.0, (0xcf / 255, 0xdb / 255, 0xe4 / 255)
    s.room_min, s.room_max = (-W, FRONT), (W, BACK)
    # Seats on the two plastic chairs: x, seat height, Studio's z (Blender's -y), and the way each faces.
    for x, height, z, yaw in ((-7.4, 0.44, 7.3, 40), (-6.0, 0.44, 6.4, 215)):
        seat = bpy.data.objects.new('Seat', None)
        seat.location, seat.rotation_euler = (x, -z, height), (0, 0, math.radians(yaw))
        seat.ara_set.seat = True
        scene.collection.objects.link(seat)
    # The preview, from the medium shot.
    location, target, lens = SHOTS['medium']
    data = bpy.data.cameras.new('Preview')
    data.lens = lens
    camera = bpy.data.objects.new('Preview', data)
    camera.location = location
    camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    s.samples = int(os.environ.get('SAMPLES', 192))
    result = pipeline.check(scene)
    print('Check:', result['cost'], result['lightmaps'], result['warnings'])
    pipeline.export_set(scene, os.path.join(os.path.dirname(out), 'old-factory.glb'), log=lambda m: print('ARA:', m, flush=True))


# Where things are, for Studio's Assist and anyone staging a scene here.
STAGING = ('A brick factory hall x=-10..10,z=-7..9. The open floor x=-5..5,z=-3..7 is clear for the cast. Back wall at '
           'z=-7 with a half-open roller door at x=-2.6 and a side door at x=6.2. A car under a dust cover at x=-5.6,z=-1.6; '
           'a workbench along the left wall at x=-9.3,z=5; two plastic chairs (registered seats) at x=-7.4,z=7.3 and '
           'x=-6,z=6.4. Pallet racks along the right wall x=8.3..9.3,z=-2.6..8.6; wrapped pallets at x=6.3,z=3.6..5.2; '
           'barrels at x=3.6..5,z=-6.6..-5.6; crate stacks at x=-8.6..-5.9,z=-6.1..-3.6. Afternoon sun falls through the '
           'left windows across the floor.')

SHOTS = {
    # Studio's usual framing: a character at the middle, the camera a few metres back at eye height.
    'wide': ((2.2, -8.6, 1.9), (0, 0, 1.3), 28),
    'medium': ((1.2, -4.4, 1.6), (0, 0, 1.25), 35),
    'reverse': ((-2.5, 4.2, 1.7), (0, -2, 1.3), 30),
    'establishing': ((6.0, -14.0, 3.0), (-1.0, 0, 2.0), 24),
}

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = os.path.join(A.HERE, 'out', 'warehouse')
    os.makedirs(out, exist_ok=True)
    if 'bake' in args:
        bake(out)
        sys.exit(0)
    build()
    if 'preview' in args:
        scene = bpy.context.scene
        scene.view_settings.exposure = float(os.environ.get('EXPOSURE', -0.3))
        try:
            scene.view_settings.look = 'AgX - Medium High Contrast'
        except TypeError:
            pass
        A.haze(((-W + 0.1, FRONT + 0.1, 0.05), (W - 0.1, BACK - 0.1, EAVE - 0.1)), density=float(os.environ.get('HAZE', 0.006)))
        hero = os.path.join(A.HERE, '.cache', 'hero.glb')
        if os.path.exists(hero):
            A.stand_in(hero, (0.3, 0, 0), math.radians(-15))
        for name in (os.environ.get('SHOTS') or 'wide,medium').split(','):
            cam, target, lens = SHOTS[name]
            A.preview(os.path.join(out, f'preview-{name}.png'), cam, target, lens=lens, samples=int(os.environ.get('SAMPLES', 64)), resolution=(1280, 720))
