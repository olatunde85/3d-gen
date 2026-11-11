/** One streamed engine loop. Gesture, pause, mute and project changes cannot stack playback. */
export class EngineSound {
 private audio?:HTMLAudioElement;private wanted=false;private requested=false;private generation=0;private failed=false;
 update(playing:boolean,speed:number,enabled:boolean){
  this.wanted=playing&&enabled;if(!this.wanted){this.stop();return;}
  if(this.audio){this.audio.volume=.045+Math.min(.08,Math.abs(speed)*.008);this.audio.playbackRate=.7+Math.min(.8,Math.abs(speed)*.065);}
  this.play();
 }
 unlock(){this.failed=false;if(this.wanted)this.play();}
 private play(){if(this.requested||this.failed)return;try{if(!this.audio){this.audio=new Audio(new URL(`${import.meta.env.BASE_URL}media/effects/car-engine.mp3`,location.href).href);this.audio.loop=true;this.audio.preservesPitch=false;this.audio.preload='none';this.audio.onerror=()=>{this.failed=true;this.stop();};this.audio.volume=.045;}this.requested=true;const generation=++this.generation;void this.audio.play().catch(()=>{if(generation===this.generation){this.requested=false;this.failed=true;}});}catch{this.requested=false;}}
 stop(){if(this.requested||this.audio&&!this.audio.paused){this.generation++;this.requested=false;this.audio?.pause();}}
}
