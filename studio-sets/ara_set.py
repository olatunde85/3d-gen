"""
Helpers for Studio's baked sets, built by Blender from a script (see README.md).

A set script models its scene with these helpers: surfaces take CC0 textures (from Poly Haven, downloaded into
.cache/) mapped at real-world scale, and lights and a sky light it. The Export for Ara Studio add-on
(ara_set_export/) bakes and exports it, as it would a scene made by hand.
"""
import json
import math
import os
import urllib.request

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache', 'textures')
AGENT = {'User-Agent': 'ara-studio-set-builder'}


# --- Scene ---------------------------------------------------------------------------------------------------------

def reset():
    """An empty scene in metres, rendered with Cycles on the GPU where there is one."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('METAL', 'OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            if any(d.type == kind for d in prefs.devices):
                for d in prefs.devices:
                    d.use = True
                scene.cycles.device = 'GPU'
                break
        except TypeError:
            continue
    scene.cycles.samples = 256
    scene.view_settings.view_transform = 'AgX'
    return scene


def texture_set(asset, resolution='2k'):
    """A Poly Haven texture's maps (colour, normal, roughness), downloaded once."""
    folder = os.path.join(CACHE, asset if resolution == '2k' else f'{asset}-{resolution}')
    os.makedirs(folder, exist_ok=True)
    maps = {}
    wanted = {'diff': 'Diffuse', 'nor': 'nor_gl', 'rough': 'Rough'}
    files = None
    for short, key in wanted.items():
        path = os.path.join(folder, f'{short}.jpg')
        if not os.path.exists(path):
            if files is None:
                with urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{asset}', headers=AGENT)) as r:
                    files = json.load(r)
            url = files[key][resolution]['jpg']['url']
            with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT)) as r, open(path, 'wb') as out:
                out.write(r.read())
        maps[short] = path
    return maps


MODELS = os.path.join(HERE, '.cache', 'models')


def _download(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with urllib.request.urlopen(urllib.request.Request(url, headers=AGENT)) as r, open(path, 'wb') as out:
            out.write(r.read())


def model(asset, location=(0, 0, 0), rotation=0.0, scale=1.0, resolution='1k', name=None, max_faces=6000):
    """A Poly Haven model (CC0), downloaded once as glTF, placed at `location`, turned `rotation` radians round the
    vertical. Returns its mesh objects (keeping its own texture coordinates)."""
    folder = os.path.join(MODELS, asset, resolution)
    gltf = os.path.join(folder, f'{asset}.gltf')
    if not os.path.exists(gltf):
        with urllib.request.urlopen(urllib.request.Request(f'https://api.polyhaven.com/files/{asset}', headers=AGENT)) as r:
            files = json.load(r)
        entry = files['gltf'][resolution]['gltf']
        for rel, inc in entry.get('include', {}).items():
            _download(inc['url'], os.path.join(folder, rel))
        _download(entry['url'], gltf)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=gltf)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new(name or asset, None)
    bpy.context.scene.collection.objects.link(holder)
    for r in roots:
        r.parent = holder
    holder.location, holder.rotation_euler, holder.scale = location, (0, 0, rotation), (scale, scale, scale)
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
        if o.data.uv_layers and o.data.uv_layers[0].name != 'UVMap':
            o.data.uv_layers[0].name = 'UVMap'
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    bpy.data.objects.remove(holder)
    # Dense models are simplified for the web: at most `max_faces` across the model.
    total = sum(len(o.data.polygons) for o in meshes)
    if total > max_faces:
        for o in meshes:
            mod = o.modifiers.new('Simplify', 'DECIMATE')
            mod.ratio = max_faces / total
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for o in meshes:
        o['ara_model'] = asset
    return meshes


# --- Materials -----------------------------------------------------------------------------------------------------

_materials = {}


def _rgba(sockets, name):
    """A colour socket by name: Blender's Mix node has a float, a vector and a colour socket of each name."""
    return next(x for x in sockets if x.name == name and x.type == 'RGBA')


def _image(path, colour):
    image = bpy.data.images.load(path, check_existing=True)
    image.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return image


def textured(name, asset, size=2.0, tint=None, roughness_scale=1.0, metallic=0.0, resolution='1k'):
    """A PBR material from a Poly Haven texture, mapped `size` metres across (see box_uv). `tint` multiplies the colour."""
    if name in _materials:
        return _materials[name]
    maps = texture_set(asset, resolution)
    m = bpy.data.materials.new(name)
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    colour = nodes.new('ShaderNodeTexImage')
    colour.image = _image(maps['diff'], True)
    links.new(uv.outputs['UV'], colour.inputs['Vector'])
    if tint:
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        _rgba(mix.inputs, 'B').default_value = (*tint, 1.0)
        links.new(colour.outputs['Color'], _rgba(mix.inputs, 'A'))
        links.new(_rgba(mix.outputs, 'Result'), bsdf.inputs['Base Color'])
    else:
        links.new(colour.outputs['Color'], bsdf.inputs['Base Color'])
    rough = nodes.new('ShaderNodeTexImage')
    rough.image = _image(maps['rough'], False)
    links.new(uv.outputs['UV'], rough.inputs['Vector'])
    if roughness_scale != 1.0:
        scale = nodes.new('ShaderNodeMath')
        scale.operation = 'MULTIPLY'
        scale.inputs[1].default_value = roughness_scale
        links.new(rough.outputs['Color'], scale.inputs[0])
        links.new(scale.outputs['Value'], bsdf.inputs['Roughness'])
    else:
        links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    normal = nodes.new('ShaderNodeTexImage')
    normal.image = _image(maps['nor'], False)
    links.new(uv.outputs['UV'], normal.inputs['Vector'])
    nmap = nodes.new('ShaderNodeNormalMap')
    nmap.uv_map = 'UVMap'
    links.new(normal.outputs['Color'], nmap.inputs['Color'])
    links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Metallic'].default_value = metallic
    m['ara_size'] = size
    _materials[name] = m
    return m


