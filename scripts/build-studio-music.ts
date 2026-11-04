/** Rebuild compact, loudness-matched soundtracks from the owner's original music-for-ara files. Requires FFmpeg. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MUSIC_TRACKS } from '../src/studio/audio/tracks';
const root=resolve(import.meta.dirname,'..'),out=join(root,'public/media/music');mkdirSync(out,{recursive:true});
let before=0,after=0;
for(const track of MUSIC_TRACKS){
  if(!track.file)continue;const source=join(root,'music-for-ara',track.source),target=join(out,track.file);
  const measured=spawnSync('ffmpeg',['-hide_banner','-nostdin','-i',source,'-vn','-af','loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-'],{encoding:'utf8'});if(measured.status!==0)throw Error(measured.stderr||'FFmpeg measurement failed');const probe=measured.stderr;
  const match=probe.match(/\{\s*"input_i"[\s\S]*?\}/);if(!match)throw Error(`Could not measure ${track.source}`);
  const m=JSON.parse(match[0]),filter=`loudnorm=I=-20:TP=-2:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-af',filter,'-ar','44100','-ac','2','-c:a','libmp3lame','-q:a','3','-metadata',`title=${track.name}`,'-metadata',`artist=${track.artist}`,target],{stdio:'inherit'});
  const original=statSync(source).size,optimized=statSync(target).size;if(optimized>=original||optimized>25*1024*1024)throw Error(`Compression budget exceeded for ${track.file}`);before+=original;after+=optimized;
  console.log(`${track.name}: ${(original/1024/1024).toFixed(2)} → ${(optimized/1024/1024).toFixed(2)} MiB`);
}
writeFileSync(join(out,'CREDITS.txt'),`Ara Studio recorded music\n\nTracks supplied in music-for-ara by the project owner. Copyright belongs to\nthe respective creators; the music is not covered by Ara's MIT code licence.\nThese are compressed, loudness-matched derivatives for use in Studio films.\n\n${MUSIC_TRACKS.filter(t=>t.file).map(t=>`${t.name}\nArtist: ${t.artist}\nOriginal: ${t.source}\nWeb file: ${t.file}\n`).join('\n')}`);
console.log(`Music: ${(before/1024/1024).toFixed(2)} → ${(after/1024/1024).toFixed(2)} MiB (${Math.round((1-after/before)*100)}% smaller)`);
