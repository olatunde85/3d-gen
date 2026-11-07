/** Authored aerial choreography. Studio supplies altitude; game engines supply their own motion. */
import type {Clip,Ch,HandTarget,Sample} from './types';
import {side,fingers,grip,track,v} from './helpers';
import {idle} from './basic';
const riser=(side:1|-1,y=.18):HandTarget=>({pos:v(side*.28,y,.12),pole:v(side,-.3,-.25),dir:v(0,.9,.25),palm:v(-side,0,0)});
export const skydive:Clip={id:'skydive',name:'Skydive (free fall)',category:'Aerial',duration:3,loop:true,sample:t=>{
 const f=Math.sin(t/3*Math.PI*2),bones:Record<string,Ch>={Spine:[-9,0,0],Spine1:[-4,0,0],Neck:[-12,0,0],Head:[-20,0,0]};
 side(bones,'Arm',[85+f,0,58],[85-f,0,58]);side(bones,'ForeArm',[72,0,0],[72,0,0]);side(bones,'UpLeg',[-10,0,16],[-10,0,16]);side(bones,'Leg',[-65+f,0,0],[-65-f,0,0]);side(bones,'Foot',[6,0,0],[6,0,0]);fingers(bones,12);
 const hand=(s:1|-1):HandTarget=>({pos:v(s*.50,.08,.12),pole:v(s,-.7,-.2),dir:v(0,1,0),palm:v(0,0,1)});return{bones,root:{pitch:85,y:.12},ik:{Left:hand(1),Right:hand(-1)},gaze:[0,0]};
}};
export const parachuteGlide:Clip={id:'parachute_glide',name:'Use parachute (glide)',category:'Aerial',duration:3,loop:true,travel:[0,0,2],sample:t=>{
 const f=Math.sin(t/3*Math.PI*2),bones:Record<string,Ch>={Spine:[-3,0,0],Neck:[2,0,0],Head:[1,0,0]};
 side(bones,'UpLeg',[16,0,5],[16,0,5]);side(bones,'Leg',[-24,0,0],[-24,0,0]);side(bones,'Foot',[4,0,0],[4,0,0]);grip(bones,'Left');grip(bones,'Right');
 return{bones,root:{y:.01*f},ik:{Left:riser(1),Right:riser(-1)},thumbs:{Left:.6,Right:.6},gaze:[0,0]};
}};
export const parachuteDeploy:Clip={id:'parachute_deploy',name:'Activate parachute (deploy)',category:'Aerial',duration:2.4,loop:false,sample:t=>{
 const T=[0,.42,.7,1.1,1.75,2.4],k=(a:number[])=>track(T,a)(t),bones:Record<string,Ch>={Spine:[k([-9,-9,-6,-3,-3,-3]),0,0],Spine1:[k([-4,-4,-2,0,0,0]),0,0],Neck:[k([-12,-12,-7,0,2,2]),0,0],Head:[k([-20,-20,-10,0,1,1]),0,0]};
 side(bones,'UpLeg',[k([-10,-10,0,12,16,16]),0,k([16,16,12,7,5,5])],[k([-10,-10,0,12,16,16]),0,k([16,16,12,7,5,5])]);side(bones,'Leg',[k([-65,-65,-50,-30,-24,-24]),0,0],[k([-65,-65,-50,-30,-24,-24]),0,0]);side(bones,'Foot',[k([6,6,6,4,4,4]),0,0],[k([6,6,6,4,4,4]),0,0]);grip(bones,'Left');grip(bones,'Right');
 const s:Sample={bones,root:{pitch:k([85,85,65,28,4,0]),y:k([.12,.12,.1,.04,0,0])},ik:{Left:riser(1,k([-.1,-.1,.02,.16,.18,.18])),Right:{...riser(-1),pos:v(k([-.23,-.23,-.40,-.34,-.28,-.28]),k([-.25,-.25,-.15,.12,.18,.18]),k([-.1,-.1,.1,.14,.12,.12]))}},thumbs:{Left:.6,Right:.6},gaze:[0,0]};
 if(t<.2)s.blend={sample:skydive.sample(0),w:1-track([0,.2],[0,1])(t)};return s;
}};
export const parachuteLand:Clip={id:'parachute_land',name:'Land parachute',category:'Aerial',duration:3,loop:false,sample:t=>{
 if(t>=3)return idle.sample(0);
 const T=[0,.55,.9,1.35,2.1,3],k=(a:number[])=>track(T,a)(t),bones:Record<string,Ch>={Spine:[k([-3,3,14,9,0,0]),0,0],Neck:[k([2,-2,-6,-3,0,0]),0,0],Head:[k([1,0,-3,0,0,0]),0,0]};
 side(bones,'UpLeg',[k([16,20,44,28,4,0]),0,5],[k([16,20,44,28,4,0]),0,5]);side(bones,'Leg',[k([-24,-28,-66,-42,-8,0]),0,0],[k([-24,-28,-66,-42,-8,0]),0,0]);side(bones,'Foot',[k([4,6,22,12,2,0]),0,0],[k([4,6,22,12,2,0]),0,0]);grip(bones,'Left');grip(bones,'Right');
 const s:Sample={bones,root:{ground:true},ik:{Left:riser(1,k([.18,.06,-.04,-.14,-.3,-.4])),Right:riser(-1,k([.18,.06,-.04,-.14,-.3,-.4]))},gaze:[0,0]};
 if(t<.65)s.blend={sample:parachuteGlide.sample(0),w:1-track([0,.65],[0,1])(t)};
 if(t>2)s.blend={sample:idle.sample(0),w:track([2,3],[0,1])(t),ground:true};return s;
}};
export const AERIAL:Clip[]=[skydive,parachuteDeploy,parachuteGlide,parachuteLand];
