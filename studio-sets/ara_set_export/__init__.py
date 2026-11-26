# SPDX-License-Identifier: GPL-3.0-or-later
"""
Export for Ara Studio: bakes a Blender scene's light and exports it as a set file that Ara Studio imports.

The Ara tab in the 3D view's sidebar holds the set's details, the light on the cast, its room and seats, and Check and
Export. Export bakes a copy of the .blend in a background Blender (see run.py), so the scene is left as it was.
"""
import os
import queue
import subprocess
import tempfile
import threading

import bpy
from mathutils import Vector
from bpy.props import BoolProperty, EnumProperty, FloatProperty, FloatVectorProperty, IntProperty, PointerProperty, StringProperty

from . import pipeline

CATEGORIES = ('Studios', 'Workplaces', 'Homes', 'Leisure', 'City', 'Outdoors', 'Travel')
FAMILIES = ('studio', 'office', 'bedroom', 'lounge', 'kitchen', 'beach', 'pool', 'garden', 'street', 'transit', 'warehouse',
            'restaurant', 'landscape', 'yacht', 'civic', 'bathroom', 'venue', 'road')
MOODS = ('day', 'sunset', 'night')
SIZE_ITEMS = [('AUTO', 'Automatic', 'From the group\'s surface area and the pixels-a-metre setting')] + [(str(s), f'{s} px', '') for s in pipeline.SIZES]


def _items(values, title=str.title):
    return [(v, title(v), '') for v in values]


def _is_sun(_, obj):
    return obj.type == 'LIGHT' and obj.data.type == 'SUN'


class AraSetSettings(bpy.types.PropertyGroup):
    set_id: StringProperty(name='ID', description='author/set, in lower case: what films use to find the set')
    name: StringProperty(name='Name', description='As Studio lists it')
    subtitle: StringProperty(name='About', description='One line about the set, under its name in Studio')
    author: StringProperty(name='Author')
    license: StringProperty(name='Licence', description='Such as CC-BY-4.0, or All rights reserved')
    release: StringProperty(name='Release', default='1.0', description='This version of the set, such as 1.0 or 1.2')
    category: EnumProperty(name='Category', items=_items(CATEGORIES, str))
    family: EnumProperty(name='Kind', items=_items(FAMILIES), description='The kind of place, for Studio\'s search and staging')
    mood: EnumProperty(name='Time of day', items=_items(MOODS))
    staging: StringProperty(name='Staging note', description='Where things are, in metres (Studio\'s axes: x across, z toward the front), for Assist')
    sun: PointerProperty(name='Sun', type=bpy.types.Object, poll=_is_sun, description='The sun the cast\'s light follows (the first sun if empty)')
    sun_colour: FloatVectorProperty(name='Sun colour', subtype='COLOR_GAMMA', size=3, min=0, max=1, default=(1.0, 0.95, 0.87))
    sun_intensity: FloatProperty(name='Sun strength', default=2.5, min=0, soft_max=6)
    fill_colour: FloatVectorProperty(name='Fill colour', subtype='COLOR_GAMMA', size=3, min=0, max=1, default=(0.75, 0.8, 0.88))
    fill_intensity: FloatProperty(name='Fill strength', default=0.6, min=0, soft_max=3)
    exposure: FloatProperty(name='Exposure', default=1.0, min=0.1, max=4)
    background: FloatVectorProperty(name='Background', subtype='COLOR_GAMMA', size=3, min=0, max=1, default=(0.8, 0.85, 0.9))
    room_min: FloatVectorProperty(name='Room from', size=2, subtype='XYZ', unit='LENGTH', description='The floor\'s corner at lowest X and Y')
    room_max: FloatVectorProperty(name='Room to', size=2, subtype='XYZ', unit='LENGTH', description='The floor\'s corner at highest X and Y')
    samples: IntProperty(name='Samples', default=192, min=16, max=4096, description='Cycles samples for each lightmap (they are denoised)')
    density: FloatProperty(name='Pixels a metre', default=128, min=16, max=1024, description='Lightmap detail for groups sized automatically')
    output: StringProperty(name='Set file', subtype='FILE_PATH', default='', description='Where the set file goes (next to the .blend if empty)')


class AraObjectSettings(bpy.types.PropertyGroup):
    lightmap: StringProperty(name='Lightmap group', description='Objects in a group share one lightmap (by default, their top-level collection)')
    lightmap_size: EnumProperty(name='Lightmap size', items=SIZE_ITEMS)
    glass: BoolProperty(name='Glass', description='See-through, and not baked')
    unlit: BoolProperty(name='Self-lit', description='Shows its own colour and glow, not baked (a sky dome, a lit sign)')
    skip: BoolProperty(name='Leave out', description='Not part of the set (a helper, or a stand-in)')
    seat: BoolProperty(name='Seat', description='Characters can sit here, facing along its -Y axis')


