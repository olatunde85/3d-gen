/** Fixed-time scene rendering: no animation, camera or face state depends on wall-clock time. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { StudioActor } from './actor';
import { createSet, disposeSet, type StudioSet } from './sets';
import { durationOf, shotAt, type StudioProject } from './project';
import { sceneById } from './catalog';

export class StudioScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly output = document.createElement('canvas');
  readonly camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.03, 150);
  readonly scene = new THREE.Scene();
  readonly actors = new Map<string, StudioActor>();
  get actor() { return this.actors.values().next().value as StudioActor | undefined; }
  private set?: StudioSet;
  private environment: THREE.WebGLRenderTarget;
  private key = new THREE.DirectionalLight('#fff3df', 3);
  private rim = new THREE.DirectionalLight('#dce6ff', 1.8);
  private fill = new THREE.HemisphereLight('#f3f4ff', '#6d675f', 1.3);
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
  async setActors(next: Map<string, StudioActor>, project: StudioProject) {
    const previous = new Map(this.actors);
    for(const actor of previous.values())actor.group.removeFromParent();
    this.actors.clear();for(const [id,actor]of next){this.actors.set(id,actor);this.scene.add(actor.group);}
    try { await this.warmup(project); }
    catch(error){
      for(const actor of next.values())actor.group.removeFromParent();this.actors.clear();
      for(const [id,actor]of previous){this.actors.set(id,actor);this.scene.add(actor.group);}throw error;
    }
    for(const [id,actor]of previous)if(next.get(id)!==actor)actor.dispose();
  }
  async ready() { await Promise.all([...this.actors.values()].map(a => a.ready())); }
  private updateSet(project: StudioProject) {
    if (this.set?.group.name === project.template) return;
    if (this.set) disposeSet(this.set.group);
    this.set = createSet(project.template); this.set.group.name = project.template; this.scene.add(this.set.group);
    this.scene.background = new THREE.Color(this.set.background);
    this.scene.fog = new THREE.Fog(this.set.background, project.template === 'runway' ? 10 : 14, project.template === 'runway' ? 35 : 60);
    this.renderer.toneMappingExposure = this.set.exposure;
    this.key.color.set(this.set.key); this.rim.color.set(this.set.fill);
    this.key.intensity = project.template === 'runway' ? 3.4 : 3;
    const night = sceneById.get(project.template)?.mood === 'night';
    this.fill.intensity = night ? 0.45 : 1.2;
    this.scene.environmentIntensity = night ? 0.22 : 0.5;
    this.key.intensity = night ? 1.7 : 3; this.rim.intensity=night?1.3:1.8;
  }
  render(project: StudioProject, time: number) {
    this.updateSet(project);
    const at = shotAt(project, time), beat = at.shot;
    for (const track of project.actors) this.actors.get(track.id)?.pose(project, time, track);
    const subjects = project.actors.filter(a => beat.target === 'all' || a.id === beat.target).map(a => this.actors.get(a.id)).filter((a): a is StudioActor => !!a);
    const h = Math.max(1.6, ...subjects.map(a => a.height)), center = new THREE.Vector3();
    for (const a of subjects) center.add(a.group.position); if(subjects.length)center.multiplyScalar(1/subjects.length);
    const u = at.progress, eased = u * u * (3 - 2 * u);
    let angle = (project.template === 'courtyard' ? -0.32 : project.template === 'runway' ? 0.1 : 0.24) + THREE.MathUtils.degToRad(project.view.azimuth);
    if (project.camera === 'orbit') angle += (eased - 0.5) * 0.6;
    const size = { wide: 1.28, medium: 0.82, close: 0.43 }[beat.shot];
    const targetY = center.y + h * { wide: 0.51, medium: 0.7, close: 0.88 }[beat.shot];
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let extent = 0, depth = 0;
    for(const a of subjects){const dx=a.group.position.x-center.x,dz=a.group.position.z-center.z;
      extent=Math.max(extent,Math.abs(dx*Math.cos(angle)-dz*Math.sin(angle))+a.height*0.29);
      depth=Math.max(depth,Math.abs(dx*Math.sin(angle)+dz*Math.cos(angle)));
    }
    let distance = Math.max(h*size/(2*tan),extent/(tan*this.camera.aspect))*project.view.zoom + depth + Math.max(0,...subjects.map(a=>a.framingPadding));
    if (project.camera === 'dolly') distance *= 1.07 - 0.12 * eased;
    const elevation=THREE.MathUtils.degToRad(project.view.elevation);
    this.camera.position.set(center.x+Math.sin(angle)*distance*Math.cos(elevation),Math.max(0.12,targetY+h*0.025+Math.sin(elevation)*distance),center.z+Math.cos(angle)*distance*Math.cos(elevation));
    this.camera.lookAt(center.x, targetY, center.z);
    this.key.position.set(center.x + (project.template === 'courtyard' ? -3.5 : 3.2), 6, center.z + 4);
    const shadowExtent=Math.max(5,...subjects.map(a=>a.group.position.distanceTo(center)+2));
    if(Math.abs(this.key.shadow.camera.right-shadowExtent)>0.01){Object.assign(this.key.shadow.camera,{left:-shadowExtent,right:shadowExtent,top:shadowExtent,bottom:-shadowExtent});this.key.shadow.camera.updateProjectionMatrix();}
    this.key.target.position.set(center.x,0.8,center.z);this.rim.position.set(center.x-3,4,center.z-4);
    this.renderer.render(this.scene, this.camera);
    // Compositing in one output canvas makes preview, PNG and MP4 use exactly the same picture.
    const ctx = this.output.getContext('2d')!, W = this.output.width, H = this.output.height;
    ctx.drawImage(this.renderer.domElement, 0, 0);
    if (project.caption && project.title) {
      const duration = durationOf(project);
      const opacity = Math.min(1, time / 0.65, (duration - time) / 0.4);
      ctx.save(); ctx.globalAlpha = Math.max(0, opacity);
      const gradient = ctx.createLinearGradient(0, H * 0.6, 0, H); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.48)');
      ctx.fillStyle = gradient; ctx.fillRect(0, H * 0.6, W, H * 0.4);
      const pad = W * 0.05;
      ctx.fillStyle = '#e4b77e'; ctx.font = `600 ${Math.round(H * 0.016)}px system-ui, sans-serif`;
      ctx.fillText('A R A   S T U D I O', pad, H * 0.84);
      let font = Math.round(H * (project.aspect === 'portrait' ? 0.033 : 0.042));
      do { ctx.font = `500 ${font--}px Georgia, serif`; } while (ctx.measureText(project.title).width > W - pad * 2 && font > 12);
      ctx.fillStyle = '#fff'; ctx.fillText(project.title, pad, H * 0.91);
      ctx.restore();
    }
    const visible = this.canvas.getContext('2d')!; visible.clearRect(0, 0, W, H); visible.drawImage(this.output, 0, 0);
  }
  async warmup(project: StudioProject) { this.render(project, 0); await this.renderer.compileAsync(this.scene, this.camera); this.render(project, 0); }
  dispose() { this.actors.forEach(a => a.dispose()); if (this.set) disposeSet(this.set.group); this.environment.dispose(); this.key.shadow.map?.dispose(); this.renderer.dispose(); }
}
