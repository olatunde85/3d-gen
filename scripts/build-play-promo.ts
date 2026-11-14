/**
 * Cut the recorded Ara Play shots into the promo for the landing page: about 28 seconds of the Dead Drop demo game.
 * Record first: ARA_TEST_NATIVE_GPU=1 npx tsx scripts/play-browser-check.ts --promo (shots land in out/promo).
 * Then: npm run build:play-promo. Writes public/media/ara-play-promo.mp4 and its poster.
 *
 * Missions (a rescue, the companion following to the truck, boarding, driving, getting out, a shootout, police and city
 * traffic), then the runner across five settings and two races, then the builder: Game setup, Customize, Publish online
 * (sped up) and the game live at its own address. Captions and white flashes mark the beats; the voiceover clips from
 * demo-assets sit over a music bed that ducks under them and ends on the end card.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..'), shots = join(root, 'out/promo'), assets = join(root, 'demo-assets');
const output = join(root, 'public/media/ara-play-promo.mp4'), poster = join(root, 'public/media/ara-play-promo-poster.jpg');
const music = join(root, 'public/media/music/adventure-trailer-600429.mp3'), MUSIC_END = 74.2, ACCENT = '#ff3d9a';
const W = 1920, H = 1080, FPS = 30;

/** A piece of a recorded shot: where it starts, how long it plays, how fast, and what part of the frame fills the screen. */
interface Cut { shot: string; from: number; length: number; speed?: number; crop?: [number, number, number, number]; dim?: number }
const DIALOG: [number, number, number, number] = [380, 150, 1160, 653], COLOURS: [number, number, number, number] = [560, 420, 800, 450], PUBLISH: [number, number, number, number] = [480, 190, 960, 540];
const publishLength = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(shots, 'publish.mp4')], { encoding: 'utf8' }));
const CUTS: Cut[] = [
  { shot: 'race-neon-district', from: 0.2, length: 1.3, dim: 0.42 },
  // Missions
  { shot: 'rescue-free', from: 0.5, length: 1.4 },
  { shot: 'rescue-follow', from: 2.6, length: 1.3 },
  { shot: 'rescue-board', from: 1.5, length: 1.5 },
  { shot: 'rescue-drive', from: 0.5, length: 1.2 },
  { shot: 'rescue-alight', from: 0.4, length: 1.0 },
  { shot: 'shootout', from: 0.3, length: 2.1 },
  { shot: 'police', from: 1.2, length: 1.3 },
  { shot: 'city', from: 0.6, length: 1.3 },
  // Arcade
  { shot: 'run-train-yard', from: 0.1, length: 1.4 },
  { shot: 'run-city-rooftops', from: 1.0, length: 0.75 },
  { shot: 'run-neon-city', from: 1.0, length: 0.75 },
  { shot: 'run-desert-canyon', from: 1.0, length: 0.75 },
  { shot: 'run-snowy-peaks', from: 1.0, length: 0.75 },
  { shot: 'race-neon-district', from: 0.6, length: 1.2 },
  { shot: 'race-mountain-pass', from: 0.25, length: 1.2 },
  // The builder
  { shot: 'builder', from: 0.4, length: 1.7, crop: DIALOG },
  { shot: 'customize', from: 0.9, length: 1.6, crop: COLOURS },
  { shot: 'publish', from: 0.3, length: 0.9, crop: PUBLISH },
  { shot: 'publish', from: 1.2, length: publishLength - 4.2, speed: (publishLength - 4.2) / 1.2, crop: PUBLISH },
  { shot: 'publish', from: publishLength - 2.4, length: 1.2, crop: PUBLISH },
  { shot: 'live', from: 0.5, length: 2.0 },
];
const END = 2.0;
const times: number[] = [];let clock = 0;
for (const c of CUTS) { times.push(clock);clock += Math.round((c.length / (c.speed ?? 1)) * FPS) / FPS; }
const endAt = clock, total = clock + END;
const at = (index: number) => times[index];
/** Captions over the shots: text, which cut it starts on, and for how long. */
const CAPTIONS: [string, number, number][] = [['RESCUE', 1, 1.3], ['RIDE TOGETHER', 3, 1.4], ['FIGHT', 6, 1.4], ['FREE ROAM', 7, 1.2], ['RUN', 9, 1.2], ['ANY WORLD', 11, 1.4], ['RACE', 14, 1.1], ['BUILD IT', 16, 1.5], ['MAKE IT YOURS', 17, 1.4], ['PUBLISH', 18, 2.2], ['PLAY ANYWHERE', 21, 2.0]];
/** Section starts, marked with a two-frame white flash. */
const FLASHES = [1, 9, 16, 21].map(at).concat(endAt);

