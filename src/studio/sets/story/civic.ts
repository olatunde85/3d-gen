import * as THREE from 'three';
import type {SetBuilder} from '../builder';
import {surfaceBlock,basin,bench,block,door,exteriorBounds,fence,glow,METAL,ring,shell,toilet,tower,WHITE,windowPanel} from './details';
export function hospital(b:SetBuilder){
 shell(b,'#c8d8d4','#adbeb9');windowPanel(b,-3.6,-5.44,2.8,2.3);door(b,3.9,-5.43,'WARD 04','#6f9295');
 // Wheeled adjustable bed: separate mattress, backrest, rails and pillow.
 const x=-3.3,z=-2.7;
 block(b,[1.2,.16,2.35],[x,.52,z],'#627b83');b.box([1.12,.2,2.2],[x,.72,z],WHITE);b.box([1.03,.07,1.3],[x,.85,z+.35],'#a5c5c4');
 const back=b.box([1.12,.13,.74],[x,.92,z-.74],WHITE);back.rotation.x=-.22;b.box([.82,.12,.42],[x,1.04,z-.88],'#f6f2e8');
 for(const dz of [-1.17,1.17]){block(b,[1.25,.52,.08],[x,.83,z+dz],'#cbd9d7');for(const dx of [-.45,.45]){b.cylinder(.035,.35,[x+dx,.3,z+dz*.8],METAL);const wheel=b.cylinder(.09,.055,[x+dx,.12,z+dz*.8],'#343e43');wheel.rotation.z=Math.PI/2;}}
 for(const dx of [-.65,.65]){block(b,[.045,.05,1.6],[x+dx,1.02,z],'#adbebb');for(const dz of [-.7,0,.7])block(b,[.035,.28,.035],[x+dx,.9,z+dz],METAL);}
 block(b,[.7,.72,.5],[-1.9,.36,-3.5],'#c4d6d0');b.screen(-1.9,1.25,-3.55,.65,'#173b3c',0,.8,'72 bpm');
 for(let i=0;i<11;i++){const m=block(b,[.05,.012,.012],[-2.15+i*.045,1.28+(i%4===1?.075:i%4===2?-.055:0),-3.514],'#78d4a0');m.material=b.material('#78d4a0',.5,0,1);}
 b.cylinder(.022,2.1,[-4.7,1.05,-1.6],METAL);for(const dx of [-.24,.24])block(b,[.5,.035,.06],[-4.7,.07,-1.6+dx],METAL);block(b,[.45,.035,.035],[-4.7,2.1,-1.6],METAL);b.box([.22,.35,.08],[-4.85,1.84,-1.6],'#b6d6d7');
 // Curtain stays at the edge of the ward, clear of the acting space.
 block(b,[.04,.04,3.8],[-5.45,3,-2.6],METAL);for(let i=0;i<14;i++)block(b,[.055,2.05,.13],[-5.4,1.94,-4.3+i*.18],i%2?'#9ebbb9':'#b0c9c5');
 b.chair(2.7,-2.7,'#617f85');b.chair(4,-2.7,'#617f85');b.table(3.4,-3.6,'#a9c5c1',1.8,.65);b.cylinder(.08,.14,[3.3,.89,-3.55],WHITE);b.clock(.1,3.2,-5.43);
 block(b,[.14,.5,.04],[.1,2.1,-5.43],'#467c91');block(b,[.5,.14,.04],[.1,2.1,-5.41],'#467c91');
}
export function police(b:SetBuilder){
 shell(b,'#aebcc2','#9ca9ab');door(b,4.8,-5.42,'STAFF ONLY');
 block(b,[4.8,1.04,.75],[-1.9,.52,-3.8],'#304e66');block(b,[5,.08,.88],[-1.9,1.08,-3.8],'#c9d0c9');
 b.label('POLICE  /  RECEPTION',[-1.9,.66,-3.41],3.4,'#dfe8e7','#304e66');b.screen(-3.1,1.38,-4,.6);block(b,[.42,.025,.15],[-3.1,1.14,-3.55],DARK);
 b.label('SERVE  ·  PROTECT',[0,3.05,-5.42],3.4,'#e4d6ac','#304e66');
 for(const x of [-4.8,4.8]){b.table(x,-.7,'#718a96',1.5,.8);b.chair(x,-1.4,'#3d515f');b.screen(x,1.12,-.95,.65);}
 for(const x of [-5,-4.1]){block(b,[.7,1.35,.48],[x,.675,-5.14],'#70818a');for(let y=.3;y<1.3;y+=.3){block(b,[.62,.025,.015],[x,y,-4.89],'#b8c6c8');block(b,[.14,.04,.035],[x,y+.1,-4.87],'#d0d6d2');}}
 b.whiteboard(2.5,-5.4,2.4,['DUTY ROSTER','PATROL 01  ·  NORTH','PATROL 02  ·  CENTRAL','INCIDENT DESK  →']);bench(b,3.5,2.4,2.4,'#4a6472',Math.PI);b.clock(-4.2,3.1,-5.43);
}
const DARK='#283237';
export function interrogation(b:SetBuilder){
 shell(b,'#7a888b','#8f9793');b.table(0,-2.7,'#7e8d90',2.35,1,.78);b.chair(0,-3.6,'#52616a');b.chair(0,-1.7,'#52616a',Math.PI);
 block(b,[.34,.025,.24],[-.45,.835,-2.65],'#c4bda7');block(b,[.2,.06,.12],[.55,.85,-2.7],DARK);glow(b,[.018,.018,.015],[.59,.887,-2.63],'#d7655b');
 b.wall(3.8,1.65,[-1.8,2.1,-5.43],'#3a525c');for(const y of [1.25,2.95])block(b,[3.9,.05,.05],[-1.8,y,-5.39],METAL);
 door(b,3.7,-5.43,'INTERVIEW 02');glow(b,[2.2,.06,.3],[0,3.3,-2.7],'#c7e4e3',1.1);block(b,[2.3,.08,.38],[0,3.37,-2.7],DARK);
 for(const dx of [-.8,.8])b.cylinder(.008,.9,[dx,3.8,-2.7],METAL);
 block(b,[.22,.12,.32],[4.8,3.3,-5.15],DARK);const lens=b.cylinder(.045,.04,[4.8,3.27,-4.97],'#7296a2');lens.rotation.x=Math.PI/2;glow(b,[.025,.025,.025],[4.88,3.33,-4.97],'#d95d57');b.clock(-4.4,3.1,-5.43);
}
export function prisonCell(b:SetBuilder){
 shell(b,'#9daba7','#9aa49c');
 for(const y of [.5,1.85]){block(b,[1.45,.1,2.4],[-3.8,y,-2.8],METAL);b.box([1.35,.16,2.25],[-3.8,y+.12,-2.8],'#87958e');b.box([1.18,.05,1.1],[-3.8,y+.22,-2.25],'#6b7c79');b.box([.9,.1,.4],[-3.8,y+.26,-3.6],WHITE);}
 for(const x of [-4.55,-3.05])for(const z of [-4.05,-1.55])block(b,[.06,2.65,.06],[x,1.325,z],METAL);
 for(let y=.3;y<2.5;y+=.3)block(b,[.48,.035,.035],[-2.8,y,-1.55],METAL);for(const x of [-3.05,-2.55])block(b,[.035,2.65,.035],[x,1.325,-1.55],METAL);
 // Gate is in the back wall, keeping actors legible when filmed from the front.
 b.wall(1.6,2.7,[2.5,1.35,-5.43],'#34434a');for(let x=1.75;x<=3.25;x+=.18)b.cylinder(.022,2.65,[x,1.34,-5.35],METAL);for(const y of [.12,1.1,2.65])block(b,[1.65,.045,.05],[2.5,y,-5.32],METAL);
 b.table(3.8,-2.5,'#79877c',1.5,.7);b.stool(3.8,-1.65,.46,'#718077',Math.PI);b.box([.28,.02,.21],[3.75,.82,-2.45],'#c8bfa4');toilet(b,4.7,-4.3,0,true);basin(b,3.4,-4.8);windowPanel(b,-3.5,-5.43,1.3,.65,3.2);
 for(let x=-4.1;x<=-2.9;x+=.2)block(b,[.025,.7,.04],[x,3.2,-5.34],METAL);glow(b,[1.6,.05,.22],[0,3.6,-2],'#d7e2d0',.8);
}
export function prisonYard(b:SetBuilder){
 b.floor('#939e94');surfaceBlock(b,'yard-access-path','walkway',[12,.012,360],[0,-.003,0],'#a4aba1');
 for(const side of [-1,1]){b.wall(72,5.5,[0,2.75,side*38],'#9aa39b',side<0?0:Math.PI);fence(b,side*36,0,76,5,Math.PI/2);tower(b,side*16,-29);}
 for(let x=-33;x<=33;x+=3){const coil=ring(b,.3,.015,[x,5.75,-38],METAL);coil.rotation.y=Math.PI/2;}block(b,[70,.025,.025],[0,5.8,-38],METAL);
 for(const x of [-12,12]){bench(b,x,-4,2.4,'#8c9389',x<0?Math.PI/2:-Math.PI/2);block(b,[7,.05,.05],[x,2.8,-8],METAL);for(const dx of [-3.5,3.5])block(b,[.08,2.8,.08],[x+dx,1.4,-8],METAL);}
 // A separate exercise court, not a raised obstruction on the main access path.
 surfaceBlock(b,'exercise-court','court',[12,.014,18],[-21,.003,-8],'#7d8d7c');for(const x of [-26.5,-15.5])block(b,[.06,.018,17],[x,.015,-8],'#dbded0');for(const z of [-16.5,.5])block(b,[11,.018,.06],[-21,.015,z],'#dbded0');
 for(const x of [-30,30]){block(b,[.18,6,.18],[x,3,-24],METAL);glow(b,[1.2,.3,.18],[x,6,-24],'#d8e1d4',.8);}
 for(const z of [-110,-70,70,110])for(const side of [-1,1])block(b,[18,5.5,16],[side*25,2.75,z],'#a2aaa0');exteriorBounds(b);
}
export function military(b:SetBuilder){
 b.floor('#9da08b');surfaceBlock(b,'base-access-road','road',[10,.016,360],[0,-.003,0],'#7c8178');surfaceBlock(b,'base-cross-road','road',[70,.012,8],[0,-.003,-36],'#7c8178');
 for(const x of [-18,18]){fence(b,x,-15,26,3);tower(b,x<0?-31:31,-16);}
 block(b,[3.2,2.8,3],[7.5,1.4,-14],'#738275');windowPanel(b,7.5,-12.46,2,.8,1.8);b.label('CHECKPOINT  /  STOP',[0,4,-16],4.3,'#e4e6cf','#495e52');for(const x of [-5,5])block(b,[.18,4,.18],[x,2,-16],METAL);block(b,[10,.18,.18],[0,4.1,-16],METAL);
 for(const side of [-1,1])for(const z of [-55,45,100]){const x=side*23;block(b,[12,3.2,10],[x,1.6,z],'#7d8975');const roof=block(b,[13,.2,11],[x,3.3,z],'#5a685d');roof.rotation.z=side*.05;door(b,x,z+5.02,'BARRACKS','#485d54',1.3);for(const dx of [-4,4])windowPanel(b,x+dx,z+5.03,1.4,.8,1.9);}
 const roof=b.mesh(b.geometry('story-hangar',()=>new THREE.CylinderGeometry(1,1,1,24,1,true,Math.PI/2,Math.PI).rotateX(Math.PI/2)),b.material('#879185'),[-22,3,-7],[8,3,16]);roof.material.side=THREE.DoubleSide;
 block(b,[16,3,16],[-22,1.5,-7],'#82907e');block(b,[12,3.4,.04],[-22,1.7,1.03],'#36464a');for(let y=.3;y<3.4;y+=.35)block(b,[12,.018,.045],[-22,y,1.06],'#697a73');
 const pad=b.cylinder(8,.018,[23,.003,2],'#697d74');pad.castShadow=false;const rim=ring(b,7,.07,[23,.02,2],'#d5d9c5');rim.rotation.x=Math.PI/2;for(const x of [21.7,24.3])block(b,[.16,.018,4],[x,.022,2],'#e2e3cc');block(b,[2.7,.018,.16],[23,.022,2],'#e2e3cc');
 for(const x of [-8,8])for(const z of [-100,-60,30,80,130]){block(b,[.08,5,.08],[x,2.5,z],METAL);glow(b,[.5,.06,.25],[x,5,z],'#d5dcc8',.7);}exteriorBounds(b);
}
function stainedGlass(b:SetBuilder,x:number,z:number,seed:number){
 const c=document.createElement('canvas');c.width=256;c.height=512;const g=c.getContext('2d')!;g.beginPath();g.moveTo(8,504);g.lineTo(8,170);g.quadraticCurveTo(8,60,128,8);g.quadraticCurveTo(248,60,248,170);g.lineTo(248,504);g.closePath();g.clip();g.fillStyle='#354a70';g.fillRect(0,0,256,512);
 const colors=['#d8ad58','#63969c','#885f89','#c27861','#54799c'];for(let row=0;row<9;row++)for(let col=0;col<4;col++){g.fillStyle=colors[(row*3+col+seed)%colors.length];g.fillRect(col*64+3,row*60+3,58,54);}g.strokeStyle='#222e39';g.lineWidth=9;g.beginPath();g.moveTo(128,0);g.lineTo(128,512);g.moveTo(0,220);g.lineTo(256,220);g.stroke();
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshStandardMaterial({map,alphaTest:.3,emissive:'#ffffff',emissiveMap:map,emissiveIntensity:.5,roughness:.55});const pane=b.mesh(b.geometry('story-window',()=>new THREE.PlaneGeometry()),mat,[x,2.6,z],[1.55,3.1,1]);pane.castShadow=false;
}
export function church(b:SetBuilder){
 shell(b,'#c6bca3','#a59d89',14,16,6);block(b,[6,.12,2.1],[0,.06,-6],'#c1b79f');b.table(0,-6,'#aa9879',2.8,.9,.95);block(b,[3,.045,1.02],[0,1.02,-6],WHITE);
 block(b,[.13,1.9,.13],[0,2.75,-7.85],'#806844');block(b,[1.05,.13,.13],[0,3.1,-7.85],'#806844');
 for(const x of [-4.7,-2.6,2.6,4.7])stainedGlass(b,x,-7.96,Math.abs(Math.round(x*3)));
 for(const side of [-1,1])for(const z of [-3,-.7,1.6,3.9])bench(b,side*4,z,3.5,'#705b44',Math.PI);
 for(const x of [-6.5,6.5])for(const z of [-6,-1,4]){block(b,[.5,5.6,.5],[x,2.8,z],'#b6aa8f');block(b,[.7,.2,.7],[x,5.6,z],'#b6aa8f');}
 for(const x of [-1,1]){b.cylinder(.055,.32,[x,1.21,-6],WHITE);glow(b,[.025,.07,.025],[x,1.4,-6],'#edcb83',1.3);}
 // Aisle runner is flush; decorative beams leave the camera free to orbit into the cutaway.
 surfaceBlock(b,'church-aisle','walkway',[2.8,.012,11],[0,.002,0],'#827369');b.label('PEACE  /  WELCOME',[0,4.65,-7.94],3.2,'#806844','#c6bca3');
}
export function elevator(b:SetBuilder){
 shell(b,'#929e9e','#59666a',5,4.8,3.15);
 for(const x of [-1.05,1.05])b.wall(2.05,2.65,[x,1.325,-2.36],'#7b898e');for(const x of [-2.15,0,2.15])block(b,[.045,2.8,.04],[x,1.4,-2.31],'#bcc3bd');
 b.label('08  ↑',[0,2.9,-2.32],.8,'#e9ce8b','#27343b');
 for(const x of [-2.45,2.45]){block(b,[.06,.06,3.8],[x,1.03,0],METAL);for(const z of [-1.7,1.7])block(b,[.09,.045,.05],[x,1.03,z],METAL);}
 b.at(2.46,-.9,-Math.PI/2,()=>{block(b,[.3,1,.025],[2.46,1.3,-.9],'#35454d');for(let i=0;i<8;i++){const button=b.cylinder(.033,.014,[2.46+(i%2?-.065:.065),1.05+Math.floor(i/2)*.14,-.872],'#c4cec6');button.rotation.x=Math.PI/2;}glow(b,[.045,.045,.02],[2.46,1.65,-.868],'#d5bc70');});
 b.wall(.34,.85,[1.78,1.45,-2.3],'#35454d');for(let i=0;i<8;i++){const button=b.cylinder(.03,.015,[1.78+(i%2?-.065:.065),1.2+Math.floor(i/2)*.14,-2.27],'#c4cec6');button.rotation.x=Math.PI/2;}b.label('08  ↑',[1.78,2,-2.27],.4,'#e9ce8b','#27343b');
 const light=b.wall(3.8,3,[0,3.1,0],'#d5e1db');light.rotation.x=Math.PI/2;light.material=b.material('#d5e1db',.5,0,.8);light.castShadow=false;
}
