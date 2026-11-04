/** Render first: npm run test:studio -- --example. Then: npm run build:studio-example-gif */
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const source=resolve(process.argv[2]??'out/studio-expansion/warehouse-example.mp4');
if(!existsSync(source))throw Error('Render the current example first: npm run test:studio -- --example');
const published=resolve('docs/media/studio-warehouse.gif'),review=resolve('out/studio-example-review');mkdirSync(review,{recursive:true});
const fullColour=join(review,'warehouse-full-colour.webp'),output=join(review,'warehouse-preview.gif');
const ffmpeg=(args:string[])=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],{stdio:'inherit'});
const limit=9*1024*1024;let selectedWidth=0;
for(const {width,fps,colors}of [{width:640,fps:10,colors:256},{width:640,fps:8,colors:192}]){
 // Keep full RGB detail until final GIF quantization; a global palette noticeably bands clothing/skin.
 ffmpeg(['-i',source,'-vf',`fps=${fps},scale=${width}:-1:flags=lanczos`,'-an','-c:v','libwebp_anim','-lossless','1','-compression_level','4','-loop','0',fullColour]);
 await sharp(fullColour,{animated:true}).gif({reuse:false,effort:10,dither:0,colours:colors,interFrameMaxError:8,interPaletteMaxError:8}).toFile(output);
 console.log(`Warehouse GIF: ${width}px, ${fps} fps, ${colors} colours, ${(statSync(output).size/1024/1024).toFixed(2)} MiB`);
 if(statSync(output).size<=limit){selectedWidth=width;break;}
}
if(!selectedWidth)throw Error('The README GIF exceeds its 9 MiB budget. Adjust the encoding before publishing.');
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,nb_read_frames:format=duration','-of','json',output],{encoding:'utf8'}));
if(probe.streams[0].width!==selectedWidth||probe.streams[0].height!==selectedWidth*9/16||Number(probe.streams[0].nb_read_frames)<2||Math.abs(Number(probe.format.duration)-30)>.15)throw Error('The GIF does not preserve the example’s dimensions and full 30-second timing.');
copyFileSync(output,published);console.log('Verified GIF:',JSON.stringify(probe));
ffmpeg(['-i',output,'-vf','fps=1/5,scale=480:-1,tile=3x2','-frames:v','1','-update','1',join(review,'gif-contact-sheet.png')]);
ffmpeg(['-i',output,'-ss','9.8','-frames:v','1','-update','1',join(review,'gif-dialogue.png')]);
