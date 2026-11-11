/** Lossless generated meshes and rigs: the independent player uses the same Animator as the preview. */
import {encodePack,decodePack,type TypedArray} from '../core/pack';
import type {Character} from '../core/human';
import type {Material} from '../core/mesh';
interface CharacterMeta {
 kind:'ara-play-character';version:1;params:Character['params'];height:number;rig:Character['rig'];face:Character['face'];
 materials:Material[];groups:{material:number}[];morphs?:{names:string[];defaults:number[]};
}
export function encodeCharacter(character:Character):Uint8Array {
 if(!character.rig||!character.mesh.joints||!character.mesh.weights)throw Error('Game characters must have a rig.');
 const m=character.mesh,arrays:Record<string,TypedArray>={positions:m.positions,normals:m.normals,uvs:m.uvs,joints:m.joints!,weights:m.weights!};
 m.groups.forEach((g,i)=>{arrays[`indices-${i}`]=g.indices;arrays[`polys-${i}`]=g.polySizes;arrays[`poly-indices-${i}`]=g.polyIndices;});
 m.morphs?.deltas.forEach((delta,i)=>arrays[`morph-${i}`]=delta);
 const meta:CharacterMeta={kind:'ara-play-character',version:1,params:character.params,height:character.height,rig:character.rig,face:character.face,materials:m.materials,groups:m.groups.map(g=>({material:g.material})),...(m.morphs?{morphs:{names:m.morphs.names,defaults:m.morphs.defaults}}:{})};
 return encodePack(meta,arrays);
}
export function decodeCharacter(data:Uint8Array):Character {
 const {meta:m,arrays:a}=decodePack<CharacterMeta>(data);
 if(m.kind!=='ara-play-character'||m.version!==1||!m.rig||m.rig.type!=='game'||!Array.isArray(m.groups)||!Array.isArray(m.materials))throw Error('Unsupported game character asset.');
 const n=a.positions?.length/3;
 if(!(a.positions instanceof Float32Array)||!(a.normals instanceof Float32Array)||!(a.uvs instanceof Float32Array)||!(a.joints instanceof Uint16Array)||!(a.weights instanceof Float32Array)||!Number.isInteger(n)||n<1||a.normals.length!==n*3||a.uvs.length!==n*2||a.joints.length!==n*4||a.weights.length!==n*4)throw Error('Incomplete game character mesh.');
 const mesh:Character['mesh']={positions:a.positions as Float32Array,normals:a.normals as Float32Array,uvs:a.uvs as Float32Array,joints:a.joints as Uint16Array,weights:a.weights as Float32Array,materials:m.materials,groups:m.groups.map((g,i)=>{
  const indices=a[`indices-${i}`];if(!(indices instanceof Uint32Array)||indices.length%3||g.material<0||g.material>=m.materials.length)throw Error('Incomplete game character triangles.');
  return {material:g.material,indices,polySizes:a[`polys-${i}`]as Uint8Array,polyIndices:a[`poly-indices-${i}`]as Uint32Array};
 })};
 if(m.morphs)mesh.morphs={...m.morphs,deltas:m.morphs.names.map((_,i)=>{const delta=a[`morph-${i}`];if(!(delta instanceof Float32Array)||delta.length!==n*3)throw Error('Incomplete facial animation data.');return delta;})};
 return {params:m.params,mesh,rig:m.rig,height:m.height,face:m.face};
}