class AraMaterialSettings(bpy.types.PropertyGroup):
    bake_colour: BoolProperty(name='Bake its colour', description='Its colour comes from nodes glTF can\'t carry: bake it into an image')


def _last_check():
    return getattr(bpy.types.WindowManager, '_ara_check', None)


class ARA_OT_add_seat(bpy.types.Operator):
    """A seat at the 3D cursor: turn it so its -Y axis points the way a seated character faces, and raise it to seat height"""
    bl_idname = 'ara.add_seat'
    bl_label = 'Add seat'
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        seat = bpy.data.objects.new('Seat', None)
        seat.empty_display_type, seat.empty_display_size = 'ARROWS', 0.3
        seat.location = context.scene.cursor.location
        seat.location.z = max(seat.location.z, 0.45)
        seat.ara_set.seat = True
        context.collection.objects.link(seat)
        for o in context.selected_objects:
            o.select_set(False)
        seat.select_set(True)
        context.view_layer.objects.active = seat
        return {'FINISHED'}


class ARA_OT_room_from_selection(bpy.types.Operator):
    """The room's floor area from the selected objects' extent (such as the floor)"""
    bl_idname = 'ara.room_from_selection'
    bl_label = 'Room from selection'
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return bool(context.selected_objects)

    def execute(self, context):
        xs, ys = [], []
        for o in context.selected_objects:
            for corner in o.bound_box:
                p = o.matrix_world @ Vector(corner)
                xs.append(p.x)
                ys.append(p.y)
        s = context.scene.ara_set
        s.room_min, s.room_max = (min(xs), min(ys)), (max(xs), max(ys))
        return {'FINISHED'}


class ARA_OT_check(bpy.types.Operator):
    """Checks the set for Studio: its details, and what it will cost to play"""
    bl_idname = 'ara.check_set'
    bl_label = 'Check'

    def execute(self, context):
        result = pipeline.check(context.scene)
        bpy.types.WindowManager._ara_check = result
        self.report({'ERROR'} if result['errors'] else {'WARNING'} if result['warnings'] else {'INFO'},
                    f"{len(result['errors'])} to fix, {len(result['warnings'])} to look at" if result['errors'] or result['warnings'] else 'Ready to export')
        return {'FINISHED'}


def _output(scene):
    s = scene.ara_set
    if s.output:
        return bpy.path.abspath(s.output)
    return os.path.join(os.path.dirname(bpy.data.filepath), (s.set_id.split('/')[-1] or 'set') + '.glb')


class ARA_OT_export(bpy.types.Operator):
    """Bakes the light and writes the set file, in a background Blender on a copy of this file (Esc stops it)"""
    bl_idname = 'ara.export_set'
    bl_label = 'Export set'

    _process = None
    _timer = None
    _lines = None
    _log = None

    @classmethod
    def poll(cls, context):
        return cls._process is None

    def invoke(self, context, _event):
        if not bpy.data.filepath:
            self.report({'ERROR'}, 'Save the .blend first')
            return {'CANCELLED'}
        result = pipeline.check(context.scene)
        bpy.types.WindowManager._ara_check = result
        if result['errors']:
            self.report({'ERROR'}, 'Fix these first: ' + '; '.join(result['errors']))
            return {'CANCELLED'}
        copy = os.path.join(tempfile.mkdtemp(prefix='ara-set-'), os.path.basename(bpy.data.filepath))
        bpy.ops.wm.save_as_mainfile(filepath=copy, copy=True, check_existing=False)
        self.path = _output(context.scene)
        command = [bpy.app.binary_path, '-b', copy, '--python', os.path.join(os.path.dirname(__file__), 'run.py'), '--', self.path, context.scene.name]
        ARA_OT_export._process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self._lines, self._log = queue.Queue(), []
        threading.Thread(target=lambda: [self._lines.put(line) for line in ARA_OT_export._process.stdout], daemon=True).start()
        self._timer = context.window_manager.event_timer_add(0.5, window=context.window)
        context.window_manager.modal_handler_add(self)
        context.workspace.status_text_set('Ara: starting the bake…')
        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        if event.type == 'ESC':
            ARA_OT_export._process.terminate()
            return self._finish(context, 'Export stopped', 'WARNING')
        if event.type != 'TIMER':
            return {'PASS_THROUGH'}
        while not self._lines.empty():
            line = self._lines.get().rstrip()
            self._log.append(line)
            if line.startswith('ARA: '):
                context.workspace.status_text_set('Ara: ' + line[5:])
        if ARA_OT_export._process.poll() is None:
            return {'PASS_THROUGH'}
        errors = [line[11:] for line in self._log if line.startswith('ARA-ERROR: ')]
        if ARA_OT_export._process.returncode == 0 and os.path.exists(self.path):
            return self._finish(context, f'Saved {self.path} ({os.path.getsize(self.path) / 1e6:.1f} MB): import it in Ara Studio', 'INFO')
        print('\n'.join(self._log[-40:]))
        return self._finish(context, 'Export failed: ' + (errors[-1] if errors else 'see the system console'), 'ERROR')

    def _finish(self, context, message, level):
        context.window_manager.event_timer_remove(self._timer)
        context.workspace.status_text_set(None)
        ARA_OT_export._process = None
        self.report({level}, message)
        return {'FINISHED'} if level == 'INFO' else {'CANCELLED'}


