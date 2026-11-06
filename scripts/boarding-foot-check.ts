/** Regress the ankle joint and actual skin/boot surfaces through saddle dismounts. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {boneFor} from '../src/core/rig/poses';
import {quatOf} from '../src/core/rig/rig';
import {qconj,qmul,qrot,type Q} from '../src/core/anim/quat';
import type {Vec3} from '../src/core/math';
const lib=await nodeLibrary(),distance=(a:number[],b:number[])=>Math.hypot(...a.map((x,d)=>x-b[d]));
let checks=0;
for(const rig of ['game','game_lite','full']as const)for(const restPose of ['A','T']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,...PRESETS['The Wasteland Survivor'],rig,restPose,detail:'medium',carry:'none',weapon:'none'});
 const B=ch.rig!.bones,A=new Animator(ch.rig!),M=ch.mesh,J=M.joints!,W=M.weights!,foot=B.findIndex(b=>b.name===boneFor(rig,'RightFoot')),s=ch.height/1.8;
 const rest=(v:number):Vec3=>Array.from(M.positions.slice(v*3,v*3+3))as Vec3;
 const inverse=B.map(b=>qconj(quatOf(b.rot)));
 const lower=(j:number)=>/^(RightLeg|RightFoot|RightToe)|^(lowerleg\d+|foot|toe\d-\d)\.R$/.test(B[j].name);
 const near=(v:number)=>{const p=rest(v);return Math.abs(p[1]-B[foot].head[1])<.085*s&&[0,1,2,3].reduce((sum,k)=>sum+(lower(J[v*4+k])?W[v*4+k]:0),0)>.95;};
 const edges:{a:number;b:number;length:number}[]=[],seen=new Set<string>();
 for(const group of M.groups)for(let i=0;i<group.indices.length;i+=3)for(const [u,v]of [[0,1],[1,2],[2,0]]){
  const a=group.indices[i+u],b=group.indices[i+v],key=[a,b].sort((x,y)=>x-y).join(':');
  if(seen.has(key)||!near(a)||!near(b))continue;seen.add(key);
  const length=distance(rest(a),rest(b));if(length>.002*s&&length<.08*s)edges.push({a,b,length});
 }
 assert.ok(edges.length>30,'no ankle skin/boot witnesses');
 for(const id of ['board_bicycle','alight_bicycle','board_motorcycle','alight_motorcycle','board_horse','alight_horse']){
  const c=clipById.get(id)!;let minRatio=Infinity,maxAngle=0;
  for(let i=0;i<=80;i++){
   const f=A.frame(c,c.duration*i/80),positions=A.positions(f),world:Q[]=[];
   B.forEach((b,j)=>world[j]=b.parent<0?f.rot[j]:qmul(world[b.parent],f.rot[j]));
   const rotations=world.map((q,j)=>qmul(q,inverse[j])),cache=new Map<number,Vec3>();
   const vertex=(v:number):Vec3=>{const found=cache.get(v);if(found)return found;const p=rest(v),out:Vec3=[0,0,0];
    for(let k=0;k<4;k++){const j=J[v*4+k],w=W[v*4+k];if(!w)continue;const rotated=qrot(rotations[j],p.map((x,d)=>x-B[j].head[d])as Vec3);for(let d=0;d<3;d++)out[d]+=(positions[j][d]+rotated[d])*w;}
    cache.set(v,out);return out;
   };
   for(const edge of edges)minRatio=Math.min(minRatio,distance(vertex(edge.a),vertex(edge.b))/edge.length);
   const angle=2*Math.acos(Math.min(1,Math.abs(f.rot[foot].reduce((dot,x,d)=>dot+x*A.restLocal[foot][d],0))))*180/Math.PI;maxAngle=Math.max(maxAngle,angle);
  }
  assert.ok(maxAngle<45,`${rig}/${restPose}/${id}: ankle bends ${maxAngle.toFixed(1)}°`);
  assert.ok(minRatio>.25,`${rig}/${restPose}/${id}: ankle skin/boot collapses to ${(minRatio*100).toFixed(1)}% of its edge length`);
  console.log(rig,restPose,id,'ankle',maxAngle.toFixed(1),'minimum skin/boot edge ratio',minRatio.toFixed(3));checks++;
 }
}
console.log(`Saddle ankle/skin checks: ${checks} clips/rigs/binds passed.`);
