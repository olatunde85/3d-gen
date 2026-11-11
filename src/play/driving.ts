/** Deterministic pickup dynamics and oriented collision, shared by preview and exports. */
import type {VehicleSurface} from './vehicle-surfaces';
import {blocked,clearPath,type Point,type Rect} from './world';
export type DriveVehicle='pickup'|'sports_car'|'suv'|'motorcycle';
export interface DrivingSettings {color:string;pace:'relaxed'|'standard'|'fast';model?:DriveVehicle}
export const defaultDriving=():DrivingSettings=>({color:'#294c60',pace:'standard'});
export function parseDriving(raw:unknown):DrivingSettings|undefined {
 if(raw===undefined)return undefined;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use valid pickup settings.');
 const p=raw as Record<string,unknown>;for(const k of Object.keys(p))if(!['color','pace','model'].includes(k))throw Error(`Unsupported vehicle setting: ${k}.`);
 const result={...defaultDriving(),...p};if(typeof result.color!=='string'||!/^#[a-f0-9]{6}$/i.test(result.color))throw Error('Choose a six-digit vehicle paint colour.');if(!['relaxed','standard','fast'].includes(result.pace as string))throw Error('Choose Relaxed, Standard or Fast driving pace.');if(result.model!==undefined&&!['pickup','sports_car','suv','motorcycle'].includes(String(result.model)))throw Error('Choose a pickup, sports car, SUV or motorcycle.');return result as DrivingSettings;
}
export interface PassengerFit {seat:Point;stand:Point}
export interface CarFit {model?:DriveVehicle;surfaces?:VehicleSurface[];passenger?:PassengerFit;box:Rect;height:number;stand:Point;scale:number}
export const defaultCarFit=():CarFit=>({box:{minX:-1.75,maxX:.95,minZ:-2.8,maxZ:3.4},height:2.2,stand:{x:1.5,z:0},passenger:{seat:{x:-.72,z:0},stand:{x:-2.3,z:0}},scale:1});
export interface CarPose extends Point {yaw:number}
export interface CarState extends CarPose {speed:number;steer:number;distance:number;phase:'parked'|'boarding'|'driving'|'alighting';time:number;fit:CarFit;blocked:number;health?:number;damageCooldown?:number}
export const DRIVE={boarding:1.05,alighting:1.05,reverse:14,acceleration:14,braking:25,wheelbase:3.47}as const;
export const topSpeed=(settings:DrivingSettings)=>({relaxed:20,standard:29,fast:40}[settings.pace])*({pickup:1,sports_car:1.25,suv:.9,motorcycle:1.15}[settings.model??'pickup']);
/** The visible pickup zone and success test use the same body-sized radius. */
export const pickupExtractionRadius=(fit:CarFit)=>Math.max(4.2,(fit.box.maxZ-fit.box.minZ)/2+1.1,(fit.box.maxX-fit.box.minX)/2+1.1);
export const pickupAtExtraction=(car:CarState,exit:Point)=>Math.hypot(car.x-exit.x,car.z-exit.z)<=pickupExtractionRadius(car.fit)&&Math.abs(car.speed)<=2.5;
export function carPoint(car:CarPose,p:Point):Point {const c=Math.cos(car.yaw),s=Math.sin(car.yaw);return {x:car.x+c*p.x+s*p.z,z:car.z-s*p.x+c*p.z};}
export function driverStand(car:CarState){return {...carPoint(car,car.fit.stand),yaw:car.yaw};}
export function passengerStand(car:CarState){return {...carPoint(car,car.fit.passenger?.stand??{x:car.fit.box.minX-.6,z:0}),yaw:car.yaw};}
export function passengerSeat(car:CarState){return carPoint(car,car.fit.passenger?.seat??{x:-.72*car.fit.scale,z:0});}
export function passengerEntryClear(car:CarState,radius:number,rects:readonly Rect[],people:readonly (Point&{radius:number})[]=[],bounds?:Rect){const p=passengerStand(car);return (!bounds||p.x>bounds.minX+radius&&p.x<bounds.maxX-radius&&p.z>bounds.minZ+radius&&p.z<bounds.maxZ-radius)&&!blocked(p,radius,rects)&&!carTouchesPerson(car,car.fit,{...p,radius})&&people.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>radius+q.radius+.08);}
export function carCorners(car:CarPose,fit:CarFit){const b=fit.box;return [{x:b.minX,z:b.minZ},{x:b.maxX,z:b.minZ},{x:b.maxX,z:b.maxZ},{x:b.minX,z:b.maxZ}].map(p=>carPoint(car,p));}
export function carBounds(car:CarPose,fit:CarFit):Rect {const p=carCorners(car,fit);return {minX:Math.min(...p.map(p=>p.x)),maxX:Math.max(...p.map(p=>p.x)),minZ:Math.min(...p.map(p=>p.z)),maxZ:Math.max(...p.map(p=>p.z))};}
export function carObstacle(car:CarState):Rect{return {...carBounds(car,car.fit),obb:{x:car.x,z:car.z,yaw:car.yaw,box:car.fit.box}};}
export function carTouches(car:CarPose,fit:CarFit,rect:Rect){
 const points=carCorners(car,fit),corners=[{x:rect.minX,z:rect.minZ},{x:rect.maxX,z:rect.minZ},{x:rect.maxX,z:rect.maxZ},{x:rect.minX,z:rect.maxZ}],c=Math.cos(car.yaw),s=Math.sin(car.yaw);
 for(const axis of [{x:1,z:0},{x:0,z:1},{x:c,z:-s},{x:s,z:c}]){const a=points.map(p=>p.x*axis.x+p.z*axis.z),b=corners.map(p=>p.x*axis.x+p.z*axis.z);if(Math.max(...a)<=Math.min(...b)+1e-5||Math.max(...b)<=Math.min(...a)+1e-5)return false;}return true;
}
export function carLocal(car:CarPose,p:Point):Point {const c=Math.cos(car.yaw),s=Math.sin(car.yaw),dx=p.x-car.x,dz=p.z-car.z;return {x:c*dx-s*dz,z:s*dx+c*dz};}
export function carTouchesPerson(car:CarPose,fit:CarFit,p:Point&{radius:number}){
 return blocked(carLocal(car,p),p.radius,[fit.box]);
}
export function carClear(car:CarPose,fit:CarFit,rects:readonly Rect[],bounds:Rect,people:readonly (Point&{radius:number})[]=[]){
 return carCorners(car,fit).every(p=>p.x>bounds.minX+.2&&p.x<bounds.maxX-.2&&p.z>bounds.minZ+.2&&p.z<bounds.maxZ-.2)&&!rects.some(r=>carTouches(car,fit,r))&&!people.some(p=>carTouchesPerson(car,fit,p));
}
export function entryClear(car:CarState,radius:number,rects:readonly Rect[],people:readonly (Point&{radius:number})[]=[]){const p=driverStand(car);return !blocked(p,radius,rects)&&!carTouchesPerson(car,car.fit,{...p,radius})&&people.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>radius+q.radius+.08);}
export function canReachDoor(from:Point,car:CarState,radius:number,rects:readonly Rect[],hull?:readonly Rect[]){const stand=driverStand(car);return Math.hypot(from.x-stand.x,from.z-stand.z)<1.6&&clearPath(from,stand,rects,radius)&&(hull?clearPath(from,stand,hull,radius):clearPath(carLocal(car,from),car.fit.stand,[car.fit.box],radius));}
/** Substeps bound both translation and corner sweep, preventing thin-wall tunnelling at speed. */
export function driveStep(car:CarState,dt:number,throttle:number,steer:number,brake:boolean,settings:DrivingSettings,rects:readonly Rect[],bounds:Rect,people:readonly (Point&{radius:number})[]=[]){
 car.blocked=Math.max(0,car.blocked-dt);car.damageCooldown=Math.max(0,(car.damageCooldown??0)-dt);if(car.health!==undefined&&car.health<=0){car.speed=0;return;}const t=Number.isFinite(throttle)?Math.max(-1,Math.min(1,throttle)):0,r=Number.isFinite(steer)?Math.max(-1,Math.min(1,steer)):0;
 car.steer+=(r*.5-car.steer)*(1-Math.exp(-dt*8));
 const desired=brake?0:t>0?topSpeed(settings)*t:t<0?DRIVE.reverse*t:0,rate=brake||car.speed*desired<0?DRIVE.braking:t?DRIVE.acceleration:2;
 car.speed+=Math.max(-rate*dt,Math.min(rate*dt,desired-car.speed));if(Math.abs(car.speed)<.01)car.speed=0;
 const yawRate=-car.speed/(DRIVE.wheelbase*car.fit.scale)*Math.tan(car.steer),turn=Math.max(-1.8,Math.min(1.8,yawRate))*dt,travel=car.speed*dt,b=car.fit.box,radius=Math.hypot(Math.max(Math.abs(b.minX),Math.abs(b.maxX)),Math.max(Math.abs(b.minZ),Math.abs(b.maxZ))),steps=Math.max(1,Math.ceil((Math.abs(travel)+radius*Math.abs(turn))/.055));
 for(let i=0;i<steps;i++){const yaw=car.yaw+turn/steps,p={x:car.x+Math.sin(yaw)*travel/steps,z:car.z+Math.cos(yaw)*travel/steps,yaw};if(!carClear(p,car.fit,rects,bounds,people)){if(car.health!==undefined&&Math.abs(car.speed)>2.5&&car.damageCooldown===0){car.health=Math.max(0,car.health-Math.min(35,Math.ceil(Math.abs(car.speed)*3)));car.damageCooldown=.7;}car.speed=0;car.blocked=.55;break;}Object.assign(car,p);car.distance+=travel/steps;}
}
