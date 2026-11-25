"""
An original mid-engined supercar for Ara, modelled by script in Blender: a wedge body lofted through cross-sections
(nose low, one line rising to the roof and falling to the tail, wide rear haunches), smoothed, with its wheel arches
cut; tinted glass; five-spoke wheels with brake discs and calipers; light strips, intakes, a splitter and diffuser;
and a simple interior seen through the glass. Materials are glTF's own (clear-coated paint, glass, rubber, metal),
so it looks the same in Ara as in Blender.

    blender -b --python studio-props/supercar.py -- preview   # Cycles stills, studio-props/out/supercar-*.png
    blender -b --python studio-props/supercar.py -- export    # studio-props/out/supercar.glb

Front toward +X while it's built; the export turns it to face -Y (glTF's +Z, Ara's front).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'studio-sets'))
sys.path.insert(0, HERE)
import ara_set as A  # noqa: E402

OUT = os.path.join(HERE, 'out')
L = 4.62                       # length
FRONT_AXLE, REAR_AXLE = 1.36, -1.34
TRACK_F, TRACK_R = 0.845, 0.875  # wheel centres from the middle
R_F, R_R = 0.345, 0.36          # wheel radii
W_F, W_R = 0.255, 0.33          # tyre widths
PAINT = (0.86, 0.36, 0.05)      # a deep orange
SEAT_HIP = 0.32                 # the seated driver's hips above the ground, low as in a real supercar
SMOOTHING = int(os.environ.get('SMOOTHING', 1))  # subdivision levels on the body: 1 is ~45k triangles, 2 ~150k


# --- Shape ---------------------------------------------------------------------------------------------------------

def curve(points):
    """A smooth function through (x, value) points (Catmull-Rom), flat beyond the ends."""
    xs = [p[0] for p in points]

    def f(x):
        if x <= xs[0]:
            return points[0][1]
        if x >= xs[-1]:
            return points[-1][1]
        i = max(k for k in range(len(xs) - 1) if xs[k] <= x)
        p0 = points[max(i - 1, 0)][1]
        p1, p2 = points[i][1], points[i + 1][1]
        p3 = points[min(i + 2, len(points) - 1)][1]
        t = (x - xs[i]) / (xs[i + 1] - xs[i])
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    return f


# Profiles along the car (x from the tail at -L/2 to the nose at +L/2).
BOTTOM = curve([(-2.31, 0.30), (-2.1, 0.2), (-1.7, 0.13), (1.8, 0.13), (2.15, 0.15), (2.31, 0.2)])
SHOULDER = curve([(-2.31, 0.82), (-2.15, 0.93), (-1.75, 0.96), (-1.3, 0.95), (-0.85, 0.9), (-0.3, 0.82), (0.4, 0.78),
                  (0.9, 0.76), (1.36, 0.8), (1.8, 0.68), (2.15, 0.5), (2.31, 0.38)])
CENTRE = curve([(-2.31, 0.84), (-2.15, 0.93), (-1.8, 0.95), (-1.35, 0.97), (-0.9, 1.02), (-0.45, 1.1), (-0.1, 1.135),
                (0.2, 1.11), (0.5, 0.98), (0.78, 0.8), (1.1, 0.71), (1.6, 0.64), (2.0, 0.55), (2.2, 0.46), (2.31, 0.39)])
WIDTH = curve([(-2.31, 0.86), (-2.2, 0.96), (-1.9, 1.02), (-1.35, 1.045), (-0.85, 0.99), (-0.35, 0.9), (0.25, 0.89),
               (0.85, 0.95), (1.36, 0.99), (1.8, 0.95), (2.12, 0.86), (2.31, 0.7)])
# How much of a section is cabin (glasshouse): 0 at the nose and tail, 1 under the roof.
CABIN = curve([(-2.31, 0), (-1.5, 0), (-1.0, 0.85), (-0.5, 1), (0.25, 1), (0.8, 0.15), (1.0, 0), (2.31, 0)])
ROOF_W = 0.6


def section(x, n=28):
    """One cross-section (right half, from the bottom centre round to the top centre) as (y, z) points."""
    zb, zs, zt, ws, c = BOTTOM(x), SHOULDER(x), CENTRE(x), WIDTH(x), CABIN(x)
    top_w = ws * 0.78 * (1 - c) + ROOF_W * c
    side_top = zs + (zt - zs) * (0.55 + 0.25 * c)
    guide = [(0.0, zb), (ws * 0.8, zb), (ws * 0.985, zb + 0.12), (ws, zb + 0.42 * (zs - zb)), (ws * 0.975, zs),
             (top_w + (ws * 0.975 - top_w) * 0.45, zs + (side_top - zs) * 0.55), (top_w, side_top), (top_w * 0.5, zt - 0.006), (0.0, zt)]
    out = []
    for i in range(n + 1):
        t = i / n * (len(guide) - 1)
        k = min(int(t), len(guide) - 2)
        u = t - k
        p0, p1, p2 = guide[max(k - 1, 0)], guide[k], guide[k + 1]
        p3 = guide[min(k + 2, len(guide) - 1)]
        out.append(tuple(0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * u + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * u * u
                                + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * u ** 3) for d in range(2)))
    return out


def body_mesh(sections=90):
    """The body: sections lofted from tail to nose, mirrored, with rounded ends."""
    bm = bmesh.new()
    xs = [-L / 2 + L * i / (sections - 1) for i in range(sections)]
    rings = []
    for x in xs:
        half = [(y - scallop(x, y, z), z) for y, z in section(x)]
        ring = [(x, y, z) for y, z in half] + [(x, -y, z) for y, z in reversed(half[1:-1])]
        rings.append(ring)

    def shrink(ring, x, s):
        cy = 0.0
        cz = sum(p[2] for p in ring) / len(ring)
        return [(x, cy + (p[1] - cy) * s, cz + (p[2] - cz) * s) for p in ring]
    # Rounded nose and tail: a few sections stepping in.
    tail = [shrink(rings[0], -L / 2 - d, s) for d, s in ((0.025, 0.93), (0.045, 0.75), (0.055, 0.4))][::-1]
    nose = [shrink(rings[-1], L / 2 + d, s) for d, s in ((0.03, 0.9), (0.05, 0.68), (0.06, 0.3))]
    rings = tail + rings + nose
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(verts[0])
    for a, b in zip(verts, verts[1:]):
        x = (a[0].co.x + b[0].co.x) / 2
        for i in range(n):
            f = bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            j = i if i < n // 2 else n - 1 - i   # the same band on both sides
            f.material_index = region(x, j)
    for ring, flip in ((verts[0], True), (verts[-1], False)):
        centre = bm.verts.new(tuple(sum(v.co[d] for v in ring) / n for d in range(3)))
        for i in range(n):
            f = (ring[i], ring[(i + 1) % n], centre)
            face = bm.faces.new(f[::-1] if flip else f)
            face.material_index = BLACK_I if flip else PAINT_I
    # The shoulder's character line, kept crisp through the smoothing.
    crease = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for a, b in zip(verts[3:-4], verts[4:-3]):
        for i in (SHOULDER_INDEX, n - SHOULDER_INDEX):
            e = bm.edges.get((a[i], b[i]))
            if e:
                e[crease] = 0.75
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


PAINT_I, GLASS_I, BLACK_I, LENS_I, TAIL_I = range(5)


def region(x, j):
    """What a face of the loft is, from its place along the car (x) and up its side (j: 0 at the bottom centre, the
    shoulder at SHOULDER_INDEX, 27 at the top centre). Boundaries follow the loft's lines, so they stay smooth."""
    s = SHOULDER_INDEX
    if j <= 2 and -1.95 < x < 1.95:
        return BLACK_I                                    # sills
    if x > 2.02 and 2 <= j <= 9:
        return BLACK_I                                    # the nose's intakes
    if 1.86 < x < 2.27 and s - 4 <= j <= s - 1:
        return LENS_I                                     # headlights
    if x < -2.12:
        if j <= s - 3:
            return BLACK_I                                # rear grille
        if j <= s - 1:
            return TAIL_I                                 # tail light band
    if -1.12 < x < -0.64 and 6 <= j <= s - 3:
        return BLACK_I                                    # side intake
    if j > s and CABIN(x) > 0.4:
        if 0.1 < x < 0.7:
            return GLASS_I if j >= s + 7 else (BLACK_I if j >= s + 5 else GLASS_I)   # windscreen, A-pillar, side glass
        if -0.6 < x <= 0.1:
            return BLACK_I if j >= s + 7 else GLASS_I    # black roof, side glass
        if -0.98 < x <= -0.6:
            return BLACK_I                                # B-pillar and rear quarter
    return PAINT_I


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def scallop(x, y, z):
    """How far the door's side is pressed in: a channel running back along the door into the side intake."""
    if y < 0.55 * WIDTH(x):
        return 0.0
    along = smoothstep(-1.2, -0.85, x) * (1 - smoothstep(0.25, 0.8, x))
    height = math.exp(-((z - 0.5) / 0.11) ** 2)
    return 0.085 * along * height


