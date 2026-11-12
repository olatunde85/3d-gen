/**
 * Additional bodies built around an existing vehicle's fitted rider: the danfo minibus, van, bus and truck use the
 * upright SUV or pickup seat; the keke tricycle, quad bike and scooter use the motorcycle saddle and bar; the go-kart
 * uses the sports car seat. Riders, boarding and animation stay those of the base vehicle.
 */
import * as T from 'three';
import {VehicleKit,raceNumber,v} from './vehicle-kit';
import {buildCoveredCar} from './vehicle-car';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';

export const VEHICLE_BODIES=['danfo','van','bus','truck','keke','quad','scooter','kart','saloon','muscle']as const;
export type VehicleBody=typeof VEHICLE_BODIES[number];
/** The vehicle whose rider posture, boarding and lift each body borrows. */
export const BODY_BASE:Record<VehicleBody,'suv'|'pickup'|'motorcycle'|'sports_car'>={danfo:'suv',van:'suv',bus:'suv',truck:'pickup',keke:'motorcycle',quad:'motorcycle',scooter:'motorcycle',kart:'sports_car',saloon:'sports_car',muscle:'sports_car'};

/** A side wall in the car's length (z) and height (y), with wheel arches cut from its lower edge. */
function sideShape(back:number,front:number,bottom:number,top:number,arches:[number,number,number][],noseRound=0,tailRound=0){
 const shape=new T.Shape();shape.moveTo(back,bottom+tailRound);shape.lineTo(back,top-tailRound);if(tailRound)shape.quadraticCurveTo(back,top,back+tailRound,top);
 shape.lineTo(front-noseRound,top);if(noseRound)shape.quadraticCurveTo(front,top,front,top-noseRound);shape.lineTo(front,bottom+noseRound*.4);shape.quadraticCurveTo(front,bottom,front-noseRound*.4,bottom);
 for(const [z,r,cy]of [...arches].sort((a,b)=>b[0]-a[0])){shape.lineTo(z+r,bottom);shape.lineTo(z+r,cy);shape.absarc(z,cy,r,0,Math.PI,false);shape.lineTo(z-r,bottom);}
 shape.lineTo(back+tailRound*.4,bottom);if(tailRound)shape.quadraticCurveTo(back,bottom,back,bottom+tailRound*.4);return shape;
}
const rect=(z0:number,z1:number,y0:number,y1:number,r:number)=>{const p=new T.Path();p.moveTo(z0+r,y0);p.lineTo(z1-r,y0);p.quadraticCurveTo(z1,y0,z1,y0+r);p.lineTo(z1,y1-r);p.quadraticCurveTo(z1,y1,z1-r,y1);p.lineTo(z0+r,y1);p.quadraticCurveTo(z0,y1,z0,y1-r);p.lineTo(z0,y0+r);p.quadraticCurveTo(z0,y0,z0+r,y0);return p;};
/** Extrude a side shape into a wall whose outer face sits at `outer` on the given side. */
function wall(k:VehicleKit,shape:T.Shape,outer:number,side:number,thickness:number,mat:T.Material,parent:T.Object3D=k.group){
 const s=k.fit.scale,geo=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelSize:.008*s,bevelThickness:.008*s,bevelSegments:2,curveSegments:20}),m=k.mesh(geo,mat,parent);
 m.rotation.y=-Math.PI/2;m.position.x=side>0?outer:outer+thickness;return m;
}
function pane(k:VehicleKit,path:T.Path,x:number,mat:T.Material,parent:T.Object3D=k.group){
 const shape=new T.Shape(path.getPoints(6)),m=k.mesh(new T.ShapeGeometry(shape),mat,parent);m.rotation.y=-Math.PI/2;m.position.x=x;return m;
}
const steeringWheel=(k:VehicleKit,dashZ:number,cx:number,dash=1.5,radius=.19)=>{const s=k.fit.scale,H=k.fit.average('hip');k.steering(radius*s,32*Math.PI/180);k.tube(v(0,H.y+.02*s,dashZ),v(0,H.y+.22*s,dashZ-.18*s),.03*s,k.dark);if(dash)k.box(v(cx,H.y+.12*s,dashZ),v(dash*s,.2*s,.32*s),k.dark);};
const spinWheels=(k:VehicleKit,wheels:T.Object3D[],turns=6)=>k.updates.push((_,t)=>{for(const w of wheels)w.rotation.x=t/k.fit.clip.duration*Math.PI*turns;});

