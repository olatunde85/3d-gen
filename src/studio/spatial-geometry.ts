/** Continuous 2D footprint tests, including thin barriers and holes inside a swept path. */
import type {LocationMap,Rect,SpatialPose} from './spatial-types';
export type Point=[number,number];
export type Polygon=Point[];
/** Metres of rectangular boat-envelope contact allowed at a bank or dock edge. */
export const BOAT_EDGE_TOLERANCE=.15;
const area=(p:Polygon)=>Math.abs(p.reduce((a,v,i)=>{const w=p[(i+1)%p.length];return a+v[0]*w[1]-w[0]*v[1];},0))/2;
function clip(p:Polygon,axis:0|1,value:number,less:boolean):Polygon {
 const out:Polygon=[];
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],inside=(v:Point)=>less?v[axis]<=value:v[axis]>=value,aa=inside(a),bb=inside(b);
  if(aa)out.push(a);if(aa!==bb){const t=(value-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
 return out;
}
export function intersection(p:Polygon,r:Rect){return clip(clip(clip(clip(p,0,r[0],false),0,r[2],true),1,r[1],false),1,r[3],true);}
function subtract(p:Polygon,r:Rect):Polygon[]{
 const out:Polygon[]=[];let rest=p;
 for(const [axis,v,less]of [[0,r[0],true],[0,r[2],false],[1,r[1],true],[1,r[3],false]]as const){const part=clip(rest,axis,v,less);if(area(part)>1e-8)out.push(part);rest=clip(rest,axis,v,!less);if(!rest.length)break;}
 return out;
}
const subtractAll=(p:Polygon[],rects:Rect[])=>rects.reduce((parts,r)=>parts.flatMap(p=>subtract(p,r)),p);
function edgeClip(p:Polygon,a:Point,b:Point,inside:boolean):Polygon {
 const out:Polygon=[],side=(v:Point)=>(b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0]);
 for(let i=0;i<p.length;i++){const v=p[i],w=p[(i+1)%p.length],sv=side(v),sw=side(w),iv=inside?sv>=0:sv<=0,iw=inside?sw>=0:sw<=0;if(iv)out.push(v);if(iv!==iw){const t=sv/(sv-sw);out.push([v[0]+(w[0]-v[0])*t,v[1]+(w[1]-v[1])*t]);}}return out;
}
function subtractConvex(p:Polygon,cutter:Polygon):Polygon[]{
 const out:Polygon[]=[];let rest=p;
 for(let i=0;i<cutter.length;i++){const a=cutter[i],b=cutter[(i+1)%cutter.length],part=edgeClip(rest,a,b,false);if(area(part)>1e-8)out.push(part);rest=edgeClip(rest,a,b,true);if(!rest.length)break;}return out;
}
/** Erode a convex swept envelope in world metres, independently of heading and path length. */
function inset(p:Polygon,distance:number):Polygon {
 if(distance<=0)return p;
 const signed=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0),outline=signed>=0?p:[...p].reverse();let result=outline;
 for(let i=0;i<outline.length;i++){
  const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<1e-9)continue;
  const nx=-dz/length*distance,nz=dx/length*distance;result=edgeClip(result,[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],true);
 }
 // A small/degenerate envelope must never disappear from validation entirely.
 return area(result)>1e-8?result:p;
}
export function footprint(p:SpatialPose,bounds:Rect,margin=0):Polygon {
 const a=p.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a),[x0,z0,x1,z1]=bounds;
 return [[x0-margin,z0-margin],[x1+margin,z0-margin],[x1+margin,z1+margin],[x0-margin,z1+margin]].map(([x,z])=>[p.x+x*c+z*s,p.z-x*s+z*c]);
}
export function hull(points:Polygon):Polygon {
 const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o:Point,a:Point,b:Point)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=(p:Polygon)=>{const h:Polygon=[];for(const a of p){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],a)<=0)h.pop();h.push(a);}return h;};
 return half(p).slice(0,-1).concat(half([...p].reverse()).slice(0,-1));
}
export function spatialConflict(map:LocationMap,polygon:Polygon,mode:'pedestrian'|'ground-vehicle'|'boat'|'air'|'swimmer',bottom=0,top=2,decks:Polygon[]=[],options:{boatEdgeTolerance?:number}={}):{code:string;message:string}|undefined {
 if(polygon.some(([x,z])=>x<map.bounds[0]-1e-6||x>map.bounds[2]+1e-6||z<map.bounds[1]-1e-6||z>map.bounds[3]+1e-6))return{code:'outside-map',message:'leaves the mapped performance area'};
 const docks=map.regions.filter(r=>r.kind==='dock').map(r=>r.bounds);
 if(mode==='boat'){
  const tolerance=Math.max(0,options.boatEdgeTolerance??BOAT_EDGE_TOLERANCE),inner=inset(polygon,tolerance);
  if(subtractAll([inner],map.water).some(p=>area(p)>1e-6)||docks.some(r=>area(intersection(inner,r))>1e-6))return{code:'boat-on-land',message:`extends onto land or a dock beyond the ${Math.round(tolerance*100)} cm boat-edge allowance`};
 }else if(mode==='swimmer'){
  if(subtractAll([polygon],map.water).some(p=>area(p)>1e-6))return{code:'swimmer-on-land',message:'swims outside the water'};
 }else if(mode!=='air'){
  if(map.water.some(r=>decks.reduce((parts,deck)=>parts.flatMap(p=>subtractConvex(p,deck)),subtractAll([intersection(polygon,r)],docks)).some(p=>area(p)>1e-6)))return{code:'ground-in-water',message:'crosses water outside a walkable dock'};
 }
 const obstacle=map.obstacles.find(o=>o.bottom<top-1e-4&&o.top>bottom+.12&&area(intersection(polygon,o.bounds))>1e-7);
 if(obstacle)return{code:'obstacle',message:`intersects a static obstacle at [${obstacle.bounds.join(',')}] (height ${obstacle.bottom}..${obstacle.top}m)`};
}
