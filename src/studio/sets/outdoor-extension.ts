/** Extend locations in metres, without stretching furniture, people or the original set dressing. */
import {SetBuilder} from './builder';
import type {SceneDefinition} from '../catalog';
export const OUTDOOR_EXTENT=180;
export function extendOutdoor(b:SetBuilder,s:SceneDefinition){
 const coastal=['beach','yacht'].includes(s.family),desert=s.id==='desert-outpost',city=s.family==='street'||['street-cafe','restaurant-terrace','rooftop-bar','train-platform'].includes(s.id);
 if(coastal){
  // A long shore/promenade parallel to X, with clear foreground routes in both directions.
  b.box([360,.012,7],[0,-.007,6],s.family==='beach'?'#c6b697':'#b4a58c');
  for(const x of [-140,-100,-60,-25,25,60,100,140]){
   if(s.family==='beach')b.palm(x,-4,5.5);
   else{b.cylinder(.18,.65,[x,.33,-2],'#7a7666');b.cylinder(.045,3.8,[x,1.9,8],'#626e70');b.ball([.18,.18,.18],[x,3.85,8],'#e8d7ad');}
  }
 }else if(city){
  b.box([14,.014,360],[0,-.006,0],'#6d7372');b.box([360,.014,14],[0,-.005,48],'#6d7372');
  for(let z=-160;z<=160;z+=12){b.box([.12,.018,4],[0,.004,z],'#d7c998');for(const side of [-1,1]){const x=side*11;b.box([3,.1,10],[x,.015,z],'#a6a499');if(Math.abs(z)>20)b.box([8,8+(Math.abs(z)%3)*2,9],[side*17,4,z],'#8d9692');}}
 }else{
  const path=desert?'#bda17a':s.id==='courtyard'?'#c1b6a0':'#beb9a2';
  const pathMaterial=b.material(path);pathMaterial.polygonOffset=true;pathMaterial.polygonOffsetFactor=-1;pathMaterial.polygonOffsetUnits=-2;
  const shore=b.waterAreas.length?Math.max(...b.waterAreas.map(a=>a.maxZ))+.25:-180;
  b.box([6,.012,180-shore],[0,-.006,(180+shore)/2],path);b.box([360,.012,6],[0,-.005,24],path);
  for(const z of [-140,-100,-60,-28,28,60,100,140])for(const side of [-1,1]){
   const x=side*(18+(Math.abs(z)%3)*4);
   if(desert)b.ball([14,3.5,10],[side*48,-1,z],'#c6ad88');
   else if(s.id==='courtyard'){b.box([1,4.5,1],[x,2.25,z],'#cbb897');b.box([1.5,.3,1.5],[x,4.5,z],'#b9a17b');}
   else b.tree(x,z,5+(Math.abs(z)%3));
  }
  for(const x of [-140,-100,-60,60,100,140])if(!desert&&s.id!=='courtyard')b.tree(x,sideOffset(x),5.5);
  if(s.family==='landscape'&&!desert){
   // Continue the woodland along the route; lakes retain an open, uninterrupted water surface.
   for(let z=-160,row=0;z<=160;z+=16,row++){
    if(Math.abs(z-24)<8||s.id!=='forest-trail'&&z<0)continue;
    for(const side of [-1,1])for(let band=0;band<5;band++)b.tree(side*(12+band*36+(row+band)%3*2),z+((row*7+band*3)%7)-3,4.5+(row+band)%4*.45);
   }
  }
 }
 b.group.userData.performanceBounds={minX:-OUTDOOR_EXTENT,maxX:OUTDOOR_EXTENT,minZ:-OUTDOOR_EXTENT,maxZ:OUTDOOR_EXTENT};
}
const sideOffset=(x:number)=>x<0?42:-38;
