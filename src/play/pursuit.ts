/** Bounded hybrid A*: plan drivable arcs, then use the real swept-hull vehicle motor. */
import {carClear,driveStep,topSpeed,type CarState,type DrivingSettings} from './driving';
import {distance,type Point,type Rect} from './world';
export interface PursuitState {car:CarState;driver:string;path:(Point&{gear?:number})[];replan:number;reported:boolean}
interface Node {x:number;z:number;yaw:number;cost:number;score:number;parent?:Node;gear?:number}
export function pursuitRoute(car:CarState,goal:Point,rects:readonly Rect[],bounds:Rect):Point[]{
 const key=(p:Node)=>`${Math.round(p.x/1.5)},${Math.round(p.z/1.5)},${Math.round(((p.yaw%(2*Math.PI)+2*Math.PI)%(2*Math.PI))/(Math.PI/8))%16}`,start:Node={...car,cost:0,score:distance(car,goal)},open=[start],best=new Map<string,number>([[key(start),0]]);let nearest=start;
 for(let iter=0;open.length&&iter<900;iter++){open.sort((a,b)=>a.score-b.score);const p=open.shift()!;if(distance(p,goal)<distance(nearest,goal))nearest=p;if(distance(p,goal)<4.5){nearest=p;break;}
  const nearby=rects.filter(r=>r.minX<p.x+9&&r.maxX>p.x-9&&r.minZ<p.z+9&&r.maxZ>p.z-9);
  for(const gear of [1,-1])for(const turn of [-.3,0,.3]){let next={x:p.x,z:p.z,yaw:p.yaw},safe=true;for(let i=0;i<12;i++){next={x:next.x+Math.sin(next.yaw+turn/12)*.25*gear,z:next.z+Math.cos(next.yaw+turn/12)*.25*gear,yaw:next.yaw+turn/12};if(!carClear(next,car.fit,nearby,bounds)){safe=false;break;}}if(!safe)continue;const q:Node={...next,cost:p.cost+(gear===1?3:4)+Math.abs(turn),score:0,parent:p,gear},id=key(q);if((best.get(id)??Infinity)<=q.cost)continue;q.score=q.cost+distance(q,goal)*1.25;best.set(id,q.cost);open.push(q);}
 }
 const path:(Point&{gear?:number})[]=[];while(nearest.parent){path.unshift({x:nearest.x,z:nearest.z,gear:nearest.gear});nearest=nearest.parent;}return path;
}
export function pursuitStep(p:PursuitState,dt:number,goal:Point,settings:DrivingSettings,rects:readonly Rect[],bounds:Rect,people:readonly(Point&{radius:number})[],stopRadius=6,throttle=.8,replanSeconds=1.4,cruiseSpeed=11){p.replan-=dt;if(p.replan<=0){p.path=pursuitRoute(p.car,goal,rects,bounds);p.replan=p.path.length?replanSeconds:2.5;}while(p.path.length&&distance(p.car,p.path[0])<1.4)p.path.shift();const next=p.path[0],gear=next?.gear??1,angle=next?Math.atan2(next.x-p.car.x,next.z-p.car.z)-p.car.yaw-(gear<0?Math.PI:0):0,error=Math.atan2(Math.sin(angle),Math.cos(angle)),stop=!next||distance(p.car,goal)<stopRadius,cruise=Math.min(throttle,cruiseSpeed/topSpeed(settings));driveStep(p.car,dt,stop?0:gear*(Math.abs(error)>.7?Math.min(.25,cruise):cruise),Math.max(-1,Math.min(1,-error*2.5*gear)),stop,settings,rects,bounds,people);if(p.car.blocked>.35)p.replan=Math.min(p.replan,.8);}
