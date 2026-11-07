/** Reload actual GLB/FBX scale and translation channels, then inspect the deformed prop vertices. */
import assert from 'node:assert/strict';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {exportGLB} from '../src/export/glb';
import {exportFBX} from '../src/export/fbx';
const lib=await nodeLibrary();let checks=0;
for(const carry of ['none','parachute']as const){
 const ch=await buildHuman(lib,{...DEFAULT_PARAMS,carry,weapon:carry==='none'?'grenade':'none',detail:'low',outfit:'none',hair:'none',faceShapes:false}),A=new Animator(ch.rig!),mesh={...ch.mesh,materials:ch.mesh.materials.map(m=>({...m,map:undefined,normalMap:undefined,roughnessMap:undefined}))};
 for(const id of carry==='none'?['throw_grenade']:['parachute_deploy','parachute_glide','parachute_land']){
  const c=clipById.get(id)!,baked={...A.bake(c),name:c.name,loop:c.loop};
  for(const fmt of ['glb','fbx']as const){
   const data=(fmt==='glb'?exportGLB:exportFBX)(mesh,'action-props',new Map(),ch.rig!,[baked]),buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)as ArrayBuffer,loaded=fmt==='glb'?await new GLTFLoader().parseAsync(buffer,''):new FBXLoader().parse(buffer,''),scene='scene'in loaded?loaded.scene:loaded as T.Group,mixer=new T.AnimationMixer(scene),action=mixer.clipAction(loaded.animations[0]);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
   for(const t of [.2,c.duration*.5,c.duration-1/30]){
    mixer.setTime(t);scene.updateMatrixWorld(true);const actual=A.frame(c,t),name=carry==='none'?'Grenade':'ParachuteCanopy',index=ch.rig!.bones.findIndex(b=>b.name===name),bone=scene.getObjectByName(name)as T.Bone;
    assert.ok(bone);const pos=bone.getWorldPosition(new T.Vector3()).multiplyScalar(fmt==='fbx'?.01:1).toArray(),wanted=actual.rootPos.get(index)!;assert.ok(Math.hypot(...pos.map((v,d)=>v-wanted[d]))<.004,`${fmt}/${id} prop detached`);
    if(carry==='parachute'){const scale=actual.scale!.get(index)!;assert.ok(Math.abs(bone.scale.x-scale[0])<.2,`${fmt}/${id} canopy scale channel lost`);const arm=scene.getObjectByName('LeftArm')as T.Bone;assert.equal(arm.scale.x,1);}
    scene.traverse(o=>{if(o instanceof T.SkinnedMesh){o.skeleton.update();const P=o.geometry.getAttribute('position');for(let i=0;i<P.count;i+=503)assert.ok(o.applyBoneTransform(i,new T.Vector3().fromBufferAttribute(P,i)).toArray().every(Number.isFinite),'invalid exported deformation');}});checks++;
   }
   mixer.stopAllAction();console.log('OK action props',fmt,id);
  }
 }
}
console.log(`Action props export: ${checks} real GLB/FBX playback samples; prop positions, canopy scales and finite skinning passed.`);
