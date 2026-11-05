/** Open hulls, decks, steering and moving paddles/oars. */
import * as T from 'three';
import {VehicleKit,v,type V} from './vehicle-kit';
/** A floor cut to the inner hull at its actual elevation, rather than a protruding rectangle. */
function fittedDeck(k:VehicleKit,length:number,beam:number,height:number,z:number,y:number){
 const s=k.fit.scale,points:V[]=[];
 for(const side of [1,-1])for(let i=0;i<=40;i++){
  const t=(side===1?i/40:1-i/40)*1.46-.73,rim=height+.08*s*Math.abs(t)**5,bottom=height*Math.abs(t)**4+.035*s;
  if(y<=bottom)continue;
  const profile=Math.max(.035,(1-Math.abs(t)**2.8)**.65),ratio=Math.min(1,Math.max(0,(rim-y)/(rim-bottom))),half=(beam*.5*profile-.025*s)*Math.sqrt(1-ratio**(2/.7))-.022*s;
  points.push(v(side*Math.max(.005*s,half),0,z+t*length*.5));
 }
 const shape=new T.Shape();points.forEach((p,i)=>i?shape.lineTo(p.x,p.z):shape.moveTo(p.x,p.z));shape.closePath();
 const deck=k.mesh(new T.ExtrudeGeometry(shape,{depth:.035*s,steps:1,bevelEnabled:false}),k.seat);deck.rotation.x=Math.PI/2;deck.position.y=y;
}
function hull(k:VehicleKit,length:number,beam:number,height:number,z:number,deck=false){
 const N=28,M=16,positions:number[]=[],indices:number[]=[],s=k.fit.scale;
 // Inner and outer skins meet at a gunwale. The bottom remains below the rider's feet.
 for(let shell=0;shell<2;shell++)for(let i=0;i<=N;i++)for(let j=0;j<=M;j++){
  const t=i/N*2-1,angle=j/M*Math.PI,profile=Math.max(.035,(1-Math.abs(t)**2.8)**.65),rim=height+.08*s*Math.abs(t)**5;
  const width=beam*.5*profile-(shell?.025*s:0),bottom=height*Math.abs(t)**4+(shell?.035*s:0);
  positions.push(Math.cos(angle)*Math.max(.008*s,width),rim-(rim-bottom)*Math.sin(angle)**.7,z+t*length*.5);
 }
 const layer=(N+1)*(M+1),q=(a:number,b:number,c:number,d:number,flip=false)=>indices.push(...(flip?[a,c,b,a,d,c]:[a,b,c,a,c,d]));
 for(let shell=0;shell<2;shell++)for(let i=0;i<N;i++)for(let j=0;j<M;j++){const a=shell*layer+i*(M+1)+j;q(a,a+1,a+M+2,a+M+1,shell===0);}
 for(let i=0;i<N;i++)for(const j of [0,M]){const a=i*(M+1)+j;q(a,a+M+1,a+M+1+layer,a+layer,j===0);}
 for(const i of [0,N])for(let j=0;j<M;j++){const a=i*(M+1)+j;q(a,a+layer,a+1+layer,a+1,i===0);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
 const mat=k.paint;k.mesh(geo,mat);
 for(const side of [-1,1]){let prev:V|undefined;for(let i=0;i<=N;i++){const t=i/N*2-1,profile=Math.max(.035,(1-Math.abs(t)**2.8)**.65),p=v(side*beam*.5*profile,height+.08*s*Math.abs(t)**5,z+t*length*.5);if(prev)k.tube(prev,p,.014*s,k.trim);prev=p;}}
 if(deck&&k.fit.id!=='motorboat')fittedDeck(k,length,beam,height,z,.14*s);
}
function blade(k:VehicleKit,parent:T.Object3D,z:number,double=false){
 const s=k.fit.scale,m=k.ellipsoid(v(0,0,z),v(.095*s,.018*s,.25*s),k.paint,parent);if(double)m.rotation.z=.3;return m;
}
export function buildWatercraft(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),low=Math.min(...k.fit.samples.map(c=>c.hip.y)),id=k.fit.id,sport=k.style.variant==='sport';
 const dimensions={canoe:[3.45,.83,.48],kayak:[3.15,.84,.38],rowboat:[3.05,1.25,.49],motorboat:[4.9,2.45,.78]}[id as 'canoe'|'kayak'|'rowboat'|'motorboat'];
 const [baseLength,beam,height]=dimensions.map(x=>x*s),length=baseLength*(sport?.96:1),z=H.z+.25*s;
 hull(k,length,beam,height,z,id!=='kayak');
 if(id==='motorboat'){
  fittedDeck(k,length,beam,height,z,.32*s);
  const c=k.fit.average('left').add(k.fit.average('right')).multiplyScalar(.5);
  const consoleTop=c.y+.04*s,consoleFloor=.34*s;
  k.box(v(0,(consoleFloor+consoleTop)/2,c.z+.16*s),v(.58*s,consoleTop-consoleFloor,.30*s),k.paint);
  k.box(v(0,.36*s,c.z+.16*s),v(.68*s,.06*s,.39*s),k.trim);
  k.box(v(0,c.y+.06*s,c.z+.21*s),v(.7*s,.07*s,.38*s),k.dark);
  k.steering(.2*s,35*Math.PI/180);
  for(const x of [-.2,.2])k.ellipsoid(v(x*s,c.y+.11*s,c.z+.13*s),v(.05*s,.03*s,.016*s),k.light);
  const windshield=k.box(v(0,c.y+.34*s,c.z+.32*s),v(.78*s,.4*s,.018*s),k.glass);windshield.rotation.x=-.25;
  // Two full-width passenger places behind the standing helm, with deck room for their legs.
  for(const x of [-.52,.52]){
   k.box(v(x*s,.74*s,H.z-1.30*s),v(.72*s,.14*s,.55*s),k.seat);
   k.box(v(x*s,.98*s,H.z-1.59*s),v(.72*s,.48*s,.10*s),k.seat);
   k.box(v(x*s,1.27*s,H.z-1.62*s),v(.34*s,.16*s,.11*s),k.seat);
  }
  k.box(v(0,.62*s,H.z-1.43*s),v(1.76*s,.16*s,.62*s),k.paint);
  for(const side of [-1,1])for(const zz of side===1?[-1.55,-.95,.05,.35,1.35]:[-1.55,-.6,.35,1.35])k.tube(v(side*beam*.44,height,z+zz*s),v(side*beam*.44,height+.25*s,z+zz*s),.012*s,k.trim);
  for(const side of [-1,1])for(const [a,b]of side===1?[[-1.55,-.95],[.05,1.35]]:[[-1.55,1.35]])k.tube(v(side*beam*.44,height+.25*s,z+a*s),v(side*beam*.44,height+.25*s,z+b*s),.014*s,k.trim);
  // A real opening at the boarding side: the actor steps over the gunwale, not through a rail.
  const gate=k.component('Boarding_gate',v(beam*.44,height+.25*s,z+.05*s));
  k.tube(v(),v(0,0,-s),.014*s,k.trim,gate);k.tube(v(0,0,-s),v(0,-.25*s,-s),.012*s,k.trim,gate);
  k.box(v(0,-.035*s,-.96*s),v(.035*s,.04*s,.07*s),k.dark,gate);
  const engine=k.component('Outboard',v(0,.48*s,z-length*.49));k.ellipsoid(v(),v(.19*s,.23*s,.19*s),k.paint,engine);k.tube(v(0,-.14*s,0),v(0,-.38*s,0),.055*s,k.dark,engine);
  const prop=k.component('Propeller',v(0,-.35*s,0),engine);for(const a of [0,2.094,4.188]){const m=k.ellipsoid(v(Math.cos(a)*.085*s,Math.sin(a)*.085*s,0),v(.10*s,.03*s,.018*s),k.trim,prop);m.rotation.z=a;}
  k.updates.push((_,t)=>{prop.rotation.z=t/k.fit.clip.duration*Math.PI*24;});return;
 }
 if(id==='kayak'){
  // Continuous closed deck, with an oval cockpit cut out around the seated legs.
  const shape=new T.Shape(),points:V[]=[];
  for(const side of [1,-1])for(let i=0;i<=28;i++){const t=(side===1?i/28:1-i/28)*2-1,profile=Math.max(.035,(1-Math.abs(t)**2.8)**.65);points.push(v(side*beam*.5*profile,0,z+t*length*.5));}
  points.forEach((p,i)=>i?shape.lineTo(p.x,p.z):shape.moveTo(p.x,p.z));shape.closePath();
  const hole=new T.Path();hole.absellipse(0,H.z+.26*s,beam*.38,.63*s,0,Math.PI*2,true,0);shape.holes.push(hole);
  const deck=k.mesh(new T.ExtrudeGeometry(shape,{depth:.025*s,bevelEnabled:true,bevelSegments:2,bevelSize:.009*s,bevelThickness:.009*s,steps:1,curveSegments:32}),k.paint);deck.rotation.x=Math.PI/2;deck.position.y=height;
  let previous:V|undefined;for(let i=0;i<=40;i++){const a=i/40*Math.PI*2,p=v(Math.cos(a)*beam*.38,height+.018*s,H.z+.26*s+Math.sin(a)*.63*s);if(previous)k.tube(previous,p,.012*s,k.rubber);previous=p;}
  for(const zz of [-.90,-.72,1.13,1.29]){const width=.14*s;k.tube(v(-width,height+.025*s,H.z+zz*s),v(width,height+.025*s,H.z+(zz+.1)*s),.005*s,k.rubber);}
  k.box(v(0,low-.08*s,H.z),v(.37*s,.09*s,.35*s),k.seat);
  k.box(v(0,low+.06*s,H.z-.24*s),v(.36*s,.25*s,.07*s),k.seat);
 }else{
  for(const zz of [H.z,H.z-.8*s])k.box(v(0,low-.075*s,zz),v(beam*.8,.07*s,.29*s),k.seat);
 }
 if(id==='rowboat'){
  for(const [side,key]of [[1,'left'],[-1,'right']]as const){
   const pivot=v(side*beam*.49,height+.035*s,H.z+.17*s),oar=k.component(`Oar_${key}`),L=1.65*s;
   k.tube(v(),v(0,0,L),.018*s,k.trim,oar);blade(k,oar,L-.1*s);
   const lock=k.mesh(new T.TorusGeometry(.033*s,.008*s,8,16),k.trim);lock.position.copy(pivot);lock.rotation.y=Math.PI/2;
   k.updates.push(c=>{const hand=c[key];oar.position.copy(hand);oar.quaternion.setFromUnitVectors(v(0,0,1),pivot.clone().sub(hand).normalize());});
  }
 }else{
  const paddle=k.component('Paddle'),double=id==='kayak',L=(double?2.05:1.5)*s;
  k.tube(v(0,0,-L/2),v(0,0,L/2),.014*s,k.trim,paddle);blade(k,paddle,L/2-.12*s,double);if(double)blade(k,paddle,-L/2+.12*s,true);
  if(!double)k.tube(v(-.065*s,0,-L/2),v(.065*s,0,-L/2),.015*s,k.seat,paddle);
  k.updates.push(c=>{const direction=c.right.clone().sub(c.left).normalize();paddle.quaternion.setFromUnitVectors(v(0,0,1),direction);paddle.position.copy(c.left).add(c.right).multiplyScalar(.5);if(!double)paddle.position.addScaledVector(direction,L*.24);});
 }
}
