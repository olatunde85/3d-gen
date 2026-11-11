/** Authored driving courses share one measured road, collision layout and smooth reference path. */
import type {Block,Point,Rect} from './world';
import type {CarPose} from './driving';
export type DriveDifficulty='easy'|'standard'|'hard';
export interface DrivingCourse {difficulty:DriveDifficulty;startZ:number;checkpoints:CarPose[];length:number}
export function addDrivingCourse(blocks:Block[],original:Rect,difficulty:DriveDifficulty,pickup:CarPose,gate:Point){
 const rows=difficulty==='hard'?6:2,step=difficulty==='hard'?36:44,first=original.minZ-32,last=first-(rows-1)*step,exit={x:0,z:last-38},bounds={...original,minZ:exit.z-12};
 const wall=blocks.find(b=>b.id==='north')!;blocks.splice(blocks.indexOf(wall),1);
 for(const side of [-1,1])blocks.push({id:`course-mouth-${side}`,kind:'wall',color:wall.color,x:side*(original.maxX+3.5)/2,z:original.minZ,w:original.maxX-3.5,d:.4,h:2.6});
 for(const side of [-1,1])blocks.push({id:`course-edge-${side}`,kind:'wall',color:wall.color,x:side*original.maxX,z:(original.minZ+bounds.minZ)/2,w:.4,d:original.minZ-bounds.minZ,h:1.1});
 blocks.push({id:'course-end',kind:'wall',color:wall.color,x:0,z:bounds.minZ,w:original.maxX*2,d:.4,h:1.1});
 const knots:CarPose[]=[{x:0,z:original.minZ+8,yaw:Math.PI}],checkpoints:CarPose[]=[];
 for(let i=0;i<rows;i++){
  const side=i%2===0?1:-1,z=first-i*step,x=side*6,edge=side*(difficulty==='hard'?2.4:0),left=side>0?original.minX:edge,right=side>0?edge:original.maxX;
  blocks.push({id:`road-block-${i}`,kind:'crate',color:'#b59768',x:(left+right)/2,z,w:right-left,d:1.2,h:1.05});
  if(difficulty==='hard')for(const dx of [-2.65,2.65])blocks.push({id:`road-cone-${i}-${dx}`,kind:'crate',color:'#d98c42',x:x+dx,z:z-1,w:.4,d:.4,h:.65});
  knots.push({x,z,yaw:Math.PI},{x,z:z-9,yaw:Math.PI});checkpoints.push({x,z:z-9,yaw:Math.PI});
 }
 knots.push({...exit,yaw:Math.PI});const route:CarPose[]=[pickup,{x:0,z:gate.z-3,yaw:Math.PI},knots[0]];
 for(let j=1;j<knots.length;j++){const a=knots[j-1],b=knots[j],length=a.z-b.z,n=Math.ceil(length/1.4);for(let i=1;i<=n;i++){const t=i/n,s=t*t*t*(10+t*(-15+6*t)),derivative=30*t*t*(1-t)*(1-t)*(b.x-a.x)/length;route.push({x:a.x+(b.x-a.x)*s,z:a.z-length*t,yaw:Math.PI-Math.atan(derivative)});}}
 const length=route.reduce((n,p,i)=>i?n+Math.hypot(p.x-route[i-1].x,p.z-route[i-1].z):n,0);
 return {bounds,exit,route,course:{difficulty,startZ:original.minZ,checkpoints,length} satisfies DrivingCourse};
}
