/** Batch static pieces per rigid component and material, keeping moving joints independent. */
import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export function mergeVehicleParts(root:T.Group){
 root.updateMatrixWorld(true);
 const batches=new Map<T.Object3D,Map<T.Material,T.Mesh[]>>();
 root.traverse(o=>{
  if(!(o instanceof T.Mesh)||o.userData.component||Array.isArray(o.material))return;
  let parent=o.parent;while(parent&&!parent.userData.component)parent=parent.parent;
  if(!parent)return;
  let byMaterial=batches.get(parent);if(!byMaterial){byMaterial=new Map();batches.set(parent,byMaterial);}
  const list=byMaterial.get(o.material)??[];list.push(o);byMaterial.set(o.material,list);
 });
 for(const [parent,byMaterial]of batches){
  const inverse=parent.matrixWorld.clone().invert();
  for(const [material,objects]of byMaterial){
   if(objects.length<2)continue;
   const geometries=objects.map(o=>{
    const geo=o.geometry.clone();geo.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    if(!geo.getAttribute('normal'))geo.computeVertexNormals();
    if(!geo.getAttribute('uv'))geo.setAttribute('uv',new T.BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));
    if(!geo.index)geo.setIndex(Array.from({length:geo.getAttribute('position').count},(_,i)=>i));
    return geo;
   });
   const geo=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
   if(!geo)throw Error('Could not batch vehicle geometry.');
   for(const o of objects){o.removeFromParent();o.geometry.dispose();}
   const mesh=new T.Mesh(geo,material);mesh.castShadow=!(material instanceof T.MeshStandardMaterial&&material.transparent&&material.opacity<.5);mesh.receiveShadow=true;parent.add(mesh);
  }
 }
}