# The section point at the shoulder (section()'s fifth guide point of nine, at n=28).
SHOULDER_INDEX = 14


# --- Materials -----------------------------------------------------------------------------------------------------

def material(name, colour, roughness=0.5, metallic=0.0, coat=0.0, alpha=1.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*colour, 1)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Metallic'].default_value = metallic
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.03
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


ROLES = {'Headlight': 'headlight', 'Tail light': 'brake_light', 'Indicator': 'indicator', 'Paint': 'paint'}  # tagged on export


def materials():
    return {
        'paint': material('Paint', PAINT, roughness=0.32, metallic=0.35, coat=1.0),
        'glass': material('Glass', (0.02, 0.025, 0.03), roughness=0.04, alpha=0.45),
        'black': material('Black trim', (0.012, 0.012, 0.013), roughness=0.35),
        'carbon': material('Carbon', (0.02, 0.021, 0.024), roughness=0.22, coat=0.6),
        'tyre': material('Tyre', (0.018, 0.018, 0.018), roughness=0.86),
        'rim': material('Rim', (0.55, 0.56, 0.58), roughness=0.3, metallic=1.0),
        'rim_lip': material('Rim lip', (0.85, 0.85, 0.87), roughness=0.08, metallic=1.0),
        'disc': material('Brake disc', (0.32, 0.32, 0.33), roughness=0.38, metallic=1.0),
        'caliper': material('Caliper', (0.9, 0.72, 0.05), roughness=0.3, coat=0.5),
        'head': material('Headlight', (0.9, 0.95, 1.0), roughness=0.1, emission=(0.85, 0.92, 1.0), strength=6.0),
        'indicator': material('Indicator', (0.6, 0.3, 0.02), roughness=0.15, emission=(1.0, 0.45, 0.02), strength=0.0),
        'tail': material('Tail light', (0.35, 0.01, 0.01), roughness=0.12, emission=(1.0, 0.04, 0.02), strength=1.0),
        'lens': material('Lens', (0.03, 0.03, 0.035), roughness=0.05, metallic=0.2),
        'interior': material('Interior', (0.03, 0.028, 0.027), roughness=0.7),
        'stitch': material('Alcantara', (0.55, 0.22, 0.04), roughness=0.8),
        'exhaust': material('Exhaust', (0.55, 0.53, 0.5), roughness=0.25, metallic=1.0),
        'gap': material('Panel gap', (0.004, 0.004, 0.004), roughness=0.9),
    }


