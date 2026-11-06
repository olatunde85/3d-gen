/**
 * A sculpted riding horse fitted to its rider: lofted body, neck and head, three-segment legs that
 * trot with planted hooves, a swinging tail, and English or Western tack with stirrups and reins.
 * Every moving part is a rigid component, so the same horse exports to game engines.
 */
import * as T from 'three';
import {VehicleKit,v,type V,type Contacts} from './vehicle-kit';
import {TROT,trotBob,trotPitch} from './horse-gait';

/** A cross-section: centre, lateral and "up" axes, half-sizes, squareness and how much narrower its top is. */
interface Ring{c:V;u:V;w:V;a:number;b:number;n?:number;taper?:number}
const X=v(1,0,0),deg=Math.PI/180;
function ringPoint(r:Ring,phi:number,grow=0){
 const c=Math.cos(phi),s=Math.sin(phi),e=2/(r.n??2),sx=Math.sign(c)*Math.abs(c)**e,sy=Math.sign(s)*Math.abs(s)**e,taper=1-(r.taper??0)*(sy+1)/2;
 return r.c.clone().addScaledVector(r.u,sx*(r.a*taper+grow)).addScaledVector(r.w,sy*(r.b+grow));
}
/** A smooth skin through rings, with no seam so normals stay soft. */
function loft(rings:Ring[],M=40){
 const p:number[]=[],idx:number[]=[];
 for(const r of rings)for(let j=0;j<M;j++)p.push(...ringPoint(r,j/M*Math.PI*2).toArray());
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<M;j++){const a=i*M+j,b=i*M+(j+1)%M;idx.push(a,b,a+M,b,b+M,a+M);}
 // Close both ends with flat caps (their own vertices, so the cap doesn't soften the rim), wound to face outward.
 for(const [end,next] of [[0,1],[rings.length-1,rings.length-2]]){
  const base=p.length/3,centre=rings[end].c,out=centre.clone().sub(rings[next].c);p.push(...centre.toArray());
  for(let j=0;j<M;j++)p.push(...ringPoint(rings[end],j/M*Math.PI*2).toArray());
  const at=(i:number)=>v(p[3*i],p[3*i+1],p[3*i+2]),flip=at(base+1).sub(centre).cross(at(base+2).sub(centre)).dot(out)<0;
  for(let j=0;j<M;j++){const a=base+1+j,b=base+1+(j+1)%M;idx.push(...(flip?[base,b,a]:[base,a,b]));}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
/** A grid laid over a surface: rows run along `s`, columns along `t`. */
function patch(rows:number,cols:number,at:(s:number,t:number)=>V){
 const p:number[]=[],idx:number[]=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++)p.push(...at(i/rows,j/cols).toArray());
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j;idx.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();return geo;
}
/** Smooth interpolation through keyed rows [t, ...values]. */
function profile(keys:number[][]){
 const n=keys.length,slope=(i:number,d:number)=>{const a=keys[Math.max(0,i-1)],b=keys[Math.min(n-1,i+1)];return (b[d]-a[d])/(b[0]-a[0]);};
 return (x:number)=>{
  let i=0;while(i<n-2&&x>keys[i+1][0])i++;
  const a=keys[i],b=keys[i+1],h=b[0]-a[0],u=Math.min(1,Math.max(0,(x-a[0])/h)),u2=u*u,u3=u2*u;
  return a.slice(1).map((_,j)=>{const d=j+1;return (2*u3-3*u2+1)*a[d]+(u3-2*u2+u)*h*slope(i,d)+(-2*u3+3*u2)*b[d]+(u3-u2)*h*slope(i+1,d);});
 };
}
const smooth=(x:number)=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
const frac=(x:number)=>x-Math.floor(x);
/** Orientation for a segment authored hanging down -Y from its top, front +Z, kept upright about X. */
function hang(top:V,bottom:V){
 const y=top.clone().sub(bottom).normalize(),x=X.clone().addScaledVector(y,-y.x).normalize(),z=new T.Vector3().crossVectors(x,y);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
/** A limb segment hanging from the origin: keys are [t, half-width, half-depth, forward offset]. */
function limb(length:number,keys:number[][],s:number,n=2.2){
 const shape=profile(keys),rings:Ring[]=[];
 for(let i=0;i<=16;i++){const t=i/16,[a,b,dz]=shape(t);rings.push({c:v(0,-t*length,dz*s),u:X,w:v(0,0,1),a:Math.max(.004,a)*s,b:Math.max(.004,b)*s,n});}
 return loft(rings,24);
}

export function buildHorse(k:VehicleKit){
 const s=k.fit.scale,L=TROT.duration;
 // The seat is measured with the trot's bob removed, so it sits under the rider when they are down in the saddle.
 const S=Math.min(...k.fit.samples.map((c,i)=>c.hip.y-trotBob(i*L/k.fit.samples.length)*s))-.08*s,z0=k.fit.average('hip').z;
 const at=(y:number,z:number)=>v(0,S+y*s,z0+z*s);

 // ---- Body: keyed [z, top, bottom, width share] from tail to chest (rider-height units about the seat).
 const body=profile([[-.88,-.17,-.30,.08],[-.83,-.05,-.46,.46],[-.72,.01,-.55,.80],[-.56,.04,-.60,.93],[-.38,.0,-.63,.96],[-.18,-.065,-.66,.99],[.02,-.07,-.67,1],[.20,-.025,-.65,.97],[.32,.08,-.60,.88],[.44,.04,-.54,.80],[.56,-.06,-.47,.64],[.64,-.17,-.41,.38],[.69,-.27,-.36,.06]]);
 const ringAt=(z:number,W:number,grow=0):Ring=>{const [top,bottom,share]=body(z);return {c:at((top+bottom)/2,z),u:X,w:v(0,1,0),a:W*share+grow,b:(top-bottom)/2*s+grow,n:2.3,taper:.24};};
 // Fit the barrel inside the rider's legs at every point of the trot instead of spreading the rider.
 let W=.31*s;
 for(const [i,c] of k.fit.samples.entries())for(const [knee,foot] of [[c.kneeLeft,c.footLeft],[c.kneeRight,c.footRight]]){
  const bob=trotBob(i*L/k.fit.samples.length)*s;
  for(let j=0;j<=12;j++){
   const f=j/12,p=j<6?c.hip.clone().lerp(knee,.35+f*1.3):knee.clone().lerp(foot,(j-6)/6),r=(j<6?.075:j<8?.058:.048)*s+.012*s;
   const ring=ringAt((p.z-z0)/s,1),u=(p.y-bob-ring.c.y)/ring.b;if(Math.abs(u)>=1)continue;
   const sin=Math.abs(u)**(2.3/2),width=Math.sqrt(1-sin*sin)**(2/2.3)*ring.a*(1-.24*(u+1)/2);
   W=Math.min(W,(Math.abs(p.x)-r)/width);
  }
 }
 W=Math.min(.31*s,Math.max(.22*s,W));

 const coat=k.paint;coat.metalness=0;coat.roughness=k.style.finish==='gloss'?.42:k.style.finish==='matte'?.9:.68;
 const hair=new T.MeshStandardMaterial({name:'Horse mane and tail',color:k.style.accentColor,roughness:.8,side:T.DoubleSide});
 const points=new T.MeshStandardMaterial({name:'Horse muzzle',color:new T.Color(k.style.color).multiplyScalar(.45),roughness:.75});
 const eye=new T.MeshStandardMaterial({name:'Horse eyes',color:'#120d0a',roughness:.08});
 const horn=new T.MeshStandardMaterial({name:'Horse hooves',color:'#2a2522',roughness:.55});
 const leather=k.seat,pad=new T.MeshStandardMaterial({name:'Saddle pad',color:k.style.variant==='sport'?'#ece8de':'#7d2f27',roughness:.95,side:T.DoubleSide});
 leather.side=T.DoubleSide;

 // Rigid parts: the body (with neck, saddle and girth) bobs and pitches; the head nods on it.
 const pivot=at(0,0),bodyPart=k.component('Body',pivot),local=(p:V)=>p.clone().sub(pivot);
 const add=(geo:T.BufferGeometry,mat:T.Material)=>{geo.translate(-pivot.x,-pivot.y,-pivot.z);return k.mesh(geo,mat,bodyPart);};
 const rings:Ring[]=[];for(let i=0;i<=72;i++)rings.push(ringAt(-.88+1.57*i/72,W));
 add(loft(rings,44),coat);
 // Hindquarter and forearm muscle, and the chest between the front legs.
 for(const side of [-1,1]){
  k.ellipsoid(local(at(-.32,-.60).setX(side*.62*W)),v(.27*W,.24*s,.20*s),coat,bodyPart);
  k.ellipsoid(local(at(-.40,.43).setX(side*.115*s)),v(.07*s,.15*s,.11*s),coat,bodyPart);
 }

 // ---- Neck: lofted along a crest curve, narrow on top, rising from the shoulders to the poll.
 const poll=at(.42,.88),neckLine=new T.CatmullRomCurve3([at(-.20,.45),at(.0,.60),at(.21,.74),poll],false,'catmullrom',.5);
 const neckShape=profile([[0,.21,.26],[.25,.17,.235],[.55,.13,.195],[.85,.095,.145],[1,.08,.12]]),neck:Ring[]=[];
 for(let i=0;i<=40;i++){const t=i/40,tan=neckLine.getTangent(t),[a,b]=neckShape(t);neck.push({c:neckLine.getPoint(t),u:X,w:v(0,tan.z,-tan.y).normalize(),a:a*s,b:b*s,n:2.1,taper:.38});}
 add(loft(neck,36),coat);
 // Mane: a ribbon lying on the right of the crest, longer mid-neck, ragged at the ends.
 add(patch(48,4,(i,j)=>{const t=.3+.68*i,r=neck[Math.round(t*40)],len=(.10+.08*Math.sin(Math.PI*i)**.6+.02*Math.sin(t*71))*Math.min(1,i*6);
  return ringPoint(r,Math.PI/2+.02+j*len*s/r.b*1.1,(.006+.012*Math.sin(Math.PI*Math.min(1,j*1.4))-.003*j)*s);}),hair);
 // A saddle-shaped back: pad, tree with pommel and cantle, flaps under the knees, and the girth.
 const surface=(z:number,phi:number,grow:number)=>ringPoint(ringAt(z,W),phi,grow);
 add(patch(18,24,(i,j)=>{const z=-.31+.56*i,edge=Math.PI*(.13+.05*Math.abs(2*i-1)**4);return surface(z,edge+(Math.PI-2*edge)*j,.012*s);}),pad);
 const western=k.style.variant==='classic';
 add(patch(20,28,(i,j)=>{
  const z=-.24+.44*i,reach=western?.17:.2+.06*smooth((z+.05)/.2),edge=Math.PI*(reach+.12*smooth((-.1-z)/.14)+.18*smooth((z-.14)/.06)),phi=edge+(Math.PI-2*edge)*j;
  const rise=(.045+.09*smooth((-.12-z)/.12)+.06*smooth((z-.08)/.12))*Math.sin(phi)**8;
  return surface(z,phi,.024*s).add(v(0,rise*s,0));
 }),leather);
 if(western){const base=surface(.17,Math.PI/2,.12*s);k.tube(local(base),local(base.clone().add(v(0,.07*s,.01*s))),.022*s,leather,bodyPart);k.ellipsoid(local(base.clone().add(v(0,.075*s,.012*s))),v(.05*s,.018*s,.04*s),leather,bodyPart);}
 // Girth: under the belly from flap to flap.
 add(patch(2,30,(i,j)=>surface(.08+.06*i,Math.PI*(.18-1.36*j),.016*s)),leather);

 // ---- Head: lofted down from the poll with deep jowls, a flat forehead and a soft muzzle.
 const down=v(0,-Math.sin(60*deg),Math.cos(60*deg)),face=v(0,Math.cos(60*deg),Math.sin(60*deg)),headLength=.56*s;
 const headShape=profile([[0,.07,.075,-.02],[.06,.10,.13,-.035],[.2,.112,.165,-.06],[.36,.104,.135,-.03],[.56,.08,.104,0],[.76,.068,.09,0],[.9,.072,.096,-.006],[.97,.062,.082,-.01],[1,.02,.03,-.01]]);
 const headRing=(t:number,grow=0):Ring=>{const [a,b,off]=headShape(t);return {c:poll.clone().addScaledVector(down,t*headLength).addScaledVector(face,off*s),u:X,w:face,a:a*s+grow,b:b*s+grow,n:2.2,taper:-.1};};
 const headPart=k.component('Head',poll),inHead=(p:V)=>p.clone().sub(poll),headMesh=(geo:T.BufferGeometry,mat:T.Material)=>{geo.translate(-poll.x,-poll.y,-poll.z);return k.mesh(geo,mat,headPart);};
 headMesh(loft(Array.from({length:41},(_,i)=>headRing(i/40)),36),coat);
 headMesh(loft(Array.from({length:13},(_,i)=>headRing(.8+.2*i/12,.003*s)),36),points);
 const onHead=(t:number,side:number,lift:number,grow=0)=>{const r=headRing(t,grow);return r.c.clone().addScaledVector(X,side*r.a*.94).addScaledVector(face,lift*s);};
 for(const side of [-1,1]){
  k.ellipsoid(inHead(onHead(.33,side,.055)),v(.022*s,.03*s,.03*s),eye,headPart);
  const nostril=k.ellipsoid(inHead(onHead(.93,side*.62,.045)),v(.014*s,.028*s,.012*s),k.dark,headPart);nostril.quaternion.setFromUnitVectors(v(0,1,0),down);
  const ear=k.mesh(new T.LatheGeometry(Array.from({length:10},(_,i)=>{const h=i/9;return new T.Vector2(i===0||i===9?0:.042*Math.sin(Math.PI*(.15+.85*h))**.9*(1-.35*h)*s,Math.max(.01,h)*.16*s);}),14),coat,headPart);
  ear.scale.set(1,1,.55);ear.position.copy(inHead(poll.clone().addScaledVector(face,.04*s).add(v(side*.055*s,0,0))));
  ear.quaternion.setFromUnitVectors(v(0,1,0),down.clone().negate().multiplyScalar(.75).addScaledVector(face,.35).add(v(side*.22,0,0)).normalize());
  const inner=k.mesh(new T.ConeGeometry(.024*s,.11*s,10),points,headPart);inner.position.copy(ear.position);inner.quaternion.copy(ear.quaternion);inner.translateY(.06*s);inner.translateZ(.012*s);
 }
 // Forelock between the ears.
 headMesh(patch(6,2,(i,j)=>poll.clone().addScaledVector(face,.075*s).add(v((i-.5)*.07*s,0,0)).addScaledVector(down,(.02+.13*j*(1-.4*Math.abs(i-.5)))*s).addScaledVector(face,.012*s*j)),hair);
 // Bridle: crownpiece, browband, cheekpieces, noseband and throatlatch, with a snaffle bit.
 const strapRing=(t:number,from=0,to=1,grow=.008*s)=>{const closed=from===0&&to===1,n=closed?24:25;return new T.CatmullRomCurve3(Array.from({length:n},(_,i)=>ringPoint(headRing(t),Math.PI*2*(from+(to-from)*i/24),grow)),closed);};
 const strap=(curve:T.Curve<V>,r=.007*s)=>{const geo=new T.TubeGeometry(curve,40,r,6,false);geo.translate(-poll.x,-poll.y,-poll.z);k.mesh(geo,leather,headPart);};
 for(const t of [.05,.7])strap(strapRing(t,0,1));strap(strapRing(.12,.1,.4),.006*s);
 for(const side of [-1,1]){
  strap(new T.CatmullRomCurve3([.05,.3,.55,.86].map(t=>onHead(t,side,-.02,.008*s))));
  strap(new T.CatmullRomCurve3([onHead(.06,side,-.02,.008*s),onHead(.12,side*.6,-.16,.01*s),poll.clone().addScaledVector(down,.16*s).addScaledVector(face,-.17*s)]));
 }
 const bitLocal=(side:number)=>onHead(.88,side,-.035,.01*s);
 for(const side of [-1,1]){const ring=k.mesh(new T.TorusGeometry(.028*s,.005*s,8,20),k.dark,headPart);ring.position.copy(inHead(bitLocal(side)));ring.rotation.y=Math.PI/2;}
 k.tube(inHead(bitLocal(-1)),inHead(bitLocal(1)),.006*s,k.dark,headPart);

 // ---- Tail: a dock and a hanging switch of hair, each joint lagging the last as the horse trots.
 const dock=k.component('Tail',at(-.10,-.85)),tail:T.Object3D[]=[dock];
 k.mesh(limb(.16*s,[[0,.05,.05,0],[1,.04,.04,0]],s),hair,dock);
 const switchShape=[[.046,.062],[.062,.074],[.074,.074],[.074,.064],[.064,.044],[.044,.012]];
 for(const [i,[r0,r1]] of switchShape.entries()){
  const part=k.component(`Tail_hair_${i+1}`,v(0,-(i?.13:.15)*s,0),tail[i]);
  k.mesh(limb(.16*s,[[0,r0,r0*.7,0],[.5,(r0+r1)/2*1.04,(r0+r1)/2*.72,-.004],[1,r1,r1*.7,-.006]],s,2),hair,part);tail.push(part);
 }

 // ---- Legs: forearm/gaskin, cannon, pastern and hoof, solved each frame from the hoof up.
 const hoofGeo=()=>{const h=.07*s,g=new T.CylinderGeometry(.044*s,.058*s,h,20,2);const P=g.getAttribute('position');
  for(let i=0;i<P.count;i++){const y=P.getY(i)+h/2,f=y/h;P.setXYZ(i,P.getX(i),y,P.getZ(i)*(1.12-.12*f)-(.065+.02*f)*s);}g.computeVertexNormals();return g;};
 const coronet=v(0,.068*s,-.085*s),pastern=.1*s,sweep=TROT.speed*TROT.duty*TROT.duration*s;
 const legs=[[true,1,.5],[true,-1,0],[false,1,0],[false,-1,.5]]as const;
 const solved=legs.map(([front,side,phase])=>{
  const name=`${front?'Fore':'Hind'}_${side===1?'left':'right'}`,origin=at(front?-.48:-.44,front?.42:-.48).setX(side*(front?.12:.16)*s);
  const toe=v(side*(front?.11:.12)*s,0,z0+(front?.47:-.56)*s);
  const standFetlock=toe.clone().add(coronet).add(v(0,Math.sin(58*deg),-Math.cos(58*deg)).multiplyScalar(pastern)),reach=standFetlock.distanceTo(origin);
  const total=reach*(front?1.004:1.08),l1=total*(front?.56:.47),l2=total-l1;
  const upper=k.component(`${name}_upper`),lower=k.component(`${name}_lower`),pasternPart=k.component(`${name}_pastern`),hoof=k.component(`${name}_hoof`);
  k.mesh(limb(l1+.04*s,front?[[0,.095,.11,0],[.25,.08,.09,.012],[.7,.05,.055,.004],[1,.045,.05,0]]:[[0,.11,.15,0],[.3,.08,.105,-.02],[.75,.05,.065,-.02],[1,.045,.055,-.03]],s),coat,upper);
  k.mesh(limb(l2,front?[[0,.052,.054,.004],[.16,.037,.042,-.004],[.5,.03,.037,-.006],[.92,.033,.042,-.004],[1,.04,.047,-.006]]:[[0,.052,.065,-.02],[.14,.04,.05,-.01],[.5,.032,.04,-.006],[.92,.035,.045,-.004],[1,.042,.048,-.006]],s),coat,lower);
  if(!front)k.ellipsoid(v(0,-.01*s,-.045*s),v(.03*s,.045*s,.032*s),coat,lower);
  k.mesh(limb(pastern,[[0,.042,.05,-.01],[.4,.032,.035,0],[1,.042,.044,0]],s),points,pasternPart);
  k.ellipsoid(v(0,0,-.01*s),v(.04*s,.04*s,.046*s),points,pasternPart);
  k.mesh(hoofGeo(),horn,hoof);
  return {front,side,phase,origin,toe,l1,l2,reach,upper,lower,pasternPart,hoof};
 });
 // Where the toe is, how steep the pastern is and how far the hoof has rolled, at stride phase q (0 = landing).
 const coronetAt=(toe:V,roll:number)=>toe.clone().add(coronet.clone().applyAxisAngle(X,roll));
 const fetlockAt=(toe:V,roll:number,angle:number)=>coronetAt(toe,roll).add(v(0,Math.sin(angle),-Math.cos(angle)).multiplyScalar(pastern));
 /** The pastern angle that keeps the leg at its standing reach: the fetlock sinks as weight comes on. */
 const loaded=(origin:V,toe:V,roll:number,reach:number)=>{let lo=28*deg,hi=82*deg;for(let i=0;i<22;i++){const mid=(lo+hi)/2;if(fetlockAt(toe,roll,mid).distanceTo(origin)>reach)lo=mid;else hi=mid;}return (lo+hi)/2;};

 const bodyMatrix=new T.Matrix4(),headMatrix=new T.Matrix4(),q=new T.Quaternion(),tmp=new T.Matrix4();
 k.updates.push((_:Contacts,time:number)=>{
  const w=1-(k.group.userData.parkedWeight??0),phase=frac(time/L);
  // Body: bob and pitch about the seat.
  bodyMatrix.makeTranslation(0,trotBob(time)*s*w,0).multiply(tmp.makeTranslation(pivot.x,pivot.y,pivot.z)).multiply(new T.Matrix4().makeRotationX(-trotPitch(time)*w)).multiply(tmp.clone().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
  const place=(part:T.Object3D,m:T.Matrix4,rest:V)=>{part.position.copy(rest).applyMatrix4(m);part.quaternion.setFromRotationMatrix(m);};
  place(bodyPart,bodyMatrix,pivot);
  // Head: steady, with a small nod in time with the stride.
  headMatrix.copy(bodyMatrix).multiply(tmp.makeTranslation(poll.x,poll.y,poll.z)).multiply(new T.Matrix4().makeRotationX(.035*w*Math.cos(4*Math.PI*(phase-TROT.duty/2)))).multiply(new T.Matrix4().makeTranslation(-poll.x,-poll.y,-poll.z));
  place(headPart,headMatrix,poll);
  // Tail: the dock lifts a little at the trot; the hair swings side to side, each joint behind the last.
  place(dock,bodyMatrix,dock.userData.rest??=dock.position.clone());
  dock.quaternion.multiply(q.setFromEuler(new T.Euler(.58+.14*w+.05*w*Math.sin(4*Math.PI*phase),0,.06*w*Math.sin(2*Math.PI*phase))));
  tail.slice(1).forEach((part,i)=>part.rotation.set(-.2+.05*i*(1-w*.3)+.05*w*Math.sin(4*Math.PI*phase-.9*(i+1)),0,.09*w*Math.sin(2*Math.PI*phase-.7*(i+1))));
  for(const leg of solved){
   // Stance: the toe is planted and slides back at the trot's speed; swing: it folds up and reaches forward.
   const stride=frac(phase-leg.phase),D=TROT.duty;
   const toeAt=(x:number)=>{if(x<D){const r=x/D;return {z:sweep*(.5-r),y:0,roll:18*deg*Math.max(0,(r-.8)/.2)**2,swing:0};}
    const u=(x-D)/(1-D),lift=(leg.front?.17:.12)*s,fold=(leg.front?.07:.03)*s;
    return {z:-sweep/2+sweep*smooth(u)-fold*Math.sin(Math.PI*u)*(1-u),y:lift*Math.sin(Math.PI*Math.min(1,u*1.1))**1.3,roll:18*deg*(1-u)**2,swing:u};};
   const g=toeAt(stride),toe=leg.toe.clone().add(v(0,g.y*w,g.z*w)),roll=g.roll*w;
   const origin=leg.origin.clone().add(v(0,0,(leg.front?.32:.22)*g.z*w)).applyMatrix4(bodyMatrix);
   let angle:number;
   if(g.swing===0||w===0)angle=loaded(origin,toe,roll,leg.reach);
   else{
    const edge=(x:number)=>{const e=toeAt(x),o=leg.origin.clone().add(v(0,0,(leg.front?.32:.22)*e.z)).applyMatrix4(bodyMatrix);return loaded(o,leg.toe.clone().add(v(0,e.y,e.z)),e.roll,leg.reach);};
    const curl=(leg.front?95:60)*deg*Math.sin(Math.PI*Math.min(1,g.swing/.85))**1.4;
    angle=(1-w)*58*deg+w*(edge(D-1e-4)*(1-smooth(g.swing))+edge(0)*smooth(g.swing)+curl);
   }
   const curlRoll=g.swing?w*((leg.front?80:50)*deg*Math.sin(Math.PI*Math.min(1,g.swing/.85))**1.4):0,totalRoll=roll+curlRoll;
   const cor=coronetAt(toe,totalRoll),fet=fetlockAt(toe,totalRoll,angle);
   // Two-bone solve to the fetlock: the knee bends forward, the hock backward.
   const d=fet.clone().sub(origin),len=Math.min(d.length(),(leg.l1+leg.l2)*.9995),dir=d.normalize(),along=(leg.l1*leg.l1-leg.l2*leg.l2+len*len)/(2*len),high=Math.sqrt(Math.max(0,leg.l1*leg.l1-along*along));
   const bend=v(0,0,leg.front?1:-1).addScaledVector(dir,-(leg.front?dir.z:-dir.z)).normalize(),joint=origin.clone().addScaledVector(dir,along).addScaledVector(bend,high);
   const fetlock=origin.clone().addScaledVector(dir,len);
   leg.upper.position.copy(origin);leg.upper.quaternion.copy(hang(origin,joint));
   leg.lower.position.copy(joint);leg.lower.quaternion.copy(hang(joint,fetlock));
   leg.pasternPart.position.copy(fetlock);leg.pasternPart.quaternion.copy(hang(fetlock,cor));
   leg.hoof.position.copy(toe);leg.hoof.quaternion.setFromAxisAngle(X,totalRoll);
  }
 });

 // ---- Stirrups hang from the saddle bars to the rider's feet; reins run from the bit to the hands.
 for(const [side,key]of [[1,'footLeft'],[-1,'footRight']]as const){
  const stirrup=k.component(`Stirrup_${key}`),strap=k.component(`Stirrup_leather_${key}`),bar=surface(.1,side>0?.24*Math.PI:.76*Math.PI,.03*s);
  const iron=k.mesh(new T.TorusGeometry(.055*s,.007*s,8,24,Math.PI*1.25),k.trim,stirrup);iron.rotation.z=-.125*Math.PI;
  k.box(v(0,-.055*s,0),v(.11*s,.012*s,.05*s),k.trim,stirrup);
  k.mesh(new T.BoxGeometry(.03*s,1,.005*s),leather,strap);
  k.updates.push(c=>{
   const foot=c[key].clone().add(v(0,-.02*s,.04*s)),top=bar.clone().applyMatrix4(bodyMatrix);
   stirrup.position.copy(foot).add(v(0,.055*s,0));stirrup.quaternion.copy(hang(top,foot));
   strap.position.copy(top).add(stirrup.position).multiplyScalar(.5);strap.quaternion.copy(hang(top,stirrup.position));strap.scale.set(1,top.distanceTo(stirrup.position),1);
  });
 }
 for(const [side,key]of [[1,'left'],[-1,'right']]as const)for(let i=0;i<8;i++){
  const rein=k.component(`Rein_${key}_${i}`);k.mesh(new T.BoxGeometry(.018*s,1,.004*s),leather,rein);
  k.updates.push(c=>{
   const bit=bitLocal(side).applyMatrix4(headMatrix),hand=c[key],mid=bit.clone().lerp(hand,.5).add(v(0,-.05*s,0));
   const point=(f:number)=>bit.clone().multiplyScalar((1-f)**2).addScaledVector(mid,2*f*(1-f)).addScaledVector(hand,f*f),a=point(i/8),b=point((i+1)/8);
   rein.position.copy(a).add(b).multiplyScalar(.5);rein.quaternion.copy(hang(a,b));rein.scale.set(1,a.distanceTo(b),1);
  });
 }
}
