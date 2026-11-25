/**
 * Reading binary glTF (GLB) files without a renderer: their JSON and binary chunks, the images packed inside, image
 * sizes from their headers, what a model costs to draw, and a copy without images (for geometry alone, outside a
 * browser). Set files and prop files are GLBs with their details in the extras.
 */

export interface Gltf {
  images?: { bufferView?: number; mimeType?: string }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
  nodes?: { mesh?: number }[]; meshes?: { primitives?: { indices?: number; mode?: number; attributes?: Record<string, number> }[] }[]; accessors?: { count?: number }[];
  extras?: Record<string, unknown>;
}
export interface Glb { json: Gltf; bin: Uint8Array }

/** A GLB's JSON and binary chunks; null when the bytes aren't a GLB. */
export function readGlb(bytes: ArrayBuffer): Glb | null {
  const view = new DataView(bytes);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) return null;
  const jsonLength = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength))) as Gltf;
  const at = 20 + jsonLength, bin = at + 8 <= bytes.byteLength ? new Uint8Array(bytes, at + 8, view.getUint32(at, true)) : new Uint8Array();
  return { json, bin };
}

/** An image packed in the GLB, as its bytes; undefined when it isn't inside the file. */
export function imageBytes({ json, bin }: Glb, index: number): { bytes: Uint8Array<ArrayBuffer>; type: string } | undefined {
  const image = json.images?.[index], view = image?.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
  if (!image || !view || view.buffer !== 0) return undefined;
  const start = view.byteOffset ?? 0;
  if (start + view.byteLength > bin.byteLength) return undefined;
  return { bytes: bin.slice(start, start + view.byteLength) as Uint8Array<ArrayBuffer>, type: image.mimeType ?? "image/jpeg" };
}

/** An image's width and height from its first bytes (PNG, JPEG or WebP); 0 × 0 for another format. */
export function imageSize(b: Uint8Array): [number, number] {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1], le16 = (i: number) => b[i] | (b[i + 1] << 8), le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [(be16(16) << 16) | be16(18), (be16(20) << 16) | be16(22)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++;continue; }
      const marker = b[i + 1];
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += marker === 0xff ? 1 : 2;continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [be16(i + 7), be16(i + 5)];
      i += 2 + be16(i + 2);
    }
  }
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    if (tag(12) === 'VP8 ') return [le16(26) & 0x3fff, le16(28) & 0x3fff];
    if (tag(12) === 'VP8L') { const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    if (tag(12) === 'VP8X') return [le24(24) + 1, le24(27) + 1];
  }
  return [0, 0];
}

/** What a model asks of the graphics card: triangles, separate meshes (one per material on each object) and texture pixels. */
export interface ModelCost { triangles: number; meshes: number; megapixels: number }
/** A GLB's cost to draw, counting its textures and any further images (such as lightmaps) given by index. */
export function modelCost({ json, bin }: Glb, extraImages: readonly number[] = []): ModelCost {
  let triangles = 0, meshes = 0;
  for (const node of json.nodes ?? []) {
    for (const p of node.mesh === undefined ? [] : json.meshes?.[node.mesh]?.primitives ?? []) {
      meshes++;
      const count = json.accessors?.[p.indices ?? p.attributes?.POSITION ?? -1]?.count ?? 0;
      if (p.mode === undefined || p.mode === 4) triangles += count / 3;
    }
  }
  const images = new Set(extraImages);
  for (const t of json.textures ?? []) for (const source of [t.source, ...Object.values(t.extensions ?? {}).map((e) => e?.source)]) if (Number.isInteger(source)) images.add(source!);
  let pixels = 0;
  for (const i of images) {
    const image = json.images?.[i], view = image?.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
    if (!view) continue;
    const [w, h] = imageSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + Math.min(view.byteLength, 65536)));
    pixels += w * h;
  }
  return { triangles: Math.round(triangles), meshes, megapixels: Math.round(pixels / 1e5) / 10 };
}

/** A GLB without its images (for geometry alone): textures and their references are dropped from its JSON. */
export function withoutImages(glb: ArrayBuffer): ArrayBuffer {
  const view = new DataView(glb), jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
  delete json.images;delete json.textures;delete json.samplers;
  for (const key of ['extensionsUsed', 'extensionsRequired']) json[key] = (json[key] ?? []).filter((e: string) => !/^(EXT_texture_webp|KHR_texture_basisu|EXT_texture_avif)$/.test(e));
  const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !/Texture$/.test(k)).map(([k, x]) => [k, strip(x)])) : v;
  json.materials = strip(json.materials ?? []);
  const text = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4;
  const rest = new Uint8Array(glb, 20 + jsonLength), out = new Uint8Array(20 + padded + rest.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);o.setUint32(4, 2, true);o.setUint32(8, out.length, true);o.setUint32(12, padded, true);o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);out.fill(0x20, 20 + text.length, 20 + padded);out.set(rest, 20 + padded);
  return out.buffer;
}
