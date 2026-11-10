import * as T from 'three';
import {SetBuilder} from '../studio/sets/builder';
import type {EscapeGame} from './runtime';
/** Small physical supply markers share the simulation's positions and collection state. */
export class PickupView {
 readonly group=new T.Group();private key='';private items=new Map<string,T.Group>();private labels:T.Mesh[]=[];
 update(game:EscapeGame,camera:T.Camera){
  const key=JSON.stringify(game.pickups);
  if(key!==this.key){
   this.group.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v instanceof T.Texture)v.dispose();m.dispose();}}});
   this.group.clear();this.items.clear();this.labels=[];this.key=key;
   for(const p of game.pickups){
    const b=new SetBuilder(),color=p.kind==='health'?'#eff3dc':p.kind==='ammo'?'#b79a52':'#344a50';
    b.box([.5,.27,.34],[0,.16,0],color,.65);
    if(p.kind==='health'){
     b.box([.09,.01,.24],[0,.3,0],'#417659');b.box([.25,.01,.08],[0,.3,0],'#417659');
    }else if(p.kind==='ammo')for(const x of [-.13,0,.13])b.box([.055,.14,.06],[x,.36,0],'#e4c887',.3,.5);
    else{b.box([p.kind==='rifle'?.6:.32,.08,.08],[0,.4,0],'#d4d9d3',.3,.65);b.box([.07,.16,.08],[-.1,.31,0],'#525d5d');}
    this.labels.push(b.label(p.kind==='health'?'+25 HEALTH':p.kind==='ammo'?'+24 AMMO':p.kind==='rifle'?'RIFLE':'PISTOL',[0,.84,0],1.4,'#f1f4e5','#294640'));
    b.group.position.set(p.x,0,p.z);b.group.userData.pickupId=p.id;this.items.set(p.id,b.group);this.group.add(b.group);
   }
  }
  for(const p of game.pickups){const item=this.items.get(p.id)!;item.visible=!game.collected.has(p.id);}
  for(const label of this.labels)label.quaternion.copy(camera.quaternion);
 }
}