# --- Parts ---------------------------------------------------------------------------------------------------------

def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def obj_from(bm, name, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return link(bpy.data.objects.new(name, me))


def modifier_apply(obj, kind, **settings):
    mod = obj.modifiers.new(kind.lower(), kind)
    for k, v in settings.items():
        setattr(mod, k, v)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def cylinder_y(name, radius, depth, location, material, segments=48, caps=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=segments, radius1=radius, radius2=radius, depth=depth)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    o = obj_from(bm, name, [material])
    o.location = location
    return o


def body(m):
    o = obj_from(body_mesh(), 'Body', [m['paint'], m['glass'], m['black'], m['lens'], m['tail']])
    for p in o.data.polygons:
        p.use_smooth = True
    modifier_apply(o, 'SUBSURF', levels=SMOOTHING, render_levels=SMOOTHING)
    # Wheel arches: the body cut round each wheel, a little larger than the tyre. The body is solid, so the cut
    # leaves a closed wheel well, lined in the cutter's black.
    for x, track, r, w in ((FRONT_AXLE, TRACK_F, R_F, W_F), (REAR_AXLE, TRACK_R, R_R, W_R)):
        for side in (1, -1):
            cutter = cylinder_y('arch', r + 0.055, 0.9, (x, side * (track + 0.25), r), m['black'])
            mod = o.modifiers.new('arch', 'BOOLEAN')
            mod.operation, mod.object, mod.solver, mod.material_mode = 'DIFFERENCE', cutter, 'MANIFOLD', 'TRANSFER'
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter)
    smooth_by_angle(o, 50)
    return o