def one_sided(material):
    """A wall seen only from inside: the camera looks through its back (so a set can be filmed from outside it), while
    light still stops at it. Studio draws its front faces only."""
    m = material.copy()
    m.name = f'{material.name} (one-sided)'
    nodes, links = m.node_tree.nodes, m.node_tree.links
    out = nodes['Material Output']
    shader = out.inputs['Surface'].links[0].from_socket
    geo, path = nodes.new('ShaderNodeNewGeometry'), nodes.new('ShaderNodeLightPath')
    both = nodes.new('ShaderNodeMath')
    both.operation = 'MULTIPLY'
    links.new(geo.outputs['Backfacing'], both.inputs[0])
    links.new(path.outputs['Is Camera Ray'], both.inputs[1])
    clear = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    links.new(both.outputs['Value'], mix.inputs['Fac'])
    links.new(shader, mix.inputs[1])
    links.new(clear.outputs['BSDF'], mix.inputs[2])
    links.new(mix.outputs['Shader'], out.inputs['Surface'])
    m.use_backface_culling = True
    m['ara_one_sided'] = True
    return m


def grimy(name, asset, dirt_asset, size=3.0, dirt_size=4.0, patches=0.12, stains=0.55, roughness_scale=1.35, specular=0.3):
    """A floor of `asset` with wear across it: large patches of `dirt_asset` and darker stains (oil, water marks),
    from noise in the floor's own space. Blender draws it as it is; the set bakes it into one colour texture. Worn
    floors are rough: `roughness_scale` and `specular` keep the sky in skylights from mirroring across it."""
    if name in _materials:
        return _materials[name]
    m = textured(name, asset, size, roughness_scale=roughness_scale, resolution='2k')
    m.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = specular
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    base = bsdf.inputs['Base Color'].links[0].from_socket
    dirt_maps = texture_set(dirt_asset)
    coord = nodes.new('ShaderNodeTexCoord')
    scale = nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs['Scale'].default_value = 1.0 / dirt_size
    links.new(coord.outputs['Object'], scale.inputs[0])
    dirt = nodes.new('ShaderNodeTexImage')
    dirt.image = _image(dirt_maps['diff'], True)
    links.new(scale.outputs['Vector'], dirt.inputs['Vector'])
    # Where the dirt shows: broad patches.
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = patches
    noise.inputs['Detail'].default_value = 8.0
    noise.inputs['Roughness'].default_value = 0.6
    links.new(coord.outputs['Object'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.45, 0.62
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    links.new(ramp.outputs['Color'], mix.inputs['Factor'])
    links.new(base, _rgba(mix.inputs, 'A'))
    links.new(dirt.outputs['Color'], _rgba(mix.inputs, 'B'))
    # Stains: small dark blots, multiplied in.
    blot = nodes.new('ShaderNodeTexNoise')
    blot.inputs['Scale'].default_value = stains
    blot.inputs['Detail'].default_value = 3.0
    links.new(coord.outputs['Object'], blot.inputs['Vector'])
    blot_ramp = nodes.new('ShaderNodeValToRGB')
    blot_ramp.color_ramp.elements[0].position, blot_ramp.color_ramp.elements[1].position = 0.66, 0.72
    blot_ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    blot_ramp.color_ramp.elements[1].color = (0.42, 0.4, 0.37, 1)
    links.new(blot.outputs['Fac'], blot_ramp.inputs['Fac'])
    darken = nodes.new('ShaderNodeMix')
    darken.data_type = 'RGBA'
    darken.blend_type = 'MULTIPLY'
    darken.inputs['Factor'].default_value = 1.0
    links.new(_rgba(mix.outputs, 'Result'), _rgba(darken.inputs, 'A'))
    links.new(blot_ramp.outputs['Color'], _rgba(darken.inputs, 'B'))
    links.new(_rgba(darken.outputs, 'Result'), bsdf.inputs['Base Color'])
    m['ara_grime'] = True
    return m


def plain(name, colour, roughness=0.6, metallic=0.0, emission=None, strength=0.0, alpha=1.0):
    """A material of one colour; `emission` makes it glow (lamp bulbs, signs, screens)."""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
        m['ara_glow'] = True
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m['ara_size'] = 1.0
    _materials[name] = m
    return m


# --- Geometry ------------------------------------------------------------------------------------------------------

def _link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, build, material, location=(0, 0, 0), rotation=(0, 0, 0)):
    """A mesh built by `build(bm)` (a bmesh), with one material and real-world box UVs."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me))
    obj.location, obj.rotation_euler = location, rotation
    me.materials.append(material)
    return obj


def box(name, size, location, material, rotation=(0, 0, 0), bevel=0.0):
    """A box `size` (x, y, z metres) centred at `location`, optionally with bevelled edges for highlights."""
    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES', profile=0.5)
    return mesh_object(name, build, material, location, rotation)


def cylinder(name, radius, depth, location, material, rotation=(0, 0, 0), segments=24, cap=True):
    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments, radius1=radius, radius2=radius, depth=depth)
    return mesh_object(name, build, material, location, rotation)


def plane(name, size, location, material, rotation=(0, 0, 0)):
    def build(bm):
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
        bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
    return mesh_object(name, build, material, location, rotation)


def join(objects, name):
    """Joins objects into one (their materials kept): fewer draws, and one lightmap island layout."""
    objects = [o for o in objects if o is not None]
    if not objects:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def apply_transforms(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def box_uv(obj):
    """Texture coordinates at real-world scale: each face projected along its main axis, divided by its material's
    size (metres per texture repeat), so bricks and planks are the same size everywhere."""
    apply_transforms(obj)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    sizes = [m.get('ara_size', 1.0) if m else 1.0 for m in me.materials]
    for face in bm.faces:
        n = face.normal
        size = sizes[face.material_index] if face.material_index < len(sizes) else 1.0
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in face.loops:
            p = loop.vert.co
            if ax == 0:
                u, v = (p.y if n.x > 0 else -p.y), p.z
            elif ax == 1:
                u, v = (-p.x if n.y > 0 else p.x), p.z
            else:
                u, v = p.x, (p.y if n.z > 0 else -p.y)
            loop[uv].uv = (u / size, v / size)
    bm.to_mesh(me)
    bm.free()
    me.uv_layers['UVMap'].active_render = True


# --- Lights --------------------------------------------------------------------------------------------------------

def sky(sun_elevation, sun_rotation, strength=1.0):
    """A physical sky (Blender's own model) lighting the set from outside."""
    world = bpy.data.worlds.new('Sky')
    bpy.context.scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    background = nodes['Background']
    sky_node = nodes.new('ShaderNodeTexSky')
    sky_node.sky_type = 'MULTIPLE_SCATTERING'
    sky_node.sun_elevation = math.radians(sun_elevation)
    sky_node.sun_rotation = math.radians(sun_rotation)
    sky_node.sun_disc = False
    links.new(sky_node.outputs['Color'], background.inputs['Color'])
    background.inputs['Strength'].default_value = strength
    return world


def sun(name, elevation, rotation, strength, colour=(1.0, 0.92, 0.8), angle=1.0):
    """The sun, from `elevation` degrees above the horizon and `rotation` degrees round the vertical (0 = from -Y)."""
    data = bpy.data.lights.new(name, 'SUN')
    data.energy = strength
    data.color = colour
    data.angle = math.radians(angle)
    obj = _link(bpy.data.objects.new(name, data))
    obj.rotation_euler = (math.radians(90 - elevation), 0, math.radians(rotation))
    obj['ara_cast'] = True
    return obj


def point(name, location, power, colour=(1.0, 0.8, 0.6), radius=0.08):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = power
    data.color = colour
    data.shadow_soft_size = radius
    obj = _link(bpy.data.objects.new(name, data))
    obj.location = location
    return obj


def area(name, location, size, power, colour=(1.0, 0.95, 0.9), rotation=(0, 0, 0)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = colour
    data.size = size
    obj = _link(bpy.data.objects.new(name, data))
    obj.location, obj.rotation_euler = location, rotation
    return obj


# --- Bake and export -----------------------------------------------------------------------------------------------

def group(objects, key):
    """Joins objects that belong together (one wall, one rack, one crate stack) into one mesh each: fewer draws, while
    each piece keeps its own footprint for Studio's staging map. `key(obj)` names an object's group; None leaves it."""
    groups = {}
    for o in objects:
        k = key(o)
        groups.setdefault(k, []).append(o)
    out = []
    for k, objs in groups.items():
        if k is None or len(objs) == 1:
            if k is not None:
                objs[0].name = k
            out.extend(objs)
            continue
        for o in objs:
            apply_transforms(o)
        out.append(join(objs, k))
    return out


def _select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def preview(path, camera_location, target, lens=28, samples=128, resolution=(1600, 900)):
    """A still from Cycles, for judging the set before it's baked."""
    scene = bpy.context.scene
    cam_data = bpy.data.cameras.new('Preview')
    cam_data.lens = lens
    cam = _link(bpy.data.objects.new('Preview', cam_data))
    cam.location = camera_location
    direction = Vector(target) - Vector(camera_location)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'JPEG' if path.endswith('.jpg') else 'PNG'
    scene.render.image_settings.quality = 82
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
