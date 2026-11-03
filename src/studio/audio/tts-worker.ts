/** Local Supertonic 2 inference. Model inputs follow Supertone's MIT Web example. */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={wasm:new URL(wasmUrl,import.meta.url).href,mjs:new URL(wasmModuleUrl,import.meta.url).href};
type Config={ae:{sample_rate:number;base_chunk_size:number};ttl:{latent_dim:number;chunk_compress_factor:number}};
type Style={style_ttl:{dims:number[];data:unknown[]};style_dp:{dims:number[];data:unknown[]}};
let ready:Promise<void>|undefined,base='',config:Config,indexer:number[],sessions:ort.InferenceSession[]=[];
const send=(value:unknown)=>self.postMessage(value);
async function resource(path:string):Promise<ArrayBuffer>{
  const url=base+'/'+path;let cache:Cache|undefined;try{cache=await caches.open('ara-studio-tts-v1');const stored=await cache.match(url);if(stored)return stored.arrayBuffer();}catch{/* Fetch still works when browser caching is disabled. */}
  const response=await fetch(url);if(!response.ok)throw Error(`Could not download ${path} (${response.status}). Check your connection or speech-model URL.`);
  const total=Number(response.headers.get('content-length'))||0,reader=response.body?.getReader();if(!reader)return response.arrayBuffer();
  const chunks:Uint8Array[]=[];let length=0,last=0;
  for(;;){const {value,done}=await reader.read();if(done)break;chunks.push(value);length+=value.byteLength;if(length-last>1024*1024){send({type:'progress',message:`Downloading ${path.split('/').pop()} · ${(length/1024/1024).toFixed(0)}${total?' / '+(total/1024/1024).toFixed(0):''} MB`});last=length;}}
  const data=new Uint8Array(length);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}
  if(cache)try{await cache.put(url,new Response(data,{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* A complete model can still be used without a persistent cache. */}
  return data.buffer;
}
const json=async<T>(path:string)=>JSON.parse(new TextDecoder().decode(await resource(path)))as T;
async function load(modelBase:string){
  if(base&&base!==modelBase){for(const session of sessions)await session.release();sessions=[];ready=undefined;}
  base=modelBase.replace(/\/$/,'');
  ready??=(async()=>{config=await json<Config>('onnx/tts.json');indexer=await json<number[]>('onnx/unicode_indexer.json');
    for(const name of ['duration_predictor','text_encoder','vector_estimator','vocoder']){send({type:'progress',message:`Preparing ${name.replace(/_/g,' ')}…`});const bytes=await resource(`onnx/${name}.onnx`);sessions.push(await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'}));}
  })().catch(async error=>{for(const session of sessions)await session.release().catch(()=>{});sessions=[];ready=undefined;throw error;});await ready;
}
function normalize(text:string){
  let out=text.normalize('NFKD').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').replace(/[–—‑]/g,'-').replace(/[“”]/g,'"').replace(/[‘’`´]/g,"'").replace(/[\[\]|/_#→←]/g,' ').replace(/[♥☆♡©\\]/g,'').replace(/@/g,' at ').replace(/\s+/g,' ').trim();
  if(!out)throw Error('Enter dialogue containing words.');if(!/[.!?;:,'"…]$/.test(out))out+='.';return `<en>${out}</en>`;
}
async function infer(text:string,voice:string):Promise<Float32Array>{
  const processed=normalize(text),codes=Array.from(processed),ids=new BigInt64Array(codes.map(c=>BigInt(indexer[c.codePointAt(0)!]??-1))),textIds=new ort.Tensor('int64',ids,[1,ids.length]),mask=new ort.Tensor('float32',new Float32Array(ids.length).fill(1),[1,1,ids.length]);
  const style=await json<Style>(`voice_styles/${voice}.json`),ttl=new ort.Tensor('float32',Float32Array.from(style.style_ttl.data.flat(Infinity)as number[]),style.style_ttl.dims),dp=new ort.Tensor('float32',Float32Array.from(style.style_dp.data.flat(Infinity)as number[]),style.style_dp.dims);
  const held:ort.Tensor[]=[textIds,mask,ttl,dp];
  try{
    const durationResult=await sessions[0].run({text_ids:textIds,style_dp:dp,text_mask:mask}),duration=Number(durationResult.duration.data[0]);Object.values(durationResult).forEach(t=>t.dispose());
    if(!Number.isFinite(duration)||duration<=0||duration>60)throw Error('This dialogue is too long. Split it into shorter speech clips.');
    const encoded=await sessions[1].run({text_ids:textIds,style_ttl:ttl,text_mask:mask});held.push(...Object.values(encoded));
    const chunk=config.ae.base_chunk_size*config.ttl.chunk_compress_factor,frames=Math.ceil(Math.floor(duration*config.ae.sample_rate)/chunk),dims=config.ttl.latent_dim*config.ttl.chunk_compress_factor;
    let seed=2166136261;for(const c of text+voice)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return (seed+.5)/4294967296;};
    let latent=new Float32Array(frames*dims);for(let i=0;i<latent.length;i++)latent[i]=Math.sqrt(-2*Math.log(Math.max(.0001,random())))*Math.cos(2*Math.PI*random());
    const latentMask=new ort.Tensor('float32',new Float32Array(frames).fill(1),[1,1,frames]),totalStep=new ort.Tensor('float32',new Float32Array([8]),[1]);held.push(latentMask,totalStep);
    for(let step=0;step<8;step++){
      send({type:'progress',message:`Generating speech · ${step+1} / 8`});const xt=new ort.Tensor('float32',latent,[1,dims,frames]),current=new ort.Tensor('float32',new Float32Array([step]),[1]);
      const result=await sessions[2].run({noisy_latent:xt,text_emb:encoded.text_emb,style_ttl:ttl,latent_mask:latentMask,text_mask:mask,current_step:current,total_step:totalStep});latent=Float32Array.from(result.denoised_latent.data as Float32Array);xt.dispose();current.dispose();Object.values(result).forEach(t=>t.dispose());
    }
    const xt=new ort.Tensor('float32',latent,[1,dims,frames]);held.push(xt);const output=await sessions[3].run({latent:xt});const waveform=Float32Array.from(output.wav_tts.data as Float32Array).slice(0,Math.floor(duration*config.ae.sample_rate));Object.values(output).forEach(t=>t.dispose());return waveform;
  }finally{for(const tensor of held)tensor.dispose();}
}
self.onmessage=async(event:MessageEvent<{text:string;voice:string;base:string}>)=>{
  try{
    const {text,voice,base}=event.data;if(text.length>600||!text.trim()||!['F1','F2','M1','M2'].includes(voice))throw Error('Choose a voice and enter up to 600 characters.');
    await load(base);const chunks=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)??[text],audio:Float32Array[]=[];
    for(const sentence of chunks){const parts=sentence.match(/[\s\S]{1,250}(?:\s|$)|[\s\S]{1,250}/g)??[sentence];for(const part of parts){if(part.trim())audio.push(await infer(part.trim(),voice));}}
    const gap=Math.round(config.ae.sample_rate*.15),length=audio.reduce((n,c)=>n+c.length,0)+Math.max(0,audio.length-1)*gap;if(length/config.ae.sample_rate>60)throw Error('Generated speech exceeds 60 seconds. Shorten the script.');
    if(!length||audio.some(chunk=>chunk.some(sample=>!Number.isFinite(sample))))throw Error('The speech engine returned invalid audio. Try generating a shorter take.');
    const samples=new Float32Array(length);let offset=0;for(const chunk of audio){samples.set(chunk,offset);offset+=chunk.length+gap;}
    (self as unknown as Worker).postMessage({type:'result',samples,sampleRate:config.ae.sample_rate},[samples.buffer]);
  }catch(error){send({type:'error',message:(error as Error).message});}
};