def wheel(m, x, y, r, width, front):
    """A wheel at (x, y): tyre, five twin-spoke rim, disc and caliper. Built round the +Y axis, turned for the left side."""
    parts = []
    # Tyre: a rounded profile spun round the axle.
    bm = bmesh.new()
    rim_r = r * 0.68
    hw = width / 2
    side = [(rim_r + (r - 0.03 - rim_r) * t, hw * (0.9 + 0.1 * math.sin(math.pi * t) + 0.02 * t)) for t in (0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    shoulder = [(r - 0.03 + 0.03 * math.sin(a), hw - 0.03 + 0.03 * math.cos(a)) for a in (math.pi * k / 8 for k in range(1, 5))]
    tread = []
    for g in (0.55, 0.18, -0.18, -0.55):     # three grooves between four ribs
        gy = hw * g
        tread += [(r, gy + 0.012), (r - 0.009, gy + 0.006), (r - 0.009, gy - 0.006), (r, gy - 0.012)]
    tread = tread[2:-2]
    flip = lambda pts: [(a, -b) for a, b in reversed(pts)]
    prof = side + shoulder + [(r, hw - 0.03)] + tread + [(r, -(hw - 0.03))] + flip(shoulder) + flip(side)
    seg = 64
    rings = []
    for k in range(seg):
        t = 2 * math.pi * k / seg
        rings.append([bm.verts.new((rr * math.cos(t), yy, rr * math.sin(t))) for rr, yy in prof])
    for k in range(seg):
        a, b = rings[k], rings[(k + 1) % seg]
        for i in range(len(prof) - 1):
            bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tyre = obj_from(bm, 'Tyre', [m['tyre']])
    parts.append(tyre)
    # Rim barrel and lip.
    barrel = cylinder_y('Barrel', rim_r, width * 0.86, (0, 0, 0), m['black'], 64, caps=False)
    lip = cylinder_y('Lip', rim_r + 0.008, 0.03, (0, width * 0.445, 0), m['rim_lip'], 64, caps=False)
    parts += [barrel, lip]
    # Face: five twin spokes from a hub, slightly dished.
    hub = cylinder_y('Hub', 0.07, 0.05, (0, width * 0.35, 0), m['rim'], 32)
    cap = cylinder_y('Cap', 0.032, 0.015, (0, width * 0.39, 0), m['black'], 32)
    parts += [hub, cap]
    for k in range(5):
        for off in (-0.12, 0.12):
            t = 2 * math.pi * k / 5 + off
            bm = bmesh.new()
            # From the hub (narrow, set back) to the rim (wider, flush with the lip): a tapered, dished spoke.
            r0, r1 = 0.065, rim_r - 0.004
            y0, y1 = width * 0.35, width * 0.44
            corners = []
            for rr, half, yy in ((r0, 0.014, y0), (r1, 0.026, y1)):
                for zz in (-half, half):
                    for dy in (0.0, -0.035):
                        corners.append(bm.verts.new((rr, yy + dy, zz)))
            hub_end, rim_end = corners[:4], corners[4:]
            quads = [(0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6), (0, 1, 3, 2), (4, 6, 7, 5)]
            for q in quads:
                bm.faces.new([corners[i] for i in q])
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.004, segments=2, affect='EDGES')
            spoke = obj_from(bm, 'Spoke', [m['rim']])
            spoke.rotation_euler = (0, -t, 0)
            parts.append(spoke)
    # Brake disc and caliper, inside the spokes.
    parts.append(cylinder_y('Disc', rim_r - 0.05, 0.03, (0, width * 0.12, 0), m['disc'], 64))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.09
        v.co.y *= 0.06
        v.co.z *= 0.17
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.012, segments=3, affect='EDGES')
    caliper = obj_from(bm, 'Caliper', [m['caliper']])
    caliper.location = (-(rim_r - 0.1) * (1 if front else -1) * 0.0 - 0.0, width * 0.16, 0)
    caliper.location = ((rim_r - 0.11) * (-1 if front else 1) * 0.6, width * 0.16, (rim_r - 0.11) * 0.75)
    parts.append(caliper)
    # One object per wheel, placed and turned to its side.
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.objects.active = tyre
    bpy.ops.object.join()
    tyre.name = f'Wheel {"F" if front else "R"}{"L" if y > 0 else "R"}'
    if y < 0:
        tyre.scale.y = -1
        bpy.ops.object.transform_apply(scale=True)
        for p in tyre.data.polygons:
            p.flip()
    tyre.location = (x, y, r)
    smooth_by_angle(tyre)
    tyre['ara_role'], tyre['ara_axle'], tyre['ara_side'] = 'wheel', 'front' if front else 'rear', 'left' if y > 0 else 'right'
    return tyre


