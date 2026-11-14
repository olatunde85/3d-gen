/**
 * Cut the recorded Ara Play shots into the promo for the landing page: about 56 seconds of the Dead Drop demo game.
 * Record first: ARA_TEST_NATIVE_GPU=1 npx tsx scripts/play-browser-check.ts --promo (shots land in out/promo).
 * Then: npm run build:play-promo. Writes public/media/ara-play-promo.mp4 and its poster.
 *
 * Missions (the rescued companion running alongside, the two driving away, a shootout, police and a city drive with the
 * car radio on), then the runner across five settings with a power-up in each and two races, then the builder: Game
 * setup, Customize, Publish online (sped up) and the game live at its own address. The builder part moves: the camera
 * pushes in on each dialog and the shots dissolve and slide into each other. Captions slide in at each beat. The music
 * is the game's own: the mission theme, the radio in the city, the runner beat and the race track to the end card.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..'), shots = join(root, 'out/promo'), tracks = join(root, 'public/media/music');
mkdirSync(join(root, 'out/play'), { recursive: true });
const master = join(root, 'out/play/ara-play-promo-master.mp4'), output = join(root, 'public/media/ara-play-promo.mp4'), poster = join(root, 'public/media/ara-play-promo-poster.jpg');
/** The edit is laid out on a 1920×1080 grid and rendered at 1440p from 4K shots; `K` scales layout to output pixels. */
const ACCENT = '#ff3d9a', W = 2560, H = 1440, K = W / 1920, FPS = 30;

type Rect = [number, number, number];
/** A piece of a recorded shot: where it starts, how long it plays and how fast. `move` frames it: a 16:9 window
 * [x, y, width] of the 1920×1080 recording that eases from the first to the second over `ease` seconds, then drifts
 * on to the third. `fade` is the transition into it from the shot before. */
interface Cut { shot: string; from: number; length: number; speed?: number; dim?: number; move?: [Rect, Rect, Rect]; ease?: number; fade?: [string, number] }
const FULL: Rect = [0, 0, 1920], DIALOG: Rect = [380, 150, 1160], CUSTOMIZE: Rect = [250, 140, 1420], PUBLISH: Rect = [480, 190, 960];
const tighter = ([x, y, w]: Rect, k: number): Rect => [x + (w * (1 - k)) / 2, y + (w * 9 / 16 * (1 - k)) / 2, w * k];
const wider = (r: Rect, k: number): Rect => { const [x, y, w] = tighter(r, k);return [Math.max(0, x), Math.max(0, y), Math.min(1920, w)]; };
const publishLength = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(shots, 'publish.mp4')], { encoding: 'utf8' }));
const CUTS: Cut[] = [
  { shot: 'race-neon-district', from: 0.3, length: 2.4, dim: 0.42 },
  // Missions
  { shot: 'rescue-follow', from: 0.2, length: 2.7 },
  { shot: 'rescue-drive', from: 0.2, length: 1.9 },
  { shot: 'shootout', from: 0.2, length: 3.2 },
  { shot: 'police', from: 0.8, length: 2.2 },
  { shot: 'city', from: 0.6, length: 5.0 },
  // Arcade: a power-up in each run
  { shot: 'run-train-yard', from: 0.3, length: 3.4 },
  { shot: 'run-city-rooftops', from: 0.0, length: 2.6 },
  { shot: 'run-neon-city', from: 0.0, length: 2.6 },
  { shot: 'run-desert-canyon', from: 0.0, length: 2.6 },
  { shot: 'run-snowy-peaks', from: 0.0, length: 2.6 },
  { shot: 'race-neon-district', from: 0.8, length: 2.0 },
  { shot: 'race-mountain-pass', from: 0.25, length: 2.4 },
  // The builder, moving
  { shot: 'builder', from: 0.2, length: 6.5, move: [FULL, DIALOG, tighter(DIALOG, 0.94)], ease: 1.4 },
  { shot: 'customize', from: 0.5, length: 5.0, move: [wider(CUSTOMIZE, 1.12), CUSTOMIZE, tighter(CUSTOMIZE, 0.95)], ease: 1.0, fade: ['smoothleft', 0.6] },
  { shot: 'publish', from: 0.3, length: 1.8, move: [wider(PUBLISH, 1.3), PUBLISH, tighter(PUBLISH, 0.97)], ease: 1.0, fade: ['smoothleft', 0.6] },
  { shot: 'publish', from: 1.5, length: publishLength - 4.5, speed: (publishLength - 4.5) / 2.0, move: [PUBLISH, PUBLISH, tighter(PUBLISH, 0.95)], ease: 0.1, fade: ['fade', 0.4] },
  { shot: 'publish', from: publishLength - 3.0, length: 2.4, move: [tighter(PUBLISH, 0.95), tighter(PUBLISH, 0.95), tighter(PUBLISH, 0.9)], ease: 0.1, fade: ['fade', 0.4] },
  { shot: 'live', from: 0.4, length: 3.6, move: [tighter(FULL, 0.82), FULL, FULL], ease: 1.2, fade: ['zoomin', 0.6] },
];
const END = 3.0, END_FADE = 0.6;
const frames = (c: Cut) => Math.round((c.length / (c.speed ?? 1)) * FPS);
const times: number[] = [];let clock = 0;
for (const c of CUTS) { clock -= c.fade?.[1] ?? 0;times.push(clock);clock += frames(c) / FPS; }
const endAt = clock - END_FADE, total = endAt + END;
const at = (index: number) => times[index];
/** Captions over the shots: text, which cut it starts on, and for how long. */
const CAPTIONS: [string, number, number][] = [['ESCAPE TOGETHER', 1, 3.0], ['FIGHT', 3, 2.4], ['FREE ROAM', 4, 2.4], ['CAR RADIO ON', 5, 2.6], ['RUN', 6, 2.4], ['POWER-UPS', 7, 3.6], ['ANY WORLD', 9, 3.4], ['RACE', 11, 2.4], ['BUILD IT', 13, 3.0], ['MAKE IT YOURS', 14, 3.0], ['PUBLISH', 15, 3.4], ['PLAY ANYWHERE', 18, 2.8]];
/** Section starts in the game footage, marked with a two-frame white flash. */
const FLASHES = [1, 6, 13].map(at);
/** The game's own music: [track, from cut, to cut (or the end), where in the track to start, radio]. The last one ends
 * with its track. */
