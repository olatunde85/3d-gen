/** Small portable contracts, generated from real set geometry rather than guessed coordinates. */
import data from './location-maps.generated.json';
import {type SetId} from './catalog';
import type {LocationMap,VehicleEnvelope} from './spatial-types';
export const LOCATION_MAPS=data.locations as unknown as LocationMap[];
export const VEHICLE_ENVELOPES=data.vehicleEnvelopes as unknown as Record<string,VehicleEnvelope>;
export const locationMap=(id:SetId)=>LOCATION_MAPS.find(m=>m.id===id)!;
export function locationMapFile(id:SetId){return {kind:'ara-studio-location-map',version:1,coordinates:data.coordinates,vehicleEnvelopes:VEHICLE_ENVELOPES,location:locationMap(id)};}
export const allLocationMapsFile=()=>data;
/** All locations are enumerated; the selected location gets its full obstacle/route contract. */
export function locationMapIndex(){return LOCATION_MAPS.map(m=>({id:m.id,bounds:m.bounds,water:m.water,regions:m.regions.filter(r=>!r.id.startsWith('pavement-')||m.regions.length<8),seats:m.seats.map(s=>[s.x,s.y,s.z,s.yaw]),routes:m.routes.map(r=>r.id),boarding:m.boarding.map(a=>a.id)}));}
