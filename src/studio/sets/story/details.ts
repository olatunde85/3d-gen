/** Original, reusable set dressing. Shared low-poly shapes and bounded procedural maps. */
import * as THREE from 'three';
import {SetBuilder} from '../builder';
export const METAL='#6d7b80',WHITE='#e8e8df',DARK='#283237';
export function block(b:SetBuilder,size:number[],pos:number[],color:string,roughness=.8){return b.mesh(b.geometry('story-block',()=>new THREE.BoxGeometry()),b.material(color,roughness),pos,size);}
export function glow(b:SetBuilder,size:number[],pos:number[],color:string,intensity=1.4){const m=block(b,size,pos,color);m.material=b.material(color,.45,0,intensity);m.castShadow=false;return m;}
export function ring(b:SetBuilder,radius:number,tube:number,pos:number[],color:string){return b.mesh(b.geometry(`story-ring:${tube/radius}`,()=>new THREE.TorusGeometry(1,tube/radius,6,48)),b.material(color),pos,[radius,radius,radius]);}
export function beam(b:SetBuilder,a:number[],c:number[],radius=.025,color=METAL){const start=new THREE.Vector3(...a as [number,number,number]),end=new THREE.Vector3(...c as [number,number,number]),delta=end.clone().sub(start),m=b.cylinder(radius,delta.length(),start.add(end).multiplyScalar(.5).toArray(),color);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;}
export function practical(b:SetBuilder,color:string,pos:number[],intensity=8,distance=9){const light=new THREE.PointLight(color,intensity,distance,2);light.position.set(...pos as [number,number,number]);b.group.add(light);return light;}
export function shell(b:SetBuilder,color='#c4c9c7',floor='#aaa99f',width=12,depth=11,height=4.2){
 b.floor(floor);b.wall(width,height,[0,height/2,-depth/2],color);b.wall(depth,height,[-width/2,height/2,0],color,Math.PI/2);b.wall(depth,height,[width/2,height/2,0],color,-Math.PI/2);
 for(const y of [.08,1.05])block(b,[width,.045,.035],[0,y,-depth/2+.015],y<1?'#777e7d':'#b7bfbd');
 b.group.userData.roomBounds={minX:-width/2,maxX:width/2,minZ:-depth/2,maxZ:depth/2};
}
export function windowPanel(b:SetBuilder,x:number,z:number,width=2,height=2,y=2.3,yaw=0){b.at(x,z,yaw,()=>{const pane=b.wall(width,height,[x,y,z],'#829da7');pane.material=b.material(b.mood==='night'?'#304a62':'#829da7',.25,.2,.15);for(const dx of [-width/2,0,width/2])block(b,[.04,height+.06,.05],[x+dx,y,z+.025],WHITE);for(const dy of [-height/2,0,height/2])block(b,[width,.04,.05],[x,y+dy,z+.025],WHITE);});}
export function door(b:SetBuilder,x:number,z:number,label:string,color='#435b65',width=1.1){
 b.wall(width,2.3,[x,1.15,z],color);for(const dx of [-width/2,width/2])block(b,[.065,2.4,.07],[x+dx,1.2,z+.03],METAL);block(b,[width+.1,.06,.07],[x,2.4,z+.03],METAL);block(b,[.17,.035,.06],[x+width*.3,1.04,z+.08],'#b5bdba');b.label(label,[x,2.65,z+.04],Math.min(1.6,width*1.3));
}
export function bench(b:SetBuilder,x:number,z:number,width=2.4,color='#7f8178',yaw=0){b.at(x,z,yaw,()=>{block(b,[width,.12,.52],[x,.46,z],color);block(b,[width,.48,.08],[x,.75,z-.23],color);for(const dx of [-width*.36,width*.36])block(b,[.12,.42,.42],[x+dx,.21,z],METAL);for(let i=0;i<Math.floor(width/.6);i++)b.seat(x+(i-(Math.floor(width/.6)-1)/2)*.6,.52,z+.02);});}
export function toilet(b:SetBuilder,x:number,z:number,yaw=0,steel=false){const c=steel?'#aab3b4':WHITE;b.at(x,z,yaw,()=>{
 b.ball([.2,.28,.28],[x,.23,z],c);b.ball([.25,.12,.34],[x,.38,z+.06],c);const opening=b.cylinder(.19,.008,[x,.507,z+.09],'#52676e');opening.scale.z*=1.35;
 const seat=ring(b,.235,.028,[x,.52,z+.065],steel?'#bfc5c5':'#f2f0e8');seat.rotation.x=Math.PI/2;seat.scale.y*=1.34;
 b.box([.45,.5,.18],[x,.62,z-.28],c);block(b,[.46,.035,.2],[x,.88,z-.28],c);block(b,[.075,.018,.04],[x+.13,.902,z-.28],METAL);
 });}
export function basin(b:SetBuilder,x:number,z:number,yaw=0){b.at(x,z,yaw,()=>{
 b.box([.66,.12,.46],[x,.87,z],WHITE);const bowl=b.cylinder(.2,.025,[x,.94,z+.02],'#8bafb6');bowl.scale.z*=.65;
 beam(b,[x,.92,z-.16],[x,1.18,z-.16],.018);beam(b,[x,1.18,z-.16],[x,1.18,z+.015],.018);b.cylinder(.025,.42,[x,.61,z],METAL);
 for(const dx of [-.25,.25])b.cylinder(.025,.035,[x+dx,.96,z-.12],METAL);
 });}
const fenceMaps=new WeakMap<SetBuilder,Map<string,THREE.MeshStandardMaterial>>();
export function fence(b:SetBuilder,x:number,z:number,width:number,height=4,yaw=0){
 let cache=fenceMaps.get(b);if(!cache)fenceMaps.set(b,cache=new Map());const key=`${width}:${height}`;let material=cache.get(key);
 if(!material){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!;g.strokeStyle='#b3bebc';g.lineWidth=2;g.beginPath();g.moveTo(0,32);g.lineTo(32,0);g.lineTo(64,32);g.lineTo(32,64);g.closePath();g.stroke();const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(width*7,height*7);material=new THREE.MeshStandardMaterial({map,alphaTest:.4,side:THREE.DoubleSide,roughness:.5,metalness:.35});cache.set(key,material);}
 b.at(x,z,yaw,()=>{const panel=b.mesh(b.geometry('story-fence',()=>new THREE.PlaneGeometry()),material!,[x,height/2,z],[width,height,1]);panel.castShadow=false;for(const dx of [-width/2,width/2])b.cylinder(.045,height+.2,[x+dx,height/2,z],METAL);for(const y of [.08,height])beam(b,[x-width/2,y,z],[x+width/2,y,z],.025);});
}
export function tower(b:SetBuilder,x:number,z:number){
 for(const dx of [-1,1])for(const dz of [-1,1])block(b,[.2,5.5,.2],[x+dx,2.75,z+dz],METAL);
 for(const dz of [-1,1]){beam(b,[x-1,.4,z+dz],[x+1,4.8,z+dz],.045);beam(b,[x+1,.4,z+dz],[x-1,4.8,z+dz],.045);}
 block(b,[2.8,.2,2.8],[x,5.1,z],'#767e76');block(b,[2.5,1.6,2.5],[x,5.95,z],'#8b9487');for(const dz of [-1.26,1.26])block(b,[2.2,.65,.02],[x,6.15,z+dz],'#38515a');block(b,[3,.15,3],[x,6.85,z],DARK);
}
export function exteriorBounds(b:SetBuilder){b.group.userData.performanceBounds={minX:-180,maxX:180,minZ:-180,maxZ:180};}