interface BoxSpec {
 width:number;front:number;back:number;axles:number[];wheelR:number;roofAbove:number;belt:number;cx:number;
 /** Side windows behind the driver's door, per side, as [rear, front] lengths along z. */
 windows:[number,number][];doorBack:number;stripes?:boolean;slidingDoor?:boolean;dualRear?:boolean;rack?:boolean;
 nose?:number;rake?:number;cargo?:{front:number;back:number;top:number};bench?:number[];destination?:boolean;
}
/** Danfo, van, bus and truck cab: hollow side walls with arches, window and door openings, faces, roof and seats. */
function boxVehicle(k:VehicleKit,spec:BoxSpec){
 const s=k.fit.scale,H=k.fit.average('hip'),z0=H.z,seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.085*s;
 const {width,cx,wheelR}=spec,front=z0+spec.front*s,back=z0+spec.back*s,bottom=.30*s,belt=H.y+spec.belt*s,headroom=Math.max(...k.fit.samples.map(c=>c.headTop.y));
 const roof=Math.max(headroom+spec.roofAbove*s,belt+.6*s),half=width/2,rc=.11*s,rake=(spec.rake??.22)*s,nose=(spec.nose??.12)*s,doorFront=front-.12*s,doorBack=z0+spec.doorBack*s;
 const arches=spec.axles.map(a=>[z0+a*s,wheelR+.05*s,wheelR]as [number,number,number]);
 // Lower walls; the driver's side (+X) has the door opening.
 for(const side of [-1,1]){
  const lower=sideShape(back+rc,front-rc,bottom,belt,arches,nose*.5,.04*s);
  if(side>0)lower.holes.push(rect(doorBack,doorFront,bottom+.12*s,belt+.02*s,.04*s));
  wall(k,lower,cx+side*half,side,.05*s,k.paint);
  // Window band with pillars: a wall from belt to roof with the window openings.
  const upper=new T.Shape();const upFront=side>0?doorBack:front-rake;upper.moveTo(back+rc,belt);upper.lineTo(upFront,belt);upper.lineTo(side>0?doorBack:front-rake-.08*s,roof-.06*s);upper.lineTo(back+rc,roof-.06*s);upper.lineTo(back+rc,belt);
  const openings:T.Path[]=[];let z=doorBack-.08*s;
  for(const [len,gap]of spec.windows){const z1=z,z0w=z-len*s;if(z0w>back+.12*s){openings.push(rect(z0w,z1,belt+.08*s,roof-.16*s,.06*s));}z=z0w-gap*s;}
  if(side<0)openings.push(rect(doorBack+.06*s,front-rake-.14*s,belt+.08*s,roof-.16*s,.06*s));
  upper.holes.push(...openings);wall(k,upper,cx+side*half*.985,side,.04*s,k.paint);
  for(const o of openings){pane(k,o,cx+side*(half*.985-.02*s),k.glass);const pts=o.getPoints(6);k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>v(cx+side*half*.99,p.y,p.x)),true),48,.012*s,6,true),k.dark);}
  // Stripes (the danfo's black bands), skipping the driver's door, which carries its own.
  if(spec.stripes)for(const y of [belt-.12*s,belt-.32*s])for(const [a,b]of side>0?[[back+.1*s,doorBack-.02*s],[doorFront+.02*s,front-.08*s]]:[[back+.1*s,front-.08*s]])if(b>a)k.box(v(cx+side*(half+.008*s),y,(a+b)/2),v(.012*s,.08*s,b-a),k.dark);
  if(side<0&&spec.slidingDoor){const a=doorBack-1.1*s,b=doorBack-.05*s;k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3([v(cx-half-.01*s,bottom+.1*s,a),v(cx-half-.01*s,roof-.12*s,a),v(cx-half-.01*s,roof-.12*s,b),v(cx-half-.01*s,bottom+.1*s,b)],true,'catmullrom',0),40,.008*s,5,true),k.dark);k.box(v(cx-half-.02*s,belt-.06*s,b-.12*s),v(.03*s,.03*s,.16*s),k.trim);}
 }
 // The driver's door: panel, window and stripes hinge at the front edge.
 const door=k.component('Door_left',v(cx+half,0,doorFront));door.userData.doorSide=1;door.userData.occupantDoor=true;
 {const len=doorFront-doorBack,panel=new T.Shape();panel.moveTo(-len,bottom+.12*s);panel.lineTo(0,bottom+.12*s);panel.lineTo(0,belt);const lean=-(rake-.04*s);panel.lineTo(lean,roof-.06*s);panel.lineTo(-len,roof-.06*s);panel.closePath();
  const hole=new T.Path();hole.moveTo(-len+.08*s,belt+.08*s);hole.lineTo(-.08*s,belt+.08*s);hole.lineTo(lean-.07*s,roof-.16*s);hole.lineTo(-len+.08*s,roof-.16*s);hole.closePath();panel.holes.push(hole);
  const geo=new T.ExtrudeGeometry(panel,{depth:.05*s,bevelEnabled:true,bevelSize:.006*s,bevelThickness:.006*s,bevelSegments:2});const m=k.mesh(geo,k.paint,door);m.rotation.y=-Math.PI/2;
  pane(k,hole,-.025*s,k.glass,door);k.box(v(.01*s,belt-.08*s,-len+.18*s),v(.03*s,.03*s,.14*s),k.trim,door);
  if(spec.stripes)for(const y of [belt-.12*s,belt-.32*s])k.box(v(.012*s,y,-len/2),v(.012*s,.08*s,len-.04*s),k.dark,door);}
 // Front: raked windscreen, lamps, grille and bumper.
 const glassTop=roof-.08*s;
 {const ws=k.mesh(new T.PlaneGeometry(width*.9,Math.hypot(glassTop-belt,rake)),k.glass);ws.position.set(cx,(belt+glassTop)/2,front-rake/2-.02*s);ws.rotation.x=-Math.atan2(rake,glassTop-belt);}
 for(const side of [-1,1])k.tube(v(cx+side*half*.96,belt,front-.02*s),v(cx+side*half*.96,glassTop,front-rake-.04*s),.026*s,k.paint);
 // Rounded vertical corners join the flat front and rear faces to the side walls.
 const corner=(zc:number,y0:number,y1:number)=>{for(const side of [-1,1]){const c=k.mesh(new T.CylinderGeometry(rc,rc,y1-y0,20),k.paint);c.position.set(cx+side*(half-rc),(y0+y1)/2,zc);}};
 corner(front-rc,bottom+.02*s,belt);corner(back+rc,bottom+.02*s,roof-.06*s);
 k.box(v(cx,(bottom+belt)/2+.01*s,front-.035*s),v(width-2*rc+.01*s,belt-bottom-.02*s,.07*s),k.paint);
 // Below the windscreen a slim intake; the lamps sit at each end of a full-width dark grille band.
 k.box(v(cx,belt-.07*s,front+.004*s),v(width*.62,.05*s,.02*s),k.dark);
 const lampY=belt-.24*s,amber=new T.MeshStandardMaterial({name:'Vehicle indicators',color:'#f2a531',emissive:'#9a5306',emissiveIntensity:.4,roughness:.3});
 for(const side of [-1,1]){
  k.box(v(cx+side*half*.7,lampY,front+.025*s),v(.3*s,.17*s,.03*s),k.trim);k.box(v(cx+side*half*.7,lampY,front+.04*s),v(.26*s,.13*s,.02*s),k.light);
  k.box(v(cx+side*half*.9,lampY-.155*s,front+.02*s),v(.12*s,.06*s,.03*s),amber);
 }
 k.box(v(cx,lampY,front+.012*s),v(width*.94,.2*s,.03*s),k.dark);for(let i=-3;i<=3;i++)k.box(v(cx,lampY+i*.022*s,front+.03*s),v(width*.3,.007*s,.008*s),k.trim);
 k.box(v(cx,bottom+.13*s,front+.06*s),v(width*1.01,.16*s,.14*s),k.dark);k.box(v(cx,bottom+.20*s,front+.12*s),v(.46*s,.11*s,.012*s),new T.MeshStandardMaterial({name:'Vehicle plate',color:'#e9ebe4',roughness:.5}));
 // Roof, rear and floor.
 k.box(v(cx,roof-.03*s,(back+front-rake)/2),v(width*1.0,.07*s,front-rake-back),k.paint);
 for(let i=1;i<6;i++)k.box(v(cx,roof+.005*s,back+(front-rake-back)*i/6),v(width*.92,.012*s,.05*s),k.paint);
 k.box(v(cx,(bottom+roof)/2-.02*s,back+.035*s),v(width-2*rc+.01*s,roof-bottom-.08*s,.07*s),k.paint);
 if(!spec.cargo){const rw=rect(-width*.36,width*.36,belt+.08*s,roof-.18*s,.06*s);const g=k.mesh(new T.ShapeGeometry(new T.Shape(rw.getPoints(6))),k.glass);g.position.set(cx,0,back-.005*s);g.rotation.y=Math.PI;}
 for(const side of [-1,1])k.box(v(cx+side*half*.86,belt-.15*s,back-.01*s),v(.12*s,.3*s,.03*s),k.tail);
 k.box(v(cx,bottom+.13*s,back-.06*s),v(width*1.01,.16*s,.14*s),k.dark);
 k.box(v(cx,bottom-.02*s,(back+front)/2),v(width*.94,.06*s,front-back-.1*s),k.dark);
 // Wheels: steel rims with hubcaps; a truck carries twin rear wheels.
 const wheels:T.Object3D[]=[];
 spec.axles.forEach((a,i)=>{for(const side of [-1,1]){const rear=i>0,twin=rear&&spec.dualRear;
  wheels.push(k.wheel(`Wheel_${i?'rear':'front'}_${side}${i>1?`_${i}`:''}`,v(cx+side*(half-.12*s),wheelR,z0+a*s),wheelR,.24*s));
  if(twin)wheels.push(k.wheel(`Wheel_twin_${side}_${i}`,v(cx+side*(half-.38*s),wheelR,z0+a*s),wheelR,.22*s));}});
 spinWheels(k,wheels);
 // Mirrors on stalks at the windscreen pillars.
 for(const side of [-1,1]){const base=v(cx+side*half,belt+.12*s,front-.18*s),m=v(cx+side*(half+.22*s),belt+.25*s,front-.12*s);k.tube(base,m,.015*s,k.dark);k.box(m,v(.05*s,.24*s,.12*s),k.dark);}
 // Seats: the fitted driver, a passenger seat and bench rows.
 k.box(v(0,seatY-.03*s,z0-.02*s),v(.52*s,.12*s,.5*s),k.seat);const sb=k.box(v(0,seatY+.3*s,z0-.32*s),v(.5*s,.66*s,.12*s),k.seat);sb.rotation.x=-.08;
 k.box(v(cx-half*.5,seatY-.03*s,z0-.02*s),v(.62*s,.12*s,.5*s),k.seat);k.box(v(cx-half*.5,seatY+.3*s,z0-.32*s),v(.6*s,.66*s,.12*s),k.seat);
 for(const zz of spec.bench??[]){k.box(v(cx,seatY-.03*s,z0+zz*s),v(width*.86,.12*s,.48*s),k.seat);k.box(v(cx,seatY+.28*s,z0+(zz-.26)*s),v(width*.86,.6*s,.1*s),k.seat);}
 steeringWheel(k,z0+.58*s,cx);
 // The danfo's roof rack: side rails and slats on short legs, with a strapped load.
 if(spec.rack){const z0r=back+.35*s,z1r=front-rake-.25*s,y=roof+.14*s,hw=half*.86,mid=(z0r+z1r)/2;
  for(const side of [-1,1]){k.tube(v(cx+side*hw,y,z0r),v(cx+side*hw,y,z1r),.018*s,k.dark);for(const zz of [z0r,mid,z1r])k.tube(v(cx+side*hw,roof,zz),v(cx+side*hw,y,zz),.015*s,k.dark);}
  for(let i=0;i<=6;i++){const zz=z0r+(z1r-z0r)*i/6;k.tube(v(cx-hw,y,zz),v(cx+hw,y,zz),.012*s,k.dark);}
  const sack=new T.MeshStandardMaterial({name:'Danfo load',color:'#8a7656',roughness:.95}),bag=new T.MeshStandardMaterial({name:'Danfo bag',color:'#2f5d7c',roughness:.85});
  k.box(v(cx-.25*s,y+.14*s,mid-.6*s),v(.6*s,.26*s,.8*s),sack);k.box(v(cx+.3*s,y+.11*s,mid-.3*s),v(.5*s,.2*s,.55*s),bag);k.ellipsoid(v(cx+.1*s,y+.12*s,mid+.5*s),v(.32*s,.13*s,.26*s),sack);}
 if(spec.destination){k.box(v(cx,roof-.13*s,front-rake-.03*s),v(width*.7,.18*s,.04*s),k.dark);k.box(v(cx,roof-.13*s,front-rake-.005*s),v(width*.62,.12*s,.01*s),new T.MeshStandardMaterial({name:'Vehicle destination sign',color:'#f5a623',emissive:'#b86b00',emissiveIntensity:.8,roughness:.4}));}
 // A truck's cargo box rides behind the cab.
 if(spec.cargo){const c=spec.cargo,len=(c.front-c.back)*s,zc=z0+(c.front+c.back)/2*s,top=H.y+c.top*s;
  k.box(v(cx,(bottom+.1*s+top)/2,zc),v(width*1.04,top-bottom-.1*s,len),new T.MeshStandardMaterial({name:'Vehicle cargo box',color:'#e8e6df',roughness:.75}));
  for(let i=0;i<=8;i++)for(const side of [-1,1])k.box(v(cx+side*width*.525,(bottom+top)/2,zc-len/2+len*i/8),v(.02*s,top-bottom-.2*s,.04*s),k.trim);
  for(const side of [-1,1])k.box(v(cx+side*half*.86,bottom+.35*s,zc-len/2-.01*s),v(.12*s,.22*s,.03*s),k.tail);}
}

