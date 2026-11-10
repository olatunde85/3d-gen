/** Escape depot geometry in metres. Rendering, movement and navigation share these bounds. */
export interface Point {x:number;z:number}
export interface Block {id:string;x:number;z:number;w:number;d:number;h:number;kind:'wall'|'container'|'crate'|'building';color:string}
export const WORLD={minX:-15,maxX:15,minZ:-18,maxZ:16};
export const START:Point={x:-10,z:11},KEY:Point={x:-10,z:-1.5},DOOR:Point={x:0,z:-6},EXIT:Point={x:10,z:-14};
export const PATROL:Point[]=[{x:2,z:-10},{x:11,z:-8.5},{x:2,z:-15}];
export const BLOCKS:Block[]=[
 {id:'west',x:-15,z:-1,w:.4,d:34,h:2.6,kind:'wall',color:'#535e65'},
 {id:'east',x:15,z:-1,w:.4,d:34,h:2.6,kind:'wall',color:'#535e65'},
 {id:'north',x:0,z:-18,w:30,d:.4,h:2.6,kind:'wall',color:'#535e65'},
 {id:'south',x:0,z:16,w:30,d:.4,h:1.6,kind:'wall',color:'#535e65'},
 {id:'partition-west',x:-8.225,z:-6,w:13.55,d:.4,h:2.3,kind:'wall',color:'#727c7e'},
 {id:'partition-east',x:8.225,z:-6,w:13.55,d:.4,h:2.3,kind:'wall',color:'#727c7e'},
 {id:'store-01',x:-5,z:5,w:3.4,d:7,h:2.7,kind:'container',color:'#416166'},
 {id:'store-02',x:5,z:6,w:4,d:6,h:2.7,kind:'container',color:'#a67648'},
 {id:'store-03',x:6,z:-11.5,w:4,d:3,h:2.4,kind:'container',color:'#416166'},
 {id:'crates-01',x:-11.7,z:3,w:1.7,d:2,h:1.15,kind:'crate',color:'#977653'},
 {id:'crates-02',x:-5,z:-1.5,w:2,d:2,h:1.3,kind:'crate',color:'#977653'},
 {id:'crates-03',x:-6,z:-11,w:3,d:3,h:1.5,kind:'crate',color:'#977653'},
];
export interface Rect {minX:number;maxX:number;minZ:number;maxZ:number;obb?:{x:number;z:number;yaw:number;box:Rect}}
export const rectLocal=(p:Point,o:NonNullable<Rect['obb']>):Point=>{const c=Math.cos(o.yaw),s=Math.sin(o.yaw),dx=p.x-o.x,dz=p.z-o.z;return {x:c*dx-s*dz,z:s*dx+c*dz};};
export const rectOf=(b:Pick<Block,'x'|'z'|'w'|'d'>):Rect=>({minX:b.x-b.w/2,maxX:b.x+b.w/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2});
export const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
export function doorRect(progress:number,position:Point=DOOR,width=2.9):Rect {
 const a=progress*Math.PI/2,c=Math.cos(a),s=Math.sin(a),hinge=position.x-width/2;
 return {minX:hinge-.13*s,maxX:hinge+width*c+.13*s,minZ:position.z-width*s-.13*c,maxZ:position.z+.13*c};
}
export const obstacles=(progress=0,blocks:readonly Block[]=BLOCKS,gate:Point=DOOR,width=2.9):Rect[]=>[...blocks.map(rectOf),doorRect(progress,gate,width)];
export function blocked(p:Point,radius:number,rects:readonly Rect[]):boolean {
 return rects.some(r=>{const q=r.obb?rectLocal(p,r.obb):p,box=r.obb?.box??r;return Math.hypot(q.x-Math.max(box.minX,Math.min(box.maxX,q.x)),q.z-Math.max(box.minZ,Math.min(box.maxZ,q.z)))<radius-1e-7;});
}
/** Substeps smaller than the capsule radius prevent tunnelling. Axes slide independently. */
export function move(p:Point,dx:number,dz:number,radius:number,rects:readonly Rect[]):Point {
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));let q={...p};
 for(let i=0;i<steps;i++){
  const x={x:q.x+dx/steps,z:q.z};if(!blocked(x,radius,rects))q=x;
  const z={x:q.x,z:q.z+dz/steps};if(!blocked(z,radius,rects))q=z;
 }
 return q;
}
export function clearPath(a:Point,b:Point,rects:readonly Rect[],radius=0):boolean {
 if(radius){const n=Math.ceil(distance(a,b)/.12);for(let i=0;i<=n;i++){const t=n?i/n:0;if(blocked({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},radius,rects))return false;}return true;}
 const fromPoint=a,toPoint=b;
 // Exact slab intersection, so even a thin wall blocks a guard's view.
 return !rects.some(rect=>{const a=rect.obb?rectLocal(fromPoint,rect.obb):fromPoint,b=rect.obb?rectLocal(toPoint,rect.obb):toPoint,r=rect.obb?.box??rect;let lo=0,hi=1;for(const axis of ['x','z']as const){const min=axis==='x'?r.minX:r.minZ,max=axis==='x'?r.maxX:r.maxZ,d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max)return false;}else{const t0=(min-a[axis])/d,t1=(max-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}}return true;});
}
/** Bounded grid A*, with collision-checked diagonal edges and path smoothing. */
export function route(from:Point,to:Point,rects:readonly Rect[],radius=.4,bounds:Rect=WORLD):Point[] {
 if(clearPath(from,to,rects,radius))return [{...to}];
 const nearest=(p:Point)=>{let best:Point|undefined,score=Infinity;for(let x=Math.round(p.x)-2;x<=Math.round(p.x)+2;x++)for(let z=Math.round(p.z)-2;z<=Math.round(p.z)+2;z++){const q={x,z},d=distance(p,q);if(x>bounds.minX&&x<bounds.maxX&&z>bounds.minZ&&z<bounds.maxZ&&d<score&&!blocked(q,radius,rects)&&clearPath(p,q,rects,radius)){best=q;score=d;}}return best;};
 const start=nearest(from),goal=nearest(to);if(!start||!goal)return [];
 const key=(p:Point)=>`${p.x},${p.z}`,open=[start],cost=new Map([[key(start),0]]),parent=new Map<string,Point>(),closed=new Set<string>();let found:Point|undefined;
 while(open.length){open.sort((a,b)=>(cost.get(key(a))!+distance(a,goal))-(cost.get(key(b))!+distance(b,goal)));const p=open.shift()!,id=key(p);if(closed.has(id))continue;closed.add(id);if(id===key(goal)){found=p;break;}
  for(const dx of [-1,0,1])for(const dz of [-1,0,1]){if(!dx&&!dz)continue;const q={x:p.x+dx,z:p.z+dz},k=key(q);if(q.x<=bounds.minX||q.x>=bounds.maxX||q.z<=bounds.minZ||q.z>=bounds.maxZ||closed.has(k)||!clearPath(p,q,rects,radius))continue;const c=cost.get(id)!+Math.hypot(dx,dz);if(c<(cost.get(k)??Infinity)){cost.set(k,c);parent.set(k,p);open.push(q);}}
 }
 if(!found)return [];const result:Point[]=[to,found];while(key(found)!==key(start)){found=parent.get(key(found))!;result.push(found);}result.reverse();
 const smooth:Point[]=[];let origin=from,index=0;while(index<result.length){let next=index;for(let j=index+1;j<result.length;j++){if(clearPath(origin,result[j],rects,radius))next=j;}smooth.push(result[next]);origin=result[next];index=next+1;}return smooth;
}
