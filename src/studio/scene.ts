/** Fixed-time scene rendering: no animation, camera or face state depends on wall-clock time. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { StudioActor } from './actor';
import { createSet, disposeSet, type StudioSet } from './sets';
import { durationOf, shotAt, type StudioProject } from './project';
import { drawTextCues, resolveTextActor, type TextLayout } from './text';
import { sceneById,isImportedSet,isOutdoorScene } from './catalog';
import {VehicleStage} from './vehicle-stage';
import { BAKED_LAYER } from './set-files';
import { hasSet, loadedSet, loadSet } from './set-store';

export class StudioScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly output = document.createElement('canvas');
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.03, 1000);
  readonly scene = new THREE.Scene();
  readonly actors = new Map<string, StudioActor>();
  selectionId?: string;
  textLayouts: TextLayout[] = [];
  freezeCamera = false;
  /** The film's title card shows only in a film's first scene. */
  titleCard = true;
  /** Black over the picture, 0 to 1: the fades between scenes. */
  darkness = 0;
  private readonly raycaster = new THREE.Raycaster();
  get actor() { return this.actors.values().next().value as StudioActor | undefined; }
  private set?: StudioSet;
  private environment: THREE.WebGLRenderTarget;
  private key = new THREE.DirectionalLight('#fff3df', 3);
  private rim = new THREE.DirectionalLight('#dce6ff', 1.8);
  private fill = new THREE.HemisphereLight('#f3f4ff', '#6d675f', 1.3);
  /** An imported set loading in the background (see set-store.ts): a plain stage stands in, and onSetReady says when it's here. */
  private setLoading?: Promise<unknown>;
  onSetReady?: () => void;
  /** Under the cast on a baked set: catches the cast's shadows (the set's own light is baked). */
  private shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.42 }));
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearAlpha(1);
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.5; pmrem.dispose(); room.dispose();
    this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.normalBias = 0.018; this.key.shadow.bias = -0.0002;
    this.key.shadow.radius = 4;
    Object.assign(this.key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 25 });
    this.scene.add(this.key, this.key.target, this.rim, this.fill);
    this.resize(1280, 720);
  }
  resize(width: number, height: number) {
    this.output.width = this.canvas.width = width; this.output.height = this.canvas.height = height;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }
  /** Puts a cast on the stage. Characters leaving it are released: disposed, unless `release` keeps them for another scene. */
  async setActors(next: Map<string, StudioActor>, project: StudioProject, release = (actor: StudioActor) => actor.dispose()) {
    const previous = new Map(this.actors);
    for(const actor of previous.values())actor.detach();
    this.actors.clear();for(const [id,actor]of next){this.actors.set(id,actor);this.scene.add(actor.group);}
    try { await this.warmup(project); }
    catch(error){
      for(const actor of next.values())actor.detach();this.actors.clear();
      for(const [id,actor]of previous){this.actors.set(id,actor);this.scene.add(actor.group);}throw error;
    }
    const staying=new Set(next.values());for(const actor of previous.values())if(!staying.has(actor))release(actor);
  }
  /** Imported sets that failed to load: the stand-in stays rather than trying again every frame. */
  private setFailed = new Set<string>();
  /** Builds the set again on the next frame: its file was imported again or removed. */
  invalidateSet(id: string) {
    this.setFailed.delete(id);
    if (this.set?.group.name === id) { disposeSet(this.set.group);this.set = undefined; }
  }
  async ready() { await Promise.all([...this.actors.values()].map(a => a.ready()));await this.setLoading; }
  /** The seats in the project's set, building the set if it isn't showing yet. */
  seatsFor(project: StudioProject) { this.updateSet(project); return this.set!.seats; }
  private updateSet(project: StudioProject) {
    if (this.set?.group.name === project.template) return;
    // An imported set loads first: a plain dark stage stands in meanwhile, and the scene is drawn again once it's here.
    // A set that isn't in this browser keeps the stand-in.
    if (isImportedSet(project.template) && !loadedSet(project.template)) {
      if (!this.setLoading && hasSet(project.template) && !this.setFailed.has(project.template)) { const id = project.template;this.setLoading = loadSet(id).then(() => { this.setLoading = undefined;this.onSetReady?.(); }, (error) => { this.setLoading = undefined;this.setFailed.add(id);console.error(error);this.onSetReady?.(); }); }
      if (this.set?.group.name !== 'loading') { if (this.set) disposeSet(this.set.group);this.set = { group: Object.assign(new THREE.Group(), { name: 'loading' }), seats: [], background: '#15171a', floor: '#000000', key: '#fff3df', fill: '#dce6ff', exposure: 1 };this.scene.add(this.set.group);this.scene.background = new THREE.Color('#15171a'); }
      return;
    }
    if (this.set) disposeSet(this.set.group);
    this.set = createSet(project.template); this.set.group.name = project.template; this.scene.add(this.set.group);
    this.shadowCatcher.removeFromParent();
    this.scene.background = new THREE.Color(this.set.background);
    this.scene.fog = new THREE.Fog(this.set.background, isOutdoorScene(project.template)?100:project.template === 'runway' ? 10 : 14, isOutdoorScene(project.template)?450:project.template === 'runway' ? 35 : 60);
    this.renderer.toneMappingExposure = this.set.exposure;
    this.key.color.set(this.set.key); this.rim.color.set(this.set.fill);
    this.key.intensity = project.template === 'runway' ? 3.4 : 3;
    const night = sceneById.get(project.template)?.mood === 'night';
    this.fill.intensity = night ? 0.45 : 1.2;
    this.scene.environmentIntensity = night ? 0.22 : 0.5;
    this.key.intensity = night ? 1.7 : 3; this.rim.intensity=night?1.3:1.8;
    // A baked set lights the cast as its bake lights the room: the key from its sun, a matching fill, no fog.
    const baked = this.set.baked?.manifest;
    if (baked) {
      const { sun, fill } = baked.light;
      this.key.color.set(sun.color);this.key.intensity = sun.intensity;this.rim.intensity = 0.6;
      this.fill.color.set(fill.color);this.fill.groundColor.set('#3a342e');this.fill.intensity = fill.intensity;
      this.scene.fog = null;
      // The environment lights the cast softly and gives the set's surfaces a sheen over their baked light.
      this.scene.environmentIntensity = 0.3;
      const [x0, z0, x1, z1] = baked.room;
      this.shadowCatcher.scale.set(x1 - x0, 1, z1 - z0);this.shadowCatcher.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2);
      this.shadowCatcher.receiveShadow = true;this.scene.add(this.shadowCatcher);
    }
  }
  render(project: StudioProject, time: number) {
    this.updateSet(project);
    const at = shotAt(project, time), beat = at.shot;
    const vehicles=new VehicleStage(project,time,new Map([...this.actors].map(([id,actor])=>[id,actor.vehicleBody])));
    for (const track of project.actors) this.actors.get(track.id)?.pose(project, time, track, this.set?.seats,vehicles);
    // Off-stage characters are not framed; a shot of only off-stage characters frames everyone on stage.
    const onStage = project.actors.map(a => this.actors.get(a.id)).filter((a): a is StudioActor => !!a && !a.hidden);
    const chosen = project.actors.filter(a => beat.target === 'all' || a.id === beat.target).map(a => this.actors.get(a.id)).filter((a): a is StudioActor => !!a && !a.hidden);
    const subjects = chosen.length ? chosen : onStage;
    const position=(a:StudioActor)=>a.stagePosition;
    const h = Math.max(1.6, ...subjects.map(a => a.height)), center = new THREE.Vector3();
    for (const a of subjects) center.add(position(a)); if(subjects.length)center.multiplyScalar(1/subjects.length);
    const u = at.progress, eased = u * u * (3 - 2 * u);
    const view=beat.view??project.view,cameraMove=beat.camera??project.camera;
    let angle = (project.template === 'courtyard' ? -0.32 : project.template === 'runway' ? 0.1 : 0.24) + THREE.MathUtils.degToRad(view.azimuth);
    if (cameraMove === 'orbit') angle += (eased - 0.5) * 0.6;
    const size = { wide: 1.28, medium: 0.82, close: 0.43 }[beat.shot];
    const targetY = center.y + h * { wide: 0.51, medium: 0.7, close: 0.88 }[beat.shot];
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let extent = 0, depth = 0;
    for(const a of subjects){const dx=position(a).x-center.x,dz=position(a).z-center.z;
      extent=Math.max(extent,Math.abs(dx*Math.cos(angle)-dz*Math.sin(angle))+a.height*0.29);
      depth=Math.max(depth,Math.abs(dx*Math.sin(angle)+dz*Math.cos(angle)));
    }
    let distance = Math.max(h*size/(2*tan),extent/(tan*this.camera.aspect))*view.zoom + depth + Math.max(0,...subjects.map(a=>a.framingPadding));
    if (cameraMove === 'dolly') distance *= 1.07 - 0.12 * eased;
    const elevation=THREE.MathUtils.degToRad(view.elevation);
    if(beat.shot==='wide')for(const actor of subjects){const bounds=actor.framingBounds;if(!bounds)continue;let fit=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const dx=x-center.x,dz=z-center.z,dy=y-targetY,lateral=dx*Math.cos(angle)-dz*Math.sin(angle),forward=dx*Math.sin(angle)+dz*Math.cos(angle),up=dy*Math.cos(elevation)-forward*Math.sin(elevation),towards=dy*Math.sin(elevation)+forward*Math.cos(elevation);fit=Math.max(fit,Math.abs(lateral)/(tan*this.camera.aspect)+towards,Math.abs(up)/tan+towards);}distance=Math.max(distance,fit*1.08*view.zoom);}
    if(!this.freezeCamera){this.camera.position.set(center.x+Math.sin(angle)*distance*Math.cos(elevation),Math.max(0.12,targetY+h*0.025+Math.sin(elevation)*distance),center.z+Math.cos(angle)*distance*Math.cos(elevation));
    this.camera.lookAt(center.x, targetY, center.z); }
    // Wide exterior shots need depth precision for paths, water and road markings hundreds of metres away.
    const near=Math.max(.03,Math.min(.5,this.camera.position.distanceTo(center)/300));
    if(Math.abs(this.camera.near-near)>.001){this.camera.near=near;this.camera.updateProjectionMatrix();}
    const sun = this.set?.baked?.manifest.light.sun.direction;
    if (sun) this.key.position.set(center.x - sun[0] * 12, center.y - sun[1] * 12, center.z - sun[2] * 12);
    else this.key.position.set(center.x + (project.template === 'courtyard' ? -3.5 : 3.2), center.y+6, center.z + 4);
    const shadowExtent=Math.max(5,...subjects.map(a=>a.group.position.distanceTo(center)+2));
    if(Math.abs(this.key.shadow.camera.right-shadowExtent)>0.01){Object.assign(this.key.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});this.key.shadow.camera.updateProjectionMatrix();}
    this.key.target.position.set(center.x,center.y+.8,center.z);this.rim.position.set(center.x-3,center.y+4,center.z-4);
    if (this.set?.baked) this.renderBaked(); else this.renderer.render(this.scene, this.camera);
    // Compositing in one output canvas makes preview, PNG and MP4 use exactly the same picture.
    const ctx = this.output.getContext('2d')!, W = this.output.width, H = this.output.height;
    ctx.drawImage(this.renderer.domElement, 0, 0);
    if (project.caption && project.title && this.titleCard) {
      const duration = durationOf(project),titleLift=(project.texts??[]).some(c=>c.style==='subtitle'&&c.anchor==='screen'&&c.y>.7&&time>=c.start&&time<c.start+c.duration)?.11:0;
      const opacity = Math.min(1, time / 0.65, (duration - time) / 0.4);
      ctx.save(); ctx.globalAlpha = Math.max(0, opacity);
      const gradient = ctx.createLinearGradient(0, H * 0.6, 0, H); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.48)');
      ctx.fillStyle = gradient; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      const pad = W * 0.05;
      ctx.fillStyle = '#e4b77e'; ctx.font = `600 ${Math.round(H * 0.016)}px system-ui, sans-serif`;
      ctx.fillText('A R A   S T U D I O', pad, H * (0.84-titleLift));
      let font = Math.round(H * (project.aspect === 'portrait' ? 0.033 : 0.042));
      do { ctx.font = `500 ${font--}px Georgia, serif`; } while (ctx.measureText(project.title).width > W - pad * 2 && font > 12);
      ctx.fillStyle = '#fff'; ctx.fillText(project.title, pad, H * (0.91-titleLift));
      ctx.restore();
    }
    this.textLayouts=drawTextCues(ctx,project.texts??[],time,W,H,id=>{
      const actor=this.actors.get(resolveTextActor(id));if(!actor)return;
      const bone=actor.mesh.skeleton.bones.find(b=>b.name==='HeadTop_End')??actor.mesh.skeleton.bones.find(b=>b.name==='Head'||b.name==='head');
      const point=bone?new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld):actor.group.position.clone().add(new THREE.Vector3(0,actor.height,0));
      if(bone?.name!=='HeadTop_End')point.y+=actor.height*.12;
      point.project(this.camera);if(point.z< -1||point.z>1||Math.abs(point.x)>1.1||Math.abs(point.y)>1.3)return;
      return{x:(point.x+1)/2,y:(1-point.y)/2};
    });
    if (this.darkness > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, this.darkness); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    const visible = this.canvas.getContext('2d')!; visible.clearRect(0, 0, W, H); visible.drawImage(this.output, 0, 0);
    this.drawSelection(visible);
  }
  /**
   * A baked set in two passes: the set first, in its baked light alone (the cast's lights off, so nothing lights it
   * twice), then the cast and everything else over it in lights matched to the bake, keeping the set's depth so it
   * hides what's behind it.
   */
  private renderBaked() {
    const lights = [this.key, this.rim, this.fill], background = this.scene.background;
    for (const light of lights) light.visible = false;
    this.camera.layers.set(BAKED_LAYER);
    this.renderer.render(this.scene, this.camera);
    for (const light of lights) light.visible = true;
    this.camera.layers.set(0);
    this.scene.background = null;this.renderer.autoClear = false;
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = true;this.scene.background = background;
  }
  private pointerRay(x: number, y: number) {
    const rect=this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.camera);
    return this.raycaster.ray;
  }
  groundPoint(x: number, y: number, elevation=0) {
    const point=this.pointerRay(x,y).intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-elevation),new THREE.Vector3());
    return point?{x:point.x,z:point.z}:undefined;
  }
  pickActor(x: number, y: number) {
    this.pointerRay(x,y);let closest=Infinity,selected:string|undefined;
    for(const [id,actor]of this.actors){
      // Conservative posed-bone bounds avoid stale bind-pose bounds when picking animated meshes.
      const inverse=new THREE.Matrix4().copy(actor.mesh.matrixWorld).invert(),bounds=new THREE.Box3(),point=new THREE.Vector3();
      for(const bone of actor.mesh.skeleton.bones)bounds.expandByPoint(point.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inverse));
      bounds.expandByScalar(actor.height*.25+(actor.character.params.weapon!=='none'?1:0));
      actor.mesh.boundingBox=bounds;actor.mesh.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
      const hit=this.raycaster.intersectObject(actor.mesh,false)[0];if(hit&&hit.distance<closest){closest=hit.distance;selected=id;}
    }
    return selected;
  }
  /** Preview-only: a ring with a dark outline at the feet and a name tag above the head, legible on any set. */
  private drawSelection(ctx: CanvasRenderingContext2D) {
    const actor=this.selectionId?this.actors.get(this.selectionId):undefined;if(!actor)return;
    const W=this.canvas.width,H=this.canvas.height,origin=actor.stagePosition,radius=actor.height*.3;
    // Sized for the screen, whatever the film's resolution or the preview's size.
    const u=Math.max(W/1280,W/(this.canvas.clientWidth||W)),ring='#8ea6ff',ink='rgba(10,12,16,.8)';
    const project=(p:THREE.Vector3)=>{p.project(this.camera);return{x:(p.x+1)*W/2,y:(1-p.y)*H/2,z:p.z};};
    const stroke=()=>{ctx.strokeStyle=ink;ctx.lineWidth=5.5*u;ctx.stroke();ctx.strokeStyle=ring;ctx.lineWidth=2.6*u;ctx.stroke();};
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    let visible=false,whole=true;const points=[];
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,p=project(new THREE.Vector3(origin.x+Math.cos(a)*radius,origin.y+.018,origin.z+Math.sin(a)*radius));points.push(p);if(p.z< -1||p.z>1)whole=false;else if(p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H)visible=true;}
    if(visible){
      ctx.beginPath();let started=false;for(const p of points){if(p.z< -1||p.z>1){started=false;continue;}if(!started)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);started=true;}
      if(whole){ctx.fillStyle='rgba(244,199,143,.2)';ctx.fill();}
      stroke();
    } else {
      // Close shots may exclude the feet; corner marks still identify the selected subject.
      const projected=actor.mesh.skeleton.bones.map(b=>project(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld))).filter(p=>p.z>=-1&&p.z<=1);
      if(projected.length){const minX=Math.min(...projected.map(p=>p.x))-8*u,maxX=Math.max(...projected.map(p=>p.x))+8*u,minY=Math.min(...projected.map(p=>p.y))-8*u,maxY=Math.max(...projected.map(p=>p.y))+8*u;
        if(maxX>0&&minX<W&&maxY>0&&minY<H){const left=Math.max(8*u,minX),right=Math.min(W-8*u,maxX),top=Math.max(8*u,minY),bottom=Math.min(H-8*u,maxY),d=Math.min(18*u,W*.02);ctx.beginPath();for(const [x,y,sx,sy]of [[left,top,1,1],[right,top,-1,1],[left,bottom,1,-1],[right,bottom,-1,-1]]){ctx.moveTo(x+sx*d,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*d);}stroke();}
      }
    }
    // Name tag, kept inside the frame.
    const bone=actor.mesh.skeleton.bones.find(b=>b.name==='HeadTop_End')??actor.mesh.skeleton.bones.find(b=>b.name==='Head'||b.name==='head');
    const head=bone?new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld):origin.clone().add(new THREE.Vector3(0,actor.height,0));
    if(bone?.name!=='HeadTop_End')head.y+=actor.height*.1;
    const tip=project(head);
    if(tip.z>=-1&&tip.z<=1){
      const name=actor.character.params.name||'Selected character',size=Math.round(13*u),padX=10*u,h=24*u,gap=10*u;
      ctx.font=`650 ${size}px system-ui,-apple-system,'Segoe UI',sans-serif`;const w=Math.min(W*.5,ctx.measureText(name).width+padX*2);
      const x=Math.min(W-w-6*u,Math.max(6*u,tip.x-w/2)),y=Math.min(H-h-6*u,Math.max(6*u,tip.y-gap-h-6*u)),r=h/2;
      ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=8*u;ctx.fillStyle=ring;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();ctx.shadowBlur=0;
      const px=Math.min(x+w-r,Math.max(x+r,tip.x));ctx.beginPath();ctx.moveTo(px-6*u,y+h-0.5);ctx.lineTo(px,y+h+6*u);ctx.lineTo(px+6*u,y+h-0.5);ctx.closePath();ctx.fill();
      ctx.fillStyle='#1d1f24';ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(name,x+w/2,y+h/2+0.5*u,w-padX*2);
    }
    ctx.restore();
  }
  async warmup(project: StudioProject) { this.render(project, 0); await this.renderer.compileAsync(this.scene, this.camera); this.render(project, 0); }
  dispose() { new Set(this.actors.values()).forEach(a => a.dispose()); if (this.set) disposeSet(this.set.group); this.environment.dispose(); this.key.shadow.map?.dispose(); this.renderer.dispose(); }
}
