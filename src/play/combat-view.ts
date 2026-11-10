/** Pooled muzzle flashes and shot trails; optional Studio-library audio is independent of gameplay. */
import * as T from 'three';
import type {EscapeGame} from './runtime';
import {PlayAudio} from './audio';
export class CombatView {
 readonly group=new T.Group();readonly audio=new PlayAudio();private game?:EscapeGame;private seen=0;private time=0;private cursor=0;
 private pool=Array.from({length:24},()=>{
  const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(6),3)),material=new T.LineBasicMaterial({color:'#ffe4a0',transparent:true,depthWrite:false,toneMapped:false}),line=new T.Line(geometry,material),flash=new T.Mesh(new T.ConeGeometry(.045,.15,6),new T.MeshBasicMaterial({color:'#fff1ad',transparent:true,depthWrite:false,toneMapped:false}));
  line.frustumCulled=false;line.visible=false;flash.visible=false;this.group.add(line,flash);return {line,flash,age:1};
 });
 get enabled(){return this.audio.enabled;}set enabled(value:boolean){this.audio.enabled=value;}
 configure(_firearms:boolean,_grenades:boolean){this.audio.silence();}
 silence(){this.audio.silence();}
 unlock(){this.audio.unlock();}
 update(game:EscapeGame,dt:number){
  if(this.game!==game||game.time<this.time){this.game=game;this.seen=0;for(const p of this.pool){p.age=1;p.line.visible=false;p.flash.visible=false;}}this.time=game.time;this.audio.update(game,dt);
  for(const shot of game.shots)if(shot.id>this.seen){
   this.seen=shot.id;const p=this.pool[this.cursor++%this.pool.length],from=new T.Vector3(shot.from.x,shot.from.y,shot.from.z),to=new T.Vector3(shot.to.x,shot.to.y,shot.to.z),delta=to.clone().sub(from),start=from.clone().addScaledVector(delta,Math.min(.4,delta.length()*.4)/Math.max(.001,delta.length()));
   p.line.geometry.attributes.position.setXYZ(0,start.x,start.y,start.z);p.line.geometry.attributes.position.setXYZ(1,to.x,to.y,to.z);p.line.geometry.attributes.position.needsUpdate=true;p.line.material.color.set(shot.owner==='player'?'#ffe4a0':'#ffab82');p.flash.position.copy(start);p.flash.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());p.flash.scale.setScalar(shot.weapon==='rifle'?1.5:1);p.age=0;
  }
  for(const p of this.pool){p.age+=dt;p.line.visible=p.age<.14;p.flash.visible=p.age<.075;p.line.material.opacity=Math.max(0,1-p.age/.14);p.flash.material.opacity=Math.max(0,1-p.age/.075);}
 }
}
