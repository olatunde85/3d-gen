/** Original, deterministic instrumental scores; no external recordings or music downloads. */
import { MUSIC_TRACKS, type MusicId } from './schema';
export function addMusic(ctx:BaseAudioContext,id:MusicId,duration:number,destination:AudioNode){
  if(id==='none')return;const track=MUSIC_TRACKS.find(t=>t.id===id)!,beat=60/track.bpm;
  const roots=id==='suspense'?[38,38,41,37]:id==='cinematic'?[45,41,48,43]:id==='lofi'?[48,45,41,43]:id==='ambient'?[48,55,45,53]:id==='playful'?[60,57,65,67]:[50,57,47,55];
  const minor=['cinematic','suspense','lofi'].includes(id),chord=[0,minor?3:4,7,id==='lofi'||id==='ambient'?11:12];
  const bus=ctx.createGain();bus.gain.value=.6;bus.connect(destination);
  const freq=(midi:number)=>440*2**((midi-69)/12);
  const note=(midi:number,start:number,length:number,level:number,type:OscillatorType='sine',pan=0)=>{
    if(start>=duration)return;const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),panner=ctx.createStereoPanner();osc.type=type;osc.frequency.value=freq(midi);filter.type='lowpass';filter.frequency.value=type==='triangle'?1800:3500;panner.pan.value=pan;
    const end=Math.min(duration,start+length),attack=Math.min(id==='ambient'?.45:.035,(end-start)/3);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+attack);gain.gain.setTargetAtTime(.0001,start+attack,Math.max(.03,(end-start-attack)/3));gain.gain.setValueAtTime(0,end);osc.connect(filter).connect(gain).connect(panner).connect(bus);osc.start(start);osc.stop(end);
  };
  let seed=81273;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.12),ctx.sampleRate),samples=noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(random()*2-1)*(1-i/samples.length)**3;
  const hit=(at:number,kind:'kick'|'hat'|'snare')=>{if(at>=duration)return;if(kind==='kick'){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(100,at);o.frequency.exponentialRampToValueAtTime(42,at+.13);g.gain.setValueAtTime(.22,at);g.gain.exponentialRampToValueAtTime(.0001,at+.18);o.connect(g).connect(bus);o.start(at);o.stop(Math.min(at+.2,duration));}else{const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=noise;f.type=kind==='hat'?'highpass':'bandpass';f.frequency.value=kind==='hat'?6500:2200;g.gain.value=kind==='hat'?.045:.09;s.connect(f).connect(g).connect(bus);s.start(at);s.stop(Math.min(duration,at+.12));}};
  for(let bar=0;bar*beat*4<duration;bar++){
    const at=bar*beat*4,root=roots[bar%roots.length];
    for(let i=0;i<chord.length;i++)note(root+chord[i]+(id==='playful'?0:12),at,beat*3.9,.085,'triangle',(i-1.5)*.28);
    note(root-12,at,beat*3.5,id==='suspense'?.16:.13,'sine');
    const pattern=id==='suspense'?[0,0,7,0,3,0,7,1]:[0,7,12,7,4,7,14,12];
    if(id!=='ambient')for(let step=0;step<8;step++){const n=id==='suspense'?pattern[step]:pattern[(step+bar)%8];note(root+12+n,at+step*beat/2,beat*.8,id==='cinematic'?.055:.085,'sine',step%2?.22:-.22);}
    else note(root+24+(bar%2?7:4),at+beat,beat*2.8,.055,'sine',.25);
    if(['lofi','playful','uplifting'].includes(id))for(let b=0;b<4;b++){hit(at+b*beat,b%2?'snare':'kick');hit(at+b*beat+beat*.5,'hat');}
  }
}