def smooth_by_angle(obj, degrees=35):
    """Smooth across gentle angles, sharp across creases: what a real part looks like."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def box(name, size, location, material, bevel=0.01, rotation=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=3, affect='EDGES')
    o = obj_from(bm, name, [material])
    o.location, o.rotation_euler = location, rotation
    smooth_by_angle(o)
    return o


def surface_point(x, side, height_frac):
    """A point on the body's side at x: height as a fraction from bottom to shoulder."""
    zb, zs = BOTTOM(x), SHOULDER(x)
    z = zb + (zs - zb) * height_frac
    pts = section(x, 80)
    y = max((p[0] for p in pts if abs(p[1] - z) < 0.03), default=WIDTH(x))
    return Vector((x, side * y, z))


def details(m):
    out = []
    # Headlights: a thin light strip along the top edge of each lens, following the body.
    for side in (1, -1):
        bm = bmesh.new()
        pts = []
        for k in range(14):
            x = 1.9 + 0.33 * k / 13
            half = section(x, 80)
            z = SHOULDER(x) - 0.012
            y = max((q[0] for q in half if abs(q[1] - z) < 0.02 and q[0] > 0.3), default=WIDTH(x))
            pts.append((x + 0.004, side * (y + 0.004), z))
        vs = [(bm.verts.new(p), bm.verts.new((p[0], p[1], p[2] - 0.018))) for p in pts]
        for (a, b), (c, d) in zip(vs, vs[1:]):
            bm.faces.new((a, c, d, b))
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
        out.append(obj_from(bm, 'Headlight', [m['head']]))
    # Tail light: one thin bar across the tail, and its housing.
    # Rear diffuser fins and the exhausts: a hexagonal pair in the middle.
    out.append(box('Diffuser', (0.5, 1.5, 0.05), (-2.12, 0, 0.17), m['carbon'], bevel=0.01, rotation=(0, math.radians(-14), 0)))
    for k in range(-3, 4):
        out.append(box('Fin', (0.42, 0.012, 0.11), (-2.12, k * 0.2, 0.2), m['carbon'], bevel=0.003, rotation=(0, math.radians(-14), 0)))
    out.append(box('Exhaust surround', (0.06, 0.42, 0.16), (-2.32, 0, 0.42), m['black'], bevel=0.03))
    for side in (1, -1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.058, radius2=0.058, depth=0.16)
        bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.05, radius2=0.05, depth=0.16)
        tip = obj_from(bm, 'Exhaust', [m['exhaust']])
        tip.rotation_euler = (0, math.radians(90), 0)
        tip.location = (-2.33, side * 0.1, 0.42)
        out.append(tip)
        out.append(cylinder_x('Exhaust inside', 0.05, 0.01, (-2.3, side * 0.1, 0.42), m['black']))
        # Where the exhaust's effects start, pointing out of the pipe.
        out.append(anchor('Exhaust ' + ('L' if side > 0 else 'R'), (-2.41, side * 0.1, 0.42), 'exhaust'))
    # Indicators: amber strips at the front corners and beside the tail light.
    for side in (1, -1):
        out.append(box('Indicator front', (0.06, 0.12, 0.018), (2.17, side * 0.74, SHOULDER(2.17) - 0.07), m['indicator'], bevel=0.006))
        out.append(box('Indicator rear', (0.02, 0.1, 0.03), (-2.335, side * 0.7, 0.77), m['indicator'], bevel=0.006))
    # Front splitter and side skirts in carbon.
    out.append(box('Splitter', (0.35, 1.7, 0.025), (2.1, 0, 0.14), m['carbon'], bevel=0.008))
    for side in (1, -1):
        out.append(box('Skirt', (2.1, 0.05, 0.035), (0.0, side * 0.995, 0.15), m['carbon'], bevel=0.01))
        # Mirrors on stalks.
        out.append(box('Mirror', (0.16, 0.1, 0.065), (0.42, side * 1.04, 0.86), m['paint'], bevel=0.03))
        out.append(box('Mirror glass', (0.005, 0.085, 0.05), (0.343, side * 1.04, 0.86), m['rim_lip'], bevel=0.004))
        out.append(box('Mirror stalk', (0.06, 0.16, 0.018), (0.45, side * 0.95, 0.82), m['black'], bevel=0.006))
    # A fixed rear wing on two struts.
    out.append(box('Wing', (0.26, 1.7, 0.03), (-2.05, 0, 1.12), m['carbon'], bevel=0.012, rotation=(0, math.radians(-6), 0)))
    for side in (1, -1):
        out.append(box('Wing strut', (0.12, 0.02, 0.18), (-2.0, side * 0.55, 1.03), m['carbon'], bevel=0.006))
    # Engine cover louvres behind the cabin.
    for k in range(6):
        x = -1.15 - k * 0.11
        out.append(box('Louvre', (0.05, 0.9, 0.012), (x, 0, CENTRE(x) + 0.01), m['black'], bevel=0.004, rotation=(0, math.radians(-8), 0)))
    # Interior: seats, dash, wheel, seen through the glass.
    for side in (1, -1):
        out.append(box('Seat base', (0.5, 0.42, 0.12), (-0.22, side * 0.36, SEAT_HIP - 0.12), m['interior'], bevel=0.04))
        out.append(box('Seat back', (0.12, 0.42, 0.55), (-0.5, side * 0.36, SEAT_HIP + 0.16), m['interior'], bevel=0.05, rotation=(0, math.radians(-18), 0)))
        out.append(box('Seat stripe', (0.13, 0.12, 0.5), (-0.49, side * 0.36, SEAT_HIP + 0.17), m['stitch'], bevel=0.02, rotation=(0, math.radians(-18), 0)))
    out.append(box('Dash', (0.35, 1.5, 0.18), (0.45, 0, 0.66), m['interior'], bevel=0.05))
    out.append(box('Rear bulkhead', (0.04, 1.7, 0.75), (-0.78, 0, 0.62), m['interior'], bevel=0.0))
    out.append(box('Front bulkhead', (0.04, 1.6, 0.5), (0.68, 0, 0.45), m['interior'], bevel=0.0))
    out.append(box('Floor', (1.5, 1.7, 0.03), (-0.05, 0, 0.15), m['interior'], bevel=0.0))
    out.append(box('Tunnel', (0.9, 0.22, 0.22), (0.05, 0, 0.27), m['interior'], bevel=0.05))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=32, radius=0.17)
    ring = obj_from(bm, 'Steering wheel', [m['interior']])
    ring.location, ring.rotation_euler = (0.3, 0.36, 0.72), (0, math.radians(70), 0)
    sk = ring.modifiers.new('skin', 'SKIN')
    ring.modifiers.new('sub', 'SUBSURF')
    for v in ring.data.skin_vertices[0].data:
        v.radius = (0.018, 0.018)
    ring['ara_role'] = 'steering'
    out.append(ring)
    # Where people sit (left-hand drive): the driver's and passenger's hips, facing forward.
    out.append(anchor('Seat driver', (-0.26, 0.36, SEAT_HIP), 'seat_driver'))
    out.append(anchor('Seat passenger', (-0.26, -0.36, SEAT_HIP), 'seat_passenger'))
    out += panel_lines(m)
    return out


