/** Bounded, lazy Studio-library effects. Audio failures never affect simulation. */
import {soundEffectById,type SoundEffectId} from '../studio/audio/effects-catalog';
import {heroGuns,gameProjects,type PlayProject} from './project';
import {isGun,weaponProfile} from './weapons';
import {ambientEffect,defaultEnvironment} from './environment';
import type {EscapeGame} from './runtime';
export function gameEffects(project:PlayProject):Set<SoundEffectId>{
 const effects=new Set<SoundEffectId>();for(const p of gameProjects(project)){const e=p.mission.environment??defaultEnvironment();for(const cue of p.story?.cues??[])if(cue.sound)effects.add(cue.sound);if(e.effects){for(const id of ['take-cover-steps','body-fall-thump','bullet-hit','low-punch']as const)effects.add(id);for(const gun of [...heroGuns(p),...p.enemies.map(x=>x.response).filter(isGun)])effects.add(weaponProfile(gun).sound);}const ambient=ambientEffect(e,p.mission.location??'depot');if(ambient!=='none')effects.add(ambient);if(project.mode&&project.mode!=='mission'&&(e.weather==='rain'||e.weather==='sandstorm'))effects.add(e.weather==='rain'?'heavy-rain':'sandstorm');}return effects;
}
export class PlayAudio{
 private context?:AudioContext;private buffers=new Map<SoundEffectId,AudioBuffer>();private fetching=new Map<SoundEffectId,Promise<AudioBuffer|undefined>>();private sources:AudioBufferSourceNode[]=[];private epoch=0;private active=true;
 private melee=0;private horn=0;private game?:EscapeGame;private lastTime=0;private shot=0;private explosion=0;private health=new Map<string,number>();private steps=new Map<string,number>();private clock=0;private pending:{at:number;volume:number}[]=[];private stepSide=0;
 private ambient?:{id:SoundEffectId;source:AudioBufferSourceNode;gain:GainNode};private noise?:AudioBuffer;
 constructor(private readonly base=new URL(import.meta.env?.BASE_URL??'/',typeof location==='undefined'?'http://localhost/':location.href)){}
 get enabled(){return this.active;}set enabled(value:boolean){this.active=value;if(!value)this.silence();}
 unlock(){if(!this.active)return;try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});if(this.game)for(const id of this.needed(this.game))void this.load(id);}catch{/* Optional device audio. */}}
 private needed(g:EscapeGame){const e=g.mission.environment??defaultEnvironment(),ids=new Set<SoundEffectId>();if(e.effects){ids.add('take-cover-steps');ids.add('body-fall-thump');ids.add('bullet-hit');ids.add('low-punch');for(const gun of [g.playerCombat.weapon,g.progression.weapon!=='loadout'?g.progression.unlock??'pistol':'none',...g.enemies.map(x=>x.combat.weapon)].filter(isGun))ids.add(weaponProfile(gun).sound);}const a=ambientEffect(e,g.world.location);if(a!=='none')ids.add(a);return ids;}
 private load(id:SoundEffectId):Promise<AudioBuffer|undefined>{
  if(this.buffers.has(id))return Promise.resolve(this.buffers.get(id));if(this.fetching.has(id))return this.fetching.get(id)!;const effect=soundEffectById(id);if(!effect||!this.context)return Promise.resolve(undefined);
  const promise=fetch(new URL(`media/effects/${effect.file}`,this.base)).then(r=>{if(!r.ok)throw Error('Audio unavailable');return r.arrayBuffer();}).then(b=>this.context!.decodeAudioData(b)).then(b=>{if(this.buffers.size>=8)this.buffers.delete(this.buffers.keys().next().value!);this.buffers.set(id,b);return b;}).catch(()=>undefined).finally(()=>this.fetching.delete(id));this.fetching.set(id,promise);return promise;
 }
 private play(id:SoundEffectId,volume:number,offset=0,duration?:number){
  const ctx=this.context;if(!this.active||ctx?.state!=='running'||volume<=0)return;const epoch=this.epoch,started=performance.now();void this.load(id).then(buffer=>{if(!buffer||epoch!==this.epoch||!this.active||ctx.state!=='running'||performance.now()-started>500)return;try{
   while(this.sources.length>=12){try{this.sources.shift()!.stop();}catch{/* Ended voice. */}}const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=volume;source.connect(gain).connect(ctx.destination);this.sources.push(source);source.onended=()=>{this.sources=this.sources.filter(s=>s!==source);source.disconnect();gain.disconnect();};source.start(0,Math.min(offset,buffer.duration-.01),duration===undefined?undefined:Math.min(duration,buffer.duration-offset));
  }catch{/* Optional audio. */}});
 }
 silence(){this.epoch++;for(const source of this.sources){try{source.stop();}catch{/* Ended. */}}this.sources=[];if(this.ambient){try{this.ambient.source.stop();}catch{/* Ended. */}this.ambient=undefined;}}
 private ambience(g:EscapeGame){
  const e=g.mission.environment??defaultEnvironment(),id=ambientEffect(e,g.world.location);if(!this.active||g.status!=='playing'||id==='none'||e.volume===0){if(this.ambient){try{this.ambient.source.stop();}catch{/* Ended. */}this.ambient=undefined;}return;}
  if(this.ambient?.id===id){this.ambient.gain.gain.value=e.volume*.35;return;}if(!this.context||this.context.state!=='running')return;const epoch=this.epoch;void this.load(id).then(buffer=>{if(!buffer||this.ambient?.id===id||epoch!==this.epoch||!this.active||this.game!==g||g.status!=='playing')return;if(this.ambient){try{this.ambient.source.stop();}catch{/* Ended. */}}const source=this.context!.createBufferSource(),gain=this.context!.createGain();source.buffer=buffer;source.loop=true;gain.gain.value=e.volume*.35;source.connect(gain).connect(this.context!.destination);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();this.ambient={id,source,gain};});
 }
 /** A two-tone car horn. */
 private honk(volume:number){const ctx=this.context;if(!this.active||ctx?.state!=='running')return;const now=ctx.currentTime,gain=ctx.createGain(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2200;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.22),now+.02);gain.gain.setValueAtTime(Math.max(.0002,volume*.22),now+.32);gain.gain.exponentialRampToValueAtTime(.0001,now+.42);filter.connect(gain).connect(ctx.destination);
  for(const f of [392,494]){const o=ctx.createOscillator();o.type='square';o.frequency.value=f;o.connect(filter);o.start(now);o.stop(now+.45);}}
 private blast(volume:number){const ctx=this.context;if(!this.active||ctx?.state!=='running')return;if(!this.noise){this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const data=this.noise.getChannelData(0);let previous=0;for(let i=0;i<data.length;i++){previous=(previous+.3*(Math.random()*2-1))/1.3;data[i]=previous;}}
  const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),now=ctx.currentTime;source.buffer=this.noise;filter.type='lowpass';filter.frequency.setValueAtTime(1400,now);filter.frequency.exponentialRampToValueAtTime(100,now+.8);gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+.85);source.connect(filter).connect(gain).connect(ctx.destination);this.sources.push(source);source.start();source.onended=()=>{this.sources=this.sources.filter(s=>s!==source);source.disconnect();filter.disconnect();gain.disconnect();};
 }
 update(g:EscapeGame,dt:number){
  const e=g.mission.environment??defaultEnvironment();if(this.game!==g||g.time<this.lastTime){this.game=g;this.silence();this.shot=0;this.explosion=0;this.health.clear();this.steps.clear();this.pending=[];this.clock=0;this.melee=0;for(const [id,c]of [['player',g.playerCombat]as const,...g.enemies.map(x=>[x.id,x.combat]as const),...(g.companion?[["companion",g.companion.combat]as const]:[])])this.health.set(id,c.health);if(this.context&&this.active)for(const id of this.needed(g))void this.load(id);}this.lastTime=g.time;this.clock+=dt;
  if(dt<=0)return;this.ambience(g);
  if(!e.effects||e.volume===0)return;const volume=e.volume/.3;
  const meleeEvents=g.events.filter(x=>x.type==='melee-hit'||x.type==='takedown');for(const event of meleeEvents)if(event.time>this.melee){this.melee=event.time;this.play('low-punch',.16*volume,.35,.5);}
  for(const s of g.shots)if(s.id>this.shot){this.shot=s.id;const distance=Math.hypot(s.from.x-g.player.x,s.from.z-g.player.z);this.play(weaponProfile(s.weapon??'pistol').sound,.13*volume/(1+distance*.06));if(s.hit)this.play('bullet-hit',.13*volume/(1+Math.hypot(s.to.x-g.player.x,s.to.z-g.player.z)*.08),.4,.35);}
  if(g.horns>this.horn){this.horn=g.horns;const at=g.hornAt??g.player;this.honk(.5*volume/(1+Math.hypot(at.x-g.player.x,at.z-g.player.z)*.08));}
  for(const x of g.explosions)if(x.id>this.explosion){this.explosion=x.id;this.blast(.6*volume/(1+Math.hypot(x.position.x-g.player.x,x.position.z-g.player.z)*.08));}
  const bodies=[{id:'player',body:g.player,combat:g.playerCombat},...g.enemies.map(body=>({id:body.id,body,combat:body.combat})),...(g.companion?[{id:'companion',body:g.companion,combat:g.companion.combat}]:[])];
  for(const {id,body,combat}of bodies){const previous=this.health.get(id)??combat.health;this.health.set(id,combat.health);const distance=Math.hypot(body.x-g.player.x,body.z-g.player.z);if(previous>0&&combat.health===0)this.pending.push({at:this.clock+((body.crouch??0)>.1?.75:combat.hitDirection==='back'?1.1:1.7),volume:.2*volume/(1+distance*.1)});
   if(g.status==='playing'&&combat.health>0&&body.grounded&&body.speed>.2&&distance<9&&!(id==='player'&&g.vehicleBusy)){const n=(this.steps.get(id)??0)+body.speed*dt,step=.75*(body.animationScale??1);if(n>=step){this.play('take-cover-steps',volume*((body.crouch??0)>.1?.04:.11)/(1+distance*.15),this.stepSide++%2?.65:0,.24);this.steps.set(id,n%step);}else this.steps.set(id,n);}}
  for(let i=this.pending.length-1;i>=0;i--)if(this.pending[i].at<=this.clock){this.play('body-fall-thump',this.pending[i].volume);this.pending.splice(i,1);}
 }
}
