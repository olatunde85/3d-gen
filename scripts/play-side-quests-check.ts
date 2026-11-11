import assert from 'node:assert/strict';
import {EscapeGame,type Input} from '../src/play/runtime';
import {defaultMission,parseMission} from '../src/play/mission';
import {driverStand} from '../src/play/driving';

const idle:Input={x:0,z:0,sprint:false,interact:false};
assert.throws(()=>parseMission({...defaultMission(),sideQuests:['street-race']}),/pickup extraction/);
assert.throws(()=>parseMission({...defaultMission(),sideQuests:['delivery','delivery']}),/unique side jobs/);

const delivery=new EscapeGame({...defaultMission(),sideQuests:['delivery']});delivery.start();delivery.protection=Infinity;delivery.enemies.forEach(e=>e.combat.health=0);
const job=delivery.sideQuests[0];Object.assign(delivery.player,job.start);delivery.update(1/60,{...idle,interact:true});assert.equal(job.status,'active');assert.equal(delivery.cash,0);
Object.assign(delivery.player,job.checkpoints[0]);delivery.update(1/60,idle);assert.equal(delivery.cash,0);assert.equal(delivery.interactLabel,'Hand over package');delivery.update(1/60,{...idle,interact:true});assert.equal(job.status,'complete');assert.equal(delivery.cash,200);assert.equal(delivery.rewards.filter(r=>r.id==='side-delivery').length,1);
delivery.update(1/60,idle);assert.equal(delivery.cash,200);console.log('OK timed delivery requires a parcel handoff and pays once');

const race=new EscapeGame({...defaultMission(),extraction:'pickup',driveDifficulty:'standard',sideQuests:['street-race']});race.start();race.protection=Infinity;race.enemies.forEach(e=>e.combat.health=0);race.hasKey=true;
const racing=race.sideQuests[0];Object.assign(race.player,driverStand(race.car!));race.update(1/60,{...idle,interact:true});assert.equal(racing.status,'active');race.car!.phase='driving';
for(const point of racing.checkpoints){Object.assign(race.car!,point,{speed:0});race.update(1/60,idle);}assert.equal(racing.status,'complete');assert.equal(race.cash,300);console.log('OK street race follows measured road markers and pays once');

const expired=new EscapeGame({...defaultMission(),sideQuests:['delivery']});expired.start();expired.protection=Infinity;expired.enemies.forEach(e=>e.combat.health=0);Object.assign(expired.player,expired.sideQuests[0].start);expired.update(1/60,{...idle,interact:true});for(let i=0;i<(expired.sideQuests[0].limit+1)*10;i++)expired.update(.1,idle);assert.equal(expired.sideQuests[0].status,'failed');assert.equal(expired.cash,0);console.log('OK an expired job earns no cash');

const bounty=new EscapeGame({...defaultMission(),sideQuests:['bounty']});bounty.start();bounty.protection=Infinity;Object.assign(bounty.player,bounty.sideQuests[0].start);assert.equal(bounty.interactLabel,'Start bounty');bounty.update(1/60,{...idle,interact:true});assert.equal(bounty.sideQuests[0].status,'active');bounty.bountyTarget.combat.health=0;bounty.update(1/60,idle);assert.equal(bounty.sideQuests[0].index,1);assert.equal(bounty.cash,0);Object.assign(bounty.player,bounty.sideQuests[0].start);assert.equal(bounty.interactLabel,'Confirm bounty');bounty.update(1/60,{...idle,interact:true});assert.equal(bounty.sideQuests[0].status,'complete');assert.equal(bounty.cash,250);console.log('OK bounty contract requires target defeat and contact confirmation');
