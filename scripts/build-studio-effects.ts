/** Compress the supplied one-shot WAVs without trimming or time-stretching their attacks/tails. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SOUND_EFFECTS } from '../src/studio/audio/effects-catalog';
const root=resolve(import.meta.dirname,'..'),out=join(root,'public/media/effects');mkdirSync(out,{recursive:true});
let before=0,after=0;
for(const effect of SOUND_EFFECTS){
 const source=join(root,'sound-for-ara',effect.source),target=join(out,effect.file);
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',source],{encoding:'utf8'}).trim());
 if(!Number.isFinite(duration)||Math.abs(duration-effect.duration)>.001)throw Error(`Update the effects catalogue duration for ${effect.name}: source is ${duration}s`);
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',source,'-map','0:a:0','-vn','-map_metadata','-1','-af','volume=-1dB','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2','-metadata',`title=${effect.name}`,target],{stdio:'inherit'});
 const original=statSync(source).size,compressed=statSync(target).size;if(compressed>=original)throw Error(`Sound effect compression failed for ${effect.name}`);before+=original;after+=compressed;console.log(`${effect.name}: ${original} → ${compressed} bytes`);
}
writeFileSync(join(out,'CREDITS.txt'),`Ara Studio sound effects\n\nRecordings supplied by the project owner in sound-for-ara.\nAudio retains its own rights and is not covered by Ara's MIT code licence.\nWeb versions use FFmpeg VBR MP3 compression at 48 kHz stereo, with 1 dB\nof additional headroom. No trimming, looping or time-stretching is applied.\n\n${SOUND_EFFECTS.map(s=>`${s.name}\nOriginal: ${s.source}\nWeb file: ${s.file}\n`).join('\n')}`);
console.log(`Effects: ${before} → ${after} bytes (${Math.round((1-after/before)*100)}% smaller)`);
