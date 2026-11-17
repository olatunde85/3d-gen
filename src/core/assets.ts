/**
 * Asset pack formats (produced by scripts/build-assets.ts from the CC0
 * MakeHuman data) and a loader that works in both the browser and Node.
 */
import { decodePack, type Pack } from './pack';

export interface AssetMaterial {
  name: string;
  color: string; // sRGB hex multiplier
  roughness: number;
  metalness: number;
  diffuse?: string; // texture file name in assets/textures
  normal?: string;
  alpha: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;
}

export interface BaseMeta {
  vertexCount: number;
  faceCount: number;
  /** Skeleton joint name -> base-mesh vertex indices (joint position = their mean). */
  joints: Record<string, number[]>;
  bones: { name: string; parent: string | null; head: string; tail: string }[];
}
// arrays: positions (Float32, decimetres), faceVerts (Uint32, quads), faceUVs (Uint32), uvs (Float32)

export interface TargetsMeta {
  /** 2 = values delta-coded per target and stored as low/high byte planes (see decodeTargets). */
  format?: number;
  /** name -> [entry offset, entry count, quantisation scale] */
  targets: Record<string, [number, number, number]>;
}
// arrays (in memory): idx (Uint16 vertex-index deltas), dx, dy, dz (Int16 quantised deltas)

/** Turn a format-2 targets pack back into idx/dx/dy/dz arrays (format 1 packs pass through). */
export function decodeTargets(p: Pack<TargetsMeta>): Pack<TargetsMeta> {
  if (p.meta.format !== 2) return p;
  const a = p.arrays as Record<string, Uint8Array>;
  const n = a.xlo.length;
  const out: Int16Array[] = [new Int16Array(n), new Int16Array(n), new Int16Array(n)];
  const planes = [[a.xlo, a.xhi], [a.ylo, a.yhi], [a.zlo, a.zhi]];
  for (const [off, count] of Object.values(p.meta.targets))
    for (let k = 0; k < 3; k++) {
      const [lo, hi] = planes[k], o = out[k];
      let v = 0;
      for (let i = off; i < off + count; i++) {
        v = (v + (lo[i] | (hi[i] << 8))) & 0xffff;
        o[i] = (v << 16) >> 16;
      }
    }
  return { meta: p.meta, arrays: { idx: p.arrays.idx, dx: out[0], dy: out[1], dz: out[2] } };
}

export type ProxyKind = 'body' | 'eyes' | 'eyebrows' | 'eyelashes' | 'hair' | 'outfit' | 'shoes' | 'hat' | 'teeth' | 'tongue';

export interface ProxyMeta {
  id: string;
  kind: ProxyKind;
  zDepth: number;
  /** Per-axis scale reference: [vertA, vertB, referenceDistance] or null. */
  scale: ([number, number, number] | null)[];
  material?: AssetMaterial;
  vertexCount: number;
}
// arrays: refs (Uint32 N*3), weights (Float32 N*3), offsets (Float32 N*3),
//         faceSizes (Uint8), faceVerts (Uint32), faceUVs (Uint32), uvs (Float32), deleteVerts (Uint32)

export interface CatalogItem {
  id: string;
  name: string;
  tags: string[];
  thumb?: string;
  /** Proxy pack file (relative to assets/), for mesh assets. */
  file?: string;
  material?: AssetMaterial;
}

export interface Slider {
  id: string;
  label: string;
  /** Pairs of [min target, max target]; several pairs = symmetric left/right. null = no target on that side. */
  targets: [string | null, string | null][];
  /** Unipolar sliders run 0..1, bipolar -1..1. */
  bipolar: boolean;
}

export interface SliderGroup {
  category: string;
  group: string;
  sliders: Slider[];
}

export interface Catalog {
  skins: CatalogItem[];
  eyes: CatalogItem[];
  eyebrows: CatalogItem[];
  eyelashes: CatalogItem[];
  hair: CatalogItem[];
  outfits: CatalogItem[];
  shoes: CatalogItem[];
  hats: CatalogItem[];
  bodies: CatalogItem[];
  eyeMesh: string;
  /** Teeth variants and the tongue (mouth interior). */
  teeth: CatalogItem[];
  tongue: CatalogItem;
  sliders: SliderGroup[];
}

/** Where asset bytes come from: fetch() in the browser, the filesystem in Node. */
export interface AssetSource {
  read(path: string): Promise<Uint8Array>;
  /** URL usable by the viewer for textures (browser only). */
  url?(path: string): string;
}

