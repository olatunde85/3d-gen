/** Original jet and enclosed tracked tank, measured around real operator contacts. */
import * as T from 'three';
import {VehicleKit,v,type V} from './vehicle-kit';
import {tankRoof} from './vehicle-actions';
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
  // Main gear folds inward into the belly once airborne (Studio drives the fold).
  const gear=k.component(`Gear_main_${side>0?'left':'right'}`,v(side*.61*s,deck,z-.85*s));gear.userData.gearFold=v(0,0,-side);gear.userData.gearLift=v(0,.34*s,0);
  k.tube(v(),v(side*.11*s,.26*s-deck,.01*s),.035*s,k.trim,gear);k.wheel(`Wheel_main_${side}`,v(side*.13*s,.24*s-deck,.01*s),.24*s,.13*s,true,gear);
  const step=k.component(`Boarding_step_${side>0?'left':'right'}`,v(side*.68*s,.31*s,z+.12*s));step.userData.gearLift=v(0,.22*s,0);k.box(v(),v(.26*s,.04*s,.30*s),k.dark,step);
 }
 const finShape=new T.Shape([new T.Vector2(-4*s,belt+.1*s),new T.Vector2(-3.85*s,belt+1.45*s),new T.Vector2(-3.35*s,belt+1.48*s),new T.Vector2(-2.3*s,belt+.1*s)]);
 const fin=k.mesh(new T.ExtrudeGeometry(finShape,{depth:.065*s,bevelEnabled:true,bevelSize:.015*s,bevelThickness:.015*s,bevelSegments:2}),k.paint);fin.rotation.y=-Math.PI/2;fin.position.set(.0325*s,0,z);
 const exhaust=k.mesh(new T.CylinderGeometry(.23*s,.27*s,.28*s,32),k.dark);exhaust.rotation.x=Math.PI/2;exhaust.position.set(0,belt-.025*s,z-4.22*s);k.ellipsoid(v(0,belt-.025*s,z-4.37*s),v(.16*s,.16*s,.015*s),k.trim);
 const nose=k.component('Gear_nose',v(0,deck,z+1.1*s));nose.userData.gearFold=v(-1,0,0);nose.userData.gearLift=v(0,.3*s,0);
 k.tube(v(),v(0,.19*s-deck,.15*s),.026*s,k.trim,nose);k.wheel('Wheel_nose',v(0,.18*s-deck,.15*s),.18*s,.10*s,true,nose);
 // Engine glow behind the nozzle; Studio scales it with throttle.
 const glow=k.component('Exhaust_glow',v(0,belt-.025*s,z-4.36*s)),flame=k.mesh(new T.ConeGeometry(.17*s,.75*s,24,1,true),new T.MeshStandardMaterial({name:'Jet exhaust glow',color:'#ffb35c',emissive:'#ff7a1a',emissiveIntensity:1.6,transparent:true,opacity:.55,depthWrite:false,side:T.DoubleSide}),glow);
 flame.rotation.x=-Math.PI/2;flame.position.z=-.375*s;flame.castShadow=false;glow.scale.setScalar(.25);
 if(k.style.variant==='sport')for(const side of [-1,1])k.box(v(side*3.65*s,belt+.06*s,z-1.96*s),v(.035*s,.31*s,.45*s),k.trim);
 controls(k);
}
export function buildTank(k:VehicleKit){
 const s=k.fit.scale,H=seat(k),z=H.z,cx=-.55*s,roof=tankRoof(Math.max(...k.fit.samples.map(c=>c.headTop.y)),s),floor=.2*s;
 const left=cx-1.15*s,right=cx+1.15*s,rear=z-2.2*s,hatch=.34*s;
 // Glacis clears the driver's knees and feet; everything below the roof is a hollow armoured shell.
 const knee=Math.max(...k.fit.samples.flatMap(c=>[c.kneeLeft.z,c.kneeRight.z])),foot=Math.max(...k.fit.samples.flatMap(c=>[c.footLeft.z,c.footRight.z]));
 const noseZ=Math.max(foot+.5*s,knee+.75*s),topZ=knee+.2*s,noseY=.42*s;
 k.box(v(cx,floor+.025*s,(rear+noseZ)/2),v(2.3*s,.05*s,noseZ-rear),k.dark);
 for(const x of [left,right])k.box(v(x+(x<cx?.03:-.03)*s,(floor+roof)/2,(rear+noseZ)/2),v(.06*s,roof-floor,noseZ-rear),k.paint);
 k.box(v(cx,(floor+roof)/2,rear+.03*s),v(2.3*s,roof-floor,.06*s),k.paint);
 k.box(v(cx,(floor+noseY)/2,noseZ-.03*s),v(2.3*s,noseY-floor,.06*s),k.paint);
 const glacisLength=Math.hypot(roof-noseY,noseZ-topZ),glacis=k.box(v(cx,(roof+noseY)/2,(noseZ+topZ)/2),v(2.3*s,.07*s,glacisLength),k.paint);glacis.rotation.x=Math.atan2(roof-noseY,noseZ-topZ);
 // Roof plates around the driver's hatch opening.
 const plate=(x0:number,x1:number,z0:number,z1:number)=>k.box(v((x0+x1)/2,roof-.03*s,(z0+z1)/2),v(x1-x0,.06*s,z1-z0),k.paint);
 plate(left,H.x-hatch,rear,topZ);plate(H.x+hatch,right,rear,topZ);plate(H.x-hatch,H.x+hatch,rear,z-hatch);plate(H.x-hatch,H.x+hatch,z+hatch,topZ);
 for(const [x,zz,w,d] of [[H.x,z-hatch,2*hatch+.08*s,.05*s],[H.x,z+hatch,2*hatch+.08*s,.05*s],[H.x-hatch,z,.05*s,2*hatch],[H.x+hatch,z,.05*s,2*hatch]])k.box(v(x,roof+.012*s,zz),v(w,.04*s,d),k.dark);
 const lid=k.component('Tank_hatch',v(H.x-hatch,roof,z));k.box(v(hatch,.03*s,0),v(2*hatch-.02*s,.06*s,2*hatch-.02*s),k.paint,lid);k.box(v(hatch,.075*s,0),v(.26*s,.03*s,.05*s),k.dark,lid);
 for(const x of [-.17,.17])k.box(v(H.x+x*s,roof+.04*s,z+hatch+.1*s),v(.16*s,.07*s,.08*s),k.dark);
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
  k.box(v(cx+side*.83*s,noseY-.08*s,noseZ+.01*s),v(.16*s,.12*s,.06*s),k.light);
 }
 // Tread-side climbing steps and a roof grab handle match the entry solver.
 for(const y of [.40,.78])k.box(v(1.13*s,y-.025*s,z-.55*s),v(.30*s,.05*s,.30*s),k.dark);
 for(const zz of [-.75,-.2])k.tube(v(right-.06*s,roof,z+zz*s),v(right-.06*s,roof+.07*s,z+zz*s),.018*s,k.trim);
 k.tube(v(right-.06*s,roof+.07*s,z-.75*s),v(right-.06*s,roof+.07*s,z-.2*s),.018*s,k.trim);
 if(k.style.variant==='sport')for(const side of [-1,1])k.box(v(cx+side*1.5*s,.85*s,z-.2*s),v(.07*s,.48*s,3.65*s),k.paint);
 const turret=k.component('Turret',v(cx,roof+.04*s,z-1.35*s));k.ellipsoid(v(0,.12*s,0),v(.91*s,.40*s,.78*s),k.paint,turret);k.box(v(0,.39*s,-.12*s),v(1.15*s,.12*s,.8*s),k.paint,turret);
 k.tube(v(0,.22*s,.48*s),v(0,.22*s,3.55*s),.085*s,k.paint,turret);k.tube(v(0,.22*s,3.50*s),v(0,.22*s,3.82*s),.115*s,k.dark,turret);
 k.tube(v(cx-.67*s,roof+.3*s,z-1.7*s),v(cx-.67*s,roof+1.45*s,z-1.7*s),.009*s,k.dark);
 controls(k);
}

/** Arc-length stadium path: no teleport or direction change at the ends of a track. */
function trackPoint(t:number):[number,number]{
 const r=.48,line=3.1,arc=Math.PI*r,total=2*(line+arc);let d=((t%1+1)%1)*total;
 if(d<line)return [1.06,-1.55+d];d-=line;
 if(d<arc){const a=d/r;return [.58+r*Math.cos(a),1.55+r*Math.sin(a)];}d-=arc;
 if(d<line)return [.10,1.55-d];d-=line;const a=d/r;return [.58-r*Math.cos(a),-1.55-r*Math.sin(a)];
}