/** Keke (auto-rickshaw), quad bike and scooter share the motorcycle's fitted saddle and bar. */
function handlebar(k:VehicleKit,width=1){
 const s=k.fit.scale,bars=k.component('Handlebars'),centre=k.fit.average('left').add(k.fit.average('right')).multiplyScalar(.5),half=k.fit.average('left').distanceTo(k.fit.average('right'))/2*width;
 k.tube(v(-half,0,0),v(half,0,0),.015*s,k.trim,bars);for(const side of [-1,1])k.tube(v(side*(half-.1*s),0,0),v(side*(half+.04*s),0,0),.024*s,k.rubber,bars);
 bars.position.copy(centre);return centre;
}
function buildKeke(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),z0=H.z,low=Math.min(...k.fit.samples.map(c=>c.hip.y)),head=Math.max(...k.fit.samples.map(c=>c.headTop.y)),r=.22*s;
 const frontZ=z0+.98*s,rearZ=z0-.95*s,track=.62*s,roof=Math.max(head+.16*s,1.62*s),green=new T.MeshStandardMaterial({name:'Keke stripe',color:k.style.accentColor,roughness:.4});
 const wheels=[k.wheel('Wheel_front',v(0,r,frontZ),r,.12*s),...[-1,1].map(side=>k.wheel(`Wheel_rear_${side}`,v(side*track,r,rearZ),r,.14*s))];spinWheels(k,wheels,10);
 // Floor pan, front cowl and apron around the single front wheel.
 k.box(v(0,.27*s,z0-.12*s),v(1.18*s,.08*s,2.0*s),k.dark);
 // A tapered fascia in front of the driver's legs carries the headlamp; the front wheel turns beneath it on a fork.
 const feet=Math.max(k.fit.average('footLeft').z,k.fit.average('footRight').z)+.14*s,dash=Math.max(.95*s,low+.28*s);
 const face=(y:number)=>T.MathUtils.lerp(frontZ-.08*s,feet+.26*s,(y-.5*s)/(dash-.5*s));
 const fascia=new ConvexGeometry([
  ...[-1,1].flatMap(x=>[v(x*.2*s,.5*s,face(.5*s)),v(x*.5*s,dash,face(dash)),v(x*.52*s,dash,feet),v(x*.3*s,.32*s,feet),v(x*.2*s,.36*s,face(.5*s)-.06*s)]),
 ]);k.mesh(fascia,k.paint);
 k.box(v(0,dash+.02*s,(face(dash)+feet)/2),v(1.06*s,.05*s,face(dash)-feet+.06*s),k.dark);
 const lampY=dash-.17*s,lamp=k.mesh(new T.CylinderGeometry(.08*s,.08*s,.05*s,24),k.light);lamp.rotation.x=Math.PI/2-.35;lamp.position.set(0,lampY,face(lampY)+.02*s);
 const rim=k.mesh(new T.TorusGeometry(.085*s,.012*s,8,24),k.trim);rim.rotation.x=-.35;rim.position.set(0,lampY,face(lampY)+.035*s);
 for(const side of [-1,1]){const ind=k.box(v(side*.38*s,dash-.08*s,face(dash-.08*s)+.01*s),v(.1*s,.05*s,.03*s),k.light);ind.rotation.x=-.35;}
 k.ellipsoid(v(0,r+.11*s,frontZ),v(.1*s,.045*s,.24*s),k.paint);
 for(const side of [-1,1])k.tube(v(side*.07*s,r,frontZ),v(side*.07*s,.5*s,face(.5*s)-.03*s),.02*s,k.trim);
 const centre=handlebar(k,.9);k.tube(v(0,dash,face(dash)-.08*s),centre,.022*s,k.trim);
 const screen=k.box(v(0,(dash+roof-.05*s)/2,face(dash)-.04*s),v(1.0*s,roof-dash-.06*s,.02*s),k.glass);screen.rotation.x=-.06;
 // Driver saddle and the rear passenger bench with its backrest.
 k.box(v(0,low-.07*s,z0-.06*s),v(.42*s,.1*s,.46*s),k.seat);
 k.box(v(0,low-.07*s,z0-.78*s),v(1.08*s,.12*s,.48*s),k.seat);k.box(v(0,low+.22*s,z0-1.06*s),v(1.08*s,.5*s,.1*s),k.seat);
 // Body sides around the rear wheels, the engine cover and the rear panel with lamps and plate.
 for(const side of [-1,1]){
  const p=sideShape(z0-1.28*s,z0+.25*s,.3*s,.66*s,[[rearZ,r+.05*s,r]],.08*s,.06*s);wall(k,p,side*.62*s,side,.04*s,k.paint);
  k.box(v(side*.625*s,.52*s,z0-.5*s),v(.012*s,.07*s,1.4*s),green);
  k.ellipsoid(v(side*track,r+.12*s,rearZ),v(.12*s,.05*s,.26*s),k.paint);
 }
 k.box(v(0,.5*s,z0-1.26*s),v(1.22*s,.44*s,.06*s),k.paint);k.box(v(0,.38*s,z0-1.15*s),v(.9*s,.18*s,.2*s),k.dark);
 for(const side of [-1,1])k.box(v(side*.48*s,.6*s,z0-1.3*s),v(.14*s,.08*s,.03*s),k.tail);
 k.box(v(0,.45*s,z0-1.3*s),v(.36*s,.1*s,.012*s),new T.MeshStandardMaterial({name:'Vehicle plate',color:'#e9ebe4',roughness:.5}));
 // Canopy on four posts, with a canvas back.
 const posts:[number,number][]=[[-.5,.6],[.5,.6],[-.6,-1.22],[.6,-1.22]];
 for(const [x,zz]of posts){const front=zz>0,pz=front?face(dash)-.06*s:z0+zz*s;k.tube(v(x*s,front?dash:.62*s,pz),v(x*s,roof-.03*s,pz),.022*s,k.dark);}
 const canvas=new T.MeshStandardMaterial({name:'Keke canopy',color:'#2b2f2e',roughness:.9});
 const roofFront=face(dash)+.1*s,roofBack=z0-1.32*s,roofMid=(roofFront+roofBack)/2;
 // A domed roof: a shallow cylinder section across the width, a visor over the windscreen and a canvas back.
 const dome=k.mesh(new T.CylinderGeometry(1.4*s,1.4*s,roofFront-roofBack,32,1,true,-.48,.96),canvas);dome.rotation.x=-Math.PI/2;dome.position.set(0,roof-1.4*s*Math.cos(.48)+.04*s,roofMid);
 const under=k.box(v(0,roof-.01*s,roofMid),v(1.26*s,.03*s,roofFront-roofBack),canvas);under.castShadow=false;
 const visor=k.box(v(0,roof-.04*s,roofFront+.06*s),v(1.2*s,.04*s,.18*s),canvas);visor.rotation.x=.25;
 k.box(v(0,(roof+.66*s)/2,roofBack+.05*s),v(1.24*s,roof-.66*s,.03*s),canvas);
 for(const side of [-1,1])k.box(v(side*.635*s,roof-.03*s,roofMid),v(.03*s,.07*s,roofFront-roofBack),green);
}
function buildQuad(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),z0=H.z,low=Math.min(...k.fit.samples.map(c=>c.hip.y)),r=.3*s,track=.52*s,fz=z0+.86*s,rz=z0-.62*s;
 const wheels=[fz,rz].flatMap(zz=>[-1,1].map(side=>k.wheel(`Wheel_${zz===fz?'front':'rear'}_${side}`,v(side*track,r,zz),r,.26*s,true)));spinWheels(k,wheels,8);
 k.box(v(0,.42*s,z0+.1*s),v(.42*s,.26*s,1.3*s),k.dark);
 for(const zz of [fz,rz]){const fender=k.box(v(0,r+.16*s,zz),v(1.3*s,.08*s,.62*s),k.paint);fender.rotation.x=zz===fz?.1:-.1;for(let i=-3;i<=3;i++)k.tube(v(i*.15*s,r+.24*s,zz-.22*s),v(i*.15*s,r+.24*s,zz+.22*s),.012*s,k.trim);}
 k.ellipsoid(v(0,low-.05*s,z0-.12*s),v(.2*s,.07*s,.42*s),k.seat);k.ellipsoid(v(0,.62*s,z0+.42*s),v(.24*s,.14*s,.3*s),k.paint);
 const centre=handlebar(k);k.tube(v(0,.6*s,z0+.5*s),centre,.022*s,k.trim);
 const lamp=k.box(v(0,.66*s,fz+.25*s),v(.32*s,.1*s,.05*s),k.light);lamp.rotation.x=.2;
 for(const side of [-1,1]){const foot=k.fit.average(side>0?'footLeft':'footRight');k.box(v(side*.3*s,foot.y-.03*s,foot.z),v(.2*s,.03*s,.5*s),k.trim);k.box(v(side*.36*s,.62*s,rz-.3*s),v(.08*s,.05*s,.03*s),k.tail);}
}
function buildScooter(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),z0=H.z,low=Math.min(...k.fit.samples.map(c=>c.hip.y)),r=.21*s,fz=z0+.82*s,rz=z0-.62*s;
 spinWheels(k,[k.wheel('Front_wheel',v(0,r,fz),r,.1*s,'alloy'),k.wheel('Rear_wheel',v(0,r,rz),r,.12*s,'alloy')],10);
 // Step-through floor, a curved leg shield and the rounded rear body under the seat.
 k.box(v(0,.3*s,z0+.15*s),v(.36*s,.06*s,.7*s),k.dark);
 const shield=k.ellipsoid(v(0,.62*s,z0+.58*s),v(.24*s,.36*s,.09*s),k.paint);shield.rotation.x=-.25;
 k.ellipsoid(v(0,low-.2*s,z0-.35*s),v(.22*s,.2*s,.48*s),k.paint);k.ellipsoid(v(0,low-.05*s,z0-.2*s),v(.18*s,.06*s,.36*s),k.seat);
 k.ellipsoid(v(0,r+.16*s,fz),v(.08*s,.05*s,.22*s),k.paint);
 const centre=handlebar(k,.85);k.tube(v(0,.4*s,fz-.05*s),centre,.022*s,k.trim);
 const lamp=k.mesh(new T.CylinderGeometry(.07*s,.07*s,.05*s,20),k.light);lamp.rotation.x=Math.PI/2;lamp.position.copy(centre).add(v(0,.02*s,.1*s));
 k.box(v(0,low-.18*s,rz-.12*s),v(.16*s,.06*s,.03*s),k.tail);
}
function buildKart(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),z0=H.z,seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.09*s,r=.15*s,fz=z0+1.05*s,rz=z0-.42*s;
 const wheels=[k.wheel('Wheel_front_1',v(.5*s,r,fz),r,.13*s,'alloy'),k.wheel('Wheel_front_-1',v(-.5*s,r,fz),r,.13*s,'alloy'),k.wheel('Wheel_rear_1',v(.6*s,r+.01*s,rz),r+.01*s,.2*s,'alloy'),k.wheel('Wheel_rear_-1',v(-.6*s,r+.01*s,rz),r+.01*s,.2*s,'alloy')];spinWheels(k,wheels,12);
 // Tube chassis, bucket seat at the fitted hips, nose cone, side pods and rear bumper.
 for(const side of [-1,1]){k.tube(v(side*.3*s,.12*s,fz+.1*s),v(side*.36*s,.12*s,rz-.2*s),.02*s,k.trim);k.tube(v(side*.38*s,.12*s,fz),v(side*.5*s,.12*s,fz),.02*s,k.trim);}
 k.tube(v(-.36*s,.12*s,rz),v(.36*s,.12*s,rz),.025*s,k.trim);
 k.box(v(0,seatY-.06*s,z0-.05*s),v(.42*s,.18*s,.45*s),k.seat);const back=k.box(v(0,seatY+.2*s,z0-.3*s),v(.42*s,.42*s,.08*s),k.seat);back.rotation.x=-.3;
 const nose=k.mesh(new ConvexGeometry([...[-1,1].flatMap(x=>[v(x*.42*s,.08*s,fz+.42*s),v(x*.42*s,.22*s,fz+.4*s),v(x*.3*s,.12*s,z0+.45*s),v(x*.24*s,.42*s,z0+.5*s),v(x*.3*s,.08*s,z0+.45*s)])]),k.paint);nose.castShadow=true;
 k.tube(v(-.55*s,.13*s,fz+.47*s),v(.55*s,.13*s,fz+.47*s),.025*s,k.trim);
 for(const side of [-1,1]){const pod=k.ellipsoid(v(side*.55*s,.2*s,z0+.25*s),v(.12*s,.1*s,.42*s),k.paint);pod.rotation.x=.05;}
 k.box(v(0,.18*s,rz-.32*s),v(1.35*s,.12*s,.08*s),k.paint);
 k.box(v(-.32*s,seatY,rz+.05*s),v(.22*s,.24*s,.26*s),k.dark);
 const number=raceNumber(k,k.style.number??8,.12*s,k.dark);number.position.set(0,.29*s,fz+.31*s);k.group.add(number);
 steeringWheel(k,z0+.62*s,0,0,.15);
}

