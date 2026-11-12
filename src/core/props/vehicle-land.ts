/** Fitted open-cabin cars and road motorcycles. All controls are measured from the rider. */
import * as T from 'three';
import {buildCoveredCar} from './vehicle-car';
import {VehicleKit,v} from './vehicle-kit';
export function buildCar(k:VehicleKit){
 if(k.fit.id!=='car'){buildCoveredCar(k);return;}
 const s=k.fit.scale,H=k.fit.average('hip'),driver=!k.fit.clip.id.includes('passenger'),cx=driver?-.36*s:.36*s,z=H.z,seatY=Math.min(...k.fit.samples.map(c=>c.hip.y))-.085*s;
 const sport=k.style.variant==='sport',length=(sport?3.55:3.8)*s,width=1.62*s,front=z+1.38*s,rear=z-1.18*s;
 k.box(v(cx,.23*s,z+.2*s),v(width*.94,.16*s,length*.91),k.dark);
 // A low shoulder line keeps the character's arms and face visible in an open cabin.
 for(const side of [-1,1]){
  const outline=new T.Shape();outline.moveTo(-1.55*s,.28*s);outline.lineTo(-1.55*s,.66*s);outline.quadraticCurveTo(-1.55*s,.79*s,-1.32*s,.79*s);outline.lineTo(-.77*s,.79*s);outline.lineTo(-.47*s,.74*s);outline.lineTo(.46*s,.74*s);outline.quadraticCurveTo(.76*s,.82*s,1.12*s,.80*s);outline.quadraticCurveTo(1.69*s,.77*s,1.69*s,.57*s);outline.lineTo(1.69*s,.30*s);
  for(const axle of [1.38,-1.18]){outline.lineTo((axle+.335)*s,.30*s);outline.absarc(axle*s,.30*s,.335*s,0,Math.PI,false);}outline.lineTo(-1.55*s,.28*s);outline.closePath();
  const panel=k.mesh(new T.ExtrudeGeometry(outline,{depth:.105*s,bevelEnabled:true,bevelSize:.018*s,bevelThickness:.018*s,bevelSegments:3,steps:1,curveSegments:24}),k.paint);panel.rotation.y=-Math.PI/2;panel.position.set(cx+side*width*.47+.0525*s,0,z);
  k.box(v(cx+side*width*.47,.80*s,z+.05*s),v(.13*s,.045*s,1.1*s),k.trim);
  k.box(v(cx+side*width*.48,.55*s,z-.18*s),v(.015*s,.03*s,.14*s),k.trim);
 }
 k.box(v(cx,.55*s,z+1.18*s),v(width,.40*s,.92*s),k.paint);
 k.ellipsoid(v(cx,.77*s,z+1.12*s),v(width*.48,.12*s,.52*s),k.paint);
 k.box(v(cx,.56*s,z-1.2*s),v(width,.39*s,.64*s),k.paint);
 k.box(v(cx,.79*s,z-1.05*s),v(width*.48,.08*s,.7*s),k.paint);
 for(const sign of [-1,1]){
  k.box(v(cx+sign*.48*s,.62*s,z+1.67*s),v(.32*s,.1*s,.035*s),k.light);
  const red=k.tail;
  k.box(v(cx+sign*.5*s,.64*s,z-1.53*s),v(.30*s,.09*s,.035*s),red);
 }
 k.box(v(cx,.43*s,z+1.69*s),v(width*.7,.12*s,.04*s),k.dark);
 for(let i=-5;i<=5;i++)k.box(v(cx+i*.075*s,.44*s,z+1.715*s),v(.015*s,.1*s,.012*s),k.trim);
 for(const zz of [front,rear])for(const sign of [-1,1]){
  const wheel=k.wheel(`Wheel_${zz===front?'front':'rear'}_${sign}`,v(cx+sign*width*.49,.30*s,zz),.30*s,.22*s,sport);
  k.updates.push((_,t)=>{wheel.rotation.x=t/k.fit.clip.duration*Math.PI*6;});

 }
 // Both seats share the fitted rider's support height. Passenger mode moves the driver to +X.
 for(const x of [cx-.36*s,cx+.36*s]){
  k.box(v(x,seatY-.035*s,z-.02*s),v(.51*s,.12*s,.47*s),k.seat);
  const back=k.box(v(x,seatY+.25*s,z-.31*s),v(.5*s,.61*s,.12*s),k.seat);back.rotation.x=-.12;
  k.ellipsoid(v(x,seatY+.64*s,z-.37*s),v(.17*s,.11*s,.07*s),k.seat);
  for(const edge of [-1,1])k.tube(v(x+edge*.2*s,seatY+.05*s,z-.33*s),v(x+edge*.2*s,seatY+.47*s,z-.38*s),.015*s,k.trim);
 }
 const dashZ=z+.56*s;k.box(v(cx,.88*s,dashZ),v(width*.86,.16*s,.21*s),k.dark);
 // The wheel is animated through the actual palm contacts. Passenger cars use a driver-side wheel.
 const offset=driver?v():v(.72*s,0,0),wheel=k.steering(.18*s,28*Math.PI/180,offset);
 if(!driver){const saved=k.updates.pop()!;void saved;wheel.position.set(.72*s,1.0*s,z+.42*s);wheel.rotation.x=-.45;}
 k.tube(v(driver?0:.72*s,.79*s,dashZ),v(driver?0:.72*s,.93*s,dashZ-.15*s),.036*s,k.dark);
 // Minimal windscreen at the far edge of the dash; no roof or opaque cabin hiding the rider.
 const glass=k.box(v(cx,1.15*s,z+.78*s),v(width*.89,.48*s,.018*s),k.glass);glass.rotation.x=-.24;
 for(const sign of [-1,1])k.tube(v(cx+sign*width*.45,.91*s,z+.72*s),v(cx+sign*width*.45,1.39*s,z+.84*s),.022*s,k.trim);
 k.tube(v(cx-width*.45,1.39*s,z+.84*s),v(cx+width*.45,1.39*s,z+.84*s),.018*s,k.trim);
 for(const sign of [-1,1]){k.tube(v(cx+sign*.8*s,.87*s,z+.63*s),v(cx+sign*.91*s,.95*s,z+.65*s),.018*s,k.trim);k.ellipsoid(v(cx+sign*.95*s,.96*s,z+.65*s),v(.08*s,.05*s,.055*s),k.paint);}
 if(sport){k.tube(v(cx-.58*s,1.12*s,z-.6*s),v(cx-.58*s,.8*s,z-.77*s),.04*s,k.dark);k.tube(v(cx+.58*s,1.12*s,z-.6*s),v(cx+.58*s,.8*s,z-.77*s),.04*s,k.dark);}
}

