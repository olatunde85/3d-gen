import {MUSIC_TRACKS,defaultMusic,type MusicSettings} from './presentation';
type Output=Pick<HTMLAudioElement,'src'|'loop'|'preload'|'volume'|'currentTime'|'paused'|'play'|'pause'|'load'|'onerror'|'removeAttribute'>&Partial<Pick<HTMLAudioElement,'playbackRate'>>;
/** Native streaming keeps full recorded tracks out of decoded PCM memory. No audio before user play. */
export class GameMusic {
 private output?:Output;private settings=defaultMusic();private wanted=false;private muted=false;private generation=0;
 private requested=false;private intensity=1;error='';state:'idle'|'loading'|'playing'|'paused'|'error'='idle';
 constructor(private baseUrl:string,private create:()=>Output=()=>new Audio()){}
 configure(settings:MusicSettings,rewind=false){
  const changed=settings.track!==this.settings.track;this.settings={...settings};
  if(changed){this.stopOutput();this.error='';if(this.output){this.output.onerror=null;this.output.removeAttribute('src');this.output.load();this.output=undefined;}}
  if(rewind&&this.output)try{this.output.currentTime=0;}catch{/* An unloaded element already starts at zero. */}
  this.sync();
 }
 /** Arcade modes build the music up with pace: 0 is calm, 1 is full; tempo rises a little and pitch stays. */
 setIntensity(value:number){const v=Math.max(0,Math.min(1,value));if(Math.abs(v-this.intensity)<.02)return;this.intensity=v;if(this.output){this.output.volume=this.settings.volume*(1-.18*(1-v));if('playbackRate' in this.output)this.output.playbackRate=1+.07*v;}}
 setPlaying(value:boolean){if(this.wanted===value)return;this.wanted=value;if(value)this.error='';this.sync();}
 setMuted(value:boolean){if(this.muted===value)return;this.muted=value;if(!value)this.error='';this.sync();}
 /** Retry on an explicit user gesture after browser autoplay or an audio device interruption. */
 unlock(){if(this.error||this.state==='playing'&&this.output?.paused){this.error='';if(this.requested)this.stopOutput();this.sync();}}
 private stopOutput(){this.generation++;this.requested=false;this.output?.pause();this.state='paused';}
 private sync(){
  const track=MUSIC_TRACKS.find(t=>t.id===this.settings.track);
  if(!this.wanted||this.muted||!track?.file||this.settings.volume===0){if(this.requested)this.stopOutput();if(!track?.file)this.state='idle';return;}
  if(this.error)return;
  try{
   this.output??=this.create();const output=this.output,url=new URL(`media/music/${track.file}`,this.baseUrl).href;
   if(output.src!==url){this.stopOutput();output.preload='none';output.loop=true;output.src=url;output.onerror=()=>this.failed('Background music could not be loaded.');}
   output.volume=this.settings.volume*(1-.18*(1-this.intensity));
   if(this.requested)return;this.requested=true;this.state='loading';const generation=this.generation;
   void output.play().then(()=>{if(generation===this.generation&&this.requested)this.state='playing';}).catch(error=>{if(generation===this.generation&&this.requested)this.failed(error?.name==='NotAllowedError'?'Tap the sound button to enable music.':'Background music could not be played.');});
  }catch{this.failed('Background music is unavailable in this browser.');}
 }
 private failed(message:string){this.stopOutput();this.error=message;this.state='error';}
 stop(){this.wanted=false;this.stopOutput();}
}
