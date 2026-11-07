/** Pack, webbing and a striped ram-air canopy. Only prop joints scale during deployment. */
import {frameOf,roundedBox,loftRings,cord,merge} from '../garments/ring';
import type {CarryPart,BagStyle} from './carry';
import type {Vec3} from '../math';
import type {Material} from '../mesh';
export const PACKED_CANOPY=.002;
export const CANOPY_WIDTH=5.4;
export const canopyPoint=(x:number,z:number):Vec3=>[x,.52-.105*x*x+.11*Math.cos(z/1.7*Math.PI),z];
export const SUSPENSION_ANCHORS=Array.from({length:12},(_,i)=>canopyPoint((-2.45+(i%6)*.98),i<6?-.74:.74));
const mat=(name:string,color:string):Material=>({name,color,roughness:.9,metalness:0,alpha:'opaque',doubleSided:true});
const box=(p:Vec3,size:Vec3)=>roundedBox(frameOf(p,[0,0,1],[0,1,0]),size.map(x=>x/(2*1.36))as Vec3,2);
export function parachutePack(centre:Vec3,width:number,scale:number,style:BagStyle,harness?:Vec3[][]):CarryPart[]{
 const point=(x:number,y:number,z:number):Vec3=>[centre[0]+x*scale,centre[1]+y*scale,centre[2]+z*scale];
 const straps=[];
 for(const side of [-1,1]){
  const x=side*width*.38/scale;
  straps.push(cord([point(x,-.22,.02),point(x,.25,.02),point(x,.31,.18),point(x,.21,.35),point(x,-.25,.32),point(x,-.30,.06)],.017*scale,false,8));
 }
 return [{mesh:box(centre,[width,.43*scale,.17*scale]),material:mat('Parachute pack',style.color2)},
 {mesh:merge(harness?harness.map(path=>cord(path,.009*scale,false,8)):straps)!,material:mat('Parachute webbing','#242a2d')},
 {mesh:box(point(0,-.04,-.091),[width*.78,.30*scale,.018*scale]),material:mat('Pack panel',style.color)},
 {mesh:box(point(-width*.35/scale,-.14,.32),[.035*scale,.065*scale,.025*scale]),material:mat('Deployment handle','#d3a34c')}];
}
/**
 * Webbing paths fitted around the clothed torso (metres, bind pose): on each side a strap rises up
 * the chest, arcs over the shoulder and runs down the back into the pack, plus a chest strap.
 */