def anchor(name, location, role):
    """An empty marking a point the car's life or fitting uses (in the GLB as a node with ara_role)."""
    e = link(bpy.data.objects.new(name, None))
    e.location, e.empty_display_size = location, 0.1
    e['ara_role'] = role
    return e


def cylinder_x(name, radius, depth, location, material, segments=32):
    o = cylinder_y(name, radius, depth, (0, 0, 0), material, segments)
    o.rotation_euler = (0, 0, math.radians(90))
    o.location = location
    return o


def on_body(x, j, out=0.0025):
    """A point on the body at x and section index j (fractional; mirrored for j < 0), pushed out a little."""
    side = -1 if j < 0 else 1
    pts = section(x)
    j = min(abs(j), len(pts) - 1)
    k = min(int(j), len(pts) - 2)
    t = j - k
    y = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t
    z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t
    y -= scallop(x, y, z)
    cz = (BOTTOM(x) + CENTRE(x)) / 2
    d = Vector((0, y, z - cz)).normalized()
    return Vector((x, side * y, z)) + d * out


def line(name, points, material, radius=0.0035):
    """A thin dark groove along points on the body: a panel gap."""
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions, curve.bevel_depth, curve.bevel_resolution = '3D', radius, 1
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for p, q in zip(spline.points, points):
        p.co = (q.x, q.y, q.z, 1)
    o = link(bpy.data.objects.new(name, curve))
    o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active