const MUSIC: [string, number, number | undefined, number, boolean][] = [
  ['spy-mission-574523', 0, 5, 11, false],
  ['afrobeat-alone-464383', 5, 6, 30, true],
  ['hip-hop-story-623450', 6, 11, 4, false],
  ['adventure-trailer-600429', 11, undefined, 0, false],
];
const ADVENTURE_END = 73.0;

for (const c of new Set(CUTS.map((x) => x.shot))) if (!existsSync(join(shots, `${c}.mp4`))) throw Error(`Record the promo shots first: ${c}.mp4 is missing in out/promo.`);
const work = mkdtempSync(join(tmpdir(), 'ara-play-promo-'));
const font = 'Helvetica Neue';
/** A caption: heavy white type on a dark band with an accent bar, transparent elsewhere. */
async function caption(text: string, file: string) {
  const size = 96, width = Math.round(text.length * size * 0.66 + 120);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * K)}" height="${Math.round(190 * K)}" viewBox="0 0 ${width} 190"><rect x="0" y="22" width="${width}" height="140" fill="#0b0712" fill-opacity="0.72"/><rect x="0" y="22" width="14" height="140" fill="${ACCENT}"/><text x="52" y="128" font-family="${font}" font-weight="900" font-size="${size}" fill="#ffffff" letter-spacing="-1">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
