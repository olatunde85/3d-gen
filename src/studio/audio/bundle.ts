import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Catalog } from '../../core/assets';
import type { StudioProject } from '../project';
import { parseStudioInput } from '../assist';
import { getAsset, putAsset } from './assets';
export const MAX_BUNDLE_BYTES=128*1024*1024;
export async function audioProjectBundle(project:StudioProject):Promise<Blob>{
  const files:Record<string,Uint8Array>={'project.json':strToU8(JSON.stringify(project,null,2))};let total=files['project.json'].length;
  for(const id of new Set(project.audio.speech.map(c=>c.asset).filter((id):id is string=>!!id))){const asset=await getAsset(id);if(!asset)throw Error('Some speech audio is missing. Reattach it in Sound before saving the bundle.');total+=asset.blob.size;if(total>MAX_BUNDLE_BYTES)throw Error('The audio project exceeds 128 MiB. Use shorter recordings.');files[`audio/${id}.wav`]=new Uint8Array(await asset.blob.arrayBuffer());}
  return new Blob([zipSync(files,{level:0})],{type:'application/zip'});
}
export async function openAudioBundle(file:File,catalog:Catalog):Promise<StudioProject>{
  if(file.size>MAX_BUNDLE_BYTES+1024*1024)throw Error('Choose an audio project smaller than 128 MiB.');let total=0;
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{if(entry.name!=='project.json'&&!/^audio\/[a-f0-9]{64}\.wav$/.test(entry.name))return false;total+=entry.originalSize;if(entry.originalSize>(entry.name==='project.json'?100_000:24*1024*1024)||total>MAX_BUNDLE_BYTES)throw Error('This project bundle is too large.');return true;}});
  if(!files['project.json'])throw Error('This bundle has no project.json.');const project=parseStudioInput(strFromU8(files['project.json']),catalog);
  for(const id of new Set(project.audio.speech.map(c=>c.asset).filter((id):id is string=>!!id))){const bytes=files[`audio/${id}.wav`];if(!bytes)throw Error('The audio project is missing a referenced recording.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length<44||strFromU8(bytes.slice(0,4))!=='RIFF'||strFromU8(bytes.slice(8,12))!=='WAVE'||view.getUint16(20,true)!==1||view.getUint16(34,true)!==16)throw Error('Use WAV recordings exported by Ara Studio in audio bundles.');
    const channels=view.getUint16(22,true),rate=view.getUint32(24,true);if(channels<1||channels>2||rate<8000||rate>96000)throw Error('Invalid bundled audio format.');
    const duration=(bytes.length-44)/(rate*channels*2),asset=await putAsset(new Blob([bytes.slice().buffer],{type:'audio/wav'}),`Speech ${id.slice(0,8)}`,duration,rate,channels);if(asset.id!==id)throw Error('A bundled recording does not match its asset ID.');
  }
  return project;
}