def panel_lines(m):
    """Shut lines: the doors, the front lid and the engine cover, as thin grooves following the body."""
    out, s, gap = [], SHOULDER_INDEX, m['gap']
    steps = lambda a, b, n: [a + (b - a) * i / n for i in range(n + 1)]
    for side in (1, -1):
        # Door: front and rear edges up the side, and along the bottom above the sill.
        for x in (0.64, -0.58):
            out.append(line('Door gap', [on_body(x, side * j) for j in steps(3.2, s - 0.3, 16)], gap))
        out.append(line('Door gap', [on_body(x, side * 3.2) for x in steps(-0.58, 0.64, 24)], gap))
    # Front lid: between the fenders, from the windscreen base to the nose.
    for side in (1, -1):
        out.append(line('Lid gap', [on_body(x, side * (s + 4.5)) for x in steps(1.0, 2.02, 24)], gap))
    across = lambda x, j0, name: line(name, [on_body(x, j) for j in steps(j0, 28, 12)] + [on_body(x, -j) for j in steps(28, j0, 12)[1:]], gap)
    out.append(across(1.0, s + 4.5, 'Lid gap'))
    # Engine cover, round the louvres.
    for side in (1, -1):
        out.append(line('Cover gap', [on_body(x, side * (s + 4)) for x in steps(-1.92, -1.02, 20)], gap))
    out += [across(-1.02, s + 4, 'Cover gap'), across(-1.92, s + 4, 'Cover gap')]
    return out


def build():
    A.reset()
    m = materials()
    parts = [body(m)]
    for x, track, r, w, front in ((FRONT_AXLE, TRACK_F, R_F, W_F, True), (REAR_AXLE, TRACK_R, R_R, W_R, False)):
        for side in (1, -1):
            parts.append(wheel(m, x, side * (track), r, w, front))
    parts += details(m)
    return parts


# --- Preview and export --------------------------------------------------------------------------------------------