export function fetchSource(base = './assets/'): AssetSource {
  return {
    async read(path) {
      const r = await fetch(base + path);
      if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
    url: (path) => base + path,
  };
}

/** Loads and caches packs, catalog and textures. */
export class AssetLibrary {
  catalog!: Catalog;
  base!: Pack<BaseMeta>;
  targets!: Pack<TargetsMeta>;
  /**
   * With the web copy of the data (initWeb), which file holds each target. Targets load on demand with loadTargets(),
   * and only those are in `targets`.
   */
  targetFiles?: Record<string, string>;
  /** The web copy's texture size: textures read with small = true come from web/textures. */
  webTextureSize?: number;
  private targetLoads = new Map<string, Promise<void>>();
  private proxies = new Map<string, Promise<Pack<ProxyMeta>>>();
  private textures = new Map<string, Promise<Uint8Array>>();
  /** Textures generated at runtime (procedural garments), by file name. */
  private generated = new Map<string, Uint8Array>();
  private blobUrls = new Map<string, string>();

  registerTexture(name: string, data: Uint8Array): void {
    this.generated.set(name, data);
  }

  hasTexture(name: string): boolean {
    return this.generated.has(name);
  }

  peekTexture(name: string): Uint8Array | undefined {
    return this.generated.get(name);
  }

  /** Names of all runtime-generated textures. */
  generatedNames(): string[] {
    return [...this.generated.keys()];
  }

  constructor(readonly source: AssetSource) {}

  async init(): Promise<this> {
    const [cat, base, targets] = await Promise.all([
      this.source.read('catalog.json'),
      this.source.read('base.pack'),
      this.source.read('targets.pack'),
    ]);
    this.catalog = JSON.parse(new TextDecoder().decode(cat));
    this.base = decodePack<BaseMeta>(base);
    this.targets = decodeTargets(decodePack<TargetsMeta>(targets));
    return this;
  }

  /**
   * For downloads over the web: the catalog and base mesh now, and body-shape targets as loadTargets() asks for them,
   * from the web copy of the data (scripts/build-web-assets.ts). Data without a web copy loads in full, as init().
   */
  async initWeb(): Promise<this> {
    const [cat, base, index] = await Promise.all([
      this.source.read('catalog.json'),
      this.source.read('base.pack'),
      this.source.read('web/index.json').catch(() => undefined),
    ]);
    if (!index) return this.init();
    this.catalog = JSON.parse(new TextDecoder().decode(cat));
    this.base = decodePack<BaseMeta>(base);
    const web = JSON.parse(new TextDecoder().decode(index)) as { textureSize: number; targets: Record<string, string> };
    this.targetFiles = web.targets;this.webTextureSize = web.textureSize;
    this.targets = { meta: { targets: {} }, arrays: { idx: new Uint16Array(0), dx: new Int16Array(0), dy: new Int16Array(0), dz: new Int16Array(0) } };
    return this;
  }

  /** Makes sure these targets are loaded (with the web copy of the data); the full data has them all already. */
  async loadTargets(names: Iterable<string>): Promise<void> {
    if (!this.targetFiles) return;
    const files = new Set<string>();
    for (const name of names) { const file = this.targetFiles[name];if (file && !this.targets.meta.targets[name]) files.add(file); }
    await Promise.all([...files].map((file) => {
      let load = this.targetLoads.get(file);
      if (!load) {
        load = this.source.read(`web/targets/${file}`).then((bytes) => this.addTargets(decodeTargets(decodePack<TargetsMeta>(bytes))));
        load.catch(() => this.targetLoads.delete(file));
        this.targetLoads.set(file, load);
      }
      return load;
    }));
  }

  /** Appends a decoded pack's targets to `targets`. */
  private addTargets(pack: Pack<TargetsMeta>) {
    const table = this.targets.meta.targets, have = this.targets.arrays as Record<string, Uint16Array | Int16Array>, add = pack.arrays as Record<string, Uint16Array | Int16Array>;
    const start = have.idx.length;
    const join = <T extends Uint16Array | Int16Array>(a: T, b: T): T => { const out = new (a.constructor as new (n: number) => T)(a.length + b.length);out.set(a);out.set(b, a.length);return out; };
    this.targets.arrays = { idx: join(have.idx, add.idx), dx: join(have.dx, add.dx), dy: join(have.dy, add.dy), dz: join(have.dz, add.dz) };
    for (const [name, [offset, count, scale]] of Object.entries(pack.meta.targets)) table[name] = [start + offset, count, scale];
  }

  /** Catalog only (for UIs that delegate building to a worker). */
  async initCatalog(): Promise<this> {
    this.catalog = JSON.parse(new TextDecoder().decode(await this.source.read('catalog.json')));
    return this;
  }

  proxy(file: string): Promise<Pack<ProxyMeta>> {
    let p = this.proxies.get(file);
    if (!p) this.proxies.set(file, (p = this.source.read(file).then((b) => decodePack<ProxyMeta>(b))));
    return p;
  }

  /** A texture's bytes. `small` reads the web copy's smaller texture when the data has one (see initWeb). */
  texture(name: string, small = false): Promise<Uint8Array> {
    const gen = this.generated.get(name);
    if (gen) return Promise.resolve(gen);
    const path = small && this.webTextureSize ? `web/textures/${name}` : `textures/${name}`;
    let p = this.textures.get(path);
    if (!p) this.textures.set(path, (p = this.source.read(path)));
    return p;
  }

  textureUrl(name: string): string {
    const gen = this.generated.get(name);
    if (gen) {
      let url = this.blobUrls.get(name);
      if (!url) {
        url = URL.createObjectURL(new Blob([gen as BlobPart], { type: name.endsWith('.png') ? 'image/png' : 'image/jpeg' }));
        this.blobUrls.set(name, url);
      }
      return url;
    }
    return this.source.url ? this.source.url(`textures/${name}`) : name;
  }
}
