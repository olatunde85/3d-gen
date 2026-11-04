/** Optional, pinned speech fixtures for local integration tests or a licensed model mirror. */
import { mkdir, stat, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { MODEL_BASE } from '../src/studio/audio/tts';
const root=resolve(process.env.STUDIO_TTS_FIXTURE??'out/studio-speech-model');
const files=['onnx/tts.json','onnx/unicode_indexer.json',...['duration_predictor','text_encoder','vector_estimator','vocoder'].map(n=>`onnx/${n}.onnx`),...['F1','F2','M1','M2'].map(v=>`voice_styles/${v}.json`),'LICENSE'];
for(const name of files){
 const target=join(root,name);if(await stat(target).then(s=>s.size>0,()=>false)){console.log('Cached',name);continue;}
 await mkdir(dirname(target),{recursive:true});const partial=target+'.partial';
 try{console.log('Downloading',name);const response=await fetch(`${MODEL_BASE}/${name}`,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${name}`);const data=new Uint8Array(await response.arrayBuffer());await writeFile(partial,data);await rename(partial,target);console.log('Saved',name,(data.byteLength/1024/1024).toFixed(1)+' MiB');}
 catch(error){await rm(partial,{force:true});throw error;}
}
console.log(`Speech fixtures ready: ${root}\nModel terms: ${join(root,'LICENSE')}\nRun: npm run test:studio -- --audio`);
