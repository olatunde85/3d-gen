# SPDX-License-Identifier: GPL-3.0-or-later
"""
Bakes a scene into an Ara Studio set file: checks it, lays out a second UV map per lightmap group, bakes the light
(and any procedural colour glTF can't carry) with Cycles, exports the GLB and packs it with its lightmaps, preview and
details (see bundle.py). Export changes the scene (it applies transforms and modifiers, adds UV maps and nodes), so
the add-on runs it on a copy of the .blend in a background Blender (see run.py).
"""
import json
import math
import os
import re
import tempfile

import bpy
from mathutils import Vector

from . import bundle as _bundle

# What Studio accepts (src/studio/set-files.ts).
LIMITS = {'triangles': 300_000, 'meshes': 400, 'megapixels': 200}
SET_ID = re.compile(r'^[a-z0-9][a-z0-9-]{0,39}/[a-z0-9][a-z0-9-]{0,59}$')
RELEASE = re.compile(r'^\d{1,4}(\.\d{1,4}){0,2}$')
SIZES = (512, 1024, 2048, 4096)


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'set'


def hex_colour(c):
    return '#%02x%02x%02x' % tuple(round(max(0.0, min(1.0, v)) * 255) for v in c[:3])


# --- What's in the set ---------------------------------------------------------------------------------------------

def set_objects(scene):
    """The meshes that make the set: visible ones not marked to leave out."""
    return [o for o in scene.objects if o.type == 'MESH' and o.visible_get() and not o.ara_set.skip]


def _top_collection(scene, obj):
    for c in scene.collection.children:
        if obj.name in c.all_objects:
            return c
    return None


def group_of(scene, obj):
    """The object's lightmap group: its own setting, else its top-level collection, else 'set'."""
    if obj.ara_set.lightmap:
        return slug(obj.ara_set.lightmap)
    c = _top_collection(scene, obj)
    return slug(c.name) if c else 'set'


def groups(scene):
    """Lightmap groups (name to objects), and the glass, which isn't baked."""
    out, glass = {}, []
    for o in set_objects(scene):
        if o.ara_set.glass:
            glass.append(o)
        else:
            out.setdefault(group_of(scene, o), []).append(o)
    return out, glass


def _area(obj):
    """The object's surface area in square metres, as placed in the scene."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    area = sum(f.calc_area() for f in bm.faces)
    bm.free()
    return area


def size_of(objects, density):
    """A group's lightmap size: the largest set on its objects, else the size nearest `density` pixels a metre."""
    chosen = [int(o.ara_set.lightmap_size) for o in objects if o.ara_set.lightmap_size != 'AUTO']
    if chosen:
        return max(chosen)
    side = math.sqrt(sum(_area(o) for o in objects)) * density
    return min(SIZES, key=lambda s: abs(math.log2(s / max(side, 1))))


def _base_colour_source(material):
    """What feeds a material's base colour: None (a plain colour), 'image' (an image, perhaps tinted or mixed, which
    the glTF exporter follows), or 'nodes' (procedural, with no image at all)."""
    if not material.use_nodes:
        return None
    bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or not bsdf.inputs['Base Color'].links:
        return None
    seen, todo = set(), [bsdf.inputs['Base Color'].links[0].from_node]
    while todo:
        node = todo.pop()
        if node.type == 'TEX_IMAGE':
            return 'image'
        if node.name not in seen:
            seen.add(node.name)
            todo += [link.from_node for i in node.inputs for link in i.links]
    return 'nodes'


def _materials(objects):
    return {m for o in objects for m in o.data.materials if m}


# --- Checking ------------------------------------------------------------------------------------------------------

