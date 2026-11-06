/** Load animated props through Three's real GLB/FBX importers and compare deformed vertices. */
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById,CLIPS} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {VEHICLE_FITS,VEHICLE_FOR_CLIP,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
import {exportGLB} from '../src/export/glb';
import {exportFBX} from '../src/export/fbx';
const lib=await nodeLibrary(),ch=await buildHuman(lib,{...DEFAULT_PARAMS,detail:'low',outfit:'none',hair:'none',faceShapes:false}),A=new Animator(ch.rig!);let maxError=0;
for(const {clip:clipId,id}of [...VEHICLE_FITS,...CLIPS.filter(c=>c.vehicleTransition).map(c=>({clip:c.id,id:VEHICLE_FOR_CLIP[c.id]}))]){
 const c=clipById.get(clipId)!,vehicle=new Vehicle(id,ch.rig!,A,c,DEFAULT_VEHICLE_STYLE),parts:T.Object3D[]=[];vehicle.group.traverse(o=>{if(o.userData.component)parts.push(o);});
 const inverse=vehicle.group.matrixWorld.clone().invert(),rest=parts.map(o=>inverse.clone().multiply(o.matrixWorld).invert());
 const {mesh,rig,bake}=vehicle.asset(),baked=bake();
 for(const fmt of ['glb','fbx']as const){
  const data=(fmt==='glb'?exportGLB:exportFBX)(mesh,id,new Map(),rig,[baked]),buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)as ArrayBuffer;
  const loaded=fmt==='glb'?await new GLTFLoader().parseAsync(buffer,''):new FBXLoader().parse(buffer,''),scene='scene'in loaded?loaded.scene:loaded as T.Group,clips=loaded.animations;
  assert.equal(clips.length,1);const mixer=new T.AnimationMixer(scene);mixer.clipAction(clips[0]).play();
  const meshes:T.SkinnedMesh[]=[];scene.traverse(o=>{if(o instanceof T.SkinnedMesh)meshes.push(o);});assert.ok(meshes.length);
  for(const tick of [0,3,11,23]){
   const t=baked.times[Math.floor((baked.times.length-1)*tick/30)];vehicle.update(t);const matrices=parts.map((o,i)=>inverse.clone().multiply(o.matrixWorld).multiply(rest[i]));mixer.setTime(t);scene.updateMatrixWorld(true);meshes.forEach(m=>m.skeleton.update());
   // The exporters preserve vertex order within each material's group, but FBX may split meshes.
   for(const m of meshes){const pos=m.geometry.getAttribute('position'),joints=m.geometry.getAttribute('skinIndex');for(let i=0;i<pos.count;i+=Math.max(1,Math.floor(pos.count/150))){
    const actual=m.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(pos,i)).applyMatrix4(m.matrixWorld);if(fmt==='fbx')actual.multiplyScalar(.01);
    // Imported static positions identify the matching source vertex (FBX uses centimetres).
    const source=new T.Vector3().fromBufferAttribute(pos,i);if(fmt==='fbx')source.multiplyScalar(.01);
    const bone=m.skeleton.bones[joints.getX(i)],joint=rig.bones.findIndex(b=>b.name===bone.name);assert.ok(joint>=0,'unknown vehicle joint');
    const expected=source.applyMatrix4(matrices[joint]);const error=actual.distanceTo(expected);maxError=Math.max(maxError,error);assert.ok(error<.002,`${fmt}/${clipId}/${bone.name} ${t.toFixed(3)} vertex drift ${error}`);
   }}
  }
  console.log('OK loaded',fmt,id,clipId,rig.bones.length,'rigid joints');mixer.stopAllAction();
 }
 vehicle.dispose();
}
console.log('Vehicle GLB/FBX round-trip max error',maxError,'metres');