export function parachuteHarness(P:Float32Array,level:number,k:number):Vec3[][]{
 const gap=.014*k,yTop=level+.17*k,smooth=(a:number[],n:number)=>{for(let r=0;r<n;r++)a=a.map((x,i)=>(a[Math.max(0,i-1)]+2*x+a[Math.min(a.length-1,i+1)])/4);return a;};
 const fill=(a:number[])=>a.map((x,i)=>{if(Number.isFinite(x))return x;let l=i,r=i;while(l>=0&&!Number.isFinite(a[l]))l--;while(r<a.length&&!Number.isFinite(a[r]))r++;return l<0?a[r]:r>=a.length?a[l]:a[l]+(a[r]-a[l])*(i-l)/(r-l);});
 // Outermost surface of a slab, kept outside even where smoothing would sink into a fold.
 const envelope=(raw:number[],sign:number)=>{const f=fill(raw);return smooth(f,3).map((x,i)=>sign>0?Math.max(x,f[i]):Math.min(x,f[i]));};
 const paths:Vec3[][]=[];
 for(const side of [-1,1]){
  const x=side*.115*k,ys=Array.from({length:11},(_,n)=>level-.32*k+(yTop-level+.32*k)*n/10),hi=ys.map(()=>-Infinity),lo=ys.map(()=>Infinity);
  for(let i=0;i<P.length;i+=3){if(Math.abs(P[i]-x)>gap)continue;const n=Math.round((P[i+1]-ys[0])/(ys[1]-ys[0]));if(n<0||n>10||Math.abs(P[i+1]-ys[n])>gap)continue;hi[n]=Math.max(hi[n],P[i+2]);lo[n]=Math.min(lo[n],P[i+2]);}
  const front=envelope(hi.map(z=>Number.isFinite(z)?z:NaN),1),rear=envelope(lo.map(z=>Number.isFinite(z)?z:NaN),-1);
  // Over the shoulder: the farthest surface point in each direction about the top of the straps.
  const zc=(front[10]+rear[10])/2,bins=24,radius:number[]=Array(bins+1).fill(-Infinity);
  for(let i=0;i<P.length;i+=3){
   const dy=P[i+1]-yTop,dz=P[i+2]-zc;if(Math.abs(P[i]-x)>gap||dy<-gap||dy>.3*k)continue;
   const b=Math.round(Math.atan2(Math.max(0,dy),dz)/Math.PI*bins);radius[b]=Math.max(radius[b],Math.hypot(dy,dz));
  }
  radius[0]=front[10]-zc;radius[bins]=zc-rear[10];
  const arc=envelope(radius.map(r=>Number.isFinite(r)?r:NaN),1);
  const path:Vec3[]=ys.map((y,n)=>[x,y,front[n]+gap]);
  for(let b=1;b<bins;b++){const a=b/bins*Math.PI;path.push([x,yTop+Math.sin(a)*(arc[b]+gap),zc+Math.cos(a)*(arc[b]+gap)]);}
  for(let n=10;n>=0;n--)path.push([x,ys[n],rear[n]-gap]);
  path.push(path[0]);paths.push(path);
 }
 // Chest strap between the two front straps.
 const yc=level+.06*k,xs=Array.from({length:9},(_,i)=>(-.115+.23*i/8)*k),zs=xs.map(()=>-Infinity);
 for(let i=0;i<P.length;i+=3){if(Math.abs(P[i+1]-yc)>gap)continue;const n=Math.round((P[i]-xs[0])/(xs[1]-xs[0]));if(n>=0&&n<9&&Math.abs(P[i]-xs[n])<gap)zs[n]=Math.max(zs[n],P[i+2]);}
 paths.push(envelope(zs.map(z=>Number.isFinite(z)?z:NaN),1).map((z,n)=>[xs[n],yc,z+gap*1.4]));
 return paths;
}
export function parachuteCanopy(style:BagStyle):CarryPart[]{
 const parts:CarryPart[]=[];
 for(let cell=0;cell<9;cell++){
  const x0=-CANOPY_WIDTH/2+cell*.6,rows:Vec3[][]=[];
  // Each inflated cell has a rounded airfoil. Closed ends/ribs preserve volume from all views.
  for(let i=0;i<=8;i++){const x=x0+i/8*.6,bump=.075*Math.sin(i/8*Math.PI);const ring:Vec3[]=[];
   for(let j=0;j<=18;j++){const z=-.85+j/18*1.7,p=canopyPoint(x,z);ring.push([p[0],p[1]+bump+.12*Math.sin(j/18*Math.PI),p[2]]);}
   for(let j=18;j>=0;j--){const z=-.85+j/18*1.7,p=canopyPoint(x,z);ring.push([p[0],p[1]-.08+.025*Math.sin(j/18*Math.PI),p[2]]);}
   rows.push(ring);
  }
  parts.push({mesh:loftRings(rows,{closedAround:true}),material:mat(`Canopy cell ${cell+1}`,cell%3===1?style.color2:style.color)});
  for(const edge of [0,8])parts.push({mesh:cord([...rows[edge],rows[edge][0]],.004,false,6),material:mat('Canopy ribs','#c9d3d4')});
 }
 return parts;
}
export function parachuteLine():CarryPart{return{mesh:cord([[0,0,0],[0,1,0]],.0025,false,6),material:mat('Suspension lines','#c5c6b8')};}