const clip = (name: string) => readdirSync(assets).find((f) => f.includes(name))!;
const VO: [string, number, number][] = [
  [clip('20_26_35_Jamie'), 0.25, 1], [clip('20_13_34_Emmaline'), at(3) + 0.1, 0.9], [clip('20_03_13_Ostap'), at(6) + 0.15, 1],
  [clip('20_27_01_Jamie'), at(9) + 0.1, 1], [clip('20_27_26_Jamie'), at(16) + 0.05, 1], [clip('20_28_00_Jamie'), at(18) + 0.4, 1], [clip('20_28_28_Jamie'), endAt + 0.35, 1],
];

for (const c of new Set(CUTS.map((x) => x.shot))) if (!existsSync(join(shots, `${c}.mp4`))) throw Error(`Record the promo shots first: ${c}.mp4 is missing in out/promo.`);
const work = mkdtempSync(join(tmpdir(), 'ara-play-promo-'));
const font = 'Helvetica Neue';
/** A caption: heavy white type on a dark band with an accent bar, transparent elsewhere. */
async function caption(text: string, file: string) {
  const size = 96, width = Math.round(text.length * size * 0.66 + 120);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="190"><rect x="0" y="22" width="${width}" height="140" fill="#0b0712" fill-opacity="0.72"/><rect x="0" y="22" width="14" height="140" fill="${ACCENT}"/><text x="52" y="128" font-family="${font}" font-weight="900" font-size="${size}" fill="#ffffff" letter-spacing="-1">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
async function titleCard(file: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="50%" y="560" text-anchor="middle" font-family="${font}" font-weight="900" font-size="230" fill="#ffffff" letter-spacing="-2">DEAD DROP</text><rect x="${W / 2 - 60}" y="610" width="120" height="10" fill="${ACCENT}"/><text x="50%" y="700" text-anchor="middle" font-family="Menlo" font-size="40" fill="#ffffff" fill-opacity="0.85" letter-spacing="10">A GAME MADE WITH ARA PLAY</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
async function endCard(file: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="#2a1840"/><stop offset="1" stop-color="#0b0712"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="470" text-anchor="middle" font-family="${font}" font-weight="900" font-size="200" fill="#ffffff" letter-spacing="-2">ARA PLAY</text><rect x="${W / 2 - 70}" y="520" width="140" height="10" fill="${ACCENT}"/>
  <text x="50%" y="620" text-anchor="middle" font-family="${font}" font-weight="700" font-size="58" fill="#ffffff">Build it. Play it. Publish it.</text>
  <text x="50%" y="740" text-anchor="middle" font-family="Menlo" font-size="44" fill="${ACCENT}" letter-spacing="4">ara3dgen.com/play</text>
  <text x="50%" y="810" text-anchor="middle" font-family="${font}" font-size="30" fill="#ffffff" fill-opacity="0.6">Free and open source. No code needed.</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

try {
  await titleCard(join(work, 'title.png'));await endCard(join(work, 'end.png'));
  for (const [i, [text]] of CAPTIONS.entries()) await caption(text, join(work, `cap${i}.png`));
  // Each cut is rendered on its own to an exact number of frames, so the timeline lands on frame boundaries.
  const pieces = CUTS.map((c, i) => {
    const file = join(work, `cut${i}.mp4`), frames = Math.round((c.length / (c.speed ?? 1)) * FPS), crop = c.crop ? `crop=${c.crop[2]}:${c.crop[3]}:${c.crop[0]}:${c.crop[1]},` : '';
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(c.from), '-i', join(shots, `${c.shot}.mp4`), '-vf', `setpts=(PTS-STARTPTS)/${c.speed ?? 1},${crop}scale=${W}:${H}:flags=lanczos,fps=${FPS},setsar=1${c.dim ? `,eq=brightness=-${c.dim}:saturation=0.8` : ''},format=yuv420p`, '-frames:v', String(frames), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', file]);
    return file;
  });
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of pieces) args.push('-i', file);
  const n = CUTS.length, titleIn = n, endIn = n + 1, capIn = n + 2;
  args.push('-loop', '1', '-t', String(total), '-i', join(work, 'title.png'), '-loop', '1', '-t', String(END), '-i', join(work, 'end.png'));
  for (let i = 0; i < CAPTIONS.length; i++) args.push('-loop', '1', '-t', String(total), '-i', join(work, `cap${i}.png`));
  const musicIn = capIn + CAPTIONS.length;args.push('-ss', String(Math.max(0, MUSIC_END - total)), '-i', music);
  const voIn = musicIn + 1;for (const [file] of VO) args.push('-i', join(assets, file));
  const g: string[] = [];
  CUTS.forEach((_, i) => g.push(`[${i}:v]setpts=PTS-STARTPTS[c${i}]`));
  g.push(`[${endIn}:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p[endcard]`);
  g.push(`${CUTS.map((_, i) => `[c${i}]`).join('')}[endcard]concat=n=${n + 1}:v=1:a=0[base]`);
  let last = 'base';
  const over = (input: string, enable: string, x = '0', y = '0', name = `o${g.length}`) => { g.push(`[${last}][${input}]overlay=x=${x}:y=${y}:enable='${enable}'[${name}]`);last = name; };
  over(`${titleIn}:v`, `between(t,0.15,${times[1] - 0.05})`);
  CAPTIONS.forEach(([, cut, length], i) => over(`${capIn + i}:v`, `between(t,${at(cut) + 0.08},${at(cut) + 0.08 + length})`, '0', 'H-h-90'));
  g.push(`color=c=white:s=${W}x${H}:r=${FPS}:d=${total}[white]`);
  for (const t of FLASHES) { g.push(`[${last}][white]overlay=enable='between(t,${t},${t + 2 / FPS})'[f${Math.round(t * 100)}]`);last = `f${Math.round(t * 100)}`; }
  g.push(`[${last}]fade=t=out:st=${total - 0.4}:d=0.4[video]`);
  // Voices over a music bed that ducks under them and fades out on the end card.
  VO.forEach(([, start, gain], i) => g.push(`[${voIn + i}:a]aresample=48000,volume=${gain * 1.6},adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[v${i}]`));
  g.push(`${VO.map((_, i) => `[v${i}]`).join('')}amix=inputs=${VO.length}:normalize=0,apad=whole_dur=${total}[voices]`);
  g.push('[voices]asplit=2[vo][key]');
  g.push(`[${musicIn}:a]aresample=48000,volume=0.9,afade=t=in:d=0.3,afade=t=out:st=${total - 0.6}:d=0.6[bed]`);
  g.push('[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[ducked]');
  g.push(`[ducked][vo]amix=inputs=2:normalize=0,atrim=0:${total},alimiter=limit=0.95[audio]`);
  args.push('-filter_complex', g.join(';'), '-map', '[video]', '-map', '[audio]', '-t', String(total), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at(6) + 1.2), '-i', output, '-frames:v', '1', '-q:v', '3', poster]);
  console.log(`Ara Play promo: ${total.toFixed(1)} s → ${output}`);
} finally { rmSync(work, { recursive: true, force: true }); }
