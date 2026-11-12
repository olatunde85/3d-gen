/** Contemporary coupe/SUV bodywork, with the existing rider contacts and measured headroom. */
import * as T from 'three';
import {VehicleKit,v,raceNumber,type V} from './vehicle-kit';
const smooth=(x:number)=>{const t=T.MathUtils.clamp(x,0,1);return t*t*(3-2*t);};
/** Smooth indexed surface; columns run across the panel, rows along it. */
function surface(k:VehicleKit,rows:number,cols:number,point:(row:number,col:number)=>V,mat:T.Material,flip=false){
 const p:number[]=[],uv:number[]=[],indices:number[]=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){p.push(...point(i/rows,j/cols).toArray());uv.push(j/cols,i/rows);}
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+1,c=a+cols+1,d=c+1;indices.push(...(flip?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return k.mesh(geo,mat);
}
function line(k:VehicleKit,points:V[],radius:number,mat:T.Material){return k.mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),32,radius,7,false),mat);}
export function buildCoveredCar(k:VehicleKit,variant?:'saloon'|'muscle'){
 const s=k.fit.scale,pickup=k.fit.id==='pickup',suv=k.fit.id==='suv'||pickup,driver=!k.fit.clip.id.includes('passenger'),H=k.fit.average('hip'),cx=(driver?-.36:.36)*s,z=H.z;
 // The coupe sits long and wide on big wheels pushed to the corners, which reads low despite the seated driver's headroom.
 // A saloon stretches the cabin and adds a boot and rear doors; a muscle car runs a long bonnet and squared haunches.
 const saloon=variant==='saloon',muscle=variant==='muscle';
 const width=(suv?2.02:saloon?1.9:1.98)*s,wheelR=(suv?.395:saloon?.35:.375)*s,front=(suv?1.52:muscle?1.78:1.64)*s,rear=(pickup?-1.95:suv?-1.57:saloon?-1.72:-1.42)*s,endF=(suv?2.15:muscle?2.5:2.34)*s,endR=(pickup?-3.0:suv?-2.48:saloon?-2.62:-2.12)*s;
 const belt=H.y+(suv?.16:.35)*s,bottom=(suv?.41:.12)*s,roof=Math.max(H.y+.88*s,...k.fit.samples.map(c=>c.headTop.y+.12*s));
 const roofRear=(pickup?-.64:suv?-2.27:saloon?-1.42:-1.02)*s,roofFront=(suv?.53:saloon?.42:.37)*s,halfRoof=width*(suv?.43:saloon?.39:.36),frontLow=(suv?.72:saloon?.95:.99)*s,rearLow=(pickup?-.75:suv?-2.37:saloon?-2.02:-1.74)*s;
 // Coupe haunches swell over the rear wheels.
 const halfAt=(zz:number)=>suv?width*.49:width*.5*((muscle?.9:.84)+(muscle?.1:.16)*Math.sin(Math.PI*T.MathUtils.clamp((zz-endR)/(endF-endR),0,1))**.65)+.035*s*Math.exp(-(((zz-rear)/(.55*s))**2));
 // The coupe's bonnet falls away to a low nose; the deck drops gently to the tail.
 const shoulderAt=(zz:number)=>suv?belt-.025*s:belt-(saloon?.30:muscle?.22:.40)*s*smooth((zz-.55*s)/(endF-.55*s))**.8-(saloon?.04:muscle?.03:.10)*s*smooth((-.70*s-zz)/(-.70*s-endR));
 const arch=wheelR+.033*s;
 const lowAt=(zz:number)=>{let y=bottom;for(const axle of [front,rear])if(Math.abs(zz-axle)<=arch)y=Math.max(y,wheelR+Math.sqrt(Math.max(0,arch*arch-(zz-axle)**2)));return y;};
 const bodyTopAt=(zz:number)=>Math.max(shoulderAt(zz),lowAt(zz)+.065*s);
 // Rounded, three-dimensional flanks. The lower boundary follows each wheel opening.
 const stations=[...Array.from({length:97},(_,i)=>endR+(endF-endR)*i/96),...([front,rear].flatMap(a=>[a-arch-.0001*s,a-arch,a+arch,a+arch+.0001*s]))].sort((a,b)=>a-b);
 for(const side of [-1,1]){
  const points:number[]=[],uv:number[]=[],indices:number[]=[],M=20;
  for(const [i,zz]of stations.entries()){
   const low=lowAt(zz),top=bodyTopAt(zz),half=halfAt(zz);
   const ring=new T.CatmullRomCurve3([v(.92,0,0),v(.99,.27,0),v(1,.67,0),v(.97,.91,0),v(.89,1,0),v(.81,.96,0),v(.81,.35,0),v(.82,0,0)],true,'catmullrom',.18);
   for(let j=0;j<=M;j++){const q=ring.getPoint(j/M);points.push(cx+side*half*q.x,low+(top-low)*q.y,z+zz);uv.push(j/M,i/(stations.length-1));}
  }
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<M;j++){const a=i*(M+1)+j,b=a+1,c=a+M+1,d=c+1;indices.push(...(side>0?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
  // Close both ends of the flank, so its thickness never shows where it meets the nose and tail.
  for(const [i,outward]of [[0,-1],[stations.length-1,1]]){
   const base=i*(M+1),centre=points.length/3;let cx0=0,cy0=0,cz0=0;for(let j=0;j<=M;j++){cx0+=points[(base+j)*3];cy0+=points[(base+j)*3+1];cz0+=points[(base+j)*3+2];}
   points.push(cx0/(M+1),cy0/(M+1),cz0/(M+1));uv.push(.5,i?1:0);
   for(let j=0;j<M;j++){const a=base+j,b=a+1;indices.push(...(side*outward>0?[centre,b,a]:[centre,a,b]));}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();k.mesh(geo,k.paint);
  line(k,[v(cx+side*halfAt(-.8*s)*.985,belt-.12*s,z-.8*s),v(cx+side*halfAt(0)*.99,belt-.10*s,z),v(cx+side*halfAt(.7*s)*.985,belt-.14*s,z+.7*s)],.004*s,k.dark);
  // Flush handles, door shut lines and dark sill trim replace the broad chrome strips.
  for(const doorZ of suv&&!pickup?[-1.22,.08]:saloon?[-1.02,.05]:[.05]){
   const zz=doorZ*s,x=cx+side*(halfAt(zz)*.997+.003*s);
   k.box(v(x,belt-.095*s,z+zz),v(.015*s,.025*s,.17*s),k.dark);
   line(k,[v(x,belt-.16*s,z+zz+.12*s),v(x,belt-.34*s,z+zz+.13*s),v(x,bottom+.11*s,z+zz+.10*s)],.0025*s,k.dark);
  }
  k.box(v(cx+side*width*.465,bottom+.012*s,z+(front+rear)/2),v(.08*s,.045*s,front-rear-2*arch),k.dark);
 }
 // A crowned bonnet and tapered rear deck join the body shoulder without a box-shaped hood.
 for(const [from,to]of (pickup?[[frontLow,endF]]:[[frontLow,endF],[endR,rearLow]]))surface(k,32,28,(t,u)=>{const zz=from+(to-from)*t,x=u*2-1,half=halfAt(zz)*.90;return v(cx+x*half,bodyTopAt(zz)+.005*s+.035*s*(1-x*x),z+zz);},k.paint,true);
 const nose=(u:number)=>{const x=u*2-1;return{ x:cx+x*halfAt(endF)*.99,z:z+endF+.10*s*(1-x*x)};};
 surface(k,14,36,(t,u)=>{const p=nose(u),x=u*2-1;return v(p.x,bottom+(shoulderAt(endF)+.018*s-bottom)*t+.018*s*(1-x*x)*t,suv?z+endF+.035*s*(1-x*x)-.015*s*(1-t):p.z-.12*s*(1-t)**1.3);},k.paint);
 // The coupe's tail curves across and leans in toward the deck instead of standing as a flat panel.
 surface(k,12,32,(t,u)=>v(cx+(u*2-1)*halfAt(endR)*.99,bottom+(shoulderAt(endR)-bottom)*t,z+endR-(suv?.045:.11)*s*(1-(u*2-1)**2)+(suv?0:.05*s*t*t)),k.paint,true);
 k.box(v(cx,k.fit.lift-.04*s,z-.05*s),v(width*.76,.04*s,2.3*s),k.dark);
 for(const axle of [front,rear])for(const side of [-1,1]){
  const wheel=k.wheel(`Wheel_${axle===front?'front':'rear'}_${side}`,v(cx+side*width*.485,wheelR,z+axle),wheelR,.245*s,'alloy');
  k.updates.push((_,t)=>{wheel.rotation.x=t/k.fit.clip.duration*Math.PI*6;});
  // Brake discs sit behind the alloy spokes.
  const disc=k.mesh(new T.CylinderGeometry(wheelR*.57,wheelR*.57,.018*s,32),k.dark);disc.rotation.z=Math.PI/2;disc.position.set(cx+side*width*.485,wheelR,z+axle);
 }
 // Two front seats retain exactly the existing car animation's body and hand contacts.
 const seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.085*s;
 for(const x of [cx-.36*s,cx+.36*s]){
  k.box(v(x,seatY-.025*s,z),v(.53*s,.12*s,.48*s),k.seat);
  const back=k.box(v(x,seatY+.26*s,z-.30*s),v(.51*s,.62*s,.12*s),k.seat);back.rotation.x=-.11;
  k.box(v(x,seatY+.66*s,z-.36*s),v(.32*s,.18*s,.10*s),k.seat);
 }
 if(suv&&!pickup||saloon){
  k.box(v(cx,seatY-.01*s,z-.91*s),v(1.40*s,.12*s,.45*s),k.seat);
  k.box(v(cx,seatY+.25*s,z-1.18*s),v(1.40*s,.57*s,.11*s),k.seat);
  for(const x of [-.44,0,.44])k.box(v(cx+x*s,seatY+.62*s,z-1.20*s),v(.27*s,.17*s,.10*s),k.seat);
 }
 k.box(v(cx,H.y+.08*s,z+.58*s),v(width*.81,.18*s,.23*s),k.dark);
 const wheel=k.steering(.18*s,28*Math.PI/180,driver?v():v(.72*s,0,0));
 if(!driver){k.updates.pop();wheel.position.set(.72*s,H.y+.27*s,z+.43*s);wheel.rotation.x=-.45;}
 k.tube(v(driver?0:.72*s,H.y+.02*s,z+.59*s),v(driver?0:.72*s,H.y+.20*s,z+.48*s),.03*s,k.dark);
 // A thin double-curved roof, raked glass and a continuous dark window surround.
 const roofPoint=(t:number,u:number)=>{const across=u*2-1,edge=(t-.5)*2,half=halfRoof*(.95+.05*Math.sin(t*Math.PI));return v(cx+across*half,roof+.02*s-(suv?.025:.07)*s*across*across-(suv?.008:.035)*s*edge*edge,z+roofRear+(roofFront-roofRear)*t);};
 const roofMat=k.style.variant==='sport'?k.dark:k.paint;
 surface(k,24,30,roofPoint,roofMat,true);
 surface(k,24,30,(t,u)=>roofPoint(t,u).add(v(0,-.035*s,0)),roofMat);
 for(const edge of [0,1])surface(k,1,30,(t,u)=>roofPoint(edge,u).add(v(0,-.035*s*t,0)),roofMat,edge===0);
 for(const edge of [0,1])surface(k,24,1,(t,u)=>roofPoint(t,edge).add(v(0,-.035*s*u,0)),roofMat,edge===1);
 buildCabin(k,{cx,z,belt,roof,roofRear,roofFront,halfRoof,frontLow,rearLow,width,halfAt,suv,saloon});
 // The muscle car's raised bonnet scoop and a ducktail spoiler across the deck.
 if(muscle){
  const top=bodyTopAt(1.35*s);k.box(v(cx,top+.05*s,z+1.35*s),v(.62*s,.1*s,.7*s),k.style.variant==='sport'?k.dark:k.paint);k.box(v(cx,top+.06*s,z+1.71*s),v(.5*s,.06*s,.02*s),k.dark);
  const lip=bodyTopAt(endR+.12*s);k.box(v(cx,lip+.05*s,z+endR+.1*s),v(width*.88,.05*s,.22*s),k.paint).rotation.x=.18;
 }
 // Painted designs: twin stripes, a race number on each door, or police and taxi equipment.
 const livery=k.style.livery;
 if(livery==='stripes'||livery==='racing'){
  const stripe=new T.MeshStandardMaterial({name:'Vehicle stripes',color:livery==='racing'?k.style.accentColor:'#f1f1ec',roughness:.3,metalness:.15}),bands=[[.40,.47],[.53,.60]];
  if(!suv)for(const [from,to]of [[frontLow,endF],[endR,rearLow]])for(const [u0,u1]of bands)surface(k,24,3,(t,u)=>{const x=(u0+(u1-u0)*u)*2-1,zz=from+(to-from)*t,half=halfAt(zz)*.90;return v(cx+x*half,bodyTopAt(zz)+.011*s+.035*s*(1-x*x),z+zz);},stripe,true);
  else for(const [u0,u1]of bands)k.box(v(cx+(u0+u1-1)*.55*s,belt+.066*s,z+1.21*s),v((u1-u0)*1.1*s,.006*s,.66*s),stripe);
  for(const [u0,u1]of bands)surface(k,20,3,(t,u)=>roofPoint(t,u0+(u1-u0)*u).add(v(0,.005*s,0)),stripe,true);
 }
 if(livery==='racing'||livery==='police'||livery==='taxi'){
  const white=new T.MeshStandardMaterial({name:'Vehicle roundel',color:'#f4f4f0',roughness:.4}),ink=new T.MeshStandardMaterial({name:'Vehicle number',color:'#16181b',roughness:.4});
  const doorZ=(suv?.12:.23)*s,doorY=(belt+bottom)/2+.03*s;
  for(const side of [-1,1]){
   const x=cx+side*(halfAt(doorZ)+.008*s);
   if(livery==='racing'){
    const roundel=k.mesh(new T.CircleGeometry(.2*s,32),white);roundel.position.set(x,doorY,z+doorZ);roundel.rotation.y=side*Math.PI/2;
    const number=raceNumber(k,k.style.number??7,.2*s,ink);number.position.set(x+side*.006*s,doorY,z+doorZ);number.rotation.y=side*Math.PI/2;k.group.add(number);
   }else{
    // A band along the doors: blue on police cars, black and white checks on taxis.
    const band=livery==='police'?new T.MeshStandardMaterial({name:'Vehicle band',color:'#1c3f8f',roughness:.35}):ink;
    for(let i=0;i<(livery==='taxi'?12:1);i++){const len=livery==='taxi'?.14*s:1.5*s,zz=livery==='taxi'?(i-5.5)*.14*s:-.15*s,box=k.box(v(x,doorY+(livery==='taxi'&&i%2?.07*s:0),z+zz),v(.012*s,livery==='taxi'?.07*s:.16*s,len),livery==='taxi'&&i%2?white:band);box.castShadow=false;}
   }
  }
  const top=roofPoint(.5,.5);
  if(livery==='police'){
   k.box(v(top.x,top.y+.045*s,top.z),v(.95*s,.07*s,.22*s),k.dark);
   for(const side of [-1,1])k.box(v(top.x+side*.24*s,top.y+.1*s,top.z),v(.42*s,.07*s,.2*s),new T.MeshStandardMaterial({name:side<0?'Vehicle beacon red':'Vehicle beacon blue',color:side<0?'#e0262f':'#2a5be8',emissive:side<0?'#c0141c':'#1c46d8',emissiveIntensity:.9,roughness:.2}));
  }
  if(livery==='taxi'){
   k.box(v(top.x,top.y+.035*s,top.z),v(.5*s,.05*s,.2*s),k.dark);
   k.box(v(top.x,top.y+.11*s,top.z),v(.46*s,.13*s,.16*s),new T.MeshStandardMaterial({name:'Vehicle roof sign',color:'#f6d94a',emissive:'#a8860c',emissiveIntensity:.5,roughness:.3}));
  }
 }
 k.box(v(cx,belt-.045*s,z+frontLow-.12*s),v(width*.77,.08*s,.24*s),k.dark);
 if(pickup){
  const bedEnd=z-.82*s,bedRear=z+endR+.10*s,floorY=bottom+.24*s;
  k.box(v(cx,floorY,(bedEnd+bedRear)/2),v(width*.78,.06*s,bedEnd-bedRear),k.dark);
  for(let i=-5;i<=5;i++)k.box(v(cx+i*.13*s,floorY+.035*s,(bedEnd+bedRear)/2),v(.028*s,.012*s,bedEnd-bedRear-.06*s),k.rubber);
  k.box(v(cx,(floorY+belt)/2,bedEnd),v(width*.84,belt-floorY,.08*s),k.paint);
  for(const side of [-1,1])k.box(v(cx+side*width*.44,belt+.015*s,(bedEnd+bedRear)/2),v(.10*s,.045*s,bedEnd-bedRear),k.dark);
  k.box(v(cx,belt-.1*s,z+endR-.016*s),v(.24*s,.04*s,.02*s),k.trim);
  for(const side of [-1,1])k.box(v(cx+side*.77*s,belt-.15*s,z+endR-.04*s),v(.13*s,.24*s,.025*s),k.tail);
 }
 if(suv){buildRuggedDetails(k,{cx,z,belt,bottom,endF,endR,width,wheelR,front,rear});return;}
 // Surface-following lights and intakes stay flush with the sculpted nose.
 const frontZ=(x:number,y:number)=>{const u=(x-cx)/(halfAt(endF)*.99),t=T.MathUtils.clamp((y-bottom)/(shoulderAt(endF)+.018*s-bottom),0,1);return z+endF+.10*s*(1-u*u)-.12*s*(1-t)**1.3+.01*s;};
 const red=k.tail;
 for(const side of [-1,1]){
  const y=shoulderAt(endF)-.055*s,x0=cx+side*.43*s,x1=cx+side*.72*s;
  line(k,[v(x0,y,frontZ(x0,y)),v((x0+x1)/2,y,frontZ((x0+x1)/2,y)),v(x1,y-.025*s,frontZ(x1,y-.025*s)),v(x1,y-.09*s,frontZ(x1,y-.09*s))],.011*s,k.light);
  const intakeX=cx+side*.63*s,intakeY=bottom+.15*s;
  surface(k,8,12,(t,u)=>{const x=intakeX+(u-.5)*.26*s,y=intakeY+(t-.5)*.17*s;return v(x,y,frontZ(x,y)+.005*s);},k.dark);
 }
 surface(k,8,32,(t,u)=>{const x=cx+(u-.5)*width*.43,y=bottom+(.07+t*.17)*s;return v(x,y,frontZ(x,y)+.005*s);},k.dark);
 // One slim mesh grille between the lamps, framed in trim.
 const grilleY=shoulderAt(endF)-.15*s;surface(k,6,28,(t,u)=>{const x=cx+(u-.5)*(.58+.08*t)*s,y=grilleY+(t-.5)*.09*s;return v(x,y,frontZ(x,y)+.006*s);},k.dark);
 for(let i=-6;i<=6;i++){const x=cx+i*.042*s;k.box(v(x,grilleY,frontZ(x,grilleY)+.012*s),v(.006*s,.075*s,.008*s),k.trim);}
 line(k,[-.33,-.16,0,.16,.33].map(xx=>{const x=cx+xx*s,y=grilleY+.05*s;return v(x,y,frontZ(x,y)+.01*s);}),.005*s,k.trim);
 for(const yy of [.10,.15,.20])line(k,[-.38,0,.38].map(xx=>{const x=cx+xx*s,y=bottom+yy*s;return v(x,y,frontZ(x,y)+.01*s);}),.004*s,k.trim);
 surface(k,2,32,(t,u)=>{const x=cx+(u-.5)*width*.78,y=bottom+(.005+t*.035)*s;return v(x,y,frontZ(x,y)+.015*s);},k.dark);
 // Rear diffuser with fins and twin exhausts instead of a plain bar.
 // Rear face: a dark band across the curved tail carries wraparound lamps, a light bar and the plate.
 const tailTop=shoulderAt(endR),tailZ=(x:number,y:number)=>{const u=(x-cx)/(halfAt(endR)*.99),t=(y-bottom)/(tailTop-bottom);return z+endR-.11*s*(1-u*u)+.05*s*t*t;};
 surface(k,4,40,(t,u)=>{const x=cx+(u*2-1)*halfAt(endR)*.88,y=tailTop-.19*s+t*.10*s;return v(x,y,tailZ(x,y)-.006*s);},k.dark,true);
 for(const side of [-1,1])surface(k,3,12,(t,u)=>{const x=cx+side*halfAt(endR)*(.52+.36*u),y=tailTop-.18*s+t*.08*s;return v(x,y,tailZ(x,y)-.012*s);},red,side<0);
 line(k,Array.from({length:9},(_,i)=>{const x=cx+(i/8-.5)*halfAt(endR)*1.04,y=tailTop-.14*s;return v(x,y,tailZ(x,y)-.014*s);}),.008*s,red);
 {const y=bottom+.30*s;k.box(v(cx,y,tailZ(cx,y)-.01*s),v(.52*s,.12*s,.012*s),new T.MeshStandardMaterial({name:'Vehicle plate',color:'#e9ebe4',roughness:.5}));}
 const tail=z+endR+.07*s;surface(k,4,24,(t,u)=>v(cx+(u-.5)*width*.72,bottom+.02*s+t*.12*s,tail-.06*s*(1-t)),k.dark);
 for(let i=-3;i<=3;i++)k.box(v(cx+i*.12*s,bottom+.05*s,tail-.02*s),v(.012*s,.06*s,.08*s),k.dark);
 for(const side of [-1,1]){const pipe=k.mesh(new T.CylinderGeometry(.045*s,.05*s,.10*s,20,1,true),k.trim);pipe.rotation.x=Math.PI/2;pipe.position.set(cx+side*.52*s,bottom+.09*s,tail-.03*s);}
 if(!suv){
  // Subtle integrated lip, rather than a tall period-style wing.
  k.box(v(cx,shoulderAt(rearLow)+.035*s,z+rearLow-.045*s),v(width*.67,.025*s,.11*s),roofMat);
 }
}

/** Rounded side-window apertures in solid body panels, rather than an all-glass wedge. */
function roundedWindow(points:[number,number][],radius:number){
 const path=new T.Shape();points.forEach(([x,y],i)=>{
  const [px,py]=points[(i+points.length-1)%points.length],[nx,ny]=points[(i+1)%points.length],a=Math.hypot(px-x,py-y),b=Math.hypot(nx-x,ny-y),r=Math.min(radius,a*.3,b*.3),start=new T.Vector2(x+(px-x)*r/a,y+(py-y)*r/a),end=new T.Vector2(x+(nx-x)*r/b,y+(ny-y)*r/b);
  if(!i)path.moveTo(start.x,start.y);else path.lineTo(start.x,start.y);path.quadraticCurveTo(x,y,end.x,end.y);
 });path.closePath();return path;
}
interface Cabin{cx:number;z:number;belt:number;roof:number;roofRear:number;roofFront:number;halfRoof:number;frontLow:number;rearLow:number;width:number;halfAt:(z:number)=>number;suv:boolean;saloon?:boolean}
function buildCabin(k:VehicleKit,c:Cabin){
 const {cx,z,belt,roof,roofRear,roofFront,halfRoof,frontLow,rearLow,width,halfAt,suv,saloon}=c,s=k.fit.scale;
 const outer=new T.Shape();outer.moveTo(frontLow,belt);
 if(suv){outer.quadraticCurveTo(.72*s,roof-.15*s,roofFront,roof-.015*s);outer.lineTo(roofRear,roof-.015*s);outer.quadraticCurveTo(rearLow,roof-.06*s,rearLow,belt);}
 else if(saloon){outer.quadraticCurveTo(.76*s,roof-.27*s,roofFront,roof-.075*s);outer.bezierCurveTo(.0,roof-.02*s,-.95*s,roof-.02*s,roofRear,roof-.075*s);outer.quadraticCurveTo(-1.72*s,roof-.2*s,rearLow,belt);}
 else{outer.quadraticCurveTo(.77*s,roof-.29*s,roofFront,roof-.085*s);outer.bezierCurveTo(.10*s,roof-.025*s,-.65*s,roof-.025*s,roofRear,roof-.085*s);outer.quadraticCurveTo(-1.27*s,roof-.25*s,rearLow,belt);}
 outer.lineTo(frontLow,belt);outer.closePath();
 const windows:T.Shape[]=k.fit.id==='pickup'?[roundedWindow([[.59*s,belt+.075*s],[-.56*s,belt+.075*s],[-.56*s,roof-.13*s],[.43*s,roof-.13*s]],.065*s)]:suv?[
  roundedWindow([[.59*s,belt+.075*s],[-.35*s,belt+.075*s],[-.35*s,roof-.13*s],[.43*s,roof-.13*s]],.065*s),
  roundedWindow([[-.43*s,belt+.075*s],[-1.23*s,belt+.075*s],[-1.23*s,roof-.13*s],[-.43*s,roof-.13*s]],.065*s),
  roundedWindow([[-1.31*s,belt+.075*s],[-2.21*s,belt+.075*s],[-2.17*s,roof-.13*s],[-1.31*s,roof-.13*s]],.065*s),
 ]:saloon?[
  roundedWindow([[.80*s,belt+.06*s],[-.30*s,belt+.06*s],[-.30*s,roof-.12*s],[.28*s,roof-.13*s],[.48*s,roof-.24*s]],.07*s),
  roundedWindow([[-.37*s,belt+.06*s],[-1.28*s,belt+.06*s],[-1.28*s,roof-.13*s],[-.37*s,roof-.12*s]],.07*s),
  roundedWindow([[-1.35*s,belt+.06*s],[-1.78*s,belt+.06*s],[-1.40*s,roof-.15*s],[-1.35*s,roof-.15*s]],.05*s),
 ]:[
  roundedWindow([[.82*s,belt+.06*s],[-.22*s,belt+.06*s],[-.22*s,roof-.13*s],[.26*s,roof-.145*s],[.47*s,roof-.26*s]],.07*s),
  roundedWindow([[-.29*s,belt+.06*s],[-1.22*s,belt+.06*s],[-1.10*s,belt+.26*s],[-.85*s,roof-.145*s],[-.29*s,roof-.13*s]],.075*s),
 ];
 for(const w of windows)outer.holes.push(new T.Path(w.getPoints(8)));
 const xAt=(zz:number,y:number,side:number)=>{
  const t=T.MathUtils.clamp((y-belt)/(roof-belt),0,1),long=T.MathUtils.clamp((zz-roofRear)/(roofFront-roofRear),0,1),top=halfRoof*(.95+.05*Math.sin(long*Math.PI));return cx+side*T.MathUtils.lerp(halfAt(zz)*.88,top,t);
 };
 const project=(geo:T.BufferGeometry,side:number,depth:number)=>{
  const P=geo.getAttribute('position');for(let i=0;i<P.count;i++){const zz=P.getX(i),y=P.getY(i),d=P.getZ(i);P.setXYZ(i,xAt(zz,y,side)+side*(depth+d),y,z+zz);}
  if(side>0){if(!geo.index)geo.setIndex(Array.from({length:P.count},(_,i)=>i));const I=geo.index!;for(let i=0;i<I.count;i+=3){const a=I.getX(i);I.setX(i,I.getX(i+2));I.setX(i+2,a);}}
  geo.computeVertexNormals();return geo;
 };
 k.glass.color.set('#435a69');k.glass.opacity=.43;
 for(const side of [-1,1]){
  const shell=project(new T.ExtrudeGeometry(outer,{depth:.018*s,bevelEnabled:true,bevelSize:.006*s,bevelThickness:.006*s,bevelSegments:2,curveSegments:32}),side,0);k.mesh(shell,k.paint);
  for(const w of windows){
   k.mesh(project(new T.ShapeGeometry(w,16),side,.010*s),k.glass);
   line(k,w.getSpacedPoints(64).map(p=>v(xAt(p.x,p.y,side)+side*.018*s,p.y,z+p.x)),.010*s,k.dark);
  }
  const mirror=v(cx+side*(width*.5+.04*s),belt+.075*s,z+(suv?.56:.72)*s),stem=v(xAt((suv?.56:.72)*s,belt+.05*s,side),belt+.05*s,mirror.z-.07*s);
  k.tube(stem,mirror,.018*s,k.dark);k.ellipsoid(mirror,v(.11*s,.055*s,.065*s),k.dark);
  if(suv){for(const zz of [.57,-.42])for(const y of [belt-.16*s,belt-.47*s])k.box(v(cx+side*width*.495,y,z+zz*s),v(.04*s,.045*s,.075*s),k.dark);}
 }
 // Front/rear glazing share the body apertures and the actual roof edge.
 const crown=(u:number)=>roof+.02*s-(suv?.025:.07)*s*(u*2-1)**2-(suv?.008:.035)*s;
 for(const [front,lowZ,highZ]of [[true,frontLow,roofFront],[false,rearLow,roofRear]]as const){
  surface(k,14,32,(t,u)=>{const across=u*2-1,low=v(cx+across*halfAt(lowZ)*.86,belt+.015*s,z+lowZ),high=v(cx+across*halfRoof*.95,crown(u)-.025*s,z+highZ);return low.lerp(high,t).add(v(0,.015*s*Math.sin(t*Math.PI),(front?1:-1)*(suv?.012:.055)*s*Math.sin(t*Math.PI)));},k.glass,!front);
  line(k,[v(cx-halfAt(lowZ)*.86,belt+.015*s,z+lowZ),v(cx,belt+.015*s,z+lowZ),v(cx+halfAt(lowZ)*.86,belt+.015*s,z+lowZ)],.016*s,k.dark);
 }
 if(suv)for(const side of [-1,1])k.tube(v(cx+side*halfRoof*.80,roof+.065*s,z+roofRear+.15*s),v(cx+side*halfRoof*.80,roof+.065*s,z+roofFront-.15*s),.02*s,k.dark);
 // Pair of low-profile windscreen wipers.
 for(const x of [-.26,.26])line(k,[v(cx+x*s,belt+.025*s,z+frontLow+.015*s),v(cx+(x+.15)*s,belt+.065*s,z+frontLow-.015*s)],.008*s,k.dark);
}
interface Rugged{cx:number;z:number;belt:number;bottom:number;endF:number;endR:number;width:number;wheelR:number;front:number;rear:number}
function buildRuggedDetails(k:VehicleKit,c:Rugged){
 const {cx,z,belt,bottom,endF,endR,width,wheelR,front,rear}=c,s=k.fit.scale,grilleY=belt-.24*s,face=z+endF+.045*s;
 const grilleMetal=new T.MeshStandardMaterial({name:'SUV grille insert',color:'#aeb7c2',roughness:.28,metalness:.9});
 k.box(v(cx,grilleY,face),v(1.04*s,.38*s,.065*s),k.dark);
 for(let i=-4;i<=4;i++)k.box(v(cx+i*.105*s,grilleY,face+.04*s),v(.018*s,.32*s,.018*s),grilleMetal);
 for(const side of [-1,1]){
  const x=cx+side*.72*s;
  k.box(v(x,grilleY,face-.015*s),v(.36*s,.35*s,.085*s),k.paint);
  const lamp=k.mesh(new T.CylinderGeometry(.13*s,.13*s,.065*s,40),k.dark);lamp.rotation.x=Math.PI/2;lamp.position.set(x,grilleY,face+.015*s);
  const halo=k.mesh(new T.TorusGeometry(.112*s,.012*s,10,48),k.light);halo.position.set(x,grilleY,face+.058*s);
  k.ellipsoid(v(x,grilleY,face+.056*s),v(.084*s,.077*s,.022*s),k.glass);
  k.box(v(x,grilleY,face+.072*s),v(.10*s,.037*s,.008*s),k.light);
  k.box(v(x,bottom+.12*s,face+.025*s),v(.48*s,.19*s,.07*s),k.dark);
  k.box(v(cx+side*(width*.50+.035*s),bottom-.025*s,z+(front+rear)/2),v(.19*s,.065*s,front-rear-.56*s),k.dark);
  for(let i=0;i<8;i++)k.box(v(cx+side*(width*.50+.04*s),bottom+.011*s,z-.95*s+i*.22*s),v(.13*s,.007*s,.025*s),k.trim);
 }
 for(const axle of [front,rear])for(const side of [-1,1]){
  const flare=k.mesh(new T.TorusGeometry(wheelR+.045*s,.052*s,10,40,Math.PI),k.paint);flare.rotation.y=Math.PI/2;flare.position.set(cx+side*width*.50,wheelR,z+axle);
 }
 k.box(v(cx,belt+.035*s,z+1.21*s),v(1.1*s,.055*s,.67*s),k.paint);
 k.box(v(cx,bottom+.08*s,face+.06*s),v(.64*s,.17*s,.07*s),k.dark);
 for(const x of [-.84,.84])k.tube(v(cx+x*s,bottom+.02*s,face+.15*s),v(cx+x*s,bottom+.32*s,face+.15*s),.028*s,k.dark);
 for(const y of [bottom+.02*s,bottom+.32*s])k.tube(v(cx-.84*s,y,face+.15*s),v(cx+.84*s,y,face+.15*s),.027*s,k.dark);
 // A spare mounted to the SUV's upright rear door, with a body-colour cover. The pickup's tailgate stays clear.
 if(k.fit.id!=='pickup'){const spareY=belt-.02*s,spareZ=z+endR-.15*s;
 const tyre=k.mesh(new T.TorusGeometry(.29*s,.072*s,14,48),k.rubber);tyre.position.set(cx,spareY,spareZ);
 const cover=k.mesh(new T.CylinderGeometry(.315*s,.315*s,.16*s,48),k.paint);cover.rotation.x=Math.PI/2;cover.position.set(cx,spareY,spareZ-.035*s);
 const rim=k.mesh(new T.TorusGeometry(.314*s,.012*s,8,48),k.dark);rim.position.set(cx,spareY,spareZ-.12*s);
 k.box(v(cx,spareY,spareZ-.13*s),v(.49*s,.075*s,.012*s),k.dark);}
 const red=k.tail;
 for(const side of [-1,1])k.box(v(cx+side*.72*s,bottom+.17*s,z+endR-.055*s),v(.31*s,.09*s,.04*s),red);
 k.box(v(cx,bottom+.035*s,z+endR-.06*s),v(width*.88,.14*s,.14*s),k.dark);
}
