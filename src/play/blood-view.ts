/** Ara's existing wound, droplet and pool effect, bounded to four actual impacts per actor. */
import {Matrix4} from 'three';
import {Blood,type BloodHit} from '../core/props/blood';
import type {Clip} from '../core/anim/clips';
import type {StudioActor} from '../studio/actor';
import type {Combatant} from './combat';
export class GameBlood {
 private effect?:Blood;private health=Infinity;private sequence=0;private restoreCorpse=false;
 private hits:{clip:Clip;elapsed:number;world:Matrix4}[]=[];
 constructor(private actor:StudioActor){}
 reset(health:number){this.restoreCorpse=health===0;this.health=health===0?Infinity:health;this.hits=[];this.effect?.clear();}
 update(c:Combatant|undefined,dt:number,clip:Clip,at:number){
  if(!c)return;this.actor.group.updateMatrixWorld(true);
  if(c.damageKind!=='melee'&&c.health<this.health&&(c.hitAge<.3||this.restoreCorpse)){
   const id='play-impact-'+this.sequence++,fatal=c.health<=0,dir:[number,number,number]=c.hitDirection==='back'?[0,0,1]:c.hitDirection==='left'?[-1,0,0]:c.hitDirection==='right'?[1,0,0]:[0,0,-1];
   const wound:Clip={...clip,id,wounds:[{t:0,bone:'Spine2',dir,...(fatal?{pool:clip.duration*.65}:{})}],sample:t=>clip.sample(fatal?t:at)};
   this.hits.push({clip:wound,elapsed:this.restoreCorpse?clip.duration+3:0,world:this.actor.group.matrixWorld.clone()});if(this.hits.length>4){const old=this.hits.shift()!;this.effect?.forget(old.clip.id);}
   if(!this.effect){this.effect=new Blood(this.actor.mesh,this.actor.animator,this.actor.scale);this.actor.group.add(this.effect.group);}
  }
  this.restoreCorpse=false;this.health=c.health;const inverse=this.actor.group.matrixWorld.clone().invert(),hits:BloodHit[]=this.hits.map(h=>{h.elapsed+=dt;return {clip:h.clip,elapsed:h.elapsed,place:new Matrix4().multiplyMatrices(inverse,h.world)};});this.effect?.update(hits);
 }
 dispose(){this.effect?.dispose();}
}
