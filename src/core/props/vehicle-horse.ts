/** Anatomical riding horse with articulated diagonal trot, fitted tack, stirrups and reins. */
import * as T from 'three';
import {VehicleKit,v,type V} from './vehicle-kit';
function skin(k:VehicleKit,stations:{p:V;x:number;y:number}[],mat:T.Material){
 const M=32,p:number[]=[],uv:number[]=[],idx:number[]=[],count=64;
 const centres=new T.CatmullRomCurve3(stations.map(r=>r.p),false,'catmullrom',.4),radii=new T.CatmullRomCurve3(stations.map(r=>v(r.x,r.y,0)),false,'catmullrom',.4);
 const smooth=Array.from({length:count+1},(_,i)=>{const q=radii.getPoint(i/count);return {p:centres.getPoint(i/count),x:Math.max(.001,q.x),y:Math.max(.001,q.y)};});
 smooth.forEach((r,i)=>{for(let j=0;j<=M;j++){const a=j/M*Math.PI*2;p.push(r.p.x+Math.cos(a)*r.x,r.p.y+Math.sin(a)*r.y,r.p.z);uv.push(j/M,i/count);}});
 for(let i=0;i<smooth.length-1;i++)for(let j=0;j<M;j++){const a=i*(M+1)+j;idx.push(a,a+1,a+M+1,a+1,a+M+2,a+M+1);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return k.mesh(geo,mat);
}
export function buildHorse(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.08*s,bodyY=seatY-.30*s,z=H.z;
 // Fit the barrel inside the rider's thighs rather than scaling the rider or spreading their legs.
 const spread=Math.min(...k.fit.samples.map(c=>Math.min(Math.abs(c.kneeLeft.x),Math.abs(c.kneeRight.x))))*.92;
 const width=Math.min(.30*s,Math.max(.23*s,spread));
 const coat=k.paint;coat.metalness=0;coat.roughness=k.style.finish==='gloss'?.5:k.style.finish==='matte'?.95:.85;
 const mane=new T.MeshStandardMaterial({name:'Horse mane and tail',color:k.style.accentColor,roughness:.95});
 const muzzle=new T.MeshStandardMaterial({name:'Horse muzzle',color:new T.Color(k.style.color).multiplyScalar(.6),roughness:.9});
 const eye=new T.MeshStandardMaterial({name:'Horse eyes',color:'#171410',roughness:.17});
 skin(k,[[-.86,.008,.01],[-.72,.16,.22],[-.52,.92,.93],[-.2,1,1],[.15,.93,1],[.42,.82,.9],[.61,.38,.55],[.69,.008,.01]].map(([zz,x,y])=>({p:v(0,bodyY+(zz<-.5?.01:0)*s,z+zz*s),x:width*x,y:.34*s*y})),coat);
 k.ellipsoid(v(0,bodyY+.13*s,z+.40*s),v(.20*s,.28*s,.27*s),coat);
 const neckA=v(0,bodyY+.22*s,z+.48*s),neckB=v(0,bodyY+.66*s,z+.79*s),neckC=v(0,bodyY+.83*s,z+.91*s);
 const neckCurve=new T.CatmullRomCurve3([v(0,bodyY+.08*s,z+.40*s),neckA,neckB,neckC],false,'catmullrom',.35),N=40,M=28,points:number[]=[],indices:number[]=[];
 for(let i=0;i<=N;i++){const t=i/N,p=neckCurve.getPoint(t),tangent=neckCurve.getTangent(t),normal=v(0,-tangent.z,tangent.y).normalize(),width=(.20-.085*t)*s,depth=(.26-.12*t)*s;for(let j=0;j<=M;j++){const a=j/M*Math.PI*2,q=p.clone().add(v(Math.cos(a)*width,0,0)).addScaledVector(normal,Math.sin(a)*depth);points.push(...q.toArray());}}
 for(let i=0;i<N;i++)for(let j=0;j<M;j++){const a=i*(M+1)+j;indices.push(a,a+M+1,a+1,a+1,a+M+1,a+M+2);}
 const neckGeo=new T.BufferGeometry();neckGeo.setAttribute('position',new T.Float32BufferAttribute(points,3));neckGeo.setIndex(indices);neckGeo.computeVertexNormals();k.mesh(neckGeo,coat);
 const head=k.ellipsoid(neckC,v(.14*s,.22*s,.18*s),coat);head.rotation.x=-.25;
 const nose=neckC.clone().add(v(0,-.16*s,.25*s)),bridge=k.ellipsoid(neckC.clone().lerp(nose,.5),v(.12*s,.13*s,.24*s),coat);bridge.rotation.x=.35;
 k.ellipsoid(nose,v(.135*s,.10*s,.16*s),muzzle);
 for(const side of [-1,1]){
  k.ellipsoid(neckC.clone().add(v(side*.13*s,.04*s,.08*s)),v(.029*s,.035*s,.018*s),eye);
  const ear=k.mesh(new T.ConeGeometry(.065*s,.24*s,16,3),coat);ear.position.copy(neckC).add(v(side*.095*s,.24*s,-.02*s));ear.rotation.z=-side*.18;ear.rotation.x=-.2;
  const inner=k.mesh(new T.ConeGeometry(.033*s,.15*s,12),muzzle);inner.position.copy(ear.position).add(v(0,0,.025*s));inner.rotation.copy(ear.rotation);
  k.ellipsoid(nose.clone().add(v(side*.10*s,.015*s,.09*s)),v(.028*s,.018*s,.009*s),k.dark);
 }
 // A continuous mane along the crest and a tapered tail keep the silhouette recognisable.
 for(let i=0;i<14;i++){const t=i/13,p=neckA.clone().lerp(neckC,t).add(v(0,.06*s,-.09*s));k.ellipsoid(p,v(.035*s,.09*s,.055*s),mane);}
 const tail=k.component('Tail',v(0,bodyY+.12*s,z-.72*s));
 const tailMesh=k.ellipsoid(v(0,-.22*s,-.10*s),v(.065*s,.32*s,.075*s),mane,tail);tailMesh.rotation.x=.18;
 k.updates.push((_,time)=>{tail.rotation.x=.12+.09*Math.sin(time/k.fit.clip.duration*Math.PI*2);tail.rotation.z=.1*Math.sin(time/k.fit.clip.duration*Math.PI*2);});
 // Four fixed-length two-segment chains. Diagonal pairs rise together in a trot.
 for(const [front,side]of [[true,1],[true,-1],[false,1],[false,-1]]as const){
  const name=`${front?'Fore':'Hind'}_${side===1?'left':'right'}`,top=v(side*width*.67,bodyY-.10*s,z+(front?.45:-.50)*s),L=(top.y-.055*s)*1.06,L1=L*(front?.49:.51),L2=L-L1;
  const upper=k.component(name+'_upper'),lower=k.component(name+'_lower'),hoof=k.component(name+'_hoof');
  k.tube(v(),v(0,L1,0),front?.055*s:.065*s,coat,upper);k.ellipsoid(v(0,L1*.3,0),v((front?.075:.11)*s,L1*.48,(front?.09:.14)*s),coat,upper);
  k.tube(v(),v(0,L2,0),.029*s,coat,lower);k.ellipsoid(v(),v(.049*s,.05*s,.047*s),coat,lower);
  k.box(v(0,-.008*s,.025*s),v(.095*s,.075*s,.13*s),k.dark,hoof);
  k.updates.push((_,time)=>{
   const moving=1-(k.group.userData.parkedWeight??0),phase=time/k.fit.clip.duration*Math.PI*2+(front===(side===1)?0:Math.PI),swing=moving*Math.sin(phase),origin=top.clone().add(v(0,moving*.012*s*Math.cos(phase*2),0));
   const foot=v(top.x,.052*s+Math.max(0,swing)*.15*s,top.z-moving*Math.cos(phase)*.18*s),d=foot.clone().sub(origin),len=Math.min(d.length(),L*.999),dir=d.clone().normalize(),along=(L1*L1-L2*L2+len*len)/(2*len),high=Math.sqrt(Math.max(0,L1*L1-along*along));
   const bend=v(0,-dir.z,dir.y).multiplyScalar(front?-1:1).normalize(),joint=origin.clone().addScaledVector(dir,along).addScaledVector(bend,high);
   upper.position.copy(origin);upper.quaternion.setFromUnitVectors(v(0,1,0),joint.clone().sub(origin).normalize());
   lower.position.copy(joint);lower.quaternion.setFromUnitVectors(v(0,1,0),foot.clone().sub(joint).normalize());hoof.position.copy(foot);hoof.rotation.x=swing>0?-.15*swing:0;
  });
 }
 // Saddle follows the horse, while the rising-trot rider posts above it.
 k.box(v(0,seatY-.025*s,z-.025*s),v(width*1.65,.045*s,.48*s),k.trim);
 k.ellipsoid(v(0,seatY+.005*s,z-.015*s),v(width*.73,.045*s,k.style.variant==='sport'?.18*s:.24*s),k.seat);
 for(const zz of [-.22,.18])k.ellipsoid(v(0,seatY+.04*s,z+zz*s),v(width*.7,.065*s,.045*s),k.seat);
 if(k.style.variant==='classic'){k.tube(v(0,seatY+.035*s,z+.15*s),v(0,seatY+.14*s,z+.16*s),.025*s,k.seat);k.ellipsoid(v(0,seatY+.15*s,z+.16*s),v(.045*s,.02*s,.035*s),k.seat);}
 for(const [side,key]of [[1,'footLeft'],[-1,'footRight']]as const){
  const stirrup=k.component(`Stirrup_${key}`),strap=k.component(`Stirrup_leather_${key}`);
  k.tube(v(-.055*s,0,0),v(.055*s,0,0),.014*s,k.trim,stirrup);
  for(const edge of [-1,1])k.tube(v(edge*.055*s,0,0),v(edge*.055*s,.065*s,0),.009*s,k.trim,stirrup);
  k.mesh(new T.CylinderGeometry(.010*s,.010*s,1,8),k.seat,strap);
  k.updates.push(c=>{const foot=c[key].clone().add(v(0,-.035*s,.045*s)),top=v(side*width*.75,seatY,z);stirrup.position.copy(foot);strap.position.copy(top).add(foot).multiplyScalar(.5);strap.quaternion.setFromUnitVectors(v(0,1,0),foot.clone().sub(top).normalize());strap.scale.set(1,top.distanceTo(foot),1);});
 }
 // Bridle: noseband, cheek straps and bit, with reins through the solved palms.
 const bit=nose.clone().add(v(0,-.02*s,.02*s));k.tube(bit.clone().setX(-.16*s),bit.clone().setX(.16*s),.009*s,k.trim);
 for(const side of [-1,1]){k.tube(bit.clone().setX(side*.14*s),neckC.clone().add(v(side*.13*s,.14*s,-.05*s)),.012*s,k.seat);}
 k.tube(nose.clone().add(v(-.12*s,.06*s,.04*s)),nose.clone().add(v(.12*s,.06*s,.04*s)),.012*s,k.seat);
 for(const [side,key]of [[1,'left'],[-1,'right']]as const)for(let i=0;i<8;i++){
  const rein=k.component(`Rein_${key}_${i}`),mesh=k.mesh(new T.CylinderGeometry(.006*s,.006*s,1,6),k.seat,rein);void mesh;
  k.updates.push(c=>{const end=bit.clone().setX(side*.15*s),at=(f:number)=>c[key].clone().lerp(end,f).add(v(0,-.07*s*Math.sin(f*Math.PI),0)),a=at(i/8),b=at((i+1)/8);rein.position.copy(a).add(b).multiplyScalar(.5);rein.quaternion.setFromUnitVectors(v(0,1,0),b.clone().sub(a).normalize());rein.scale.set(1,a.distanceTo(b),1);});
 }
}
