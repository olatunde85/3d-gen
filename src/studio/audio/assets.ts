/** Local, content-addressed audio. JSON holds IDs; ZIP project bundles carry the actual WAV files. */
export interface AudioAsset {id:string;name:string;blob:Blob;duration:number;sampleRate:number;channels:number}
let database:Promise<IDBDatabase>|undefined;
const cache=new Map<string,AudioAsset>();
function db(){return database??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('ara-studio-audio',1);request.onupgradeneeded=()=>request.result.createObjectStore('assets',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(Error('Audio storage is unavailable in this browser.'));};
});}
export async function getAsset(id:string):Promise<AudioAsset|undefined>{
  if(cache.has(id))return cache.get(id);const database=await db();return new Promise((resolve,reject)=>{const request=database.transaction('assets').objectStore('assets').get(id);request.onsuccess=()=>{if(request.result)cache.set(id,request.result);resolve(request.result);};request.onerror=()=>reject(Error('Could not read the audio library.'));});
}
export async function putAsset(blob:Blob,name:string,duration:number,sampleRate:number,channels:number):Promise<AudioAsset>{
  if(blob.size>24*1024*1024||duration<=0||duration>60.05)throw Error('Use speech audio up to 60 seconds and 24 MiB.');
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const asset={id,name:name.slice(0,120),blob,duration,sampleRate,channels},database=await db();
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction('assets','readwrite');tx.objectStore('assets').put(asset);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Not enough browser storage for this audio.'));tx.onabort=()=>reject(Error('Audio could not be saved.'));});
  cache.set(id,asset);return asset;
}
export function wavBlob(channels:readonly Float32Array[],sampleRate:number):Blob{
  const length=channels[0]?.length??0;if(!length||channels.some(c=>c.length!==length)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||channels.length>2)throw Error('Invalid audio waveform.');
  const bytes=new ArrayBuffer(44+length*channels.length*2),view=new DataView(bytes),text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels.length,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels.length*2,true);view.setUint16(32,channels.length*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes.byteLength-44,true);
  let at=44;for(let i=0;i<length;i++)for(const channel of channels){const v=Math.max(-1,Math.min(1,channel[i]));view.setInt16(at,v<0?v*32768:v*32767,true);at+=2;}
  return new Blob([bytes],{type:'audio/wav'});
}
export async function importAudio(file:Blob,name:string):Promise<AudioAsset>{
  if(!file.size||file.size>24*1024*1024)throw Error('Choose an audio file smaller than 24 MiB.');
  const ctx=new OfflineAudioContext(2,1,48000);let buffer:AudioBuffer;
  try{buffer=await ctx.decodeAudioData(await file.arrayBuffer());}catch{throw Error('This audio could not be decoded. Try a WAV, MP3, M4A or Ogg file.');}
  if(buffer.duration>60.05)throw Error('Speech files must be no longer than 60 seconds.');
  const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));return putAsset(wavBlob(channels,buffer.sampleRate),name,buffer.duration,buffer.sampleRate,channels.length);
}
export async function decodeAsset(id:string,context:BaseAudioContext):Promise<AudioBuffer>{const asset=await getAsset(id);if(!asset)throw Error('An audio file is missing on this device. Reattach it in Sound, or open the audio project bundle.');return context.decodeAudioData(await asset.blob.arrayBuffer());}
