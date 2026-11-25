# SPDX-License-Identifier: GPL-3.0-or-later
"""Packs a baked set into one set file for Studio: the set's GLB with its lightmaps and preview inside, and its
details (set.json, less the file names) in the GLB's extras as `ara_set`. Studio imports the file (see
src/studio/set-files.ts); any glTF viewer still opens it.

The add-on packs each set it exports. On its own, it packs a folder holding set.json (whose `model`, `lightmaps` and
`preview` name the files beside it):

    python3 studio-sets/ara_set_export/bundle.py <folder> [<set file>]     # by default <set>.glb beside the folder
"""
import json
import os
import struct
import sys

GLB, JSON_CHUNK, BIN_CHUNK = 0x46546C67, 0x4E4F534A, 0x004E4942


def compact(doc, source):
    """The binary chunk with only the buffer views still in use, renumbered."""
    used = sorted({a['bufferView'] for a in doc.get('accessors', []) if 'bufferView' in a}
                  | {i['bufferView'] for i in doc.get('images', []) if 'bufferView' in i})
    views, binary, index = doc.get('bufferViews', []), bytearray(), {}
    kept = []
    for old in used:
        view = dict(views[old])
        binary.extend(b'\0' * (-len(binary) % 4))
        start = view.get('byteOffset', 0)
        data = source[start:start + view['byteLength']]
        view['byteOffset'] = len(binary)
        binary.extend(data)
        index[old] = len(kept)
        kept.append(view)
    for a in doc.get('accessors', []):
        if 'bufferView' in a:
            a['bufferView'] = index[a['bufferView']]
    for i in doc.get('images', []):
        if 'bufferView' in i:
            i['bufferView'] = index[i['bufferView']]
    doc['bufferViews'] = kept
    return binary


def bundle(folder, path=None):
    """Writes the set file at `path` (by default <set>.glb beside the folder) and returns where."""
    with open(os.path.join(folder, 'set.json')) as f:
        manifest = json.load(f)
    with open(os.path.join(folder, manifest['model']), 'rb') as f:
        glb = f.read()
    magic, _, _ = struct.unpack_from('<III', glb, 0)
    json_length, json_type = struct.unpack_from('<II', glb, 12)
    if magic != GLB or json_type != JSON_CHUNK:
        raise SystemExit(f"{manifest['model']} isn't a GLB.")
    doc = json.loads(glb[20:20 + json_length])
    bin_length, _ = struct.unpack_from('<II', glb, 20 + json_length)
    source = glb[28 + json_length:28 + json_length + bin_length]
    # The add-on's own settings, which Blender's exporter copies into every object's extras, aren't the set's.
    for kind in ('nodes', 'meshes', 'materials', 'scenes'):
        for item in doc.get(kind, []):
            extras = item.get('extras')
            if isinstance(extras, dict):
                extras.pop('ara_set', None)
                if not extras:
                    del item['extras']
    binary = compact(doc, source)

    def add_image(file, mime):
        with open(os.path.join(folder, file), 'rb') as f:
            data = f.read()
        binary.extend(b'\0' * (-len(binary) % 4))
        views = doc.setdefault('bufferViews', [])
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
        binary.extend(data)
        images = doc.setdefault('images', [])
        images.append({'bufferView': len(views) - 1, 'mimeType': mime, 'name': os.path.splitext(file)[0]})
        return len(images) - 1

    entry = {k: v for k, v in manifest.items() if k not in ('model', 'lightmaps', 'preview')}
    entry['lightmaps'] = {name: {'image': add_image(l['file'], 'image/jpeg'), 'scale': l['scale']}
                          for name, l in manifest['lightmaps'].items()}
    if manifest.get('preview'):
        entry['preview'] = add_image(manifest['preview'], 'image/jpeg')
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    doc.setdefault('extras', {})['ara_set'] = entry

    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    path = path or os.path.join(os.path.dirname(os.path.abspath(folder)), manifest['id'].split('/')[-1] + '.glb')
    with open(path + '.tmp', 'wb') as f:
        f.write(struct.pack('<III', GLB, 2, total))
        f.write(struct.pack('<II', len(text), JSON_CHUNK) + text)
        f.write(struct.pack('<II', len(binary), BIN_CHUNK) + binary)
    os.replace(path + '.tmp', path)
    print(f'{path}: {total / 1e6:.1f} MB')
    return path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    bundle(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
