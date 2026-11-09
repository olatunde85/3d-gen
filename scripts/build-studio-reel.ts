/**
 * Cut the rendered reel scenes into the Ara 3D Studio reel for the landing page.
 * Render first: npm run test:studio -- --reel. Then: npm run build:studio-reel.
 * The kept part of each scene, played a little faster, with short crossfades, each scene's own sound effects, and one music track whose ending lands on the
 * finale. The finale ends by zooming out of the picture into the editor that made it. Writes
 * public/media/ara-studio-reel.mp4 and its poster, and the silent README preview docs/media/ara-studio-reel.gif.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { REEL } from '../src/studio/examples/reel';

const root = resolve(import.meta.dirname, '..'), folder = resolve(process.argv[2] ?? join(root, 'out/studio-expansion'));
const output = join(root, 'public/media/ara-studio-reel.mp4'), poster = join(root, 'public/media/ara-studio-reel-poster.jpg'), gif = join(root, 'docs/media/ara-studio-reel.gif');
const music = join(root, 'public/media/music/adventure-trailer-600429.mp3'), MUSIC_END = 74.2, FADE = 0.2, SPEED = 1.25;
const scenes = REEL.map((_, i) => join(folder, `reel-${String(i + 1).padStart(2, '0')}.mp4`)), editor = join(folder, 'reel-editor.png');
for (const file of [...scenes, editor]) if (!existsSync(file)) throw Error(`Render the reel scenes first (npm run test:studio -- --reel): ${file} is missing.`);
// The editor screenshot and where the film picture sits in it; the zoom-out is worked at twice the output size.
const shot = JSON.parse(readFileSync(join(folder, 'reel-editor.json'), 'utf8')) as { width: number; height: number; film: { x: number; y: number; width: number; height: number } };
const W = 2560, H = 1440, k = W / shot.width, even = (n: number) => Math.round(n / 2) * 2;
const film = { x: Math.round(shot.film.x * k), y: Math.round(shot.film.y * k), w: even(shot.film.width * k), h: even(shot.film.width * k * 9 / 16) };
const REVEAL = 3, ZOOM = 1.4;

const probe = (file: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { encoding: 'utf8' })) as { format: { duration: string }; streams: { codec_type: string }[] };
const info = scenes.map((file, i) => { const p = probe(file), { from, to } = REEL[i]; return { file, from, length: Math.min(Number(p.format.duration), to) - from, duration: (Math.min(Number(p.format.duration), to) - from) / SPEED, audio: p.streams.some((s) => s.codec_type === 'audio') }; });
const total = info.reduce((sum, s) => sum + s.duration, 0) - FADE * (info.length - 1);

// Inputs: the scenes, then the music starting where its ending meets ours.
const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
for (const s of info) args.push('-ss', String(s.from), '-t', String(s.length), '-i', s.file);
args.push('-ss', String(Math.max(0, MUSIC_END - total)), '-i', music);
args.push('-loop', '1', '-t', String(REVEAL + 1), '-i', editor);
const track = info.length, still = info.length + 1;
const graph: string[] = [];
info.forEach((s, i) => {
  graph.push(`[${i}:v]setpts=(PTS-STARTPTS)/${SPEED},fps=30,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p[v${i}]`);
  // Every scene's sound lasts exactly as long as its picture; scenes without sound get silence.
  const sound = s.audio ? `[${i}:a]asetpts=PTS-STARTPTS,atempo=${SPEED},` : `anullsrc=r=48000:cl=stereo,`;
  graph.push(`${sound}aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${s.duration.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
});
let video = 'v0', audio = 'a0', offset = info[0].duration;
for (let i = 1; i < info.length; i++) {
  offset -= FADE;
  graph.push(`[${video}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[vx${i}]`);
  graph.push(`[${audio}][a${i}]acrossfade=d=${FADE}[ax${i}]`);
  video = `vx${i}`; audio = `ax${i}`; offset += info[i].duration;
}
// The ending: the picture sits in the editor's preview, and the view eases out from it to the whole editor.
const T0 = total - REVEAL, ease = `st(0,clip((in/30-0.0)/${ZOOM},0,1));ld(0)*ld(0)*(3-2*ld(0))`;
graph.push(`[${video}]split[main][tail]`, `[main]trim=0:${T0.toFixed(3)},setpts=PTS-STARTPTS[head]`);
graph.push(`[tail]trim=start=${T0.toFixed(3)},setpts=PTS-STARTPTS,scale=${film.w}:${film.h}:flags=lanczos[inset]`);
graph.push(`[${still}:v]fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p[desk]`, `[desk][inset]overlay=${film.x}:${film.y}:shortest=1[stage]`);
graph.push(`[stage]zoompan=z='${W}/(${film.w}+(${W}-${film.w})*(${ease}))':x='${film.x}*(1-(${ease}))':y='${film.y}*(1-(${ease}))':d=1:s=1280x720:fps=30,setsar=1[zoomed]`);
graph.push(`[head][zoomed]concat=n=2:v=1:a=0[joined]`);
graph.push(`[joined]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.6).toFixed(3)}:d=0.6[vout]`);
graph.push(`[${track}:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.55,afade=t=in:st=0:d=0.6,afade=t=out:st=${(total - 1.2).toFixed(3)}:d=1.2[music]`);
graph.push(`[${audio}][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`);
args.push('-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(3),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output);
execFileSync('ffmpeg', args, { stdio: 'inherit' });
// The poster is the finale under the title, just before the zoom-out.
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', (total - REVEAL - 0.2).toFixed(2), '-i', output, '-frames:v', '1', '-q:v', '4', poster], { stdio: 'inherit' });
console.log(`Studio reel: ${total.toFixed(1)} s, ${(statSync(output).size / 1024 / 1024).toFixed(2)} MiB → ${output}`);
console.log(`Poster: ${(statSync(poster).size / 1024).toFixed(0)} KiB → ${poster}`);

// The README preview: full RGB until the final quantization (a single global palette bands skin and clothing), within GitHub's image budget.
const scratch = mkdtempSync(join(tmpdir(), 'ara-reel-')), frames = join(scratch, 'reel.webp');
let fits = false;
for (const { width, fps, colours } of [{ width: 640, fps: 10, colours: 256 }, { width: 640, fps: 8, colours: 192 }, { width: 560, fps: 8, colours: 160 }]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', output, '-vf', `fps=${fps},scale=${width}:-2:flags=lanczos`, '-an', '-c:v', 'libwebp_anim', '-lossless', '1', '-compression_level', '4', '-loop', '0', frames], { stdio: 'inherit' });
  await sharp(frames, { animated: true }).gif({ reuse: false, effort: 10, dither: 0, colours, interFrameMaxError: 8, interPaletteMaxError: 8 }).toFile(gif);
  console.log(`README GIF: ${width}px, ${fps} fps, ${colours} colours, ${(statSync(gif).size / 1024 / 1024).toFixed(2)} MiB → ${gif}`);
  if ((fits = statSync(gif).size <= 9 * 1024 * 1024)) break;
}
rmSync(scratch, { recursive: true, force: true });
if (!fits) throw Error('The README GIF exceeds its 9 MiB budget. Adjust the encoding before publishing.');
