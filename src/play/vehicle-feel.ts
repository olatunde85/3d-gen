/**
 * Body motion and lamps for a driven vehicle: the body leans out of corners, dips under braking and squats under
 * power, and the brake lamps light as it slows. Small angles about the vehicle's own origin, applied to the vehicle
 * and its occupants alike so seats and hands stay in contact.
 */
import type {Object3D} from 'three';
import type {Vehicle} from '../core/props/vehicle';
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export class VehicleFeel {
 private speed=0;private yaw=0;private ready=false;private roll=0;private pitch=0;private brake=0;
 /** Headlight level, 0..1, set from the time of day. */
 headlights=0;
 update(vehicle:Vehicle,state:{speed:number;yaw:number},dt:number,bodies:readonly Object3D[],extraPitch=0){
  const step=Math.min(.1,Math.max(1e-3,dt));
  if(!this.ready){this.speed=state.speed;this.yaw=state.yaw;this.ready=true;}
  const accel=(state.speed-this.speed)/step,yawRate=wrap(state.yaw-this.yaw)/step;this.speed=state.speed;this.yaw=state.yaw;
  const k=1-Math.exp(-step*7),clamp=(v:number,m:number)=>Math.max(-m,Math.min(m,v));
  this.roll+=(clamp(yawRate*Math.abs(state.speed)*.0042,.065)-this.roll)*k;
  this.pitch+=(clamp(-accel*.0045,.045)-this.pitch)*k;
  this.brake+=((accel<-4&&Math.abs(state.speed)>1?1:0)-this.brake)*(1-Math.exp(-step*14));
  for(const body of bodies){body.rotation.order='YXZ';body.rotation.x=this.pitch+extraPitch;body.rotation.z=this.roll;}
  vehicle.setLights(this.brake,this.headlights);
 }
 reset(){this.ready=false;this.roll=this.pitch=this.brake=0;}
}
/** Headlights by time of day. */
export const headlightLevel=(time?:string)=>time==='night'?1:time==='dusk'?.7:time==='dawn'?.5:0;
