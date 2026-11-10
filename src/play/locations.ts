/** Location contracts: art, collision, navigation and automatic staging share these measurements. */
import {BLOCKS,START,KEY,EXIT,PATROL,WORLD,type Block,type Point,type Rect} from './world';
export const LOCATIONS=[{id:'depot',name:'Freight depot',description:'Cargo lanes, climbable freight and a central security gate.'},{id:'military-base',name:'Military base',description:'Barracks, a hangar, perimeter towers and an open training yard.'},{id:'desert-compound',name:'Desert compound',description:'Sun-baked walls, adobe roofs and a guarded courtyard.'},{id:'market-street',name:'Market street',description:'A village market with shuttered shops, stalls and roof lookouts.'},{id:'urban-block',name:'Urban block',description:'Concrete apartments, shop fronts and a secured city intersection.'}]as const;
export type LocationId=typeof LOCATIONS[number]['id'];
export interface LocationDefinition {
 id:LocationId;name:string;bounds:Rect;gate:Point;blocks:Block[];starts:Point[];keys:Point[];exits:Point[];
 patrol:Point[];guards:Point[];enemySpawns:Point[];captives:Point[];supplyRows:number[];supplyLanes:number[];
}
const traversal:Block[]=[
 {id:'yard-step-1',x:-12,z:8,w:1.4,d:1.5,h:.22,kind:'crate',color:'#8a9286'},
 {id:'yard-step-2',x:-12,z:6.5,w:1.4,d:1.5,h:.44,kind:'crate',color:'#8a9286'},
 {id:'yard-step-3',x:-12,z:5,w:1.4,d:1.5,h:.66,kind:'crate',color:'#8a9286'},
 {id:'vault-rail',x:0,z:8,w:2.8,d:.35,h:.85,kind:'crate',color:'#977653'},
 {id:'roof-crate',x:-7.45,z:4,w:1.5,d:2,h:1.3,kind:'crate',color:'#977653'},
];
const military:Block[]=[
 {id:'west',x:-22,z:-2,w:.4,d:48,h:2.6,kind:'wall',color:'#687461'},
 {id:'east',x:22,z:-2,w:.4,d:48,h:2.6,kind:'wall',color:'#687461'},
 {id:'north',x:0,z:-26,w:44,d:.4,h:2.6,kind:'wall',color:'#687461'},
 {id:'south',x:0,z:22,w:44,d:.4,h:1.6,kind:'wall',color:'#687461'},
 {id:'partition-west',x:-11.725,z:-5,w:20.55,d:.4,h:2.3,kind:'wall',color:'#778170'},
 {id:'partition-east',x:11.725,z:-5,w:20.55,d:.4,h:2.3,kind:'wall',color:'#778170'},
 {id:'hangar',x:-13,z:7,w:8,d:8,h:3.6,kind:'building',color:'#7b8878'},
 {id:'barracks',x:10,z:6,w:7,d:8,h:3.2,kind:'building',color:'#8b9179'},
 {id:'command',x:10,z:-18,w:6,d:6,h:3.2,kind:'building',color:'#697c6d'},
 {id:'ammo-store',x:-7,z:-17,w:4,d:4,h:1.3,kind:'crate',color:'#657161'},
 {id:'training-cover',x:-5,z:0,w:2.8,d:.5,h:.9,kind:'crate',color:'#a6a18a'},
 {id:'patrol-cover',x:8,z:-10,w:3,d:.55,h:1.1,kind:'crate',color:'#a6a18a'},
 {id:'crates-01',x:-18,z:-11,w:2,d:2,h:1.2,kind:'crate',color:'#657161'},
 {id:'crates-02',x:3,z:11,w:2,d:2,h:1.2,kind:'crate',color:'#657161'},
 {id:'training-step',x:-7,z:7,w:1.5,d:1.5,h:.3,kind:'crate',color:'#8a9286'},
 {id:'training-platform',x:-5,z:7,w:1.5,d:2,h:1.1,kind:'crate',color:'#657161'},
];
/** Alternate layouts retain verified access lanes, while their footprints and cover differ. */
function district(id:LocationId):Block[]{
 const palette=id==='desert-compound'?['#c9ad7b','#ad8158','#916b49']:id==='market-street'?['#b7a184','#a58065','#657d70']:['#9b9f9e','#6b797e','#555f65'];
 return military.map(b=>({...b,color:palette[b.kind==='wall'?0:b.kind==='building'?1:2],...(b.id==='hangar'?{w:id==='urban-block'?9:7,h:id==='urban-block'?7:3.8}:{}),...(b.id==='barracks'?{w:6,h:id==='urban-block'?8:3.4}:{}),...(b.id==='command'?{w:5,h:id==='urban-block'?6:3.2}:{}),...(b.id==='training-cover'?{w:id==='market-street'?4:2.8,h:id==='market-street'?1.4:.9}:{}),...(b.id==='patrol-cover'?{w:id==='desert-compound'?4:3,h:id==='urban-block'?1.4:1.1}:{})}));
}
export function locationDefinition(id:LocationId='depot'):LocationDefinition {
 if(!LOCATIONS.some(l=>l.id===id))throw Error('Unsupported game location.');
 if(id!=='depot')return {id,name:LOCATIONS.find(l=>l.id===id)!.name,bounds:{minX:-22,maxX:22,minZ:-26,maxZ:22},gate:{x:0,z:-5},blocks:id==='military-base'?military.map(b=>({...b})):district(id),starts:[{x:-18,z:17},{x:18,z:17},{x:-18,z:17}],keys:[{x:-17,z:-1.5},{x:17,z:-2},{x:-17,z:-3.3}],exits:[{x:18,z:-23},{x:18,z:-23},{x:-18,z:-23}],patrol:[{x:0,z:-11},{x:17,z:-12},{x:1,z:-23},{x:-15,z:-13}],guards:[{x:5,z:-12},{x:17,z:-22},{x:-14,z:-11}],enemySpawns:[{x:17,z:-22},{x:2,z:-24},{x:-17,z:-22},{x:-16,z:-8.5},{x:17,z:-8.5},{x:0,z:-11},{x:-12,z:-20}],captives:[{x:-17,z:-21.5},{x:-17,z:-21.5},{x:17,z:-21.5}],supplyRows:[12,-11,0,-23,18,-2,5],supplyLanes:[-18,18,-3,3,-20,20]};
 return {id:'depot',name:'Freight depot',bounds:{...WORLD},gate:{x:0,z:-6},blocks:[...BLOCKS,...traversal].map(b=>({...b})),starts:[{...START},{x:10,z:11},{...START}],keys:[{...KEY},{x:10,z:-2},{x:-10,z:-3.3}],exits:[{...EXIT},{...EXIT},{x:-10,z:-15}],patrol:PATROL.map(p=>({...p})),guards:[{x:8,z:-9},{x:10,z:-15},{x:-8,z:-9}],enemySpawns:[{x:11,z:-15},{x:2,z:-16},{x:-10,z:-15},{x:-10,z:-8.5},{x:11,z:-8.5},{x:0,z:-10}],captives:[{x:-11,z:-14.5},{x:-11,z:-14.5},{x:11,z:-14.5}],supplyRows:[6,-9,0,-15,12,-3,3],supplyLanes:[-10,10,-2,2,-12,12]};
}

/** Machine-readable art/collision map, in metres. No unverified arbitrary placement. */
export function locationMap(id:LocationId){const l=locationDefinition(id);return {version:1,location:id,units:'metres',axes:{up:'y',forward:'positive z',yaw:'radians; 0 faces +z'},bounds:l.bounds,terrain:{kind:'land',y:0},solids:l.blocks.map(b=>({id:b.id,x:b.x,z:b.z,width:b.w,depth:b.d,height:b.h})),gate:l.gate,heroStarts:l.starts,enemyStarts:l.enemySpawns,captives:l.captives,exits:l.exits,patrol:l.patrol,rule:'All coordinates are actor centres. Validate the entire swept path and radius against solids. Vehicle lanes are staged by the mission; use no custom coordinates.'};}
