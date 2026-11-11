/** Export keeps generated geometry, rig and procedural animation exactly as previewed. */
import assert from 'node:assert/strict';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS,PRESETS} from '../src/core/params';
import {encodeCharacter,decodeCharacter} from '../src/play/character-pack';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {defaultProject,parseIdentity,parseProject} from '../src/play/project';
import {localAsset} from '../src/play/game-bundle';
const lib=await nodeLibrary();let checks=0;
function check(name:string,fn:()=>void){fn();checks++;console.log('OK',name);}
check('game titles and briefings migrate and round-trip without accepting invalid settings',()=>{
 const p=defaultProject();p.identity={title:'Midnight & rescue',briefing:'Free your partner. Then escape.'};assert.deepEqual(parseProject(JSON.stringify(p),lib.catalog),p);
 const {identity,...old}=defaultProject();assert.deepEqual(parseProject(JSON.stringify(old),lib.catalog).identity,identity);
 for(const raw of [null,[],{title:''},{title:' '.repeat(3)},{title:'x'.repeat(81)},{title:123},{briefing:null},{briefing:'x'.repeat(601)},{code:'script'}])assert.throws(()=>parseIdentity(raw));
 assert.deepEqual(parseIdentity({title:'  Café rescue  '}),{title:'Café rescue',briefing:''});
});
check('bundled character and texture paths cannot point outside the downloaded folder',()=>{
 for(const p of ['characters/character-1.pack','textures/123abc.png','textures/rough-map.jpg'])assert.ok(localAsset(p));
 for(const p of ['https://ara3dgen.com/a.png','/textures/a.png','textures/../a.png','characters/../../../x.pack','textures/a.png?remote=1','data:image/png,x','textures/a.svg'])assert.ok(!localAsset(p));
});
for(const patch of [{...PRESETS['The Prison Escapee'],weapon:'pistol' as const},{...PRESETS['The Female Executive'],height:.2}]){
 const character=await buildHuman(lib,{...DEFAULT_PARAMS,...patch,rig:'game',detail:'medium',faceShapes:true,speechShapes:true,carry:'none'}),bytes=encodeCharacter(character),loaded=decodeCharacter(bytes),a=character.mesh,b=loaded.mesh;
 check(`character pack preserves the ${character.params.name||'custom'} mesh and all facial shapes byte for byte`,()=>{
  for(const key of ['positions','normals','uvs','joints','weights']as const)assert.deepEqual(b[key],a[key]);
  assert.deepEqual(b.groups,a.groups);assert.equal(JSON.stringify(b.materials),JSON.stringify(a.materials));assert.deepEqual(b.morphs,a.morphs);assert.equal(loaded.height,character.height);assert.equal(JSON.stringify(loaded.rig),JSON.stringify(character.rig));assert.deepEqual(loaded.face,character.face);assert.equal(JSON.stringify(loaded.params),JSON.stringify(character.params));assert.ok(bytes.length<25*1024*1024,'one compressed character stays within common static-host asset limits');
 });
 check('loaded rigs produce the same locomotion, interactions and combat poses',()=>{
  const before=new Animator(character.rig!,character.face),after=new Animator(loaded.rig!,loaded.face);
  for(const id of ['idle','walk','run','jump_land','use_press','open_door','pistol_idle','pistol_walk','hit_front']){
   const clip=clipById.get(id)!;for(const phase of [.1,.45,.8]){const first=before.frame(clip,phase*clip.duration,{rootMotion:false}),second=after.frame(clip,phase*clip.duration,{rootMotion:false});assert.deepEqual(second.rot,first.rot);assert.deepEqual(second.rootPos,first.rootPos);assert.deepEqual(second.morph,first.morph);}
  }
 });
}
console.log(`${checks} export asset contracts passed.`);
