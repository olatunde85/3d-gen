"""
Ara's own props (cars) as prop files: a GLB with the prop's details in its extras (`ara_prop`) and a preview picture
packed inside, read by src/core/props/prop-models.ts. Cars are made only by Ara: this tooling, and the format, are
Ara's own, not part of the public Blender add-on.
"""
import json
import os
import struct

GLB, JSON_CHUNK, BIN_CHUNK = 0x46546C67, 0x4E4F534A, 0x004E4942


def pack(glb_path, out_path, details, images=()):
    """A copy of a GLB with `details` in its extras as ara_prop and images packed inside: each (field, file, mime)
    in `images` goes into the GLB and sets details[field] to its index."""
    with open(glb_path, 'rb') as f:
        glb = f.read()
    json_length = struct.unpack_from('<I', glb, 12)[0]
    doc = json.loads(glb[20:20 + json_length])
    bin_length = struct.unpack_from('<I', glb, 20 + json_length)[0]
    binary = bytearray(glb[28 + json_length:28 + json_length + bin_length])
    details = dict(details)
    for field, file, mime in images:
        with open(file, 'rb') as f:
            data = f.read()
        binary.extend(b'\0' * (-len(binary) % 4))
        views = doc.setdefault('bufferViews', [])
        views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
        binary.extend(data)
        doc.setdefault('images', []).append({'bufferView': len(views) - 1, 'mimeType': mime, 'name': field})
        details[field] = len(doc['images']) - 1
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    doc.setdefault('extras', {})['ara_prop'] = details
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(out_path + '.tmp', 'wb') as f:
        f.write(struct.pack('<III', GLB, 2, total))
        f.write(struct.pack('<II', len(text), JSON_CHUNK) + text)
        f.write(struct.pack('<II', len(binary), BIN_CHUNK) + binary)
    os.replace(out_path + '.tmp', out_path)
    print(f'{out_path}: {total / 1e6:.1f} MB')
    return out_path
