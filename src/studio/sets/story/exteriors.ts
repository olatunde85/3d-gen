import * as THREE from 'three';
import type {SetBuilder} from '../builder';
import {beam,bench,block,surfaceBlock,exteriorBounds,fence,glow,METAL,practical,ring,windowPanel} from './details';
export function highway(b:SetBuilder){
 b.floor('#969f8c');for(const x of [0,-20]){surfaceBlock(b,`carriageway-${x}`,'road',[15,.016,600],[x,-.003,0],'#656f70');for(const dx of [-7,7])block(b,[.12,.018,600],[x+dx,.01,0],'#d9d8bb');for(let z=-288;z<300;z+=12)for(const dx of [-2,2])block(b,[.12,.02,5],[x+dx,.012,z],'#dadbc5');}
 block(b,[2,.08,600],[-10,.02,0],'#a7ac9c');for(const x of [-10,9,-29]){block(b,[.14,.3,570],[x,.6,0],METAL);for(let z=-276;z<290;z+=12)block(b,[.08,.75,.08],[x,.35,z],METAL);}
 // Overpass has real clearance over both carriageways, with supports outside traffic lanes.
 block(b,[62,.65,10],[-10,5.7,-55],'#a9b0a5');for(const x of [-38,18])block(b,[1.2,5.4,3],[x,2.7,-55],'#979f96');for(const z of [-59.8,-50.2])block(b,[62,.8,.18],[-10,6.35,z],'#969e95');
 for(const x of [-30,9])block(b,[.2,6.6,.2],[x,3.3,-28],METAL);block(b,[39,.18,.18],[-10.5,6.6,-28],METAL);
 b.label('CENTRAL CITY  ↑',[0,6.2,-27.88],5.8,'#ecede1','#346958');b.label('NORTH  ↑',[-20,6.2,-27.88],5.8,'#ecede1','#346958');
 for(let z=-150;z<=150;z+=45)for(const x of [11,-32]){block(b,[.1,7,.1],[x,3.5,z],METAL);beam(b,[x,7,z],[x+(x>0?-2:2),7.3,z],.055);glow(b,[.8,.06,.32],[x+(x>0?-2:2),7.3,z],'#d9dfcf',.8);}
 for(const side of [-1,1])for(const z of [-110,-30,60,140])b.tree(side<0?-46:28,z,5.5);exteriorBounds(b);
}
function cityFacade(b:SetBuilder,x:number,z:number,night:boolean,index:number){
 const side=x<0?1:-1,color=night?(index%2?'#4d535e':'#46505c'):(index%2?'#97887b':'#a39582');
 block(b,[8,8,18],[x,4,z],color);for(const y of [3.6,5.7,7.3])for(const dz of [-5,0,5]){block(b,[.025,1.3,1.9],[x+side*4.015,y,z+dz],night?'#697f89':'#647d82');}
 block(b,[.05,.12,18],[x+side*4.04,2.8,z],'#7a8284');
 b.at(x+side*4.04,z,x<0?Math.PI/2:-Math.PI/2,()=>{windowPanel(b,x+side*4.04,z,4.2,1.8,1.3);});
}
export function neonStreet(b:SetBuilder){
 b.floor('#575f68');surfaceBlock(b,'street-road','road',[11,.015,360],[0,-.003,0],'#4c5962',.26);for(const x of [-8,8])surfaceBlock(b,`pavement-${x}`,'walkway',[5,.12,360],[x,.012,0],'#7b858b');
 for(let z=-150;z<=150;z+=30)for(const x of [-15,15])cityFacade(b,x,z,true,Math.abs(z/30));
 for(let z=-150;z<=150;z+=12)block(b,[.1,.02,4],[0,.01,z],'#b7a58e');
 // Near signs read from the camera while their supporting posts remain off the roadway.
 for(const [x,z,label,color]of [[-7,-14,'NIGHT MARKET','#b76d9f'],[7,-18,'HOTEL','#619dad'],[-7,-23,'NOODLES  /  OPEN','#bb8b67'],[7,18,'ARCADE','#8190b5']]as const){
  block(b,[.08,4.3,.08],[x,2.15,z],METAL);const sign=b.label(label,[x,3.2,z+.06],2.6,'#eff1e7',color);(sign.material as THREE.MeshStandardMaterial).emissiveIntensity=.9;glow(b,[2.7,.045,.045],[x,3.55,z+.04],color,2);glow(b,[.04,2.2,.04],[x,1.8,z+.04],color,1.5);
 }
 for(const x of [-9.5,9.5])for(const z of [-12,18,48,-42]){block(b,[.09,5,.09],[x,2.5,z],METAL);glow(b,[.7,.05,.3],[x,5,z],'#bfd2d4',1.2);}
 for(const side of [-1,1])for(const z of [-30,0,30]){const color=side<0?'#ba6da6':'#66b5cc';for(const y of [.45,2.8])glow(b,[.035,.045,17.5],[side*10.94,y,z],color,2);for(const dz of [-8,0,8])glow(b,[.035,2.35,.04],[side*10.94,1.62,z+dz],color,1.8);}
 practical(b,'#cc79b9',[-4,3,-8],25,18);practical(b,'#63b1ce',[4,3,-8],25,18);exteriorBounds(b);
}
export function alley(b:SetBuilder){
 b.floor('#96938a');surfaceBlock(b,'alley-path','walkway',[5.4,.016,360],[0,-.003,0],'#858b85');
 for(const side of [-1,1]){for(let z=-150;z<=150;z+=30){block(b,[7,7,29],[side*7.6,3.5,z],side<0?'#9b8271':'#8a8e86');for(let y=.45;y<3;y+=.38)block(b,[.012,.018,28],[side*4.09,y,z],'#b1a08c');}
  block(b,[.09,5.6,.09],[side*3.99,2.8,-4],METAL);block(b,[.09,.09,14],[side*3.99,2.8,-4],METAL);
 }
 // Delivery shutters, stacked crates, bins and a fire escape never obstruct the central route.
 block(b,[.04,2.6,2.1],[-4.02,1.3,-5],'#5d6a6c');for(let y=.2;y<2.6;y+=.2)block(b,[.05,.025,2.05],[-3.99,y,-5],'#8c9691');
 for(const z of [-2,-3.1]){b.box([.7,.95,.72],[-3.35,.48,z],'#4c6559');b.box([.77,.08,.78],[-3.35,.98,z],'#334b43');}
 for(let i=0;i<3;i++)block(b,[.75,.6,.6],[3.25,.3+i*.61,-6],'#9d8867');
 block(b,[1.3,.08,3.8],[3.35,3.3,-3],'#64706b');for(const x of [2.7,3.95]){beam(b,[x,3.35,-4.8],[x,4.1,-4.8],.025);beam(b,[x,3.35,-1.2],[x,4.1,-1.2],.025);beam(b,[x,4.1,-4.8],[x,4.1,-1.2],.025);}
 for(let y=.3;y<3.5;y+=.28)block(b,[.65,.035,.05],[3.45,y,-.8],METAL);for(const x of [3.1,3.8])block(b,[.04,3.7,.05],[x,1.85,-.8],METAL);
 b.label('DELIVERIES',[0,4.5,-19],2.8,'#dad9c2','#66746e');for(const x of [-3.9,3.9])glow(b,[.08,.22,.35],[x,2.5,-5],'#d3d8c0',.6);exteriorBounds(b);
}
function stand(b:SetBuilder,x:number,z:number,yaw:number){
 b.at(x,z,yaw,()=>{
  for(let row=0;row<12;row++){block(b,[80,.48,1.1],[x,.55+row*.66,z-row*1.12],'#9aa49e');
   for(let col=0;col<48;col++){if(col===23||col===24)continue;const sx=x+(col-23.5)*1.55;block(b,[.7,.16,.5],[sx,.9+row*.66,z-row*1.12],'#54748a');block(b,[.7,.45,.1],[sx,1.12+row*.66,z-row*1.12-.24],(row+Math.floor(col/8))%3?'#54748a':'#819696');}
  }
  block(b,[82,.2,3],[x,10.5,z-8],'#c2c8be');for(const dx of [-37,37])block(b,[.25,10,.25],[x+dx,5,z-13],METAL);
 });
}
export function stadium(b:SetBuilder){
 b.floor('#81917b');b.group.userData.spatialRegions=[{id:'football-pitch',kind:'court',bounds:[-34,-52.5,34,52.5],y:0}];
 for(let i=0;i<14;i++)block(b,[68,.012,7.5],[0,-.001,-48.75+i*7.5],i%2?'#698768':'#5f7d60');
 const white='#e4e7d4';for(const x of [-34,34])block(b,[.12,.018,105],[x,.014,0],white);for(const z of [-52.5,0,52.5])block(b,[68,.018,.12],[0,.014,z],white);
 const centre=ring(b,9.15,.06,[0,.023,0],white);centre.rotation.x=Math.PI/2;b.cylinder(.12,.01,[0,.025,0],white);
 for(const side of [-1,1]){
  for(const [width,depth]of [[40.32,16.5],[18.32,5.5]]){const end=side*(52.5-depth);block(b,[width,.018,.12],[0,.016,end],white);for(const x of [-width/2,width/2])block(b,[.12,.018,depth],[x,.016,side*(52.5-depth/2)],white);}
  b.cylinder(.12,.01,[0,.025,side*41.5],white);
  for(const x of [-3.66,3.66]){b.cylinder(.055,2.44,[x,1.22,side*52.5],white);beam(b,[x,2.44,side*52.5],[x,.05,side*54.5],.035,white);}beam(b,[-3.66,2.44,side*52.5],[3.66,2.44,side*52.5],.055,white);
  fence(b,0,side*54.5,7.32,2.4);for(const x of [-3.66,3.66])fence(b,x,side*53.5,2,2.4,Math.PI/2);
  stand(b,0,side*62,side<0?0:Math.PI);
 }
 stand(b,-43,0,Math.PI/2);stand(b,43,0,-Math.PI/2);
 for(const x of [-42,42])for(const z of [-57,57]){block(b,[.24,22,.24],[x,11,z],METAL);block(b,[5.5,2,.3],[x,22,z],'#465760');for(let i=0;i<6;i++)glow(b,[.65,1.3,.08],[x-2.2+i*.88,22,z+.2],'#d8e4dc',.8);}
 b.screen(0,12,-75,10,'#253f4d',0,.6,'HOME  0 : 0  AWAY');bench(b,37,0,4,'#526d7b',-Math.PI/2);bench(b,-37,0,4,'#526d7b',Math.PI/2);exteriorBounds(b);
}