async function titleCard(file: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 1920 1080"><text x="50%" y="560" text-anchor="middle" font-family="${font}" font-weight="900" font-size="230" fill="#ffffff" letter-spacing="-2">DEAD DROP</text><rect x="900" y="610" width="120" height="10" fill="${ACCENT}"/><text x="50%" y="700" text-anchor="middle" font-family="Menlo" font-size="40" fill="#ffffff" fill-opacity="0.85" letter-spacing="10">A GAME MADE WITH ARA PLAY</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}
async function endCard(file: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 1920 1080"><defs><radialGradient id="g" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="#2a1840"/><stop offset="1" stop-color="#0b0712"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="470" text-anchor="middle" font-family="${font}" font-weight="900" font-size="200" fill="#ffffff" letter-spacing="-2">ARA PLAY</text><rect x="890" y="520" width="140" height="10" fill="${ACCENT}"/>
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
    const file = join(work, `cut${i}.mp4`), n = frames(c);
    // Framing moves crop the 4K shot (twice the layout grid), so the window glides without whole-pixel steps.
    let frame = `scale=${W}:${H}:flags=lanczos`;
    if (c.move) {
      const [a, b, d] = c.move, e = Math.max(1, Math.round((c.ease ?? 1) * FPS)), p = `clip(on/${e},0,1)`, smooth = `(${p}*${p}*(3-2*${p}))`, q = `clip((on-${e})/${Math.max(1, n - e)},0,1)`;
      const v = (k: number) => `if(lt(on,${e}),${a[k]}+(${b[k] - a[k]})*${smooth},${b[k]}+(${d[k] - b[k]})*${q})`;
      frame = `scale=3840:2160:flags=lanczos,zoompan=z='1920/(${v(2)})':x='2*(${v(0)})':y='2*(${v(1)})':d=1:s=${W}x${H}:fps=${FPS}`;
    }
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(c.from), '-i', join(shots, `${c.shot}.mp4`), '-vf', `setpts=(PTS-STARTPTS)/${c.speed ?? 1},fps=${FPS},${frame},setsar=1${c.dim ? `,eq=brightness=-${c.dim}:saturation=0.8` : ''},format=yuv420p`, '-frames:v', String(n), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', file]);
    return file;
  });
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of pieces) args.push('-i', file);
  const n = CUTS.length, titleIn = n, endIn = n + 1, capIn = n + 2;
  args.push('-loop', '1', '-t', String(total), '-i', join(work, 'title.png'), '-loop', '1', '-t', String(END), '-i', join(work, 'end.png'));
  for (let i = 0; i < CAPTIONS.length; i++) args.push('-loop', '1', '-t', String(total), '-i', join(work, `cap${i}.png`));
  const musicIn = capIn + CAPTIONS.length, spans = MUSIC.map(([track, a, b, offset]) => {
    const start = at(a), end = b === undefined ? total : at(b), from = b === undefined ? Math.max(0, ADVENTURE_END - (end - start)) : offset;
    args.push('-ss', String(from), '-t', String(end - start + 0.5), '-i', join(tracks, `${track}.mp3`));return { start, end };
  });
  const g: string[] = [];
  CUTS.forEach((_, i) => g.push(`[${i}:v]setpts=PTS-STARTPTS,settb=1/${FPS},fps=${FPS}[c${i}]`));
  g.push(`[${endIn}:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p,settb=1/${FPS},fps=${FPS}[endcard]`);
  // Hard cuts join end to end; a cut with a fade dissolves, slides or zooms in over the end of the one before.
  let acc = 'c0';
  for (let i = 1; i <= n; i++) {
    const input = i < n ? `c${i}` : 'endcard', fade = i < n ? CUTS[i].fade : ['fade', END_FADE] as [string, number], name = `v${i}`;
    g.push(fade ? `[${acc}][${input}]xfade=transition=${fade[0]}:duration=${fade[1]}:offset=${(i < n ? at(i) : endAt).toFixed(4)}[${name}]` : `[${acc}][${input}]concat=n=2:v=1:a=0,settb=1/${FPS},fps=${FPS}[${name}]`);acc = name;
  }
  let last = acc;
  const over = (input: string, x: string, y: string, enable: string) => { const name = `o${g.length}`;g.push(`[${last}][${input}]overlay=x='${x}':y='${y}':enable='${enable}'[${name}]`);last = name; };
  g.push(`[${titleIn}:v]format=rgba,fade=t=in:st=0.2:d=0.5:alpha=1,fade=t=out:st=${times[1] - 0.5}:d=0.4:alpha=1[title]`);
  over('title', '0', '0', `lt(t,${times[1]})`);
  // Captions slide in from the left and back out, easing at both ends.
  CAPTIONS.forEach(([, cut, length], i) => {
    const t0 = at(cut) + 0.1, t1 = t0 + length, ease = (p: string) => `(${p})*(${p})*(3-2*(${p}))`, inP = `clip((t-${t0})/0.35,0,1)`, outP = `clip((t-${t1 - 0.3})/0.3,0,1)`;
    over(`${capIn + i}:v`, `-w*(1-${ease(inP)})-w*${ease(outP)}`, `H-h-${Math.round(90 * K)}`, `between(t,${t0},${t1})`);
  });
  g.push(`color=c=white:s=${W}x${H}:r=${FPS}:d=${total}[white]`);
  for (const t of FLASHES) { const name = `f${Math.round(t * 100)}`;g.push(`[${last}][white]overlay=enable='between(t,${t},${t + 2 / FPS})'[${name}]`);last = name; }
  g.push(`[${last}]fade=t=out:st=${total - 0.4}:d=0.4[video]`);
  // Each track crossfades into the next; the city drive hears its music through the car radio.
  MUSIC.forEach(([, , , , radio], i) => {
    const { start, end } = spans[i], length = end - start, delay = Math.round(start * 1000), last = i === MUSIC.length - 1;
    const tone = radio ? 'highpass=f=220,lowpass=f=4200,acompressor=threshold=0.1:ratio=4,volume=1.6,' : '';
    g.push(`[${musicIn + i}:a]aresample=48000,${tone}afade=t=in:d=${i ? 0.35 : 0.2},afade=t=out:st=${last ? length - 0.9 : length}:d=${last ? 0.9 : 0.4},adelay=${delay}|${delay}[m${i}]`);
  });
  g.push(`${MUSIC.map((_, i) => `[m${i}]`).join('')}amix=inputs=${MUSIC.length}:normalize=0,volume=0.9,atrim=0:${total},alimiter=limit=0.95[audio]`);
  args.push('-filter_complex', g.join(';'), '-map', '[video]', '-map', '[audio]', '-t', String(total), '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', master);
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  // The site streams a lighter copy; the master is for uploading to video sites, which re-encode it.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at(3) + 1.2), '-i', output, '-frames:v', '1', '-q:v', '3', poster]);
  console.log(`Ara Play promo: ${total.toFixed(1)} s → ${output} (master: ${master})`);
} finally { rmSync(work, { recursive: true, force: true }); }
