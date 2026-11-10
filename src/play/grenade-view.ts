import * as T from 'three';
import {MeshAssembler} from '../core/mesh';
import {buildWeapon} from '../core/props/weapons';
import {GRENADE,predictGrenade} from './grenades';
import {solidVolumes} from './mission';
import type {EscapeGame} from './runtime';
import type {Point3} from './combat';

/** Use the actual Ara prop both in the hand and in flight. No downloaded model. */
export function grenadeProp(){
 const assembler=new MeshAssembler();for(const part of buildWeapon('grenade'))assembler.add(part.mesh,part.material);
 const data=assembler.build(),group=new T.Group();
 for(const part of data.groups){const material=data.materials[part.material],geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(data.positions,3));geometry.setAttribute('normal',new T.BufferAttribute(data.normals,3));geometry.setIndex(new T.BufferAttribute(part.indices,1));const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:material.color,roughness:material.roughness,metalness:material.metalness}));mesh.castShadow=true;group.add(mesh);}
 return group;
}
export function disposeGrenade(group:T.Group){group.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});group.removeFromParent();}
export class GrenadeView {
 readonly group=new T.Group();aim?:Point3;private game?:EscapeGame;private previewKey='';private resultTime=0;
 private projectiles=Array.from({length:5},()=>{const p=grenadeProp();this.group.add(p);p.visible=false;return p;});
 private positions=new Float32Array(180*3);
 private arc=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(this.positions,3)),new T.LineDashedMaterial({color:'#ffd479',dashSize:.17,gapSize:.1,transparent:true,opacity:.9,depthTest:false}));
 private marker=new T.Mesh(new T.RingGeometry(.2,.3,32).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#ffd479',depthTest:false,transparent:true,opacity:.95,side:T.DoubleSide}));
 private radius=new T.Mesh(new T.RingGeometry(GRENADE.blast-.025,GRENADE.blast,64).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#ffd479',transparent:true,opacity:.35,depthWrite:false,side:T.DoubleSide}));
 private smokeTexture=(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d')!,g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.4,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);return new T.CanvasTexture(canvas);})();
 private bursts=Array.from({length:8},()=>{
  const group=new T.Group(),flash=new T.Sprite(new T.SpriteMaterial({map:this.smokeTexture,color:'#ffe3a5',depthWrite:false,toneMapped:false,blending:T.AdditiveBlending})),smoke=new T.SpriteMaterial({map:this.smokeTexture,color:'#655e52',depthWrite:false,opacity:.5}),clouds=Array.from({length:7},()=>new T.Sprite(smoke)),sparks=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(36),3)),new T.PointsMaterial({color:'#ffd28c',size:.07,transparent:true,depthWrite:false,toneMapped:false})),ring=new T.Mesh(new T.RingGeometry(.94,1,40).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#d8c3a2',transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide}));
  sparks.frustumCulled=false;group.add(flash,...clouds,sparks,ring);this.group.add(group);return {group,flash,smoke,clouds,sparks,ring};
 });
 constructor(){this.arc.frustumCulled=false;this.arc.renderOrder=10;this.marker.renderOrder=11;this.group.add(this.arc,this.marker,this.radius);}
 update(game:EscapeGame,dt=0){
  this.resultTime=game.status==='won'||game.status==='caught'?this.resultTime+dt:0;
  if(this.game!==game){this.game=game;this.previewKey='';this.resultTime=0;}
  this.projectiles.forEach((mesh,i)=>{const p=game.projectiles[i];mesh.visible=!!p;if(p){mesh.position.set(p.position.x,p.position.y,p.position.z);mesh.rotation.set(p.age*9,p.age*7,0);}});
  const visible=!!this.aim&&game.status==='playing'&&!game.throwing&&game.grenades>0;this.arc.visible=visible;this.marker.visible=visible;this.radius.visible=visible;
  if(visible&&this.aim){
   const b=game.player,t=this.aim,key=[b.x,b.y,b.z,b.height,t.x,t.y,t.z,game.door].join('/');
   if(key!==this.previewKey){
    this.previewKey=key;const {points,landing}=predictGrenade(b,t,solidVolumes(game.world,game.door));
    points.forEach((p,i)=>this.arc.geometry.attributes.position.setXYZ(i,p.x,p.y,p.z));this.arc.geometry.setDrawRange(0,points.length);this.arc.geometry.attributes.position.needsUpdate=true;this.arc.computeLineDistances();
    this.marker.position.set(landing.x,landing.y+.01,landing.z);this.radius.position.copy(this.marker.position);
   }
   const landing=this.marker.position,danger=Math.hypot(b.x-landing.x,b.z-landing.z)<GRENADE.blast||!!game.companion&&Math.hypot(game.companion.x-landing.x,game.companion.z-landing.z)<GRENADE.blast;
   for(const material of [this.arc.material,this.marker.material,this.radius.material])material.color.set(danger?'#ff775e':'#ffd479');
  }
  this.bursts.forEach((p,i)=>{const e=game.explosions[i],age=e?game.time+this.resultTime-e.time:2;p.group.visible=age>=0&&age<1.4;if(!e||!p.group.visible)return;
   p.group.position.set(e.position.x,e.position.y,e.position.z);p.flash.visible=age<.22;p.flash.scale.setScalar(.4+Math.sqrt(age)*7);p.flash.material.opacity=Math.max(0,1-age/.22);
   p.smoke.opacity=Math.min(1,age/.15)*Math.max(0,1-age/1.4)*.6;
   p.clouds.forEach((cloud,j)=>{const angle=j*2.4+e.id,spread=.2+age*.7;cloud.position.set(Math.cos(angle)*spread,.25+age*(.7+j*.09),Math.sin(angle)*spread);cloud.scale.setScalar(.6+age*(1.2+j*.1));});
   p.sparks.visible=age<.65;p.sparks.material.opacity=Math.max(0,1-age/.65);
   for(let j=0;j<12;j++){const angle=j*2.4+e.id,speed=2+j%4;p.sparks.geometry.attributes.position.setXYZ(j,Math.cos(angle)*speed*age,Math.max(.03,.12+(1+j%3)*age-4.9*age*age),Math.sin(angle)*speed*age);}p.sparks.geometry.attributes.position.needsUpdate=true;
   p.ring.visible=age<.5;p.ring.scale.setScalar(.2+age*9);p.ring.position.y=.005;p.ring.material.opacity=Math.max(0,1-age/.5)*.35;
  });
 }
}