def studio_world(strength=1.0):
    """A studio HDRI (CC0, Poly Haven) for judging paint and glass, as a photo studio would light a car."""
    import json
    import urllib.request
    path = os.path.join(A.HERE, '.cache', 'hdri', 'studio_small_09_2k.hdr')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/studio_small_09', headers=A.AGENT)) as r:
            url = json.load(r)['hdri']['2k']['hdr']['url']
        A._download(url, path)
    world = bpy.data.worlds.new('Studio')
    bpy.context.scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    env = nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(path)
    links.new(env.outputs['Color'], nodes['Background'].inputs['Color'])
    nodes['Background'].inputs['Strength'].default_value = strength


def preview(name, location, target, lens=50):
    scene = bpy.context.scene
    cam = bpy.data.objects.get('Camera') or link(bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera')))
    cam.data.lens = lens
    cam.location = location
    cam.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, f'supercar-{name}.png')
    bpy.ops.render.render(write_still=True)


# The prop's details: what Ara lists and how it fits the car in (see src/core/props/prop-models.ts).
DETAILS = {'kind': 'ara-prop', 'version': 1, 'id': 'ara/supercar', 'name': 'Supercar', 'author': 'Ara',
           'license': 'All rights reserved', 'release': '1.0', 'type': 'vehicle', 'base': 'sports_car'}


def export(path):
    """The car as a prop file (see ara_prop.py): a GLB turned to face glTF's +Z (Ara's front), its wheels separate
    pieces so they can turn, its parts and materials tagged (ara_role), its details and a preview picture inside."""
    import tempfile
    from ara_prop import pack
    scene = bpy.context.scene
    root = link(bpy.data.objects.new('Supercar', None))
    for mat in bpy.data.materials:
        if mat.name in ROLES:
            mat['ara_role'] = ROLES[mat.name]
    cars = [o for o in scene.objects if o.type in ('MESH', 'EMPTY') and o not in (root,) and o.name != 'Floor']
    for o in cars:
        o.parent = root
    root.rotation_euler = (0, 0, math.radians(-90))
    folder = tempfile.mkdtemp(prefix='ara-prop-')
    bpy.ops.object.select_all(action='DESELECT')
    for o in cars + [root]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(folder, 'model.glb'), export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT', export_extras=True, export_cameras=False, export_lights=False)
    # The preview: a three-quarter view in a photo studio.
    if not scene.world or scene.world.name != 'Studio':
        studio_world(1.0)
    if bpy.data.objects.get('Floor'):
        bpy.data.objects['Floor'].hide_render = True
    cam = link(bpy.data.objects.new('Preview camera', bpy.data.cameras.new('Preview camera')))
    cam.data.lens, cam.location = 50, (4.0, -5.2, 1.3)
    cam.rotation_euler = (Vector((0, -0.2, 0.55)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = 640, 360, 100
    r.filepath, r.image_settings.file_format, r.image_settings.quality = os.path.join(folder, 'preview.jpg'), 'JPEG', 85
    scene.cycles.samples, scene.cycles.use_denoising = 48, True
    bpy.ops.render.render(write_still=True)
    pack(os.path.join(folder, 'model.glb'), path, DETAILS, [('preview', os.path.join(folder, 'preview.jpg'), 'image/jpeg')])


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    os.makedirs(OUT, exist_ok=True)
    parts = build()
    if 'preview' in args:
        scene = bpy.context.scene
        scene.cycles.samples = int(os.environ.get('SAMPLES', 64))
        scene.cycles.use_denoising = True
        scene.render.resolution_x, scene.render.resolution_y = 1280, 720
        scene.view_settings.look = 'AgX - Medium High Contrast'
        studio_world(1.0)
        floor = box('Floor', (30, 30, 0.01), (0, 0, -0.005), material('Floor', (0.18, 0.18, 0.19), roughness=0.5), bevel=0)
        shots = {'front34': ((5.2, -4.0, 1.3), (0.2, 0, 0.55), 50), 'rear34': ((-5.0, -3.6, 1.5), (-0.3, 0, 0.6), 50),
                 'side': ((0, -7.5, 0.8), (0, 0, 0.55), 50), 'wheel': ((2.4, -1.9, 0.55), (1.36, -0.85, 0.35), 50)}
        for name in os.environ.get('SHOTS', 'front34,rear34,side').split(','):
            preview(name, *shots[name])
    if 'export' in args:
        export(os.path.join(OUT, 'supercar.glb'))
