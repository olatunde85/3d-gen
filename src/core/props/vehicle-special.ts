/** Original jet and tracked tank, measured around real operator contacts. */
import * as T from 'three';
import {VehicleKit,v,type V} from './vehicle-kit';
function shell(k:VehicleKit,rings:{z:number;y:number;w:number;h:number}[],mat:T.Material,lower=false){
 const p:number[]=[],ix:number[]=[],N=40;
 for(const r of rings)for(let j=0;j<=N;j++){const a=(lower?Math.PI:0)+j/N*(lower?Math.PI:Math.PI*2);p.push(Math.cos(a)*r.w,r.y+Math.sin(a)*r.h,r.z);}
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<N;j++){const a=i*(N+1)+j,b=a+N+1;ix.push(a,a+1,b,a+1,b+1,b);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();return k.mesh(geo,mat);
}
function foil(k:VehicleKit,points:[number,number][],height:number,thickness:number,mat:T.Material){
 const shape=new T.Shape(points.map(([x,z])=>new T.Vector2(x,z))),g=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:thickness*.3,bevelThickness:thickness*.3,bevelSegments:2,steps:1});
 const m=k.mesh(g,mat);m.rotation.x=Math.PI/2;m.position.y=height;return m;
}
function seat(k:VehicleKit){const s=k.fit.scale,H=k.fit.average('hip');k.box(H.clone().add(v(0,-.1*s,0)),v(.49*s,.13*s,.48*s),k.seat);const back=k.box(H.clone().add(v(0,.24*s,-.29*s)),v(.48*s,.62*s,.11*s),k.seat);back.rotation.x=-.1;k.box(H.clone().add(v(0,.65*s,-.33*s)),v(.29*s,.17*s,.11*s),k.seat);return H;}
function controls(k:VehicleKit){const s=k.fit.scale;for(const side of ['left','right']as const){const g=k.component(side==='right'?'Control_right':'Control_left');k.box(v(),v(.045*s,.10*s,.045*s),k.seat,g);const hand=k.fit.average(side);k.tube(v(hand.x,k.fit.lift,hand.z+.025*s),hand.clone().add(v(0,-.05*s,0)),.018*s,k.dark);k.updates.push(c=>g.position.copy(c[side]));}for(const key of ['footLeft','footRight']as const)k.box(k.fit.average(key).add(v(0,-.02*s,.04*s)),v(.16*s,.035*s,.18*s),k.rubber);}
export function buildJet(k:VehicleKit){
 const s=k.fit.scale,H=seat(k),z=H.z,belt=H.y+.06*s,deck=k.fit.lift;
 // The cockpit is open inside; the opaque fuselage ends below the pilot's shoulders.
 shell(k,[[-4.2,.07,.08],[-3.4,.35,.32],[-2,.51,.44],[-.7,.58,.72],[.65,.55,.68],[1.6,.39,.33],[2.7,.24,.22],[3.45,.015,.025]].map(([zz,w,h])=>({z:z+zz*s,y:belt,w:w*s,h:h*s})),k.paint,true);
 shell(k,[[-4.2,.07,.08],[-3.5,.32,.29],[-2.1,.50,.42],[-.70,.57,.42]].map(([zz,w,h])=>({z:z+zz*s,y:belt,w:w*s,h:h*s})),k.paint);
 shell(k,[[.73,.54,.39],[1.5,.40,.30],[2.5,.24,.20],[3.45,.015,.025]].map(([zz,w,h])=>({z:z+zz*s,y:belt,w:w*s,h:h*s})),k.paint);
 k.box(v(0,deck-.03*s,z+.05*s),v(.82*s,.05*s,1.45*s),k.dark);
 const canopy=k.component('Canopy',v(.54*s,belt,z));
 const roof=Math.max(...k.fit.samples.map(c=>c.headTop.y))+.12*s;
 const glass=k.mesh(new T.SphereGeometry(1,40,24,0,Math.PI*2,0,Math.PI/2),k.glass,canopy);glass.position.set(-.54*s,0,-.04*s);glass.scale.set(.56*s,roof-belt,1.02*s);
 for(const zz of [-.76,.78]){const arc:V[]=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI;arc.push(v(-.54*s+Math.cos(a)*.49*s,Math.sin(a)*(roof-belt)*.63,zz*s));}k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arc),32,.016*s,6,false),k.trim,canopy);}
 k.box(v(0,H.y+.12*s,z+.59*s),v(.72*s,.18*s,.19*s),k.dark);for(const x of [-.17,.17])k.box(v(x*s,H.y+.17*s,z+.48*s),v(.21*s,.12*s,.012*s),k.glass);
 for(const side of [-1,1]){
  foil(k,[[side*.35*s,z+.32*s],[side*3.8*s,z-1.65*s],[side*3.65*s,z-2.15*s],[side*.44*s,z-1.65*s]],belt-.17*s,.07*s,k.paint);
  foil(k,[[side*.18*s,z-2.5*s],[side*1.62*s,z-3.35*s],[side*1.48*s,z-3.70*s],[side*.15*s,z-3.45*s]],belt+.15*s,.05*s,k.paint);
  k.box(v(side*3.62*s,belt-.1*s,z-1.94*s),v(.025*s,.035*s,.21*s),side>0?k.light:k.trim);
  // Intake lips and dark recesses below the leading edge.
  k.ellipsoid(v(side*.48*s,belt-.14*s,z+.35*s),v(.19*s,.23*s,.37*s),k.trim);k.ellipsoid(v(side*.49*s,belt-.12*s,z+.64*s),v(.145*s,.175*s,.03*s),k.dark);
  k.tube(v(side*.61*s,deck,z-.85*s),v(side*.72*s,.26*s,z-.84*s),.035*s,k.trim);k.wheel(`Wheel_main_${side}`,v(side*.74*s,.24*s,z-.84*s),.24*s,.13*s,true);
  k.box(v(side*.68*s,.31*s,z+.12*s),v(.26*s,.04*s,.30*s),k.dark);
 }
 const finShape=new T.Shape([new T.Vector2(-4*s,belt+.1*s),new T.Vector2(-3.85*s,belt+1.45*s),new T.Vector2(-3.35*s,belt+1.48*s),new T.Vector2(-2.3*s,belt+.1*s)]);
 const fin=k.mesh(new T.ExtrudeGeometry(finShape,{depth:.065*s,bevelEnabled:true,bevelSize:.015*s,bevelThickness:.015*s,bevelSegments:2}),k.paint);fin.rotation.y=-Math.PI/2;fin.position.set(.0325*s,0,z);
 const exhaust=k.mesh(new T.CylinderGeometry(.23*s,.27*s,.28*s,32),k.dark);exhaust.rotation.x=Math.PI/2;exhaust.position.set(0,belt-.025*s,z-4.22*s);k.ellipsoid(v(0,belt-.025*s,z-4.37*s),v(.16*s,.16*s,.015*s),k.trim);
 k.tube(v(0,deck,z+1.1*s),v(0,.19*s,z+1.25*s),.026*s,k.trim);k.wheel('Wheel_nose',v(0,.18*s,z+1.25*s),.18*s,.10*s,true);
 if(k.style.variant==='sport')for(const side of [-1,1])k.box(v(side*3.65*s,belt+.06*s,z-1.96*s),v(.035*s,.31*s,.45*s),k.trim);
 controls(k);
}
export function buildTank(k:VehicleKit){
 const s=k.fit.scale,H=seat(k),z=H.z,cx=-.55*s,top=H.y+.08*s;
 k.box(v(cx,.67*s,z-.25*s),v(2.35*s,.68*s,3.9*s),k.paint);
 // Sloped glacis, separate from the open driver's station.
 const front=k.box(v(cx,1.10*s,z+1.45*s),v(2.25*s,.20*s,1.0*s),k.paint);front.rotation.x=.24;
 k.box(v(cx,top-.06*s,z-.8*s),v(2.22*s,.16*s,1.7*s),k.paint);
 for(const x of [cx-1*s,cx+1*s])k.box(v(x,top-.06*s,z+.22*s),v(.22*s,.14*s,1.3*s),k.paint);
 const hatch=k.component('Tank_hatch',v(.40*s,top,z));k.box(v(-.4*s,0,0),v(.76*s,.07*s,.72*s),k.paint,hatch);
 // Hatch folds behind the station during driving, exposing actual controls and an upholstered seat.
 k.updates.push(()=>{hatch.rotation.z=1.65;});
 for(const side of [-1,1]){
  const x=cx+side*1.32*s;
  const trackShape=new T.Shape();trackShape.moveTo(-1.55*s,.12*s);trackShape.lineTo(1.55*s,.12*s);trackShape.quadraticCurveTo(2.05*s,.12*s,2.05*s,.59*s);trackShape.quadraticCurveTo(2.05*s,1.04*s,1.55*s,1.04*s);trackShape.lineTo(-1.55*s,1.04*s);trackShape.quadraticCurveTo(-2.05*s,1.04*s,-2.05*s,.59*s);trackShape.quadraticCurveTo(-2.05*s,.12*s,-1.55*s,.12*s);
  const hole=new T.Path();hole.absellipse(0,.58*s,1.8*s,.32*s,0,Math.PI*2,true,0);trackShape.holes.push(hole);
  const belt=k.mesh(new T.ExtrudeGeometry(trackShape,{depth:.36*s,bevelEnabled:false,curveSegments:20}),k.rubber);belt.rotation.y=-Math.PI/2;belt.position.set(x+.18*s,0,z);
  for(let j=0;j<7;j++){const zz=z+(j-3)*.48*s,w=k.wheel(`Track_wheel_${side}_${j}`,v(x,.54*s,zz),.32*s,.28*s,false);k.updates.push((_,t)=>w.rotation.x=t/k.fit.clip.duration*Math.PI*6);}
  for(let j=0;j<34;j++){
   const link=k.component(`Track_link_${side}_${j}`);k.box(v(),v(.42*s,.055*s,.15*s),k.dark,link);
   k.updates.push((_,t)=>{const p=trackPoint(j/34+t/k.fit.clip.duration),next=trackPoint(j/34+t/k.fit.clip.duration+.0001);link.position.set(x,p[0]*s,z+p[1]*s);link.rotation.x=-Math.atan2(next[0]-p[0],next[1]-p[1]);});
  }
  k.box(v(x,1.12*s,z-.2*s),v(.52*s,.10*s,4.15*s),k.paint);
  for(const zz of [-.9,.3])k.tube(v(x+side*.19*s,.3*s,z+zz*s),v(x+side*.19*s,.75*s,z+zz*s),.025*s,k.trim);
 }
 // Actual tread-side climbing steps and grab rails match the entry solver.
 for(const y of [.40,.78])k.box(v(1.13*s,y-.025*s,z-.55*s),v(.30*s,.05*s,.30*s),k.dark);
 k.tube(v(1.1*s,1.10*s,z-.50*s),v(1.1*s,1.62*s,z-.50*s),.021*s,k.trim);
 k.tube(v(1.1*s,1.62*s,z-.50*s),v(1.1*s,1.62*s,z-.10*s),.021*s,k.trim);
 if(k.style.variant==='sport')for(const side of [-1,1])k.box(v(cx+side*1.5*s,.85*s,z-.2*s),v(.07*s,.48*s,3.65*s),k.paint);
 const turret=k.component('Turret',v(cx,top+.16*s,z-1.1*s));k.ellipsoid(v(0,.12*s,0),v(.91*s,.40*s,.78*s),k.paint,turret);k.box(v(0,.39*s,-.12*s),v(1.15*s,.12*s,.8*s),k.paint,turret);
 k.tube(v(0,.22*s,.48*s),v(0,.22*s,3.55*s),.085*s,k.paint,turret);k.tube(v(0,.22*s,3.50*s),v(0,.22*s,3.82*s),.115*s,k.dark,turret);
 for(let i=0;i<6;i++)k.box(v(cx+(i-2.5)*.24*s,top+.12*s,z-1.95*s),v(.15*s,.03*s,.31*s),k.dark);
 for(const side of [-1,1])k.box(v(cx+side*.83*s,1.23*s,z+1.94*s),v(.16*s,.12*s,.06*s),k.light);
 k.tube(v(cx-.67*s,top+.36*s,z-1.45*s),v(cx-.67*s,top+1.5*s,z-1.45*s),.009*s,k.dark);
 controls(k);
}

/** Arc-length stadium path: no teleport or direction change at the ends of a track. */
function trackPoint(t:number):[number,number]{
 const r=.48,line=3.1,arc=Math.PI*r,total=2*(line+arc);let d=((t%1+1)%1)*total;
 if(d<line)return [1.06,-1.55+d];d-=line;
 if(d<arc){const a=d/r;return [.58+r*Math.cos(a),1.55+r*Math.sin(a)];}d-=arc;
 if(d<line)return [.10,1.55-d];d-=line;const a=d/r;return [.58-r*Math.cos(a),-1.55-r*Math.sin(a)];
}
