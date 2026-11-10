/** Enemy presence and temperament are shared by recipes, UI and simulation. */
import {missionObstacles,type MissionWorld} from './mission';
import {blocked,distance,route,type Point} from './world';
import type {EnemyResponse} from './combat';
import type {EnemyKind,EnemyHealth} from './enemy-roles';
export const MAX_ENEMIES=5;
export const AGGRESSION={
 cautious:{label:'Cautious',range:7.5,detection:.85,speed:2.8,forget:2,search:5},
 balanced:{label:'Balanced',range:9,detection:1.2,speed:3.65,forget:2.5,search:7},
 relentless:{label:'Relentless',range:11,detection:1.6,speed:4,forget:4,search:10},
}as const;
export type Aggression=keyof typeof AGGRESSION;
export interface EnemyRole {id:string;aggression:Aggression;response?:EnemyResponse;health?:EnemyHealth;kind?:EnemyKind}
export function enemyStarts(world:MissionWorld,count:number):Point[]{
 if(!Number.isInteger(count)||count<1||count>MAX_ENEMIES)throw Error(`Use one to ${MAX_ENEMIES} enemies.`);
 const candidates=[world.guard,...world.enemySpawns],rects=missionObstacles(world,world.story==='escape'?0:1),starts:Point[]=[];
 for(const p of candidates){if(blocked(p,.55,rects)||distance(p,world.start)<6||world.story==='rescue'&&(distance(p,world.rescue.captive)<4||distance(p,world.rescue.approach)<4)||starts.some(q=>distance(p,q)<2.5)||!route(p,world.patrol[0],rects,.55,world.bounds).length)continue;starts.push({...p});if(starts.length===count)return starts;}
 throw Error('This mission has insufficient clear enemy starting positions.');
}

/** Elevated specialists use measured roof anchors and keep them on checkpoint retries. */
export function stageEnemies(world:MissionWorld,roles:readonly EnemyRole[]){
 const ground=enemyStarts(world,roles.length);let sniper=0;return roles.map((role,i)=>{if(role.kind!=='sniper')return {...ground[i],y:0,yaw:Math.PI};const at=world.sniperSpawns[sniper++];if(!at||sniper>2)throw Error('This location supports at most two elevated snipers.');return {...at};});
}
