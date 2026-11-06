import * as THREE from 'three';
import type {SetBuilder} from '../builder';
import {basin,block,door,glow,METAL,practical,ring,shell,toilet,WHITE,windowPanel} from './details';
function tiledWalls(b:SetBuilder,color:string){
 // Thin grout lines batch into one mesh rather than allocating one texture per tile.
 for(let y=.4;y<2.5;y+=.4)block(b,[11.9,.012,.006],[0,y,-5.48],'#b6c4bd');for(let x=-5.8;x<6;x+=.6)block(b,[.012,2.4,.006],[x,1.2,-5.48],'#b6c4bd');
 for(const side of [-1,1]){b.wall(10.9,1.25,[side*5.98,.625,0],color,side<0?Math.PI/2:-Math.PI/2);for(let y=.4;y<1.3;y+=.4)block(b,[.006,.012,10.8],[side*5.97,y,0],'#b6c4bd');}
}
function mirror(b:SetBuilder,x:number,y:number,z:number,width:number,height:number){
 b.wall(width,height,[x,y,z],'#536e79');for(const dx of [-width/2,width/2])block(b,[.035,height+.05,.04],[x+dx,y,z+.015],METAL);for(const dy of [-height/2,height/2])block(b,[width,.035,.04],[x,y+dy,z+.015],METAL);
 // Stylized highlights rather than a second scene renderer or a false promise of live reflection.
 for(const dx of [-width*.22,width*.22]){const stripe=block(b,[.05,height*.8,.008],[x+dx,y,z+.008],'#8ca9af');stripe.rotation.z=-.18;}
}
export function publicRestroom(b:SetBuilder){
 shell(b,'#d4ddd6','#a5b1a7');tiledWalls(b,'#c0d0c8');
 for(let i=0;i<3;i++){const x=-4.4+i*1.35;toilet(b,x,-4.4);for(const dx of [-.63,.63])block(b,[.055,1.85,1.65],[x+dx,1.2,-4.32],'#718e8b');block(b,[1.24,.04,.08],[x,2.15,-3.48],METAL);
  // Last stall is visibly open, revealing the recognizable fixtures inside.
  const panel=block(b,[1.13,1.75,.055],[x,1.2,-3.46],'#90a6a0');if(i===2){panel.rotation.y=-.85;panel.position.set(x-.2,1.2,-3.1);}else{block(b,[.045,.2,.025],[x+.4,1.25,-3.42],METAL);b.label('VACANT',[x,1.7,-3.41],.52,'#dfe8de','#466e68');}
 }
 block(b,[3.9,.16,.62],[3.15,.82,-4.63],'#b5c6bb');for(const x of [1.8,3.15,4.5]){basin(b,x,-4.5);mirror(b,x,1.8,-5.43,.9,1.25);glow(b,[1,.045,.08],[x,2.5,-5.33],'#dbe8dd',.9);}
 // Urinals face the aisle on the left wall, away from the central performance area.
 for(const z of [-1.6,.1])b.at(-5.55,z,Math.PI/2,()=>{b.ball([.25,.4,.18],[-5.55,.7,z],WHITE);b.ball([.16,.22,.07],[-5.55,.76,z+.15],'#71979f');block(b,[.055,.25,.055],[-5.55,1.19,z],METAL);});
 for(const z of [-2.45,1])block(b,[.6,1.4,.05],[-5.4,1.1,z],'#8ea6a0');b.label('WASHROOM',[.6,3.1,-5.43],2,'#415d63','#d4ddd6');b.box([.38,.42,.16],[5.75,1.25,-2.5],'#7e908d');
}
export function bathroom(b:SetBuilder){
 shell(b,'#c8c8ba','#b8b1a1');tiledWalls(b,'#bfc9bf');windowPanel(b,3.3,-5.44,2.3,1.1,2.85);
 // Tub rim is open, with an inset basin and continuous rounded outside shell.
 b.box([2.8,.62,1.4],[2.7,.34,-2.9],'#e5e5dc');b.box([2.46,.04,1.06],[2.7,.65,-2.9],'#92afb0');
 for(const dz of [-.66,.66])b.box([2.8,.12,.12],[2.7,.72,-2.9+dz],WHITE);for(const dx of [-1.32,1.32])b.box([.13,.12,1.2],[2.7+dx,.72,-2.9],WHITE);
 b.cylinder(.025,.9,[4.35,.45,-2.7],METAL);block(b,[.35,.035,.045],[4.2,.92,-2.7],METAL);
 // Shower tray and glazing sit at the rear; the entrance stays open.
 block(b,[2.4,.08,2.2],[-3.8,.04,-4.2],'#d5ded5');const glassMat=b.material('#91b1b4',.18,.1);glassMat.transparent=true;glassMat.opacity=.22;glassMat.depthWrite=false;glassMat.side=THREE.DoubleSide;
 const glass=b.wall(2.3,2.5,[-3.8,1.3,-3.08],'#91b1b4');glass.material=glassMat;glass.castShadow=false;for(const x of [-4.95,-2.65])block(b,[.025,2.55,.025],[x,1.3,-3.06],METAL);
 block(b,[.035,2,.035],[-4.8,1.4,-5.25],METAL);block(b,[.6,.035,.035],[-4.5,2.4,-5.25],METAL);const head=b.cylinder(.2,.035,[-4.23,2.4,-5.25],METAL);head.castShadow=false;
 block(b,[2.1,.7,.6],[-4.2,.5,-1.1],'#8c846b');basin(b,-4.2,-1.1);mirror(b,-4.2,1.75,-1.39,1.65,1.25);toilet(b,4.8,-4.55);
 for(let i=0;i<3;i++)b.box([.55,.06,.32],[-3.65,.97+i*.065,-1.1],i%2?'#c7bb9e':WHITE);block(b,[1.6,.014,.85],[3.3,.005,-1.7],'#9b998b');b.plant(1.1,-4.8,1.1);
}
function diningPlace(b:SetBuilder,x:number,z:number){
 b.table(x,z,'#77614b',1.8,1.15,.78);b.box([1.9,.04,1.25],[x,.84,z],WHITE);
 for(const dz of [-.8,.8]){b.chair(x,z+dz,'#5a655e',dz<0?0:Math.PI);b.plate(x,.865,z+dz*.46);for(const dx of [-.24,.24])block(b,[.017,.01,.24],[x+dx,.885,z+dz*.48],METAL);}
 b.cylinder(.045,.25,[x+.48,.99,z],'#d8d8c6');glow(b,[.022,.06,.022],[x+.48,1.15,z],'#f5c785',1.5);b.cylinder(.08,.1,[x-.4,.94,z],'#657867');b.ball([.12,.12,.12],[x-.4,1.06,z],'#ac9290');
}
export function fineDining(b:SetBuilder){
 shell(b,'#746c60','#958a76');for(const x of [-3.4,3.4])diningPlace(b,x,-2.4);
 block(b,[4.8,.9,.65],[0,.45,-5.1],'#4d504a');block(b,[4.95,.06,.8],[0,.95,-5.1],'#b6a58a');b.art(0,2.45,-5.43,2.5,1.4,31);
 for(const x of [-5.3,5.3]){for(let y=1.1;y<3;y+=.45){block(b,[1.05,.05,.4],[x,y,-5.1],'#5d5244');for(const dx of [-.3,0,.3]){const bottle=b.cylinder(.065,.35,[x+dx,y+.2,-5.08],dx===0?'#907b52':'#4e6557');bottle.rotation.x=.2;}}glow(b,[1,.035,.03],[x,3,-4.87],'#dfbc7e',.8);}
 for(const x of [-5.85,5.85]){b.wall(3.8,2.8,[x,2.1,-2.5],'#b1a389',x<0?Math.PI/2:-Math.PI/2);for(const dz of [-4.2,-.8])block(b,[.12,3,.2],[x,2,dz],'#9c8970');}
 for(const x of [-3.4,3.4]){b.pendant(x,-2.4,2.7,'#d8bd88');practical(b,'#ffd69d',[x,2.4,-2.4],5,7);}door(b,3.5,-5.43,'PRIVATE DINING','#5b6056');b.plant(-1.9,-4.2,1.4);
}
export function nightclub(b:SetBuilder){
 shell(b,'#303440','#383f46');block(b,[5.8,.012,5.6],[0,.002,0],'#3c4759');
 for(let i=-2;i<=2;i++){glow(b,[5.8,.014,.025],[0,.014,i*1.1],i%2?'#6487ba':'#b571aa',.6);glow(b,[.025,.014,5.6],[i*1.1,.014,0],i%2?'#b571aa':'#6487ba',.6);}
 block(b,[4.2,1.2,.95],[0,.6,-4.5],'#26313b');glow(b,[4,.045,.025],[0,1.18,-4.01],'#b562a6',1.8);for(const x of [-1,1]){const deck=b.cylinder(.32,.035,[x,1.23,-4.5],'#6f7c8b');deck.castShadow=false;const disc=ring(b,.23,.02,[x,1.26,-4.5],'#31414d');disc.rotation.x=Math.PI/2;}
 b.label('AFTER HOURS',[0,2.65,-5.43],3.4,'#d5b9d4','#303440');
 for(const x of [-3.2,3.2]){block(b,[.85,2.4,.7],[x,1.2,-4.7],'#20272e');for(const y of [.55,1.55]){const speaker=b.cylinder(.29,.03,[x,y,-4.335],'#4b5260');speaker.rotation.x=Math.PI/2;const tweeter=b.cylinder(.12,.04,[x,y+.48,-4.33],'#6c627b');tweeter.rotation.x=Math.PI/2;}}
 block(b,[.8,1.05,4.1],[5,.525,-1.7],'#495265');glow(b,[.025,.04,4],[4.585,1.05,-1.7],'#609db9',1.7);for(let z=-3.2;z<0;z+=.65){b.cylinder(.055,.27,[5,1.25,z],'#9d8470');b.stool(4,-.05+z,.72,'#626178',Math.PI/2);}
 b.sofa(-4.5,-1.8,'#68516b',Math.PI/2);b.table(-3.6,-1.8,'#4c5764',.7,1,.44);
 for(const x of [-5.9,5.9])for(const z of [-4,-1,2])glow(b,[.035,2.5,.035],[x,1.8,z],x<0?'#b562a6':'#609db9',2);
 practical(b,'#d66cbd',[-3.6,2.7,-2],12,10);practical(b,'#62bbda',[3.6,2.7,-2],12,10);
}
