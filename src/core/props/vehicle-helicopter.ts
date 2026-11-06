/** An original four-seat light helicopter, fitted around the pilot rather than enclosing a solid body. */
import * as T from 'three';
import {VehicleKit,v} from './vehicle-kit';
import {HELICOPTER as H} from './helicopter-layout';
/** Smooth longitudinal shell; end rings close without a faceted wedge or a solid cabin interior. */
function loft(k:VehicleKit,rings:{z:number;x:number;y:number;w:number;h:number}[],material:T.Material,half?:'lower'|'upper'){
 const N=32,positions:number[]=[],indices:number[]=[];
 for(const r of rings)for(let j=0;j<=N;j++){const a=(half==='lower'?Math.PI:0)+j/N*(half?Math.PI:2*Math.PI);positions.push(r.x+Math.cos(a)*r.w,r.y+Math.sin(a)*r.h,r.z);}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<N;j++){const a=i*(N+1)+j,b=a+N+1;if(rings.at(-1)!.z>rings[0].z)indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const m=k.mesh(g,material);return m;
}
export function buildHelicopter(k:VehicleKit){
 const s=k.fit.scale,hip=k.fit.average('hip'),cx=H.centerX*s,z=hip.z,deck=H.deck*s;
 const roof=Math.max(...k.fit.samples.map(c=>c.headTop.y))+.17*s,seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.09*s;
 const sport=k.style.variant==='sport';
 // A belly below the floor and a separate roof leave actual apertures for all four doors.
 loft(k,[[-2,.03,.10],[-1.6,.68,.26],[-1.1,.98,.30],[.4,1.05,.32],[1.15,.82,.28],[1.65,.30,.10],[1.8,.01,.01]].map(([zz,w,h])=>({z:z+zz*s,x:cx,y:deck+.035*s,w:w*s,h:h*s})),k.paint,'lower');
 k.box(v(cx,deck-.025*s,z-.22*s),v(1.91*s,.05*s,2.8*s),k.dark);
 k.ellipsoid(v(cx,roof+.12*s,z-.35*s),v(1.04*s,.18*s,1.5*s),k.paint);
 // Rounded instrument nose and a curved, transparent bubble windshield.
 k.ellipsoid(v(cx,deck+.12*s,z+1.07*s),v(.90*s,.38*s,.76*s),k.paint);
 const glassRings=[];for(let i=0;i<=16;i++){const a=i/16*Math.PI/2,zz=.52+Math.sin(a)*1.19;glassRings.push({z:z+zz*s,x:cx,y:deck+.2*s,w:Math.max(.012,Math.cos(a))*.97*s,h:Math.max(.015,Math.cos(a))*(roof-deck-.2*s)});}
 loft(k,glassRings,k.glass,'upper');
 for(let i=1;i<glassRings.length;i++){const a=glassRings[i-1],b=glassRings[i];k.tube(v(cx,a.y+a.h,a.z),v(cx,b.y+b.h,b.z),.018*s,k.dark);}
 for(const side of [-1,1]){
  const x=cx+side*H.width*.49*s;
  // Slim sills and pillars, not an opaque fuselage intersecting a boarding actor.
  k.tube(v(x,deck,z-1.48*s),v(x,deck,z+.58*s),.035*s,k.trim);
  for(const zz of [-1.48,-.49,.58])k.tube(v(x,deck,z+zz*s),v(x,roof-.04*s,z+zz*s),.035*s,k.paint);
  k.tube(v(x,roof-.04*s,z-1.48*s),v(x,roof-.04*s,z+.58*s),.035*s,k.trim);
  for(const rear of [false,true]){
   const front=(rear?-.49:.58)*s,back=(rear?-1.48:-.49)*s,door=k.component(`Door_${rear?'rear_':''}${side>0?'left':'right'}`,v(x,deck,z+front));
   door.userData.doorSide=side;door.userData.rearDoor=rear;door.userData.occupantDoor=!rear&&side<0;
   const depth=front-back-.07*s,height=roof-deck-.11*s,belt=Math.min(height*.45,.48*s);
   k.box(v(0,belt/2,-depth/2-.035*s),v(.04*s,belt,depth),k.paint,door);
   const window=k.component(`Window_${rear?'rear_':''}${side>0?'left':'right'}`,v(0,belt,0),door);
   k.box(v(0,(height-belt)/2,-depth/2-.035*s),v(.016*s,height-belt,depth),k.glass,window);
   for(const yy of [belt,height])k.tube(v(0,yy,-.035*s),v(0,yy,-depth-.035*s),.018*s,k.dark,door);
   for(const zz of [-.035*s,-depth-.035*s])k.tube(v(0,0,zz),v(0,height,zz),.02*s,k.dark,door);
   k.box(v(side*.03*s,belt*.8,-depth*.80),v(.035*s,.035*s,.16*s),k.trim,door);
  }
 }
 // Rear bulkhead and four full seats at the fitted support height.
 loft(k,[{z:z-2.02*s,x:cx,y:(deck+roof)/2,w:.25*s,h:(roof-deck)*.31},{z:z-1.85*s,x:cx,y:(deck+roof)/2,w:.77*s,h:(roof-deck)*.45},{z:z-1.55*s,x:cx,y:(deck+roof)/2,w:1.02*s,h:(roof-deck)*.49}],k.paint);
 for(const x of [0,H.seatWidth*s])for(const zz of [z,z-H.seatPitch*s]){
  k.box(v(x,seatY-.035*s,zz-.02*s),v(.54*s,.13*s,.48*s),k.seat);
  const back=k.box(v(x,seatY+.27*s,zz-.30*s),v(.54*s,.60*s,.11*s),k.seat);back.rotation.x=-.08;
  k.ellipsoid(v(x,seatY+.64*s,zz-.33*s),v(.17*s,.105*s,.065*s),k.seat);
 }
 // Landing skids, upswept toes and a non-slip boarding step at each door.
 for(const side of [-1,1]){
  const x=cx+side*1.12*s;
  k.tube(v(x,.09*s,z-1.65*s),v(x,.09*s,z+1.15*s),.055*s,k.dark);
  k.tube(v(x,.09*s,z+1.15*s),v(x,.25*s,z+1.48*s),.055*s,k.dark);
  for(const zz of [-.9,.5]){k.tube(v(cx+side*.62*s,deck,z+zz*s),v(x,.11*s,z+zz*s),.045*s,k.trim);}
  k.box(v(x,.25*s,z-.48*s),v(.24*s,.045*s,1.75*s),k.dark);
 }
 k.box(v(cx,hip.y+.15*s,z+.63*s),v(1.65*s,.27*s,.24*s),k.dark);
 for(const x of [cx-.4*s,cx+.4*s])for(const dx of [-.15,.1]){const gauge=k.mesh(new T.CylinderGeometry(.065*s,.065*s,.012*s,20),k.trim);gauge.rotation.x=Math.PI/2;gauge.position.set(x+dx*s,hip.y+.16*s,z+.498*s);k.ellipsoid(v(x+dx*s,hip.y+.16*s,z+.488*s),v(.048*s,.048*s,.008*s),k.dark);}
 for(const key of ['left','right']as const){const control=k.component(key==='right'?'Cyclic':'Collective'),grip=k.box(v(),v(.045*s,.11*s,.045*s),k.seat,control);grip.rotation.x=-.12;
  k.updates.push(c=>{control.position.copy(c[key]);});const hand=k.fit.average(key);k.tube(v(hand.x,deck,hand.z+.035*s),hand.clone().add(v(0,-.06*s,0)),.018*s,k.dark);
 }
 for(const key of ['footLeft','footRight']as const){const foot=k.fit.average(key);k.box(foot.clone().add(v(0,-.015*s,.045*s)),v(.17*s,.025*s,.13*s),k.rubber);}
 // Tapered tail boom and fins sit above the rear cabin, well clear of occupants.
 loft(k,[{z:z-1.35*s,x:cx,y:roof-.20*s,w:.42*s,h:.30*s},{z:z-2.1*s,x:cx,y:roof-.13*s,w:.27*s,h:.22*s},{z:z-5.1*s,x:cx,y:roof+.16*s,w:.075*s,h:.10*s}],k.paint);
 const fin=k.box(v(cx,roof+.46*s,z-4.9*s),v(.07*s,1.05*s,.57*s),k.paint);fin.rotation.x=-.25;
 k.box(v(cx,roof+.11*s,z-3.9*s),v(1.48*s,.065*s,.38*s),k.trim);
 k.ellipsoid(v(cx,roof+.14*s,z-.65*s),v(.48*s,.27*s,.65*s),k.paint);
 for(const side of [-1,1]){const exhaust=k.mesh(new T.CylinderGeometry(.095*s,.095*s,.28*s,16),k.dark);exhaust.rotation.x=Math.PI/2;exhaust.position.set(cx+side*.28*s,roof+.18*s,z-1.16*s);}
 const mastY=roof+.55*s;k.tube(v(cx,roof,z-.45*s),v(cx,mastY,z-.45*s),.065*s,k.dark);
 const main=k.component('Main_rotor',v(cx,mastY,z-.45*s));k.ellipsoid(v(),v(.20*s,.085*s,.20*s),k.trim,main);
 const radius=(sport?H.rotorRadius*.96:H.rotorRadius)*s;
 for(let i=0;i<3;i++){const blade=k.component(`Main_blade_${i}`,v(),main);blade.rotation.y=i*Math.PI*2/3;k.box(v(0,.015*s,radius*.54),v(.17*s,.025*s,radius*.90),k.dark,blade);k.box(v(0,.02*s,radius*.94),v(.17*s,.026*s,.14*s),k.trim,blade);}
 const tail=k.component('Tail_rotor',v(cx-.15*s,roof+.30*s,z-5.1*s));k.tube(v(-.12*s,0,0),v(.12*s,0,0),.035*s,k.dark,tail);
 for(let i=0;i<4;i++){const blade=k.component(`Tail_blade_${i}`,v(),tail);blade.rotation.x=i*Math.PI/2;k.box(v(0,.34*s,0),v(.025*s,.61*s,.085*s),k.dark,blade);k.box(v(0,.62*s,0),v(.027*s,.07*s,.085*s),k.trim,blade);}
 k.updates.push((_,t)=>{const on=1-Number(k.group.userData.parkedWeight??0);main.rotation.y=on*t/k.fit.clip.duration*Math.PI*2*32;tail.rotation.x=on*t/k.fit.clip.duration*Math.PI*2*160;});
 // Navigation lights are materials, not extra dynamic lights per vehicle.
 const red=new T.MeshStandardMaterial({name:'Helicopter port light',color:'#cc3930',emissive:'#9c211c',roughness:.3}),green=new T.MeshStandardMaterial({name:'Helicopter starboard light',color:'#42a58a',emissive:'#26755f',roughness:.3});
 k.ellipsoid(v(cx+.98*s,roof-.2*s,z-.52*s),v(.045*s,.045*s,.06*s),red);k.ellipsoid(v(cx-.98*s,roof-.2*s,z-.52*s),v(.045*s,.045*s,.06*s),green);
 k.box(v(cx,deck+.12*s,z+1.7*s),v(.18*s,.08*s,.025*s),k.light);
}
