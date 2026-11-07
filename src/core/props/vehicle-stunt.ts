/** Shared rigid transform: both rider and prop roll about the same longitudinal axis. */
import type {Vec3} from '../math';
import {qaxis,qrot,type Q} from '../anim/quat';
const dimensions:Record<string,[number,number,number]>={
 bicycle:[.7,2,0],motorcycle:[.75,2,0],car:[1.05,2,-.36],sports_car:[1.1,2,-.36],suv:[1.45,2.6,-.36],pickup:[1.45,2.65,-.36],tank:[2.25,3,-.55],canoe:[.8,2.1,0],kayak:[1.25,2.1,0],rowboat:[2.2,2.1,0],motorboat:[1.8,2.7,0],helicopter:[4.2,3.5,.44],jet:[4,3.5,0],
};
/** Roll `degrees` about the vehicle's long axis, lifted so the body never sinks into the ground. */
function roll(model:string,degrees:number,scale:number):{rotation:Q;translation:Vec3;pivot:Vec3}{
 const [width,height,cx]=dimensions[model]??[1.5,2.5,0],angle=degrees*Math.PI/180;
 const rotation=qaxis([0,0,1],degrees),pivot:Vec3=[cx*scale,height*.5*scale,0];
 const lift=Math.max(0,width*Math.abs(Math.sin(angle))+height*.5*Math.abs(Math.cos(angle))-height*.5)*scale;
 const p=qrot(rotation,pivot);return {rotation,pivot,translation:[pivot[0]-p[0],pivot[1]-p[1]+lift,-p[2]]};
}
export function vehicleStunt(model:string,time:number,duration:number,scale:number):{rotation:Q;translation:Vec3;pivot:Vec3}{
 const u=Math.max(0,Math.min(1,time/duration));return roll(model,u*u*(3-2*u)*360,scale);
}
/**
 * The empty vehicle after its driver dives out: it slides on, then rolls one and a half times away from the
 * driver's side and comes to rest upside down. Shares the stunt roll's ground clearance.
 */
export function vehicleCrash(model:string,time:number,scale:number):{rotation:Q;translation:Vec3}{
 const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);},turn=smooth((time-.75)/1.9),m=roll(model,turn*540,scale);
 return {rotation:m.rotation,translation:[m.translation[0]-turn*3*Math.PI*.9*scale,m.translation[1],m.translation[2]+3*smooth(time/2.6)*scale]};
}