def check(scene):
    """Problems that stop an export (errors), ones worth a look (warnings), and what the set will cost Studio."""
    s, errors, warnings = scene.ara_set, [], []
    if not SET_ID.match(s.set_id):
        errors.append('ID: use author/set in lower case, such as yourname/old-garage')
    for label, value, most in (('Name', s.name, 60), ('Line about it', s.subtitle, 200), ('Author', s.author, 60), ('Licence', s.license, 100)):
        if not value.strip():
            errors.append(f'{label}: fill it in')
        elif len(value) > most:
            errors.append(f'{label}: at most {most} characters')
    if len(s.staging) > 2000:
        errors.append('Staging note: at most 2,000 characters')
    if not RELEASE.match(s.release):
        errors.append('Release: a number such as 1.0')
    if not sun_of(scene):
        errors.append('Sun: the cast is lit to match a sun light; add one')
    if s.room_min[0] >= s.room_max[0] or s.room_min[1] >= s.room_max[1]:
        errors.append('Room: set its floor area (Room from selection)')
    by_group, glass = groups(scene)
    if not by_group:
        errors.append('The scene has no visible meshes to bake')
    if not scene.camera:
        warnings.append('No camera: the set will have no preview picture (the scene camera takes it)')
    if not seats(scene):
        warnings.append('No seats: characters can sit only on the floor')
    owners = {}
    for name, objects in by_group.items():
        for m in _materials(objects):
            if m.ara_set.bake_colour:
                owners.setdefault(m.name, set()).add(name)
            elif _base_colour_source(m) == 'nodes':
                warnings.append(f'Material {m.name}: its colour is made by nodes, which glTF can\'t carry; tick "Bake its colour"')
    for m, names in owners.items():
        if len(names) > 1:
            errors.append(f'Material {m}: its colour is baked, so use it in one lightmap group only (it is in {", ".join(sorted(names))})')
    # What it costs: triangles, separate meshes (one per material on an object), texture pixels.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = meshes = 0
    images, sizes = set(), {}
    for name, objects in by_group.items():
        sizes[name] = size_of(objects, s.density)
    for o in [o for objs in by_group.values() for o in objs] + glass:
        mesh = o.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        meshes += max(1, len({p.material_index for p in mesh.polygons}))
        o.evaluated_get(depsgraph).to_mesh_clear()
        for m in o.data.materials:
            if m and m.use_nodes:
                images |= {n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image}
    pixels = sum(i.size[0] * i.size[1] for i in images)
    pixels += sum(v * v for v in sizes.values())
    pixels += sum(sizes[n] ** 2 for n, objs in by_group.items() if any(m.ara_set.bake_colour for m in _materials(objs)))
    cost = {'triangles': triangles, 'meshes': meshes, 'megapixels': round(pixels / 1e6, 1)}
    for key, unit in (('triangles', 'triangles'), ('meshes', 'separate meshes'), ('megapixels', 'megapixels of textures')):
        if cost[key] > LIMITS[key]:
            errors.append(f'Too heavy: {cost[key]:,} {unit} (Studio takes up to {LIMITS[key]:,})')
    return {'errors': errors, 'warnings': warnings, 'cost': cost, 'lightmaps': sizes}


def sun_of(scene):
    s = scene.ara_set.sun
    if s and s.type == 'LIGHT' and s.data.type == 'SUN':
        return s
    return next((o for o in scene.objects if o.type == 'LIGHT' and o.data.type == 'SUN'), None)


def seats(scene):
    return [o for o in scene.objects if o.type == 'EMPTY' and o.ara_set.seat]


# --- Baking --------------------------------------------------------------------------------------------------------

