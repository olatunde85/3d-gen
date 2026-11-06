/** Shared vehicle identities and real occupant places; no renderer state lives in the project. */
import {VEHICLE_FOR_CLIP,type VehicleId} from '../core/props/vehicles';
import {helicopterHeight} from './helicopter-flight';
import {clipById} from '../core/anim/clips';
import type {ActorTrack,Beat,StudioProject} from './project';
export const VEHICLE_SEATS=['operator','front-passenger','rear-left','rear-right','passenger-left','passenger-right','passenger']as const;
export type VehicleSeat=typeof VEHICLE_SEATS[number];
export const SEAT_LABELS:Record<VehicleSeat,string>={operator:'Driver / rider', 'front-passenger':'Front passenger','rear-left':'Rear left','rear-right':'Rear right','passenger-left':'Passenger left','passenger-right':'Passenger right',passenger:'Passenger'};
export const seatsForVehicle=(id:VehicleId):readonly VehicleSeat[]=>id==='suv'||id==='helicopter'?['operator','front-passenger','rear-left','rear-right']:id==='car'||id==='sports_car'?['operator','front-passenger']:id==='motorboat'?['operator','passenger-left','passenger-right']:['motorcycle','canoe','rowboat'].includes(id)?['operator','passenger']:['operator'];
export const vehicleKey=(actor:ActorTrack,b:Beat)=>b.vehicleId??`${actor.id}-${VEHICLE_FOR_CLIP[b.clip]}`;
export function vehicleCatalog(project:Pick<StudioProject,'actors'>){
 const entries=new Map<string,{id:string;model:VehicleId;actor:ActorTrack;beat:Beat;index:number}>();
 for(const actor of project.actors)actor.beats.forEach((beat,index)=>{const model=VEHICLE_FOR_CLIP[beat.clip];if(!model||(beat.vehicleSeat??'operator')!=='operator')return;const id=vehicleKey(actor,beat);if(!entries.has(id))entries.set(id,{id,model,actor,beat,index});});
 return entries;
}
/** A linked change applies to the complete contiguous entry/ride/exit sequence. */
export function assignVehicle(project:StudioProject,actorId:string,index:number,id:string|undefined,seat:VehicleSeat='operator'){
 const actor=project.actors.find(a=>a.id===actorId)!,model=VEHICLE_FOR_CLIP[actor.beats[index].clip];
 let first=index,last=index;while(first>0&&VEHICLE_FOR_CLIP[actor.beats[first-1].clip]===model)first--;while(last<actor.beats.length-1&&VEHICLE_FOR_CLIP[actor.beats[last+1].clip]===model)last++;
 for(let i=first;i<=last;i++){const beat=actor.beats[i];if(id){beat.vehicleId=id;beat.vehicleSeat=seat;}else{delete beat.vehicleId;delete beat.vehicleSeat;}if(seat!=='operator'){beat.move=false;delete beat.travelSpeed;delete beat.flightHeight;}}
}
export function availableVehicleSeats(project:StudioProject,actorId:string,index:number,id:string){
 const source=vehicleCatalog(project).get(id),actor=project.actors.find(a=>a.id===actorId)!;if(!source)return [];
 const model=VEHICLE_FOR_CLIP[actor.beats[index].clip];let first=index,last=index;while(first>0&&VEHICLE_FOR_CLIP[actor.beats[first-1].clip]===model)first--;while(last<actor.beats.length-1&&VEHICLE_FOR_CLIP[actor.beats[last+1].clip]===model)last++;
 const start=actor.beats.slice(0,first).reduce((n,b)=>n+b.duration,0),end=actor.beats.slice(0,last+1).reduce((n,b)=>n+b.duration,0);
 return seatsForVehicle(source.model).filter(seat=>seat!=='operator'&&!project.actors.some(other=>{if(other.id===actorId)return false;let t=0;return other.beats.some((b,i)=>{const finish=t+b.duration,held=i===other.beats.length-1&&clipById.get(b.clip)?.vehicleTransition?.direction!=='alight'?60:finish,overlap=VEHICLE_FOR_CLIP[b.clip]&&vehicleKey(other,b)===id&&(b.vehicleSeat??'operator')===seat&&Math.min(end,held)-Math.max(start,t)>1e-6;t=finish;return overlap;});}));
}
export function validateVehicleLinks(project:Pick<StudioProject,'actors'>){
 const vehicles=vehicleCatalog(project),occupied=new Map<string,{actor:string;start:number;end:number}[]>();
 for(const actor of project.actors){let time=0;for(const beat of actor.beats){
  const model=VEHICLE_FOR_CLIP[beat.clip],end=time+beat.duration;
  if(beat.vehicleId!==undefined||beat.vehicleSeat!==undefined){
   if(!model)throw Error('Vehicle links and seats require a vehicle action.');
   const id=vehicleKey(actor,beat),source=vehicles.get(id),seat=beat.vehicleSeat??'operator';
   if(!source)throw Error(`Vehicle ${id} needs an operator track. Choose an existing vehicle or use Driver / rider.`);
   if(source.model!==model)throw Error(`Vehicle ${id} is a ${source.model}; use its matching animations.`);
   if(!seatsForVehicle(model).includes(seat))throw Error(`The ${model} has no ${SEAT_LABELS[seat]} seat.`);
   if(seat==='operator'&&source.actor.id!==actor.id)throw Error(`Vehicle ${id} already has a driver. Choose a passenger seat.`);
  }
  if(model){const id=vehicleKey(actor,beat),seat=beat.vehicleSeat??'operator',key=`${id}/${seat}`,list=occupied.get(key)??[],held=beat===actor.beats.at(-1)&&clipById.get(beat.clip)?.vehicleTransition?.direction!=='alight'?60:end;
   if(list.some(v=>v.actor!==actor.id&&Math.min(v.end,held)-Math.max(v.start,time)>1e-6))throw Error(`The ${SEAT_LABELS[seat]} seat in ${id} is occupied at this time.`);
   list.push({actor:actor.id,start:time,end:held});occupied.set(key,list);
  }
  if(model==='helicopter'&&(beat.vehicleSeat??'operator')!=='operator'&&beat.flightHeight!==undefined)throw Error('Passengers inherit the pilot’s flight height. Set it on the operator only.');
  time=end;
 }}
 // Boarding through a moving doorway cannot retain physical contact. Reject it before rendering.
 const gates=new Map<string,{actor:string;start:number;end:number}[]>();
 for(const actor of project.actors){let start=0;for(const b of actor.beats){const end=start+b.duration,model=VEHICLE_FOR_CLIP[b.clip],id=vehicleKey(actor,b);
  if(model&&clipById.get(b.clip)?.vehicleTransition){const vehicle=vehicles.get(id)!;let t=0;for(const drive of vehicle.actor.beats){const stop=t+drive.duration;if(VEHICLE_FOR_CLIP[drive.clip]&&vehicleKey(vehicle.actor,drive)===id&&Math.min(end,stop)-Math.max(start,t)>1e-6){const a=Math.max(start,t),z=Math.min(end,stop),air=model==='helicopter'&&[a+1e-5,(a+z)/2,z-1e-5].some(at=>helicopterHeight(vehicle.actor,vehicle.actor.beats.indexOf(drive),at)>1e-6);if(drive.move||air)throw Error(`Keep ${id} stationary${model==='helicopter'?' and on the ground':''} while characters board or alight.`);}t=stop;}
   if(!['car','sports_car','suv','helicopter'].includes(model)){const list=gates.get(id)??[];if(list.some(v=>v.actor!==actor.id&&Math.min(v.end,end)-Math.max(v.start,start)>1e-6))throw Error(`Stagger boarding/alighting for ${id}; its entry is shared.`);list.push({actor:actor.id,start,end});gates.set(id,list);}
  }
  start=end;
 }}
}