const BOXES:Partial<Record<VehicleBody,BoxSpec>>={
 danfo:{width:1.86,cx:-.42,front:.95,back:-3.3,axles:[.12,-2.42],wheelR:.33,roofAbove:.2,belt:.32,windows:[[.55,.08],[.55,.08],[.55,.08],[.5,0]],doorBack:-.55,stripes:true,slidingDoor:true,rack:true,bench:[-1.15,-1.85,-2.55]},
 van:{width:1.94,cx:-.44,front:1.0,back:-3.5,axles:[.15,-2.6],wheelR:.34,roofAbove:.42,belt:.32,windows:[],doorBack:-.55,slidingDoor:true},
 bus:{width:2.5,cx:-.7,front:1.1,back:-9.2,axles:[.0,-6.2],wheelR:.48,roofAbove:.55,belt:.22,windows:Array.from({length:7},()=>[1.0,.12]as [number,number]),doorBack:-.6,bench:[-1.6,-2.5,-3.4,-4.3,-5.2,-6.1,-7.0,-7.9],destination:true},
 truck:{width:2.1,cx:-.5,front:1.15,back:-.75,axles:[.2,-3.5],wheelR:.44,roofAbove:.32,belt:.32,windows:[],doorBack:-.55,dualRear:true,cargo:{front:-.85,back:-5.2,top:1.6}},
};
/** Builders for each body; the saloon and muscle car are variants of the covered car. */
export function buildBody(k:VehicleKit,body:VehicleBody){
 const box=BOXES[body];
 if(box)boxVehicle(k,{nose:.12,rake:body==='bus'?.08:.22,...box,width:box.width*k.fit.scale,cx:box.cx*k.fit.scale,wheelR:box.wheelR*k.fit.scale});
 else if(body==='keke')buildKeke(k);else if(body==='quad')buildQuad(k);else if(body==='scooter')buildScooter(k);else if(body==='kart')buildKart(k);else if(body==='saloon'||body==='muscle')buildCoveredCar(k,body);
}