def _select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def prepare(objects):
    """Each object made its own real mesh, its modifiers and transforms applied: the second UV map must match what's
    exported, and objects sharing a mesh would share its lightmap too."""
    for o in objects:
        if o.data.users > 1:
            o.data = o.data.copy()
    _select(objects)
    if any(o.modifiers for o in objects):
        bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def lightmap_uvs(objects, margin=0.003):
    """One second UV map, Lightmap, laying out all `objects` together without overlaps: they share one lightmap image."""
    for o in objects:
        me = o.data
        if 'Lightmap' not in me.uv_layers:
            me.uv_layers.new(name='Lightmap')
        me.uv_layers.active = me.uv_layers['Lightmap']
    _select(objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake(objects, image, kind, passes):
    targets = []
    for m in _materials(objects):
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        m.node_tree.nodes.active = node
        targets.append((m, node))
    for o in objects:
        o.data.uv_layers.active = o.data.uv_layers['Lightmap']
    _select(objects)
    bake = bpy.context.scene.render.bake
    bake.margin, bake.margin_type = 6, 'EXTEND'
    bake.use_pass_direct, bake.use_pass_indirect, bake.use_pass_color = 'DIRECT' in passes, 'INDIRECT' in passes, 'COLOR' in passes
    if passes:
        bpy.ops.object.bake(type=kind, pass_filter=passes, margin=6, use_clear=True)
    else:
        bpy.ops.object.bake(type=kind, margin=6, use_clear=True)
    for m, node in targets:
        m.node_tree.nodes.remove(node)
    for o in objects:
        o.data.uv_layers.active = o.data.uv_layers[0]


def bake_light(objects, name, resolution=4096, samples=192):
    """The light falling on `objects` (sun, sky, lamps and their bounces, without the surfaces' own colour), baked into
    one float image through their Lightmap UVs, then denoised."""
    bpy.context.scene.cycles.samples = samples
    image = bpy.data.images.new(name, resolution, resolution, float_buffer=True)
    _bake(objects, image, 'DIFFUSE', {'DIRECT', 'INDIRECT'})
    return denoise(image)


def denoise(image):
    """A baked image cleaned of sampling noise by Blender's denoiser (run in the compositor on the image alone)."""
    scene = bpy.context.scene
    folder = tempfile.mkdtemp()
    raw, clean = os.path.join(folder, 'raw.exr'), os.path.join(folder, 'clean.exr')
    image.filepath_raw, image.file_format = raw, 'OPEN_EXR'
    image.save()
    tree = bpy.data.node_groups.new('Denoise', 'CompositorNodeTree')
    previous = scene.compositing_node_group
    scene.compositing_node_group = tree
    source = tree.nodes.new('CompositorNodeImage')
    source.image = bpy.data.images.load(raw)
    dn = tree.nodes.new('CompositorNodeDenoise')
    dn.inputs['HDR'].default_value = True
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    out = tree.nodes.new('NodeGroupOutput')
    tree.links.new(source.outputs['Image'], dn.inputs['Image'])
    tree.links.new(dn.outputs['Image'], out.inputs[0])
    r = scene.render
    saved = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format, r.image_settings.color_depth, r.use_compositing)
    r.resolution_x, r.resolution_y = image.size
    r.resolution_percentage, r.filepath = 100, clean
    r.image_settings.file_format, r.image_settings.color_depth = 'OPEN_EXR', '32'
    r.use_compositing = True
    camera = scene.camera
    if camera is None:  # the compositor runs on render; a render needs a camera even when it draws nothing
        scene.camera = bpy.data.objects.new('Denoise camera', bpy.data.cameras.new('Denoise camera'))
        scene.collection.objects.link(scene.camera)
    bpy.ops.render.render(write_still=True)
    if camera is None:
        bpy.data.objects.remove(scene.camera)
    r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format, r.image_settings.color_depth, r.use_compositing = saved
    scene.compositing_node_group = previous
    bpy.data.node_groups.remove(tree)
    result = bpy.data.images.load(clean)
    result.name = f'{image.name} (denoised)'
    return result


def bake_colour(objects, name, resolution=4096):
    """The surfaces' own colour (a procedural floor's wear, which glTF can't carry) baked through their Lightmap UVs:
    their colour is shown as emission for the bake, then their materials are put back."""
    bpy.context.scene.cycles.samples = 16
    image = bpy.data.images.new(name, resolution, resolution, float_buffer=False)
    restore = []
    for m in [m for m in _materials(objects) if m.ara_set.bake_colour]:
        nodes, links = m.node_tree.nodes, m.node_tree.links
        out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        colour = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
        emit = nodes.new('ShaderNodeEmission')
        if colour:
            links.new(colour, emit.inputs['Color'])
        else:
            emit.inputs['Color'].default_value = bsdf.inputs['Base Color'].default_value
        surface = out.inputs['Surface'].links[0].from_socket
        links.new(emit.outputs['Emission'], out.inputs['Surface'])
        restore.append((m, out, emit, surface))
    _bake(objects, image, 'EMIT', set())
    for m, out, emit, surface in restore:
        m.node_tree.links.new(surface, out.inputs['Surface'])
        m.node_tree.nodes.remove(emit)
    image.pack()  # so the export carries its pixels
    return image


def use_baked_colour(objects, image):
    """Materials marked "Bake its colour" take their colour from the baked image (through the Lightmap UVs), keeping
    their own normal and roughness maps."""
    for m in [m for m in _materials(objects) if m.ara_set.bake_colour]:
        nodes, links = m.node_tree.nodes, m.node_tree.links
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'Lightmap'
        links.new(uv.outputs['UV'], tex.inputs['Vector'])
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def save_lightmap(image, path, quality=86):
    """A lightmap as an 8-bit image: light divided by a scale (returned) so the brightest spots just fit, then
    sRGB-encoded for even precision from shadow to sun. Studio multiplies the scale back."""
    import numpy as np
    w, h = image.size
    px = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[:, :3]
    scale = float(max(np.percentile(px.max(axis=1), 99.8), 1e-3))
    v = np.clip(px / scale, 0, 1)
    v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    out = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((w * h, 4), dtype=np.float32)
    rgba[:, :3] = v
    out.pixels.foreach_set(rgba.ravel())
    out.filepath_raw = path
    out.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = quality
    try:
        out.save(quality=quality)
    except TypeError:
        out.save()
    return round(scale, 4)


