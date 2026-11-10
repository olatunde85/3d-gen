import * as T from 'three';
import type {MotorBody} from './motor';
import {defaultCamera,type CameraSettings,type CameraView} from './presentation';
export const CAMERA_TILT={min:0,max:80*Math.PI/180}as const;
/** Only the movement body drives follow. Aim, fire, reactions and actor facing cannot reframe it. */
export class PlayCamera {
 private perspective=new T.PerspectiveCamera(48,1,.1,180);
 private orthographic=new T.OrthographicCamera(-5,5,5,-5,.1,180);
 private settings=defaultCamera();private current:CameraView='orbit';
 private center=new T.Vector3();private saved=new Map<CameraView,{azimuth:number;zoom:number;elevation:number}>();
 private pitch=3*Math.PI/180;private vehicleBlend=0;private orbitHold=0;
 azimuth=0;zoom=9;
 get elevation(){return this.pitch;}
 get view(){return this.current;}
 get camera(){return this.current==='overhead'||this.current==='isometric'?this.orthographic:this.perspective;}
 configure(settings:CameraSettings,body:MotorBody){this.vehicleBlend=0;this.orbitHold=0;this.settings=structuredClone(settings);this.saved.clear();this.current=settings.default;this.azimuth=this.initialAngle(this.current,body);this.pitch=this.initialElevation(this.current);this.zoom=9;this.reset(body);}
 private initialAngle(view:CameraView,body:MotorBody){return view==='isometric'?Math.PI/4:view==='overhead'?0:Math.atan2(Math.sin(body.yaw+Math.PI),Math.cos(body.yaw+Math.PI));}
 private initialElevation(view:CameraView){return view==='overhead'?Math.PI/2:view==='isometric'?Math.atan(1/Math.sqrt(2)):3*Math.PI/180;}
 setView(view:CameraView,body:MotorBody):boolean {
  if(!this.settings.allowed.includes(view)||view===this.current)return false;
  this.saved.set(this.current,{azimuth:this.azimuth,zoom:this.zoom,elevation:this.pitch});this.current=view;
  const prior=this.saved.get(view);this.azimuth=prior?.azimuth??this.initialAngle(view,body);this.pitch=prior?.elevation??this.initialElevation(view);this.zoom=prior?.zoom??9;this.reset(body);return true;
 }
 cycle(body:MotorBody,direction=1){const index=this.settings.allowed.indexOf(this.current);return this.setView(this.settings.allowed[(index+(direction<0?this.settings.allowed.length-1:1))%this.settings.allowed.length],body);}
 rotate(horizontal:number,vertical=0){
  if(!this.settings.rotate)return;this.orbitHold=2.5;
  if(Number.isFinite(horizontal))this.azimuth+=horizontal;
  if((this.current==='orbit'||this.current==='close')&&Number.isFinite(vertical))this.pitch=Math.max(CAMERA_TILT.min,Math.min(CAMERA_TILT.max,this.pitch+vertical));
 }
 dolly(delta:number){if(this.settings.zoom&&Number.isFinite(delta))this.zoom=Math.max(6,Math.min(15,this.zoom+delta));}
 private follow(body:MotorBody){return new T.Vector3(body.x,body.y+(this.current==='close'?body.height*.65:.9),body.z);}
 reset(body:MotorBody){this.center.copy(this.follow(body));}
 update(body:MotorBody,dt:number,aspect:number,height:number,vehicle?:{yaw:number;speed:number}){
  this.orbitHold=Math.max(0,this.orbitHold-dt);this.vehicleBlend+=((vehicle?1:0)-this.vehicleBlend)*(1-Math.exp(-dt*4));if(vehicle&&Math.abs(vehicle.speed)>.5&&this.orbitHold===0&&(this.current==='orbit'||this.current==='close')){const angle=vehicle.yaw+Math.PI-this.azimuth;this.azimuth+=Math.atan2(Math.sin(angle),Math.cos(angle))*(1-Math.exp(-dt*2.5));}
  this.center.lerp(this.follow(body),1-Math.exp(-Math.max(0,dt)*7));
  const wide=aspect<.8?.9:aspect>1.8&&height<430?.65:1,d=this.zoom*wide*(1+this.vehicleBlend*.45),s=Math.sin(this.azimuth),c=Math.cos(this.azimuth),camera=this.camera;
  this.perspective.aspect=aspect;this.perspective.updateProjectionMatrix();
  const half=d*(this.current==='overhead'?.9:.625);Object.assign(this.orthographic,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.orthographic.updateProjectionMatrix();
  camera.up.set(0,1,0);
  if(this.current==='overhead'){
   camera.position.copy(this.center).add(new T.Vector3(0,d*1.65,0));camera.up.set(-s,0,-c);camera.lookAt(this.center);
  }else if(this.current==='isometric'){
   camera.position.copy(this.center).add(new T.Vector3(s*d,d/Math.sqrt(2),c*d));camera.lookAt(this.center);
  }else if(this.current==='close'){
   const radius=Math.hypot(d*.55,Math.max(1.3,d*.33)),horizontal=radius*Math.cos(this.pitch),target=this.center.clone().add(new T.Vector3(c*.5*wide,0,-s*.5*wide));camera.position.copy(target).add(new T.Vector3(s*horizontal,radius*Math.sin(this.pitch),c*horizontal));camera.lookAt(target);
  }else{const radius=d*Math.hypot(1,.78),horizontal=radius*Math.cos(this.pitch);camera.position.copy(this.center).add(new T.Vector3(s*horizontal,radius*Math.sin(this.pitch),c*horizontal));camera.lookAt(this.center);}
  camera.updateMatrixWorld();return camera;
 }
}
