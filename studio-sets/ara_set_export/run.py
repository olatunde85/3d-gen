# SPDX-License-Identifier: GPL-3.0-or-later
"""
The background half of Export: Blender runs this on a copy of the .blend (blender -b copy.blend --python run.py --
<set file> <scene>), bakes the scene and writes the set file. Progress lines start "ARA: ", a failure "ARA-ERROR: ".
"""
import importlib
import os
import sys
import traceback

import bpy

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(here))
package = importlib.import_module(os.path.basename(here))
pipeline = importlib.import_module(os.path.basename(here) + '.pipeline')
# The add-on may already be enabled in this Blender (its settings registered); if not, register them here.
if not hasattr(bpy.types.Scene, 'ara_set'):
    package.register()

path, scene = sys.argv[sys.argv.index('--') + 1:][:2]
try:
    done = pipeline.export_set(bpy.data.scenes[scene], path, log=lambda message: print('ARA:', message, flush=True))
    print('ARA-DONE:', done, flush=True)
except Exception as error:  # reported to the add-on, which shows it
    traceback.print_exc()
    print('ARA-ERROR:', error, flush=True)
    sys.exit(1)
