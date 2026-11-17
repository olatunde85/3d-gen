/**
 * Tiny binary container: a JSON header plus aligned typed arrays, optionally
 * gzip-compressed. Used for the base mesh, morph targets and proxy assets.
 */
import { gunzipSync, gzipSync } from 'fflate';

export type TypedArray = Float32Array | Uint32Array | Uint16Array | Int16Array | Uint8Array;
const CTORS = { Float32Array, Uint32Array, Uint16Array, Int16Array, Uint8Array } as const;
type CtorName = keyof typeof CTORS;

export interface Pack<M = unknown> {
  meta: M;
  arrays: Record<string, TypedArray>;
}

const MAGIC = 0x3150484d; // "MHP1"

export function encodePack(meta: unknown, arrays: Record<string, TypedArray>, gzip = true): Uint8Array {
  const entries: { name: string; type: CtorName; offset: number; length: number }[] = [];
  let offset = 0;
  for (const [name, a] of Object.entries(arrays)) {
    entries.push({ name, type: a.constructor.name as CtorName, offset, length: a.length });
    offset += Math.ceil(a.byteLength / 4) * 4;
  }
  const header = new TextEncoder().encode(JSON.stringify({ meta, arrays: entries }));
  const headPad = Math.ceil(header.length / 4) * 4;
  const out = new Uint8Array(8 + headPad + offset);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, headPad, true);
  out.fill(0x20, 8, 8 + headPad);
  out.set(header, 8);
  const base = 8 + headPad;
  for (const e of entries) {
    const a = arrays[e.name];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), base + e.offset);
  }
  // No timestamp in the gzip header, so the same data always packs to the same bytes.
  return gzip ? gzipSync(out, { level: 9, mtime: 0 }) : out;
}

export function decodePack<M = unknown>(input: Uint8Array): Pack<M> {
  const buf = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Not an asset pack');
  const headLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + headLen)));
  // Copy into a fresh, aligned buffer so typed-array views are valid.
  const data = buf.slice(8 + headLen);
  const arrays: Record<string, TypedArray> = {};
  for (const e of header.arrays as { name: string; type: CtorName; offset: number; length: number }[]) {
    arrays[e.name] = new CTORS[e.type](data.buffer, e.offset, e.length);
  }
  return { meta: header.meta as M, arrays };
}
