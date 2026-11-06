/** Node-only canvas stub: paint is skipped, while every real geometry recipe still runs. */
import {writeFileSync,readFileSync} from 'node:fs';
import {createSet,disposeSet} from '../src/studio/sets';
import {SETS} from '../src/studio/catalog';
import {measureLocation} from './studio-map-geometry';
import {populateStaging} from '../src/studio/spatial-map-routes';
import type {VehicleEnvelope} from '../src/studio/spatial-types';
import {nodeLibrary} from './node-assets';
import {buildHuman} from '../src/core/human';
import {DEFAULT_PARAMS} from '../src/core/params';
import {Animator} from '../src/core/anim/evaluate';
import {clipById} from '../src/core/anim/clips';
import {Vehicle} from '../src/core/props/vehicle';
import {VEHICLE_IDS,VEHICLE_CLIP,DEFAULT_VEHICLE_STYLE} from '../src/core/props/vehicles';
const noop=()=>{},context=new Proxy({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:()=>({width:100})},{get:(target,key)=>Reflect.get(target,key)??noop});
Object.assign(globalThis,{document:{createElement:()=>({width:1,height:1,getContext:()=>context})}});
const lib=await nodeLibrary(),human=await buildHuman(lib,{...DEFAULT_PARAMS,detail:'low',rig:'game',outfit:'none',hair:'none',faceShapes:false}),animator=new Animator(human.rig!),envelopes:Record<string,VehicleEnvelope>={};
for(const id of VEHICLE_IDS){const ride=new Vehicle(id,human.rig!,animator,clipById.get(VEHICLE_CLIP[id])!,DEFAULT_VEHICLE_STYLE),box=ride.bounds;
 // Include the complete animated prop envelope, including paddles and rotor clearance.
 for(let i=0;i<=24;i++){ride.update(ride.clip.duration*i/24);box.union(ride.bounds);}const s=ride.fit.scale;
 envelopes[id]={bounds:[box.min.x/s,box.min.z/s,box.max.x/s,box.max.z/s].map(n=>Math.round(n*1000)/1000)as VehicleEnvelope['bounds'],bottom:box.min.y/s,top:box.max.y/s};ride.dispose();}
const maps=SETS.map(s=>{const set=createSet(s.id,{compact:false});try{const map=measureLocation(s.id,set);populateStaging(map,envelopes);return map;}finally{disposeSet(set.group);}});
const output=JSON.stringify({kind:'ara-studio-location-maps',version:1,coordinates:{units:'metres',rect:'[minX,minZ,maxX,maxZ]',yaw:'degrees; 0=+Z, 90=+X, 180=-Z, -90=-X',referenceScale:1},vehicleEnvelopes:envelopes,locations:maps},(_key,value)=>typeof value==='number'?Math.round(value*1000)/1000:value)+'\n';
const file=new URL('../src/studio/location-maps.generated.json',import.meta.url);
if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==output)throw Error('Location maps are stale. Run npm run build:studio-maps.');}else writeFileSync(file,output);
console.log(`${maps.length} location maps measured; ${output.length.toLocaleString()} bytes; ${maps.reduce((n,m)=>n+m.routes.length,0)} verified routes.`);
