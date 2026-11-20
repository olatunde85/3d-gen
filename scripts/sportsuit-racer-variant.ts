/** A separate colourway of MakeHuman's female_sportsuit01, keeping its fitted mesh and UVs. */
import { join } from 'node:path';
import sharp from 'sharp';
import type { CatalogItem } from '../src/core/assets';

export const RACER_SPORTSUIT_ID = 'female_sportsuit01_racer';
const TEXTURE = 'outfit_female_sportsuit01_racer.jpg';
const THUMB = 'thumbs/outfit_female_sportsuit01_racer.png';

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Recolour the existing blue top and orange/white seam stripes, retaining fabric shading. */
async function recolour(source: string, destination: string, png: boolean, trousers = true, clearLogo = false): Promise<void> {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const original = Uint8Array.from(data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = original[i], g = original[i + 1], b = original[i + 2];
    if (original[i + 3] < 8) continue;
    const blue = smooth(10, 55, b - r) * smooth(3, 30, b - g);
    const orange = smooth(24, 80, r - g) * smooth(12, 45, g - b);
    // The white trouser stripes are brighter than the atlas's flat grey UV background.
    // Include their end caps, which have no dark fabric on either side.
    const whiteStripe = trousers && y > height * 0.42 ? smooth(210, 240, Math.min(r, g, b)) : 0;
    const red = Math.max(orange, whiteStripe);
    if (blue > 0) {
      const light = clamp((0.213 * r + 0.715 * g + 0.072 * b) / 80, 0.65, 1.28);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - blue) + [50, 51, 54][c] * light * blue);
    }
    if (red > 0) {
      const light = clamp(0.82 + (r + g + b) / 2700, 0.9, 1.08);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - red) + [205, 34, 47][c] * light * red);
    }
  }
  if (clearLogo) {
    // The casual shirt has a printed crest on its front UV island. Replace that
    // oval with fabric from the matching, plain back island and feather the seam.
    const coloured = Uint8Array.from(data);
    const cx = width * 0.785, cy = height * 0.235;
    const rx = width * 0.105, ry = height * 0.095;
    const shift = Math.round(width * 0.49);
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(height, Math.ceil(cy + ry)); y++)
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(width, Math.ceil(cx + rx)); x++) {
        const radius = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const blend = 1 - smooth(0.82, 1, radius);
        if (blend <= 0) continue;
        const i = (y * width + x) * 4, from = (y * width + x - shift) * 4;
        for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - blend) + coloured[from + c] * blend);
      }
  }
  const image = sharp(data, { raw: { width, height, channels: 4 } });
  await (png ? image.png({ compressionLevel: 9 }) : image.removeAlpha().jpeg({ quality: 90, mozjpeg: true })).toFile(destination);
}

/** Add the racer colourway to a generated catalog and write its texture and thumbnail. */
export async function addSportsuitRacerVariant(assets: string, outfits: CatalogItem[]): Promise<void> {
  if (outfits.some(item => item.id === RACER_SPORTSUIT_ID)) return;
  const source = outfits.find(item => item.id === 'female_sportsuit01');
  if (!source?.file || !source.material?.diffuse || !source.thumb) throw Error('female_sportsuit01 source outfit is missing');
  await Promise.all([
    recolour(join(assets, 'textures', source.material.diffuse), join(assets, 'textures', TEXTURE), false),
    recolour(join(assets, source.thumb), join(assets, THUMB), true),
  ]);
  outfits.push({ ...source, id: RACER_SPORTSUIT_ID, name: 'Female sportsuit 01 (racer)', thumb: THUMB,
    material: { ...source.material, diffuse: TEXTURE } });
}

/** Recolour female casualsuit 01's shirt atlas; the garment uses its shirt UV islands only. */
export async function addRacerCasualShirtTexture(assets: string, outfits: CatalogItem[]): Promise<void> {
  const source = outfits.find(item => item.id === 'female_casualsuit01');
  if (!source?.material?.diffuse) throw Error('female_casualsuit01 source shirt is missing');
  await recolour(join(assets, 'textures', source.material.diffuse),
    join(assets, 'textures', 'outfit_female_casualsuit01_racer.jpg'), false, false, true);
}