def render_preview(scene, path, samples=64):
    """A still from the scene camera, for the set's card in Studio."""
    r = scene.render
    saved = (r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format, scene.cycles.samples)
    r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath = 640, 360, 100, path
    r.image_settings.file_format = 'JPEG'
    r.image_settings.quality = 82
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    bpy.ops.render.render(write_still=True)
    r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath, r.image_settings.file_format, scene.cycles.samples = saved


def export_glb(path, objects):
    """`objects` as a GLB: meshes with both UV maps, materials, textures as WebP, and their ara_ properties as extras."""
    _select(objects)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_lights=False, export_texcoords=True,
        export_image_format='WEBP', export_image_quality=82, export_apply=True, export_yup=True, export_materials='EXPORT',
        export_cameras=False,
    )


# --- The set -------------------------------------------------------------------------------------------------------

def manifest(scene, lightmaps, preview):
    """The set's details for Studio, in Studio's axes (Y up; Blender's -Y is Studio's +Z, the front)."""
    s = scene.ara_set
    sun = sun_of(scene)
    d = sun.matrix_world.to_3x3() @ Vector((0, 0, -1))
    (x0, y0), (x1, y1) = s.room_min, s.room_max
    out = []
    for o in seats(scene):
        # A seat faces along its -Y axis (the front view's direction): yaw 0 faces Studio's +Z.
        f, p = o.matrix_world.to_3x3() @ Vector((0, -1, 0)), o.matrix_world.translation
        out.append({'x': round(p.x, 3), 'y': round(p.z, 3), 'z': round(-p.y, 3), 'yaw': round(math.degrees(math.atan2(f.x, -f.y)) % 360, 1)})
    m = {
        'kind': 'ara-studio-set', 'version': 1, 'id': s.set_id, 'name': s.name.strip(),
        'author': s.author.strip(), 'license': s.license.strip(), 'release': s.release,
        'category': s.category, 'family': s.family, 'mood': s.mood, 'subtitle': s.subtitle.strip(),
        'model': 'set.glb', 'lightmaps': lightmaps,
        'room': [round(x0, 3), round(-y1, 3), round(x1, 3), round(-y0, 3)], 'seats': out,
        'light': {'sun': {'direction': [round(d.x, 4), round(d.z, 4), round(-d.y, 4)], 'color': hex_colour(s.sun_colour), 'intensity': round(s.sun_intensity, 3)},
                  'fill': {'color': hex_colour(s.fill_colour), 'intensity': round(s.fill_intensity, 3)},
                  'exposure': round(s.exposure, 3), 'background': hex_colour(s.background)},
    }
    if s.staging.strip():
        m['staging'] = s.staging.strip()
    if preview:
        m['preview'] = preview
    return m


def export_set(scene, path, log=print):
    """Bakes and writes the set file at `path`. Changes the scene: run it on a copy (see run.py)."""
    result = check(scene)
    if result['errors']:
        raise ValueError('; '.join(result['errors']))
    s = scene.ara_set
    scene.render.engine = 'CYCLES'
    by_group, glass = groups(scene)
    sizes = result['lightmaps']
    folder = tempfile.mkdtemp(prefix='ara-set-')
    log('Preparing meshes')
    prepare([o for objs in by_group.values() for o in objs] + glass)
    for name, objects in by_group.items():
        log(f'Laying out the {name} lightmap')
        lightmap_uvs(objects)
        for o in objects:
            o['ara_lightmap'] = name
    colours = []
    for name, objects in by_group.items():
        marked = [o for o in objects if any(m and m.ara_set.bake_colour for m in o.data.materials)]
        if marked:
            log(f'Baking the {name} colour')
            colours.append((marked, bake_colour(marked, f'{name}-colour', sizes[name])))
    lightmaps = {}
    for i, (name, objects) in enumerate(by_group.items()):
        log(f'Baking the {name} light ({i + 1} of {len(by_group)}, {sizes[name]} px, {s.samples} samples)')
        image = bake_light(objects, f'{name}-light', sizes[name], s.samples)
        lightmaps[name] = {'file': f'{name}-light.jpg', 'scale': save_lightmap(image, os.path.join(folder, f'{name}-light.jpg'))}
    for objects, image in colours:
        use_baked_colour(objects, image)
    for o in glass:
        o['ara_glass'] = True
    log('Exporting')
    export_glb(os.path.join(folder, 'set.glb'), [o for objs in by_group.values() for o in objs] + glass)
    preview = None
    if scene.camera:
        log('Rendering the preview')
        render_preview(scene, os.path.join(folder, 'preview.jpg'))
        preview = 'preview.jpg'
    with open(os.path.join(folder, 'set.json'), 'w') as f:
        json.dump(manifest(scene, lightmaps, preview), f, indent=2)
    log('Packing the set file')
    return _bundle.bundle(folder, path)
