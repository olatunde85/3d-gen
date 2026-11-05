/** Cut real door apertures out of the body and hinge the matching paint, glass and trim together. */
import * as T from 'three';
import {VehicleKit,v} from './vehicle-kit';
type Vertex={p:T.Vector3;n:T.Vector3;uv:T.Vector2};
type Plane={axis:'x'|'y'|'z';value:number;sign:number};
function split(poly:Vertex[],plane:Plane):[Vertex[],Vertex[]]{
 const inside:Vertex[]=[],outside:Vertex[]=[],distance=(p:Vertex)=>(p.p[plane.axis]-plane.value)*plane.sign;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a),db=distance(b),inA=da>=-1e-8;
  (inA?inside:outside).push(a);
  if((da>1e-8&&db<-1e-8)||(da<-1e-8&&db>1e-8)){
   const t=da/(da-db),point={p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t)};
   inside.push(point);outside.push(point);
  }
 }
 return [inside,outside];
}
function geometry(polygons:Vertex[][]){
 const pos:number[]=[],normal:number[]=[],uv:number[]=[];
 for(const p of polygons)for(let i=1;i<p.length-1;i++)for(const v of [p[0],p[i],p[i+1]]){pos.push(...v.p.toArray());normal.push(...v.n.toArray());uv.push(...v.uv.toArray());}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return geo;
}
export function articulateDoors(k:VehicleKit){
 const s=k.fit.scale,suv=k.fit.id==='suv',classic=k.fit.id==='car',driver=!k.fit.clip.id.includes('passenger'),cx=(driver?-.36:.36)*s,z=k.fit.average('hip').z;
 const width=(suv?2.02:classic?1.62:1.94)*s,front=(suv?.64:classic?.55:.88)*s,rear=(suv?-.40:classic?-.55:-.42)*s;
 const hip=k.fit.average('hip').y,roof=Math.max(hip+.88*s,...k.fit.samples.map(c=>c.headTop.y+.12*s));
 for(const side of [-1,1]){
  const hinge=v(cx+side*width*.465,(classic?.30:suv?.46:.19)*s,z+front),door=k.component(`Door_${side>0?'left':'right'}`,hinge);
  door.userData.doorSide=side;door.userData.occupantDoor=side===(driver?1:-1);
  const planes:Plane[]=[{axis:'x',value:cx+side*width*.36,sign:side},{axis:'z',value:z+rear,sign:1},{axis:'z',value:z+front,sign:-1},{axis:'y',value:(classic?.29:suv?.45:.17)*s,sign:1},{axis:'y',value:classic?1.0*s:roof-.075*s,sign:-1}];
  k.group.updateMatrixWorld(true);const meshes:T.Mesh[]=[];
  k.group.traverse(o=>{if(o instanceof T.Mesh&&o.parent===k.group)meshes.push(o);});
  for(const mesh of meshes){
   const geo=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld),P=geo.getAttribute('position'),N=geo.getAttribute('normal'),U=geo.getAttribute('uv'),inside:Vertex[][]=[],outside:Vertex[][]=[];
   const bounds=new T.Box3().setFromBufferAttribute(P as T.BufferAttribute);
   if(planes.some(p=>(p.sign>0?bounds.max[p.axis]:bounds.min[p.axis])*p.sign<p.value*p.sign-1e-8)){geo.dispose();continue;}
   const vertex=(i:number):Vertex=>({p:v(P.getX(i),P.getY(i),P.getZ(i)),n:v(N.getX(i),N.getY(i),N.getZ(i)),uv:new T.Vector2(U?.getX(i)??0,U?.getY(i)??0)});
   for(let i=0;i<(geo.index?.count??P.count);i+=3){let poly=[0,1,2].map(d=>vertex(geo.index?.getX(i+d)??i+d));
    for(const plane of planes){const [inn,out]=split(poly,plane);if(out.length>=3)outside.push(out);poly=inn;if(poly.length<3)break;}
    if(poly.length>=3)inside.push(poly);
   }
   geo.dispose();if(!inside.length)continue;
   const bodyGeo=geometry(outside),doorGeo=geometry(inside);doorGeo.translate(-hinge.x,-hinge.y,-hinge.z);
   k.mesh(doorGeo,mesh.material as T.Material,door);mesh.geometry.dispose();mesh.geometry=bodyGeo;mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);
  }
 }
}