class _Panel:
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Ara'


class ARA_PT_set(_Panel, bpy.types.Panel):
    bl_label = 'Ara Studio set'

    def draw(self, context):
        s, col = context.scene.ara_set, self.layout.column()
        for name in ('set_id', 'name', 'subtitle', 'author', 'license', 'release', 'category', 'family', 'mood', 'staging'):
            col.prop(s, name)


class ARA_PT_light(_Panel, bpy.types.Panel):
    bl_label = 'Light on the cast'
    bl_parent_id = 'ARA_PT_set'
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        s, col = context.scene.ara_set, self.layout.column()
        col.label(text='Characters are lit live, to match the bake.')
        for name in ('sun', 'sun_colour', 'sun_intensity', 'fill_colour', 'fill_intensity', 'exposure', 'background'):
            col.prop(s, name)


class ARA_PT_room(_Panel, bpy.types.Panel):
    bl_label = 'Room and seats'
    bl_parent_id = 'ARA_PT_set'

    def draw(self, context):
        s, col = context.scene.ara_set, self.layout.column()
        col.prop(s, 'room_min')
        col.prop(s, 'room_max')
        col.operator('ara.room_from_selection')
        row = col.row()
        row.operator('ara.add_seat')
        row.label(text=f'{len(pipeline.seats(context.scene))} seats')


class ARA_PT_selected(_Panel, bpy.types.Panel):
    bl_label = 'Selected'
    bl_parent_id = 'ARA_PT_set'

    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def draw(self, context):
        o, col = context.active_object, self.layout.column()
        if o.type == 'EMPTY':
            col.prop(o.ara_set, 'seat')
            return
        if o.type != 'MESH':
            col.label(text='Only meshes are part of the set.')
            return
        col.prop(o.ara_set, 'skip')
        col.prop(o.ara_set, 'glass')
        col.prop(o.ara_set, 'unlit')
        col.prop(o.ara_set, 'lightmap', text='Group')
        col.prop(o.ara_set, 'lightmap_size', text='Size')
        if o.active_material:
            col.prop(o.active_material.ara_set, 'bake_colour', text=f'Bake {o.active_material.name} colour')


class ARA_PT_export(_Panel, bpy.types.Panel):
    bl_label = 'Bake and export'
    bl_parent_id = 'ARA_PT_set'

    def draw(self, context):
        s, col = context.scene.ara_set, self.layout.column()
        col.prop(s, 'samples')
        col.prop(s, 'density')
        col.prop(s, 'output')
        row = col.row()
        row.operator('ara.check_set')
        row.operator('ara.export_set')
        result = _last_check()
        if not result:
            return
        box = col.box()
        c = result['cost']
        box.label(text=f"{c['triangles']:,} triangles · {c['meshes']} meshes · {c['megapixels']} MP of textures")
        box.label(text='Lightmaps: ' + ', '.join(f'{n} {v}' for n, v in result['lightmaps'].items()))
        for e in result['errors']:
            box.label(text=e, icon='ERROR')
        for w in result['warnings']:
            box.label(text=w, icon='INFO')


CLASSES = (AraSetSettings, AraObjectSettings, AraMaterialSettings, ARA_OT_add_seat, ARA_OT_room_from_selection, ARA_OT_check,
           ARA_OT_export, ARA_PT_set, ARA_PT_light, ARA_PT_room, ARA_PT_selected, ARA_PT_export)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.ara_set = PointerProperty(type=AraSetSettings)
    bpy.types.Object.ara_set = PointerProperty(type=AraObjectSettings)
    bpy.types.Material.ara_set = PointerProperty(type=AraMaterialSettings)


def unregister():
    for owner in (bpy.types.Scene, bpy.types.Object, bpy.types.Material):
        del owner.ara_set
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)

