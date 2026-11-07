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
 {mesh:merge(harness?harness.map(path=>cord(path,.008*scale,false,8)):straps)!,material:mat('Parachute webbing','#242a2d')},
 {mesh:box(point(0,-.04,-.091),[width*.78,.30*scale,.018*scale]),material:mat('Pack panel',style.color)},
 {mesh:box(point(-width*.35/scale,-.14,.32),[.035*scale,.065*scale,.025*scale]),material:mat('Deployment handle','#d3a34c')}];
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
