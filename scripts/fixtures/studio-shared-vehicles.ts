import {newProject,newActor,beat,type StudioProject,type ActorTrack} from '../../src/studio/project';
import type {VehicleSeat} from '../../src/studio/vehicle-seats';
import {clipById} from '../../src/core/anim/clips';
const useDefaultEntries=(p:StudioProject)=>{for(const a of p.actors)for(const b of a.beats){const c=clipById.get(b.clip)!;if(c.vehicleTransition)b.duration=c.duration;}return p;};
export function sharedBoatFilm():StudioProject{
 const p=newProject('beach');p.title='One boat, three people';p.caption=false;p.camera='locked';p.audio.muted=true;p.texts=[];
 const track=(id:string):ActorTrack=>({...newActor(undefined,'medium',id),x:0,y:0,z:-7,yaw:0,vehicle:'auto',beats:[]});
 const driver=track('driver'),left=track('left'),right=track('right');
 const b=(clip:string,duration:number,seat:VehicleSeat,move=false)=>({...beat(clip,duration,move),vehicleId:'launch',vehicleSeat:seat});
 driver.beats=[b('board_motorboat',4,'operator'),b('drive_boat',12,'operator'),b('drive_boat',6,'operator',true),b('drive_boat',8,'operator'),b('alight_motorboat',4,'operator')];
 left.beats=[beat('idle',2),beat('walk',2,true),b('board_motorboat',4,'passenger-left'),b('drive_boat',12,'passenger-left'),b('drive_boat',2,'passenger-left'),b('alight_motorboat',4,'passenger-left'),beat('run',8,true)];
 right.beats=[beat('idle',5),beat('walk',3,true),b('board_motorboat',4,'passenger-right'),b('drive_boat',10,'passenger-right'),b('drive_boat',4,'passenger-right'),b('alight_motorboat',4,'passenger-right'),beat('run',4,true)];
 p.actors=[driver,left,right];p.shots=[{id:'wide',duration:12,shot:'wide',target:'all'}];p.view={azimuth:40,elevation:12,zoom:1.2};return useDefaultEntries(p);
}
export function transferFilm():StudioProject{
 const p=newProject('beach');p.title='Bike to boat';p.caption=false;p.audio.muted=true;p.texts=[];p.camera='locked';
 p.actors[0]={...p.actors[0],vehicle:'auto',x:0,y:0,z:0,yaw:180,beats:[beat('ride_motorcycle',3,true),beat('alight_motorcycle',3.4),beat('run',3,true),beat('board_motorboat',4),beat('drive_boat',5,true),beat('alight_motorboat',4),beat('run',2,true)]};
 p.shots=[{id:'wide',duration:12,shot:'wide',target:'all'}];p.view={azimuth:35,elevation:10,zoom:1.3};return useDefaultEntries(p);
}