export function buildMotorcycle(k:VehicleKit){
 const s=k.fit.scale,H=k.fit.average('hip'),low=Math.min(...k.fit.samples.map(c=>c.hip.y)),sport=k.style.variant==='sport';
 const back=v(0,.32*s,H.z-.65*s),front=v(0,.32*s,H.z+.93*s),saddle=v(0,low-.08*s,H.z-.04*s);
 const rearWheel=k.wheel('Rear_wheel',back,.32*s,.17*s,true),frontWheel=k.wheel('Front_wheel',front,.32*s,.14*s,true);
 k.updates.push((_,time)=>{rearWheel.rotation.x=frontWheel.rotation.x=time/k.fit.clip.duration*Math.PI*8;});
 k.ellipsoid(v(0,saddle.y-.025*s,H.z-.1*s),v(.17*s,.055*s,.3*s),k.seat);
 // A real pillion pad and rear frame support the second Studio occupant.
 k.ellipsoid(v(0,saddle.y+.02*s,H.z-.65*s),v(.16*s,.05*s,.23*s),k.seat);
 for(const side of [-1,1]){
  k.tube(saddle.clone().setX(side*.12*s),v(side*.12*s,saddle.y-.04*s,H.z-.89*s),.022*s,k.dark);
  const peg=k.fit.average(side===1?'footLeft':'footRight').add(v(0,0,-.58*s));
  k.tube(v(side*.09*s,.48*s,H.z-.55*s),peg,.02*s,k.trim);
  k.tube(peg.clone().add(v(-.06*s,0,0)),peg.clone().add(v(.06*s,0,0)),.024*s,k.rubber);
 }
 const tank=k.ellipsoid(v(0,saddle.y-.02*s,H.z+.27*s),v(sport?.19*s:.17*s,.16*s,.29*s),k.paint);
 tank.rotation.x=-.1;
 const engine=k.box(v(0,.39*s,H.z+.1*s),v(.3*s,.32*s,.35*s),k.dark);
 for(let i=0;i<6;i++)k.box(v(0,.30*s+i*.035*s,H.z+.1*s),v(.33*s,.012*s,.37*s),k.trim);
 const head=v(0,.83*s,H.z+.62*s);
 for(const side of [-1,1]){
  k.tube(back.clone().setX(side*.09*s),v(side*.09*s,.48*s,H.z+.15*s),.026*s,k.dark);
  k.tube(back.clone().setX(side*.09*s),saddle.clone().setX(side*.12*s),.025*s,k.trim);
  k.tube(head.clone().setX(side*.045*s),front.clone().setX(side*.07*s),.022*s,k.trim);
  k.tube(saddle.clone().setX(side*.12*s),head.clone().setX(side*.09*s),.025*s,k.dark);
  const foot=k.fit.average(side===1?'footLeft':'footRight').add(v(0,-.04*s,.07*s));
  k.tube(v(side*.09*s,.41*s,H.z),foot,.023*s,k.trim);
  k.tube(foot.clone().add(v(-.07*s,0,0)),foot.clone().add(v(.07*s,0,0)),.026*s,k.rubber);
 }
 const exhaust=k.mesh(new T.CylinderGeometry(.045*s,.05*s,.74*s,16),k.trim);exhaust.rotation.x=Math.PI/2;exhaust.position.set(-.22*s,.3*s,H.z-.15*s);
 const bars=k.component('Handlebars'),barCentre=k.fit.average('left').add(k.fit.average('right')).multiplyScalar(.5);
 const barHalf=k.fit.average('left').distanceTo(k.fit.average('right'))/2;
 k.tube(v(-barHalf,0,0),v(barHalf,0,0),.014*s,k.trim,bars);
 for(const side of [-1,1]){k.tube(v(side*(barHalf-.1*s),0,0),v(side*(barHalf+.04*s),0,0),.023*s,k.rubber,bars);k.tube(v(side*barHalf,.02*s,0),v(side*(barHalf-.08*s),.025*s,.07*s),.009*s,k.trim,bars);}
 // The motorcycle's bar is rigid. Following the rider's live hand positions
 // twisted it across the bike whenever one hand aimed a weapon.
 bars.position.copy(barCentre);
 k.tube(head,barCentre,.023*s,k.trim);
 const headlight=k.mesh(new T.CylinderGeometry(.09*s,.09*s,.07*s,24),k.light);headlight.rotation.x=Math.PI/2;headlight.position.set(0,.84*s,H.z+.69*s);
 if(sport){const screen=k.box(v(0,1.00*s,H.z+.7*s),v(.31*s,.21*s,.02*s),k.glass);screen.rotation.x=-.35;k.ellipsoid(v(0,.79*s,H.z+.61*s),v(.22*s,.17*s,.11*s),k.paint);}
 const mudguard=(z:number)=>k.ellipsoid(v(0,.64*s,z),v(.13*s,.045*s,.28*s),k.paint);mudguard(front.z);mudguard(back.z);
 void engine;
}
