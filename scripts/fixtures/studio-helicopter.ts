import {newProject,newActor,beat,type StudioProject} from '../../src/studio/project';
export function helicopterFilm():StudioProject{
 const p=newProject('military-base');p.title='Chopper departure';p.caption=false;p.camera='locked';p.audio.muted=true;p.texts=[];
 const pilot={...newActor(undefined,'medium','pilot'),x:0,y:0,z:0,yaw:0,vehicle:'auto' as const};
 pilot.beats=[{...beat('board_helicopter',2.2),vehicleId:'rescue'},{...beat('fly_helicopter',3),flightHeight:0,vehicleId:'rescue'},{...beat('fly_helicopter',8,true),flightHeight:5,travelSpeed:6,vehicleId:'rescue'},{...beat('alight_helicopter',2.2),vehicleId:'rescue'},beat('idle',1)];
 p.actors=[pilot];for(const [i,seat]of ['front-passenger','rear-left','rear-right'].entries()){
  const a={...newActor(undefined,'medium',`guest-${i}`),x:0,y:0,z:0,yaw:0,vehicle:'auto' as const};
  a.beats=[beat('idle',2.2),{...beat('board_helicopter',2.2),vehicleId:'rescue',vehicleSeat:seat as 'front-passenger'|'rear-left'|'rear-right'},{...beat('fly_helicopter',8.8),vehicleId:'rescue',vehicleSeat:seat as 'front-passenger'|'rear-left'|'rear-right'},{...beat('alight_helicopter',2.2),vehicleId:'rescue',vehicleSeat:seat as 'front-passenger'|'rear-left'|'rear-right'},beat('idle',1)];p.actors.push(a);
 }
 p.shots=[{id:'wide',shot:'wide',target:'all',duration:12},{id:'land',shot:'wide',target:'all',duration:4.4}];p.view={azimuth:45,elevation:10,zoom:1.15};return p;
}
