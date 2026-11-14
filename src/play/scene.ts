import {headlightLevel} from './vehicle-feel';
import {AirView} from './air-view';
import {CITY_SHOPS} from './city';
import {AtmosphereView} from './atmosphere';
import {carPoint,pickupExtractionRadius} from './driving';
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {SetBuilder} from '../studio/sets/builder';
import {KEY,EXIT,DOOR,blocked} from './world';
import type {MissionWorld} from './mission';
import type {EscapeGame} from './runtime';
import {GrenadeView} from './grenade-view';
import {DrivingView} from './driving-view';
import type {GameActor} from './actor';
import {CombatView} from './combat-view';
import {chest,traceShot,type Point3} from './combat';
import {solidVolumes,missionObstacles} from './mission';
import {PickupView} from './pickup-view';
import {PlayCamera} from './camera';
import {TrafficView} from './traffic-view';
import type {CameraSettings,CameraView} from './presentation';
export class GameScene {
 readonly scene=new T.Scene();readonly renderer:T.WebGLRenderer;readonly views=new PlayCamera();
 get camera(){return this.views.camera;}
 get view(){return this.views.view;}
 get azimuth(){return this.views.azimuth;}set azimuth(value:number){this.views.azimuth=value;}
 get zoom(){return this.views.zoom;}set zoom(value:number){this.views.zoom=value;}
 readonly atmosphere=new AtmosphereView();readonly combat=new CombatView();readonly grenades=new GrenadeView();
 readonly supplies=new PickupView();air?:AirView;overwatch?:AirView;pickup?:DrivingView;pursuitView?:DrivingView;pursuitActor?:GameActor;raceView?:DrivingView;raceActor?:GameActor;private hubFleetViews=new Map<string,DrivingView>();private traffic?:TrafficView;private trafficGame?:EscapeGame;private beacons?:T.MeshStandardMaterial[];private hubFleetVersion=-1;private hubPeople:GameActor[]=[];
 private door=new T.Group();private key=new T.Group();private exit:T.Mesh;private marker:T.Mesh;private defendZone:T.Mesh;private questMarker:T.Mesh;private repairMarker:T.Mesh;private gunShopMarker:T.Mesh;
 private companionRing:T.Mesh;private cargo=new T.Group();private parcel=new T.Group();private roadMarker:T.Mesh;private smoke=new T.Group();private sun:T.DirectionalLight;
 private worldGroup=new T.Group();private worldId='';private hubPedSolids?:ReturnType<typeof missionObstacles>;private occluders:T.Group[]=[];private interiorDoors:{left:T.Mesh;right:T.Mesh;x:number;z:number;width:number;open:number}[]=[];private shopDoors:{left:T.Mesh;right:T.Mesh;x:number;z:number;open:number}[]=[];private ray=new T.Raycaster();
 private size={w:0,h:0};
 constructor(readonly canvas:HTMLCanvasElement){
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(this.pixelRatio());this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
  this.scene.background=new T.Color('#b6c2c6');this.scene.fog=new T.Fog('#b6c2c6',45,110);
  const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);this.scene.environment=environment.texture;this.scene.environmentIntensity=.5;room.dispose();pmrem.dispose();
  this.scene.add(this.atmosphere.group,this.smoke);for(let i=0;i<4;i++)this.smoke.add(new T.Mesh(new T.SphereGeometry(.38,8,6),new T.MeshBasicMaterial({color:'#4e5555',transparent:true,opacity:.3,depthWrite:false})));const sun=new T.DirectionalLight('#ffe2ad',3.1);sun.position.set(-12,22,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-26,right:26,top:26,bottom:-26,near:1,far:70});sun.shadow.normalBias=.025;this.sun=sun;this.scene.add(sun,sun.target);
  this.parcel.add(new T.Mesh(new T.BoxGeometry(.42,.32,.36),new T.MeshStandardMaterial({color:'#bd9361',roughness:.9})));this.parcel.add(new T.Mesh(new T.BoxGeometry(.06,.34,.38),new T.MeshStandardMaterial({color:'#e2c8a0',roughness:.85})));this.scene.add(this.parcel);
  this.scene.add(this.combat.group,this.grenades.group);
  this.scene.add(this.supplies.group);
  const gate=new SetBuilder();gate.box([2.9,2.3,.24],[1.45,1.15,0],'#aa7745',.5,.4);for(const x of [.2,2.7])gate.box([.08,2,.06],[x,1.15,.15],'#d4b787');gate.label('STAFF ONLY',[1.45,1.65,.135],1.4,'#eee4c9','#705035');this.door.add(gate.group);this.door.position.set(-1.45,0,DOOR.z);this.scene.add(this.door);
  const brass=new T.MeshStandardMaterial({color:'#e9bf62',metalness:.65,roughness:.28});const ring=new T.Mesh(new T.TorusGeometry(.14,.04,8,24),brass);this.key.add(ring);const shaft=new T.Mesh(new T.BoxGeometry(.09,.4,.07),brass);shaft.position.y=-.28;this.key.add(shaft);for(const y of [-.43,-.34]){const tooth=new T.Mesh(new T.BoxGeometry(.18,.055,.07),brass);tooth.position.set(.06,y,0);this.key.add(tooth);}this.key.position.set(KEY.x,1.2,KEY.z);this.scene.add(this.key);
  this.marker=new T.Mesh(new T.RingGeometry(.55,.62,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#e9bf62',transparent:true,opacity:.8,side:T.DoubleSide}));this.marker.position.set(KEY.x,.018,KEY.z);this.scene.add(this.marker);
  this.defendZone=new T.Mesh(new T.RingGeometry(7.85,8,96).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#e9bf62',transparent:true,opacity:.45,side:T.DoubleSide,depthWrite:false}));this.scene.add(this.defendZone);
  this.questMarker=new T.Mesh(new T.RingGeometry(.7,.82,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#82e0dc',transparent:true,opacity:.9,side:T.DoubleSide}));this.scene.add(this.questMarker);
  this.repairMarker=new T.Mesh(new T.RingGeometry(1.7,1.88,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#e8a66f',transparent:true,opacity:.75,side:T.DoubleSide}));this.repairMarker.position.set(CITY_SHOPS.repair.x,.026,CITY_SHOPS.repair.z);this.scene.add(this.repairMarker);
  this.gunShopMarker=new T.Mesh(new T.RingGeometry(1.05,1.2,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#d5aeec',transparent:true,opacity:.75,side:T.DoubleSide}));this.gunShopMarker.position.set(CITY_SHOPS.gun.x,.026,CITY_SHOPS.gun.z);this.scene.add(this.gunShopMarker);
  this.exit=new T.Mesh(new T.RingGeometry(1.25,1.5,64).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#57d7b1',transparent:true,opacity:.6,side:T.DoubleSide}));this.exit.position.set(EXIT.x,.025,EXIT.z);this.scene.add(this.exit);
  this.companionRing=new T.Mesh(new T.RingGeometry(.52,.6,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#87d8ed',transparent:true,opacity:.8,side:T.DoubleSide}));this.companionRing.visible=false;this.scene.add(this.companionRing);
  this.roadMarker=new T.Mesh(new T.RingGeometry(2.2,2.5,64).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:'#e3c66e',side:T.DoubleSide,transparent:true,opacity:.8}));this.roadMarker.visible=false;this.scene.add(this.roadMarker);
  new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();
 }
 private setWorld(world:MissionWorld){
  if(world.id===this.worldId)return;this.worldGroup.removeFromParent();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();this.worldGroup.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.worldGroup=new T.Group();this.occluders=[];this.interiorDoors=[];this.shopDoors=[];this.worldId=world.id;this.hubPedSolids=world.hub?missionObstacles(world,1):undefined;
  const military=world.location!=='depot',setMinZ=world.getaway?.course?.startZ??world.bounds.minZ,b=new SetBuilder('day','stone');b.floor(world.location==='desert-compound'?'#bdab83':world.location==='market-street'?'#a99a83':world.location==='urban-block'?'#777e82':military?'#9da08b':'#8b9290',Math.max(140,Math.abs(world.bounds.minZ)*2+30));
  // All solid world props use the very same dimensions as the gameplay colliders.
  for(const block of world.blocks){const c=new SetBuilder();
   // The roof occupies the top 18 cm of a building, rather than sharing its
   // top face with a second full-height box (which flickers as the view moves).
   const bodyHeight=block.kind==='building'?block.h-.18:block.h-(block.baseY??0);
   if(block.id.startsWith('road-cone-')){const cone=new T.Mesh(new T.ConeGeometry(block.w/2,block.h-.08,12),c.material(block.color,.8));cone.position.set(block.x,.08+(block.h-.08)/2,block.z);cone.castShadow=true;cone.receiveShadow=true;c.group.add(cone);}else c.box([block.w,bodyHeight,block.d],[block.x,(block.baseY??0)+bodyHeight/2,block.z],block.color,.85);
   if(block.id.startsWith('road-block-')){for(let x=block.x-block.w/2+.4;x<block.x+block.w/2-.3;x+=1.4)for(const side of [-1,1]){c.box([.5,.32,.03],[x,.68,block.z+side*(block.d/2+.018)],'#3d423b');}}else if(block.id.startsWith('road-cone-')){c.box([.43,.08,.43],[block.x,.04,block.z],'#424b42');const stripe=new T.Mesh(new T.CylinderGeometry(.075,.115,.1,12),c.material('#f3dca7',.8));stripe.position.set(block.x,.42,block.z);c.group.add(stripe);}
   else if(block.kind==='container'){
    for(let z=-block.d/2+.25;z<block.d/2;z+=.45)for(const side of [-1,1])c.box([.045,block.h-.12,.045],[block.x+side*(block.w/2+.015),block.h/2,block.z+z],block.color);
    c.label(block.id==='store-03'?'03 / FREIGHT':'ARA / LOGISTICS',[block.x,1.65,block.z+block.d/2+.035],Math.min(2.5,block.w-.4),'#e0ded1',block.color);
   }else if(block.id.startsWith('city-block-')){
    c.box([block.w,.18,block.d],[block.x,block.h-.09,block.z],'#57666c',.65);
    for(const y of [2.5,5.2,7.9].filter(v=>v<block.h-1))for(const side of [-1,1])c.box([2.2,1.35,.025],[block.x+side*block.w*.27,y,block.z+block.d/2+.018],'#849aa1',.25,.3);
   }else if(block.kind==='building'){
    c.box([block.w,.18,block.d],[block.x,block.h-.09,block.z],world.location==='desert-compound'?'#aa8a64':world.location==='urban-block'?'#697175':'#46594d',.7);
    const front=block.z+block.d/2+.015;
    if(block.id==='hangar'&&world.location==='military-base'){
     c.box([block.w*.76,2.8,.018],[block.x,1.4,front],'#354947');
     for(let y=.25;y<2.8;y+=.32)c.box([block.w*.76,.025,.025],[block.x,y,front+.012],'#809187');
    }else{
     c.box([1.05,2,.018],[block.x,1,front],'#3d5147');
     for(const side of [-1,1]){c.box([1.25,.85,.02],[block.x+side*block.w*.3,1.7,front],'#aabfc0',.25,.35);c.box([.04,.85,.03],[block.x+side*block.w*.3,1.7,front+.015],'#405348');}
    }
    if(world.location==='urban-block')for(let y=3.5;y<block.h-1;y+=1.7)for(const side of [-1,1])c.box([1.2,.9,.025],[block.x+side*block.w*.28,y,front+.02],'#79969c',.25,.3);
    c.label(world.location==='desert-compound'?'COMPOUND':world.location==='market-street'?(block.id==='hangar'?'MARKET':'VILLAGE STORE'):world.location==='urban-block'?'CITY / '+block.id.toUpperCase():block.id==='hangar'?'HANGAR  /  04':block.id==='command'?'OPERATIONS':'BARRACKS',[block.x,block.h-.43,front+.025],block.w*.64,'#e4e6cf','#495e52');
   }else if(block.kind==='crate'&&block.h>.7&&!block.baseY){
    for(const y of [.12,block.h-.12])c.box([block.w+.02,.07,block.d+.02],[block.x,y,block.z],'#655037');
   }
   c.compact();c.group.userData.fade=1;c.group.userData.blockId=block.id;c.group.userData.bounds={x:block.x,z:block.z,r:Math.hypot(block.w,block.d)*.6};this.occluders.push(c.group);this.worldGroup.add(c.group);
  }
  for(const [id,shop,label,color] of [['repair',CITY_SHOPS.repair,'ARA / VEHICLE REPAIR','#d9935d'],['gun',CITY_SHOPS.gun,'ARA / GUN PAWN','#b98ac9']] as const){if(!world.blocks.some(block=>block.id===`shop-${id}-roof`))continue;const facade=new SetBuilder(),side=shop.side;facade.box([9.6,.06,10],[side*24.7,.035,32],id==='repair'?'#726e66':'#555d61');facade.box([.1,.16,4],[shop.front,2.51,32],color);const sign=facade.label(label,[shop.front-side*.09,2.84,32],4.3,'#fff8eb','#243a3d');sign.rotation.y=side<0?Math.PI/2:-Math.PI/2;facade.box([.85,.85,1.1],[side*28.3,.45,35],id==='repair'?'#af7f59':'#4c5966');this.worldGroup.add(facade.group);const material=new T.MeshStandardMaterial({color:id==='repair'?'#9b6e4b':'#5b5064',metalness:.2,roughness:.55}),panel=(z:number)=>{const mesh=new T.Mesh(new T.BoxGeometry(.09,2.35,1.75),material);mesh.position.set(shop.front,1.175,z);mesh.castShadow=true;this.worldGroup.add(mesh);return mesh;};this.shopDoors.push({left:panel(31.1),right:panel(32.9),x:shop.front,z:32,open:0});}
  for(const doorway of world.doors){const material=new T.MeshStandardMaterial({color:world.location==='urban-block'?'#51656d':'#806f58',metalness:.35,roughness:.48});const panel=(side:number)=>{const mesh=new T.Mesh(new T.BoxGeometry(doorway.width/2,2.25,.075),material);mesh.position.set(doorway.x+side*doorway.width/4,1.125,doorway.z+.06);mesh.castShadow=true;mesh.receiveShadow=true;this.worldGroup.add(mesh);return mesh;};this.interiorDoors.push({...doorway,left:panel(-1),right:panel(1),open:0});}
  for(const p of world.blocks.filter(b=>b.id.startsWith('floodlight-')))b.box([.65,.25,.35],[p.x,4,p.z],'#d4d1bc');
  if(world.location==='market-street'){for(const block of world.blocks.filter(b=>b.kind==='building')){b.box([block.w+.2,.12,1.5],[block.x,2.5,block.z+block.d/2+.75],'#a45848');}}
  if(military){
   // Studio military-set palette and architecture, adapted to this collision-verified play area.
   b.box([6,.012,world.bounds.maxZ-setMinZ-.5],[0,.002,(setMinZ+world.bounds.maxZ)/2],'#7c8178');
   b.box([world.bounds.maxX-world.bounds.minX-.5,.012,4],[0,.003,-12],'#7c8178');
   for(let z=setMinZ+2;z<world.bounds.maxZ-1;z+=4)b.box([.12,.014,1.5],[0,.01,z],'#dbddc7');
   if(world.location==='military-base'){const pad=new T.Mesh(new T.RingGeometry(3,3.1,48).rotateX(-Math.PI/2),new T.MeshStandardMaterial({color:'#d9ddc4',roughness:.9}));pad.position.set(15,.014,15);b.group.add(pad);
   for(const x of [14.2,15.8])b.box([.1,.018,2.4],[x,.012,15],'#d9ddc4');b.box([1.6,.018,.1],[15,.012,15],'#d9ddc4');}
   // Towers and background barracks sit beyond the solid perimeter, outside navigable bounds.
   if(world.location==='military-base')for(const x of [world.bounds.minX-2,world.bounds.maxX+2])for(const z of [setMinZ-1,world.bounds.maxZ-1]){
    for(const dx of [-1,1])for(const dz of [-1,1])b.box([.16,5,.16],[x+dx,2.5,z+dz],'#4d5d50');
    b.box([2.8,.18,2.8],[x,4.9,z],'#495e52');b.box([2.6,1.5,2.6],[x,5.7,z],'#7d8975');
    b.box([2.3,.65,.03],[x,5.9,z+1.32],'#a2b7b4',.25,.3);b.box([3.2,.2,3.2],[x,6.6,z],'#495e52');
   }
   for(const x of [-34,34])for(const [i,z]of [-22,3,28].entries()){const h=world.location==='urban-block'?10+i*4:world.location==='market-street'?4.5:3.6,color=world.location==='urban-block'?'#7e8b91':world.location==='desert-compound'?'#b69a72':'#a29478';b.box([9,h,10],[x,h/2,z],color);b.box([9.5,.2,10.5],[x,h+.1,z],world.location==='military-base'?'#5a685d':'#8c8b7b');if(world.location==='urban-block')for(let y=2;y<h-1;y+=2)for(const dx of [-2,0,2])b.box([1.1,1.1,.04],[x+dx,y,z+5.03],'#516b78');if(world.location==='desert-compound')b.palm(x+(x>0?-6:6),z+5,5+i);if(world.location==='market-street')b.tree(x+(x>0?-6:6),z+5,4+i);}
   b.label(world.location==='market-street'?'MARKET / CHECKPOINT':world.location==='urban-block'?'CITY / CHECKPOINT':world.location==='desert-compound'?'COMPOUND / EXIT':'CHECKPOINT  /  STOP',[world.gate.x,world.gateClearance+.5,world.gate.z],3.7,'#e4e6cf','#495e52');
  }else{
   for(let z=-3;z<14;z+=3)b.box([.12,.012,1.5],[0,.005,z],'#d9c691');
   for(const x of [-12,12]){b.box([.12,.015,11],[x,.008,8],'#c2c6b9');b.box([2.4,.015,.12],[x,.008,13.4],'#c2c6b9');}
   for(let i=0;i<11;i++){const x=-35+i*7,h=5+(i%4)*2;b.box([5,h,5],[x,h/2,Math.min(-28,world.bounds.minZ-10)],'#75878c');}
   b.label('AUTHORIZED EXIT',[world.gate.x,world.gateClearance+.5,world.gate.z],3.7,'#e7e4d3','#344c4f');
  }
  if(world.getaway?.course){const start=world.getaway.course.startZ,end=world.bounds.minZ;b.box([world.bounds.maxX*2-.5,.02,start-end],[0,.025,(start+end)/2],'#737e79');for(let z=start-2;z>end+2;z-=6)b.box([.12,.015,2],[0,.045,z],'#e1d8ae');for(const x of [-world.bounds.maxX+1,world.bounds.maxX-1])b.box([.12,.015,start-end],[x,.045,(start+end)/2],'#c5cbb6');}
  this.cargo=new T.Group();if(world.cargo){const c=new SetBuilder(),p=world.cargo.position;
   if(world.cargo.kind==='briefcase'){c.box([.5,.3,.16],[p.x,.97,p.z],'#3f4e49',.45,.3);for(const x of [-.14,.14])c.box([.035,.06,.02],[p.x+x,.99,p.z+.09],'#c6c7ae',.25,.6);for(const x of [-.09,.09])c.box([.025,.09,.03],[p.x+x,1.16,p.z],'#bdbea5',.3,.6);c.box([.2,.025,.03],[p.x,1.2,p.z],'#bdbea5');}
   else{c.box([.48,.36,.36],[p.x,.99,p.z],'#b18e61');c.box([.065,.365,.365],[p.x,.99,p.z],'#e1c99b');c.box([.2,.07,.012],[p.x+.09,1.01,p.z+.19],'#e7e2d1');}
   c.compact();this.cargo=c.group;this.worldGroup.add(this.cargo);
  }
  if(world.story==='rescue')b.label('HOLDING AREA',[world.rescue.captive.x,1.9,setMinZ+.24],3.3,'#dbf7ff','#304e57');
  else if(world.story==='escape')b.label('KEY CONTROL',[world.key.x,1.9,world.gate.z+.24],4,'#e8e4cb','#455658');
  b.box([world.gateWidth+.6,.3,.5],[world.gate.x,world.gateClearance+.15,world.gate.z],'#344c4f');if(world.getaway)for(const side of [-1,1])b.box([.2,world.gateClearance+.3,.3],[world.gate.x+side*(world.gateWidth/2+.17),(world.gateClearance+.3)/2,world.gate.z],'#344c4f');
  b.compact();this.worldGroup.add(b.group);
  if(world.helipad){const pad=world.helipad;b.box([9,.018,11],[pad.x,.012,pad.z],'#6e7e76');b.label('H',[pad.x,.03,pad.z],3,'#d6e5c4','#6e7e76');}
  const sign=new SetBuilder();sign.label(world.hub?'NEXT MISSION':'EXTRACTION',[world.exit.x,2.1,world.exit.z-1.8],3,'#c7ffe8','#276354');this.worldGroup.add(sign.group);this.scene.add(this.worldGroup);this.worldGroup.updateMatrixWorld(true);
 }
 configurePickup(actor:GameActor,game:EscapeGame,companion?:GameActor){
  if(game.air){if(!this.air||this.air.hero!==actor||this.air.companion!==companion){this.air?.dispose();this.air=new AirView(actor,companion);this.scene.add(this.air.group);}game.configureAir(this.air.fit);}else{this.air?.dispose();this.air=undefined;}
  if(game.mission.overwatch){if(!this.overwatch||this.overwatch.hero!==actor){this.overwatch?.dispose();this.overwatch=new AirView(actor,undefined,true);this.scene.add(this.overwatch.group);}}else{this.overwatch?.dispose();this.overwatch=undefined;}

  if(!game.assaultCarEnabled){this.pursuitView?.dispose();this.pursuitView=undefined;}
  if(!game.car){this.pickup?.dispose();this.pickup=undefined;return;}
  if(!this.pickup||this.pickup.actor!==actor||this.pickup.passengerActor!==companion||this.pickup.settings.color!==game.vehicleSettings.color||this.pickup.settings.model!==game.vehicleSettings.model||this.pickup.passengerRadius!==(game.companion?.radius??game.player.radius)){this.pickup?.dispose();this.pickup=new DrivingView(actor,game.vehicleSettings,game.player.radius,game.companion?.radius);this.scene.add(this.pickup.vehicle.group);}
  game.configureCar(this.pickup.fit);if(companion){this.pickup.configurePassenger(companion,game.car!);game.configureCar(this.pickup.fit);}
 }
 /** Pixels per CSS pixel, capped for speed; recordings raise the cap through `window.araPixelRatioCap`. */
 private pixelRatio(){return Math.min(devicePixelRatio,(window as {araPixelRatioCap?:number}).araPixelRatioCap??1.25);}
 private resize(){const r=this.canvas.getBoundingClientRect(),ratio=this.pixelRatio();if(!r.width||!r.height||r.width===this.size.w&&r.height===this.size.h&&ratio===this.renderer.getPixelRatio())return;this.size={w:r.width,h:r.height};this.renderer.setPixelRatio(ratio);this.renderer.setSize(r.width,r.height,false);}
 configurePursuit(actor:GameActor,game:EscapeGame){if(!game.assaultCarEnabled)return;const police=game.hub&&game.city.police;if(!this.pursuitView||this.pursuitActor!==actor||(this.pursuitView.settings.model==='saloon')!==police){this.pursuitView?.dispose();this.pursuitActor=actor;this.beacons=undefined;this.pursuitView=police?new DrivingView(actor,{model:'saloon',color:'#f1f1ec',pace:'standard'},.38,.38,{livery:'police',accentColor:'#16181b'}):new DrivingView(actor,{color:'#6b5349',pace:'standard'},.38);this.scene.add(this.pursuitView.vehicle.group);}game.configurePursuit(this.pursuitView.fit);}
 configureRace(actor:GameActor,game:EscapeGame){this.raceView?.dispose();this.raceActor?.dispose();this.raceView=undefined;this.raceActor=undefined;if(!game.sideQuests.some(q=>q.id==='street-race'))return;const rival=actor.clone(),view=new DrivingView(rival,{model:'sports_car',color:'#a83d38',pace:'relaxed'},.38);try{game.configureRace(view.fit);}catch(error){view.dispose();rival.dispose();throw error;}this.raceActor=rival;this.raceView=view;this.scene.add(view.vehicle.group);}
 configureHubPedestrians(actors:GameActor[]){for(const actor of this.hubPeople)actor.render.group.removeFromParent();this.hubPeople=actors;for(const actor of actors){actor.render.group.rotation.z=0;this.scene.add(actor.render.group);}}
 configureHubFleet(actor:GameActor,game:EscapeGame){
  if(!game.hub){for(const view of this.hubFleetViews.values())view.dispose();this.hubFleetViews.clear();this.hubFleetVersion=-1;this.traffic?.dispose();this.traffic=undefined;this.trafficGame=undefined;return;}
  let initial:DrivingView[]|undefined;
  if(!game.hubFleet.length&&this.hubFleetVersion<0){const models=['sports_car','danfo','suv','keke','motorcycle','saloon','pickup','van','scooter','muscle','truck','bus','quad']as const,colors=['#a83d38','#536268','#c79239','#506d79','#b7a76f','#356e5c'];const specs=Array.from({length:game.city.traffic},(_,i)=>({model:models[i%models.length],color:colors[(i*3+Math.floor(i/4))%colors.length]}));initial=specs.map(item=>new DrivingView(actor,{...item,pace:'standard'},game.player.radius));try{game.configureHubFleet(specs.map((item,i)=>({...item,fit:initial![i].fit})));}catch(error){initial.forEach(view=>view.dispose());throw error;}}
  const next=new Map<string,DrivingView>();for(const [i,slot]of game.hubFleet.entries()){const view=this.hubFleetViews.get(slot.id)??initial?.[i]??new DrivingView(actor,{model:slot.model,color:slot.color,pace:'standard'},game.player.radius);next.set(slot.id,view);if(!view.vehicle.group.parent)this.scene.add(view.vehicle.group);}for(const [id,view]of this.hubFleetViews)if(!next.has(id))view.dispose();this.hubFleetViews=next;this.hubFleetVersion=game.hubFleetVersion;
  // Moving traffic is measured once per district visit, after the parked cars that its streets must avoid.
  if(this.trafficGame!==game){this.trafficGame=game;if(this.traffic&&this.traffic.actor!==actor){this.traffic.dispose();this.traffic=undefined;}
   if(game.city.movingTraffic>0){this.traffic??=new TrafficView(actor,game.player.radius);game.configureTraffic(this.traffic.specs(game.city.movingTraffic));this.traffic.paveRoads(game.trafficPaths);this.scene.add(this.traffic.group);}else{this.traffic?.dispose();this.traffic=undefined;game.configureTraffic([]);}}
 }
 configureCamera(settings:CameraSettings,game:EscapeGame){this.views.configure(settings,game.player);this.positionCamera(game,0);}
 setView(view:CameraView,game:EscapeGame){const changed=this.views.setView(view,game.player);this.positionCamera(game,0);return changed;}
 cycleView(game:EscapeGame,direction=1){const changed=this.views.cycle(game.player,direction);this.positionCamera(game,0);return changed;}
 rotate(horizontal:number,vertical=0){this.views.rotate(horizontal,vertical);}
 dolly(delta:number){this.views.dolly(delta);}
 resetCamera(game:EscapeGame){this.views.reset(game.player);this.positionCamera(game,0);}
 private positionCamera(game:EscapeGame,dt:number){this.views.update(game.player,dt,this.size.w/Math.max(1,this.size.h),this.size.h,game.vehicleBusy?game.car:undefined);}
 projectPoint(p:Point3){const v=new T.Vector3(p.x,p.y,p.z).project(this.camera);return {x:(v.x+1)*this.size.w/2,y:(1-v.y)*this.size.h/2,visible:v.z<1&&v.z>-1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1};}
 pickGrenade(point:{x:number;y:number},game:EscapeGame):Point3 {
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(point.x,point.y),this.camera);
  let hit=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),new T.Vector3()),distance=hit?hit.distanceTo(ray.ray.origin):Infinity;
  for(const v of solidVolumes(game.world,game.door)){const p=ray.ray.intersectBox(new T.Box3(new T.Vector3(v.minX,v.baseY??0,v.minZ),new T.Vector3(v.maxX,v.h,v.maxZ)),new T.Vector3());if(p&&p.distanceTo(ray.ray.origin)<distance){hit=p;distance=p.distanceTo(ray.ray.origin);}}
  return hit?{x:hit.x,y:hit.y,z:hit.z}:{x:game.player.x-Math.sin(this.azimuth)*8,y:0,z:game.player.z-Math.cos(this.azimuth)*8};
 }
 pickAim(point:{x:number;y:number},game:EscapeGame):Point3&{id?:string}{
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(point.x,point.y),this.camera);let best:{distance:number;id:string;point:Point3}|undefined;
  for(const e of game.enemies){if(e.combat.health<=0)continue;const box=new T.Box3(new T.Vector3(e.x-e.radius-.12,e.y,e.z-e.radius-.12),new T.Vector3(e.x+e.radius+.12,e.y+e.height,e.z+e.radius+.12)),hit=ray.ray.intersectBox(box,new T.Vector3());if(hit){const distance=hit.distanceTo(ray.ray.origin);if(!best||distance<best.distance)best={distance,id:e.id,point:chest(e)};}}
  if(best)return {...best.point,id:best.id};
  const hit=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-chest(game.player).y),new T.Vector3());
  return hit?{x:hit.x,y:hit.y,z:hit.z}:this.forwardAim(game);
 }
 forwardAim(game:EscapeGame):Point3{return {x:game.player.x-Math.sin(this.azimuth)*15,y:chest(game.player).y,z:game.player.z-Math.cos(this.azimuth)*15};}
 autoAim(game:EscapeGame,preferred?:string):Point3&{id?:string}{
  const targets=game.shotTargets(),volumes=game.combatVolumes;
  const candidates=targets.filter(t=>t.id!=='companion'&&t.alive&&Math.hypot(t.body.x-game.player.x,t.body.z-game.player.z)<24&&this.projectPoint(chest(t.body)).visible&&traceShot(game.player,chest(t.body),volumes,targets).hit===t.id).sort((a,b)=>(a.id===preferred?-1000:0)-(b.id===preferred?-1000:0)+Math.hypot(a.body.x-game.player.x,a.body.z-game.player.z)-Math.hypot(b.body.x-game.player.x,b.body.z-game.player.z));
  return candidates.length?{...chest(candidates[0].body),id:candidates[0].id}:this.forwardAim(game);
 }
 render(game:EscapeGame,dt:number,paused=false){
  this.setWorld(game.world);if(game.hub&&this.hubFleetVersion!==game.hubFleetVersion&&this.pickup){this.configurePickup(this.pickup.actor,game);this.configureHubFleet(this.pickup.actor,game);}for(const door of this.interiorDoors){const near=Math.hypot(game.player.x-door.x,game.player.z-door.z)<3.3;door.open+=(Number(near)-door.open)*Math.min(1,dt*5);const slide=door.open*door.width*.52;door.left.position.x=door.x-door.width/4-slide;door.right.position.x=door.x+door.width/4+slide;}for(const door of this.shopDoors){const near=Math.hypot(game.player.x-door.x,game.player.z-door.z)<5.2||!!game.car&&Math.hypot(game.car.x-door.x,game.car.z-door.z)<6;door.open+=(Number(near)-door.open)*Math.min(1,dt*5);door.left.position.z=31.1-door.open*1.8;door.right.position.z=32.9+door.open*1.8;}this.key.position.x=game.world.key.x;this.key.position.z=game.world.key.z;this.marker.position.set(game.world.key.x,.018,game.world.key.z);this.exit.position.set(game.world.helipad?.x??game.world.exit.x,.025,game.world.helipad?.z??game.world.exit.z);
  this.door.scale.x=game.world.gateWidth/2.9;this.door.position.set(game.world.gate.x-game.world.gateWidth/2,0,game.world.gate.z);this.door.rotation.y=game.door*Math.PI/2;this.key.visible=(game.mission.story==='escape'||game.mission.story==='getaway')&&!game.hasKey;this.marker.visible=this.key.visible||!!game.currentStep;if(game.currentStep)this.marker.position.set(game.currentStep.position.x,.025,game.currentStep.position.z);
  this.defendZone.visible=game.currentStep?.step.type==='defend';if(this.defendZone.visible)this.defendZone.position.set(game.currentStep!.position.x,.019,game.currentStep!.position.z);
  const side=game.sideQuestMarker;this.questMarker.visible=!!side;if(side)this.questMarker.position.set(side.point.x,.03,side.point.z);
  this.repairMarker.visible=game.hub&&game.city.repairShop;this.gunShopMarker.visible=game.hub&&game.city.gunShop;
  this.key.rotation.y=game.time*1.1;this.key.position.y=1.2+Math.sin(game.time*2)*.09;
  const delivery=game.sideQuests.find(q=>q.id==='delivery');this.parcel.visible=delivery?.status==='available';if(delivery?.status==='available'){this.parcel.position.set(delivery.start.x,.2,delivery.start.z);this.parcel.rotation.y=0;}
  this.exit.visible=game.mission.story==='clear'||(game.companion?game.companion.rescued:game.hasKey);(this.exit.material as T.MeshBasicMaterial).color.set(game.hub&&game.hubHeat?'#c8b08a':game.extractionReady?'#57d7b1':'#a5ac9b');(this.exit.material as T.MeshBasicMaterial).opacity=.45+Math.sin(game.time*2)*.2;
  this.companionRing.visible=game.car?!game.vehicleBusy:!!game.companion&&game.companion.combat.health>0;this.companionRing.scale.setScalar(game.car?3:1);if(game.car)this.companionRing.position.set(game.car.x,.022,game.car.z);if(game.companion&&!game.car)this.companionRing.position.set(game.companion.x,.022,game.companion.z);
  if(game.car&&this.pickup){this.pickup.feel.headlights=headlightLevel(game.mission.environment?.time);this.pickup.update(game.car,this.pickup.actor.vehicleFrame,game.companion);}this.smoke.visible=!!game.car&&game.car.health!==undefined&&game.car.health<60;if(this.smoke.visible&&game.car){const hood=carPoint(game.car,{x:0,z:game.car.fit.box.maxZ*.5});this.smoke.position.set(hood.x,game.car.fit.height*.8,hood.z);for(let i=0;i<this.smoke.children.length;i++){const cloud=this.smoke.children[i]as T.Mesh,p=(game.time*.55+i/this.smoke.children.length)%1;cloud.position.set(Math.sin(game.time*1.2+i*2)*.26,p*1.8,Math.cos(game.time+i)*.2);cloud.scale.setScalar(.45+p*.9);(cloud.material as T.MeshBasicMaterial).opacity=(1-p)*(.16+(60-game.car.health!)/180);}}this.exit.scale.setScalar(game.car?pickupExtractionRadius(game.car.fit)/1.5:1);
  this.cargo.visible=!!game.world.cargo&&!game.hasCargo;this.roadMarker.visible=!!game.routeTarget;if(game.routeTarget)this.roadMarker.position.set(game.routeTarget.x,.065,game.routeTarget.z);const lightZ=game.world.getaway?.course?game.player.z:0,lightX=game.world.getaway?.course?game.player.x:0;this.sun.position.set(lightX-12,22,lightZ+10);this.sun.target.position.set(lightX,0,lightZ);this.sun.target.updateMatrixWorld(true);
  if(this.pursuitView){this.pursuitView.vehicle.group.visible=game.pursuitActive;if(game.pursuitActive){this.pursuitView.update(game.pursuit!.car,this.pursuitActor?.vehicleFrame);
   // Police beacons alternate red and blue.
   if(this.pursuitView.settings.model==='saloon'){if(!this.beacons){const found=new Set<T.MeshStandardMaterial>();this.pursuitView.vehicle.group.traverse(o=>{const m=(o as T.Mesh).material as T.MeshStandardMaterial|undefined;if(m?.name?.startsWith('Vehicle beacon'))found.add(m);});this.beacons=[...found];}const on=Math.floor(game.time*5)%2;for(const m of this.beacons)m.emissiveIntensity=(m.name.endsWith('red')?on:1-on)?3:.15;}}}
  if(this.traffic&&game.hub)this.traffic.update(game.traffic,this.camera,headlightLevel(game.mission.environment?.time));if(this.raceView&&this.raceActor&&game.raceCar){this.raceView.vehicle.group.visible=game.raceActive;if(game.raceActive){const car=game.raceCar.car,body={...game.player,x:car.x,z:car.z,yaw:car.yaw,speed:0};this.raceActor.update(body,paused?0:dt,game.time,undefined,false,undefined,undefined,undefined,car);this.raceView.update(car,this.raceActor.vehicleFrame);}}for(const slot of game.hubFleet)this.hubFleetViews.get(slot.id)?.update(slot.car);if(game.hub){const solids=this.hubPedSolids!;for(const [i,person]of this.hubPeople.entries()){const state=game.pedestrians[i],pace=state?.aggro?state.speed:game.hubHeat?1.8:1.05,{x,z,yaw}=game.pedestrianPosition(i),near=Math.hypot(x-game.player.x,z-game.player.z)<52,clear=!blocked({x,z},.55,solids);const foughtAt=game.pedestrianFoughtAt.get(i),down=foughtAt!==undefined;person.render.group.visible=near&&clear&&(!down||game.time-foughtAt<12);if(near&&clear&&!down)person.update({...game.player,x,z,y:0,vy:0,height:person.render.height,animationScale:person.render.scale,grounded:true,airTime:0,landing:0,yaw,speed:pace,crouch:0},paused?0:dt,game.time,undefined,false,undefined,state?.aggro?state.combat:undefined);person.render.group.rotation.z=down?-Math.min(1,(game.time-foughtAt)*3)*Math.PI/2:0;}}this.air?.update(game);if(this.overwatch)this.overwatch.group.visible=!game.hub||game.hubHeat>=3;this.overwatch?.update(game);this.atmosphere.update(game,this.sun,this.scene);this.positionCamera(game,paused?0:dt);this.supplies.update(game,this.camera);this.combat.update(game,paused?0:dt);this.grenades.update(game,paused?0:dt);this.fadeObstructions(game,dt);this.renderer.render(this.scene,this.camera);
 }
 private fadeObstructions(game:EscapeGame,dt:number){
  const target=new T.Vector3(game.player.x,game.player.y+.25,game.player.z),direction=target.clone().sub(this.camera.position),distance=direction.length();this.ray.set(this.camera.position,direction.normalize());this.ray.far=distance-.15;const hit=new Set<T.Object3D>();
  const dx=target.x-this.camera.position.x,dz=target.z-this.camera.position.z,span=dx*dx+dz*dz;const nearby=this.occluders.filter(group=>{const b=group.userData.bounds as {x:number;z:number;r:number}|undefined;if(!b)return true;const t=span?Math.max(0,Math.min(1,((b.x-this.camera.position.x)*dx+(b.z-this.camera.position.z)*dz)/span)):0;return Math.hypot(b.x-this.camera.position.x-dx*t,b.z-this.camera.position.z-dz*t)<b.r+1;});
  for(const intersection of this.ray.intersectObjects(nearby,true)){let object=intersection.object;while(object.parent&&object.parent!==this.worldGroup)object=object.parent;hit.add(object);}
  for(const group of this.occluders){const goal=hit.has(group)?.18:1,old=Number(group.userData.fade);if(Math.abs(goal-old)<.006)continue;const opacity=old+(goal-old)*(1-Math.exp(-dt*12));group.userData.fade=opacity;group.traverse(o=>{if(o instanceof T.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material]){const transparent=opacity<.99;if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}material.opacity=opacity;material.depthWrite=!transparent;}});}
 }
 map(canvas:HTMLCanvasElement,game:EscapeGame){
  const original=game.world.bounds,WORLD=game.hub?{minX:game.player.x-48,maxX:game.player.x+48,minZ:game.player.z-48,maxZ:game.player.z+48}:game.world.getaway?.course?{...original,minZ:Math.max(original.minZ,game.player.z-35),maxZ:Math.min(original.maxZ,game.player.z+35)}:original,g=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,sx=w/(WORLD.maxX-WORLD.minX),sz=h/(WORLD.maxZ-WORLD.minZ),x=(n:number)=>(n-WORLD.minX)*sx,z=(n:number)=>(n-WORLD.minZ)*sz;
  g.clearRect(0,0,w,h);g.fillStyle='#172b32';g.fillRect(0,0,w,h);g.fillStyle='#687b7c';for(const b of game.world.blocks)g.fillRect(x(b.x-b.w/2),z(b.z-b.d/2),b.w*sx,b.d*sz);
  g.strokeStyle=game.opening?'#74dfba':'#e6b262';g.lineWidth=3;g.beginPath();const gate=game.world.gate;g.moveTo(x(gate.x-game.world.gateWidth/2),z(gate.z));g.lineTo(x(gate.x-game.world.gateWidth/2+game.world.gateWidth*Math.cos(game.door*Math.PI/2)),z(gate.z-game.world.gateWidth*Math.sin(game.door*Math.PI/2)));g.stroke();
  const dot=(p:{x:number;z:number},color:string,r:number)=>{g.fillStyle=color;g.beginPath();g.arc(Math.max(r,Math.min(w-r,x(p.x))),Math.max(r,Math.min(h-r,z(p.z))),r,0,Math.PI*2);g.fill();};
  if(game.currentStep)dot(game.currentStep.position,'#f0ca70',4);
  for(const job of game.sideQuests){if(job.status==='available')dot(job.start,'#82e0dc',4);else if(job.status==='active')dot(job.id==='bounty'?(job.index?job.start:game.bountyTarget):job.checkpoints[job.index],'#82e0dc',5);}
  if(game.raceActive&&game.raceCar)dot(game.raceCar.car,'#e77263',5);if(game.hub)for(const slot of game.hubFleet)dot(slot.car,'#8db6cf',4);if(game.hub)for(const car of game.traffic)dot(car,'#c9c4b8',3);
  if(game.hub&&game.city.repairShop)dot(game.repairShop,'#e8a66f',4);if(game.hub&&game.city.gunShop)dot(game.gunShop,'#d5aeec',4);
  if(game.world.cargo&&!game.hasCargo)dotCargo();
  function dotCargo(){g.fillStyle='#d3a8e2';g.fillRect(x(game.world.cargo!.position.x)-3,z(game.world.cargo!.position.z)-3,6,6);}
  if(game.routeTarget){g.strokeStyle='#e3c66e';g.lineWidth=2;g.beginPath();g.arc(x(game.routeTarget.x),Math.max(7,Math.min(h-7,z(game.routeTarget.z))),5,0,Math.PI*2);g.stroke();}
  if(game.checkpoint){g.strokeStyle='#91d5f0';g.lineWidth=2;g.beginPath();g.arc(x(game.checkpoint.spawn.x),z(game.checkpoint.spawn.z),6,0,Math.PI*2);g.stroke();}
  if((game.mission.story==='escape'||game.mission.story==='getaway')&&!game.hasKey)dot(game.world.key,'#e9bf62',3);dot(game.world.helipad??game.world.exit,game.extractionReady?'#74dfba':'#738086',4);for(const enemy of game.enemies)dot(enemy,enemy.combat.health<=0?'#738086':enemy.mode==='chase'?'#ff8770':'#e2a76a',enemy.combat.health<=0?2:4);
  for(const p of game.pickups)if(!game.collected.has(p.id))dot(p,p.kind==='health'?'#e0f2c8':p.kind==='ammo'?'#c9ae67':'#edf4f1',2.5);
  if(game.companion){const c=game.companion;dot(c,c.combat.health>0?'#87d8ed':'#738086',5);g.fillStyle='#173842';g.font='bold 7px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('C',x(c.x),z(c.z));}
  if(game.car)dot(game.car,'#87d8ed',5);
  dot(game.player,'#f7f5e6',4);
 }
}
