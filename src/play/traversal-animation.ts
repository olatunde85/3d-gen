/** Fit existing contact animations to the actual ledge, preserving every bone's length. */
import {clipById,type Clip,type Sample} from '../core/anim/clips';
import type {Traversal} from './motor';
import {fittedForward,traversalLandingDrop} from './motor';
import type {Vec3} from '../core/math';
export function traversalClip(t:Traversal):Clip {
 const source=clipById.get(t.kind==='vault'?'vault_over':'ledge_climb_up')!;
 const ratio=t.rise/t.scale/(t.kind==='vault'?.9:2.15),top=t.kind==='vault'?.9:2.15;
 const y=(value:number,contact=false)=>contact&&value>top-.15?t.rise/t.scale+(value-top):value*ratio;
 const fit=(s:Sample,time:number):Sample=>{
  const drop=traversalLandingDrop(t,time)/t.scale,travel=source.travel!.map(v=>v*time),point=(p:Vec3):Vec3=>[p[0],y(p[1]+travel[1],true)-drop,fittedForward(t,p[2]+travel[2])/t.scale];
  const out:Sample={...s,root:{...s.root,y:y((s.root.y??0)+travel[1])-drop,z:fittedForward(t,(s.root.z??0)+travel[2])/t.scale,reach:false},bones:{...s.bones}};
  if(s.ik){out.ik={};for(const side of ['Left','Right']as const){const h=s.ik[side];if(h)out.ik[side]={...h,pos:h.space==='floor'?point(h.pos):h.pos};}}
  if(s.feet){out.feet={};for(const side of ['Left','Right']as const){const foot=s.feet[side];if(foot)out.feet[side]={...foot,pos:point(foot.pos)};}}
  if(s.blend)out.blend={...s.blend,sample:fit(s.blend.sample,time)};
  return out;
 };
 return {...source,id:`play-${source.id}`,travel:undefined,sample:time=>{
  const s=fit(source.sample(time),time);
  // Enter from an upright stance rather than popping straight into the original hanging pose.
  if(t.kind==='climb'&&time<.35){const idle=clipById.get('idle')!.sample(0),u=time/.35;s.blend={sample:idle,w:1-u*u*(3-2*u),ground:true};}
  return s;
 }};
}
