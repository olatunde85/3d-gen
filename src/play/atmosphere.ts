/** Bounded atmosphere effects and practical lights, driven by simulation time. */
import * as T from 'three';
import type {EscapeGame} from './runtime';
import {defaultEnvironment,floodlightAnchors} from './environment';
export class AtmosphereView {
 readonly group=new T.Group();private hemisphere=new T.HemisphereLight();private torch=new T.SpotLight('#eef7ff',0,26,Math.PI/7,.65,1.1);private lamps:T.PointLight[]=[];private weather?:T.Points;private key='';
 constructor(){this.group.add(this.hemisphere,this.torch,this.torch.target);}
 update(g:EscapeGame,sun:T.DirectionalLight,scene:T.Scene){
  const e=g.mission.environment??defaultEnvironment(),key=g.world.id+JSON.stringify(e),night=e.time==='night',warm=e.time==='dawn'||e.time==='dusk',sky=night?'#101a30':e.weather==='sandstorm'?'#ac9371':warm?'#bd9380':'#b6c8d1';
  if(key!==this.key){this.key=key;for(const lamp of this.lamps)lamp.removeFromParent();this.lamps=[];if(this.weather){this.weather.geometry.dispose();(this.weather.material as T.Material).dispose();this.weather.removeFromParent();this.weather=undefined;}
   if(night)for(const p of floodlightAnchors(g.world.bounds,g.world.gate)){const light=new T.PointLight('#ffdaa1',38,12,1.5);light.position.set(p.x,4,p.z);this.group.add(light);this.lamps.push(light);}
   if(e.weather==='rain'||e.weather==='sandstorm'){const positions=new Float32Array(450*3);for(let i=0;i<450;i++){positions[i*3]=((i*73.731)%1)*60-30;positions[i*3+1]=((i*13.173)%1)*16;positions[i*3+2]=((i*19.917)%1)*60-30;}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));this.weather=new T.Points(geometry,new T.PointsMaterial({color:e.weather==='rain'?'#a9c5df':'#d3b48a',size:e.weather==='rain'?.045:.1,transparent:true,opacity:.55,depthWrite:false}));this.group.add(this.weather);}
  }
  scene.background=new T.Color(sky);scene.fog=new T.Fog(sky,e.weather==='fog'?12:e.weather==='sandstorm'?10:night?26:45,e.weather==='fog'?48:e.weather==='sandstorm'?45:night?85:120);
  this.hemisphere.color.set(night?'#8094bd':warm?'#f7d3bb':'#dcecff');this.hemisphere.groundColor.set('#494e45');this.hemisphere.intensity=night?.38:warm?1.2:2;scene.environmentIntensity=night?.13:.5;sun.color.set(night?'#8ea9dc':warm?'#ffb57b':'#ffe2ad');sun.intensity=night?.4:warm?2.1:3.1;
  const x=g.world.getaway?.course?g.player.x:0,z=g.world.getaway?.course?g.player.z:0;sun.position.set(x-12,night?18:warm?8:22,z+10);sun.target.position.set(x,0,z);sun.target.updateMatrixWorld(true);
  this.torch.intensity=e.flashlight&&g.flashlight?32:0;this.torch.position.set(g.player.x,g.player.y+g.player.height*.8,g.player.z);this.torch.target.position.set(g.player.x+Math.sin(g.player.yaw)*10,g.player.y+.8,g.player.z+Math.cos(g.player.yaw)*10);this.torch.target.updateMatrixWorld(true);
  if(this.weather){this.weather.position.set(g.player.x,e.weather==='rain'?-(g.time*9%16):0,g.player.z);const a=this.weather.geometry.getAttribute('position')as T.BufferAttribute;for(let i=0;i<a.count;i++){const y=(((i*13.173)%1)*16-g.time*(e.weather==='rain'?9:.5))%16;a.setY(i,(y+16)%16);}a.needsUpdate=true;this.weather.position.y=0;}
 }
 dispose(){this.weather?.geometry.dispose();if(this.weather)(this.weather.material as T.Material).dispose();this.group.removeFromParent();}
}
