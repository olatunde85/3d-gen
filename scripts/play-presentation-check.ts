/** Creator camera restrictions, stable projections and a race-safe streamed music transport. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import * as T from 'three';
import type {Catalog} from '../src/core/assets';
import {PlayCamera,CAMERA_TILT} from '../src/play/camera';
import {GameMusic} from '../src/play/music';
import {CAMERA_VIEWS,MUSIC_TRACKS,defaultCamera,defaultMusic,parseCamera,parseMusic} from '../src/play/presentation';
import {defaultProject,parseProject} from '../src/play/project';
import type {MotorBody} from '../src/play/motor';
const body:MotorBody={x:3,y:0,z:7,yaw:Math.PI,vy:0,height:1.8,radius:.34,speed:0,grounded:true,airTime:0,landing:0};let checks=0;
async function check(name:string,fn:()=>void|Promise<void>){await fn();checks++;console.log('OK',name);}
const frame=(c:PlayCamera)=>[...c.camera.position.toArray(),...c.camera.quaternion.toArray(),...c.camera.projectionMatrix.toArray()];
await check('all camera subsets and starting views round-trip; old projects retain third person and silent music',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../public/assets/catalog.json',import.meta.url),'utf8'))as Catalog;
 for(let mask=1;mask<16;mask++){const allowed=CAMERA_VIEWS.filter((_,i)=>mask&(1<<i)).map(v=>v.id);for(const start of allowed){const p=defaultProject();p.camera={allowed,default:start,rotate:false,zoom:true};p.music={track:'spy-mission',volume:.34};assert.deepEqual(parseProject(JSON.stringify(p),catalog),p);}}
 const {camera,music,...legacy}=defaultProject(),parsed=parseProject(JSON.stringify(legacy),catalog);assert.deepEqual(parsed.camera,camera);assert.deepEqual(parsed.music,music);assert.equal(parsed.camera.default,'orbit');assert.equal(parsed.music.track,'none');
 for(const raw of [null,[],{allowed:[]},{allowed:null},{default:null},{allowed:['orbit','orbit']},{allowed:['first-person']},{allowed:['orbit'],default:'close'},{rotate:1},{zoom:'false'},{scripts:'anything'}])assert.throws(()=>parseCamera(raw));
 assert.deepEqual(parseCamera({allowed:['isometric']}),{allowed:['isometric'],default:'isometric',rotate:true,zoom:true});
});
await check('every recorded music track is available locally and music settings reject arbitrary URLs and invalid volumes',()=>{
 for(const track of MUSIC_TRACKS){for(const volume of [0,.22,1])assert.deepEqual(parseMusic({track:track.id,volume}),{track:track.id,volume});if(track.file)assert.ok(existsSync(new URL(`../public/media/music/${track.file}`,import.meta.url)));}
 for(const raw of [null,[],{track:'https://example.com/song.mp3'},{track:'ambient'},{volume:-1},{volume:1.01},{volume:NaN},{volume:'50'},{volume:null},{url:'file.mp3'}])assert.throws(()=>parseMusic(raw));
 assert.deepEqual(parseMusic(undefined),defaultMusic());
});
await check('all four views project the hero and keep movement aligned with the screen on phone and desktop',()=>{
 for(const view of CAMERA_VIEWS)for(const [width,height]of [[1280,790],[320,477],[844,306]]){
  const c=new PlayCamera();c.configure({...defaultCamera(),default:view.id},body);const camera=c.update(body,1/60,width/height,height),hero=new T.Vector3(body.x,body.y+.9,body.z).project(camera);
  assert.ok(frame(c).every(Number.isFinite));assert.ok(Math.abs(hero.x)<.3&&Math.abs(hero.y)<.4&&Math.abs(hero.z)<1,view.id+' hero is visible');
  assert.equal(camera instanceof T.OrthographicCamera,view.id==='overhead'||view.id==='isometric');
  const right=new T.Vector3(body.x+Math.cos(c.azimuth),.9,body.z-Math.sin(c.azimuth)).project(camera),forward=new T.Vector3(body.x-Math.sin(c.azimuth),.9,body.z-Math.cos(c.azimuth)).project(camera);
  assert.ok(right.x>hero.x,'D moves screen-right');assert.ok(forward.y>hero.y,'W moves screen-up');
 }
});
await check('default perspective cameras stay near eye level with a slight downward view, rather than an elevated orbit',()=>{
 for(const view of ['orbit','close']as const)for(const [width,height]of [[1280,790],[320,477],[844,306]]){
  const c=new PlayCamera();c.configure({...defaultCamera(),default:view},body);const camera=c.update(body,0,width/height,height),direction=camera.getWorldDirection(new T.Vector3());assert.ok(camera.position.y>body.y+.9&&camera.position.y<body.y+body.height,'default camera is at character height');assert.ok(direction.y<0&&direction.y>-.1,'a slight downward tilt keeps the horizon ahead');assert.ok(c.elevation<5*Math.PI/180);c.rotate(0,-100);c.update(body,0,width/height,height);assert.equal(c.elevation,0,'players can choose a level view');assert.ok(c.camera.position.y>body.y+.1,'level view stays above the ground');
 }
});
await check('new perspective views begin directly behind the character at every spawn heading',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const view of ['orbit','close']as const){const b={...body,yaw},c=new PlayCamera();c.configure({...defaultCamera(),default:view},b);c.update(b,0,1.5,790);assert.ok(Math.cos(c.azimuth-yaw)<-.999999,'camera starts behind the spawn heading');const direction=c.camera.getWorldDirection(new T.Vector3());assert.ok(direction.x*Math.sin(yaw)+direction.z*Math.cos(yaw)>.99,'camera looks in the character’s forward direction');}
});
await check('actor facing, aim and recoil cannot change camera framing in any view',()=>{
 for(const view of CAMERA_VIEWS){const c=new PlayCamera(),b={...body};c.configure({...defaultCamera(),default:view.id},b);c.update(b,0,1.4,700);const before=frame(c);for(let i=0;i<30;i++){b.yaw=i*.3;c.update(b,1/60,1.4,700);assert.deepEqual(frame(c),before);}b.y=2.7;const y=c.camera.position.y;c.update(b,.1,1.4,700);assert.ok(c.camera.position.y>y,'actual elevation follows');}
});
await check('cycling only visits allowed views, remembers each view and enforces rotation/zoom locks',()=>{
 const c=new PlayCamera();c.configure({allowed:['close','isometric'],default:'close',rotate:true,zoom:true},body);c.rotate(.4);c.dolly(1);const angle=c.azimuth;c.cycle(body);assert.equal(c.view,'isometric');c.rotate(.3);c.cycle(body,-1);assert.equal(c.view,'close');assert.equal(c.azimuth,angle);assert.equal(c.zoom,10);assert.equal(c.setView('orbit',body),false);
 c.configure({allowed:['overhead'],default:'overhead',rotate:false,zoom:false},body);c.rotate(4);c.dolly(50);assert.equal(c.azimuth,0);assert.equal(c.zoom,9);assert.equal(c.cycle(body),false);assert.equal(c.view,'overhead');
 c.configure(defaultCamera(),body);c.dolly(1000);assert.equal(c.zoom,15);c.dolly(-1000);assert.equal(c.zoom,6);
});
await check('perspective views tilt along a fixed-radius orbit, clamp above ground and remember separate elevations',()=>{
 for(const view of ['orbit','close']as const)for(const [width,height]of [[1280,790],[320,477],[844,306]]){
  const c=new PlayCamera();c.configure({...defaultCamera(),default:view},body);c.update(body,0,width/height,height);
  const wide=width/height<.8?.9:width/height>1.8&&height<430?.65:1,offset=view==='close'?.5*wide:0,target=new T.Vector3(body.x+Math.cos(c.azimuth)*offset,body.y+(view==='close'?body.height*.65:.9),body.z-Math.sin(c.azimuth)*offset),radius=c.camera.position.distanceTo(target),initial=c.elevation;
  c.rotate(0,.2);c.update(body,0,width/height,height);assert.ok(c.elevation>initial);assert.ok(Math.abs(c.camera.position.distanceTo(target)-radius)<1e-8,'tilting never acts as zoom');
  const saved=c.elevation;c.setView(view==='orbit'?'close':'orbit',body);assert.notEqual(c.elevation,saved);c.setView(view,body);assert.equal(c.elevation,saved,'each view remembers its tilt');c.reset(body);assert.equal(c.elevation,saved,'retry preserves tilt');
  for(const delta of [-1000,1000]){c.rotate(0,delta);c.update(body,0,width/height,height);assert.equal(c.elevation,delta<0?CAMERA_TILT.min:CAMERA_TILT.max);assert.ok(c.camera.position.y>.1,'camera stays above ground');assert.ok(frame(c).every(Number.isFinite));assert.ok(Math.abs(c.camera.position.distanceTo(target)-radius)<1e-8);}
  c.configure({...defaultCamera(),default:view},body);assert.equal(c.elevation,initial,'new runs restore the preset angle');
 }
});
await check('rotation locks cover both axes while orthographic views keep their preset tilt',()=>{
 for(const view of CAMERA_VIEWS){const c=new PlayCamera();c.configure({...defaultCamera(),default:view.id,rotate:false},body);c.update(body,0,1.4,700);const before=frame(c),angle=c.azimuth,pitch=c.elevation;c.rotate(.4,.3);c.update(body,0,1.4,700);assert.equal(c.azimuth,angle);assert.equal(c.elevation,pitch);assert.deepEqual(frame(c),before);}
 for(const view of ['overhead','isometric']as const){const c=new PlayCamera();c.configure({...defaultCamera(),default:view},body);c.update(body,0,1.4,700);const pitch=c.elevation,before=frame(c);c.rotate(0,.4);c.update(body,0,1.4,700);assert.equal(c.elevation,pitch);assert.deepEqual(frame(c),before);c.rotate(.3,.5);assert.equal(c.elevation,pitch);assert.notEqual(c.azimuth,view==='overhead'?0:Math.PI/4,'horizontal rotation still works');}
});
class FakeAudio {
 src='';loop=false;preload='';volume=1;currentTime=0;plays=0;pauses=0;loads=0;paused=true;onerror:unknown=null;
 result:()=>Promise<void>=()=>Promise.resolve();play(){this.plays++;this.paused=false;return this.result();}pause(){this.pauses++;this.paused=true;}load(){this.loads++;}removeAttribute(){this.src='';}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
await check('music is lazy, loops a whitelisted recorded track, and resumes without stacking playback',async()=>{
 const outputs:FakeAudio[]=[],m=new GameMusic('https://ara.test/sub/',()=>{const a=new FakeAudio();outputs.push(a);return a as unknown as HTMLAudioElement;});m.configure(defaultMusic());m.setPlaying(true);assert.equal(outputs.length,0);
 m.configure({track:'spy-mission',volume:.3});await flush();const a=outputs[0];assert.equal(outputs.length,1);assert.equal(a.src,'https://ara.test/sub/media/music/spy-mission-574523.mp3');assert.equal(a.loop,true);assert.equal(a.preload,'none');assert.equal(a.volume,.3);assert.equal(m.state,'playing');for(let i=0;i<100;i++)m.setPlaying(true);assert.equal(a.plays,1);
 a.currentTime=12;m.setPlaying(false);assert.equal(m.state,'paused');assert.equal(a.currentTime,12);m.setPlaying(true);await flush();assert.equal(a.currentTime,12);assert.equal(a.plays,2);assert.equal(outputs.length,1);
 m.configure({track:'spy-mission',volume:.4});assert.equal(a.volume,.4);assert.equal(a.plays,2);m.setPlaying(false);m.configure({track:'spy-mission',volume:.4},true);assert.equal(a.currentTime,0);
 m.setPlaying(true);await flush();a.pause();m.unlock();await flush();assert.equal(a.paused,false,'a user gesture recovers a native audio interruption');assert.equal(m.state,'playing');
});
await check('master mute, zero volume, silence and track replacement leave only the intended music active',async()=>{
 const outputs:FakeAudio[]=[],m=new GameMusic('https://ara.test/',()=>{const a=new FakeAudio();outputs.push(a);return a as unknown as HTMLAudioElement;});m.configure({track:'horror',volume:.2});m.setMuted(true);m.setPlaying(true);assert.equal(outputs.length,0);m.setMuted(false);await flush();const a=outputs[0];m.setMuted(true);assert.equal(m.state,'paused');m.setMuted(false);await flush();assert.equal(a.plays,2);
 m.configure({track:'horror',volume:0});assert.equal(m.state,'paused');m.configure({track:'horror',volume:.5});await flush();assert.equal(a.plays,3);m.configure({track:'spy-opening',volume:.3});await flush();assert.equal(outputs.length,2);assert.equal(a.src,'');assert.ok(a.pauses>0&&a.loads===1);assert.equal(a.onerror,null);m.configure(defaultMusic());assert.equal(outputs[1].src,'');assert.equal(m.state,'idle');
});
await check('cancelled play promises cannot resurrect old tracks or overwrite the current playback state',async()=>{
 const outputs:FakeAudio[]=[];let rejectOld:(e:Error)=>void=()=>{};const m=new GameMusic('https://ara.test/',()=>{const a=new FakeAudio();if(!outputs.length)a.result=()=>new Promise((_,reject)=>rejectOld=reject);outputs.push(a);return a as unknown as HTMLAudioElement;});m.configure({track:'horror',volume:.2});m.setPlaying(true);m.configure({track:'spy-mission',volume:.3});await flush();rejectOld(Error('old aborted'));await flush();assert.equal(m.state,'playing');assert.equal(m.error,'');assert.equal(outputs.length,2);m.setPlaying(false);assert.equal(m.state,'paused');
});
await check('playback failure stays nonfatal and retries only on user action',async()=>{
 const a=new FakeAudio();a.result=()=>Promise.reject(Object.assign(Error('autoplay'),{name:'NotAllowedError'}));const m=new GameMusic('https://ara.test/',()=>a as unknown as HTMLAudioElement);m.configure({track:'horror',volume:.2});m.setPlaying(true);await flush();assert.equal(m.state,'error');assert.ok(m.error);for(let i=0;i<20;i++)m.setPlaying(true);assert.equal(a.plays,1);a.result=()=>Promise.resolve();m.unlock();await flush();assert.equal(m.state,'playing');assert.equal(m.error,'');assert.equal(a.plays,2);m.stop();assert.equal(m.state,'paused');
});
console.log(`${checks} camera/music contracts passed.`);
