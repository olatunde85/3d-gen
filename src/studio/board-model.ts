/**
 * A board standing in a set: a mobile whiteboard on castors, a wooden chalkboard on legs, a screen on a stand or a
 * pull-down projector screen hanging above, its surface showing what drawBoard draws. The surface is redrawn only
 * when what's on it changes; a projector screen rolls down and up (boardRoll) and shows its picture once it's down.
 */
import * as THREE from 'three';
import { boardItemEnd, boardRoll, boardSurface, drawBoard, type Board } from './board';

const RESOLUTION = 2048;

export class BoardModel {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private drawn = '';
  readonly width: number;
  readonly height: number;
  /** A projector screen's fabric and the weighted bar at its foot, which follow the roll. */
  private fabric?: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; bar: THREE.Mesh; top: number };

  constructor(board: Board) {
    const place = board.place === 'frame' ? { x: 0, z: 0, yaw: 0, width: 2 } : board.place;
    const surface0 = boardSurface(board);
    this.width = surface0.width;this.height = surface0.height;
    this.canvas.width = RESOLUTION;this.canvas.height = Math.round(RESOLUTION * (surface0.height / surface0.width));
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;this.texture.anisotropy = 8;
    const w = this.width, h = this.height, cy = surface0.centre;
    this.group.position.set(place.x, 0, place.z);
    this.group.rotation.y = THREE.MathUtils.degToRad(place.yaw);
    this.group.name = `board:${board.id}`;
    this.group.userData.surfaceCentre = cy;
    if (board.kind === 'projector') { this.buildProjector(w, h, cy);return; }
    const surface = board.kind === 'screen'
      ? new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: this.texture, roughness: board.kind === 'whiteboard' ? 0.32 : 0.92, metalness: 0 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), surface);
    face.position.set(0, cy, 0.012);face.receiveShadow = board.kind !== 'screen';
    this.group.add(face);
    const metal = new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.35, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.7 });
    const black = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.4, metalness: 0.3 });
    const frame = board.kind === 'whiteboard' ? metal : board.kind === 'chalkboard' ? wood : black;
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);mesh.position.set(x, y, z);mesh.castShadow = mesh.receiveShadow = true;this.group.add(mesh);return mesh;
    };
    const border = board.kind === 'screen' ? 0.025 : board.kind === 'chalkboard' ? 0.06 : 0.03, depth = board.kind === 'screen' ? 0.06 : 0.035;
    // The back panel and the frame round the surface.
    box(w + border * 2, h + border * 2, depth * 0.6, 0, cy, -depth * 0.3, board.kind === 'chalkboard' ? wood : board.kind === 'screen' ? black : new THREE.MeshStandardMaterial({ color: '#e6e8ea', roughness: 0.6 }));
    box(w + border * 2, border, depth, 0, cy + h / 2 + border / 2, 0, frame);
    box(w + border * 2, border, depth, 0, cy - h / 2 - border / 2, 0, frame);
    box(border, h, depth, -w / 2 - border / 2, cy, 0, frame);
    box(border, h, depth, w / 2 + border / 2, cy, 0, frame);
    if (board.kind === 'screen') {
      // A stand: a column and a foot.
      box(0.09, cy - h / 2, 0.06, 0, (cy - h / 2) / 2, -0.06, black);
      box(Math.min(0.9, w * 0.45), 0.03, 0.42, 0, 0.015, -0.06, black);
    } else {
      // A tray for markers or chalk, and legs with feet (on castors for a whiteboard).
      box(w * 0.92, 0.025, 0.07, 0, cy - h / 2 - border - 0.012, 0.04, frame);
      const legH = cy - h / 2 - border;
      for (const side of [-1, 1]) {
        const x = side * (w / 2 + border * 0.5);
        box(0.045, cy + h / 2 + border - 0.02, 0.045, x, (cy + h / 2 + border) / 2, -0.03, frame);
        box(0.06, 0.04, 0.62, x, 0.09, -0.03, frame);
        if (board.kind === 'whiteboard') for (const z of [-0.3, 0.24]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16).rotateZ(Math.PI / 2), black);
          wheel.position.set(x, 0.04, z - 0.03);wheel.castShadow = true;this.group.add(wheel);
        }
      }
      if (legH > 0.3) box(w + border, 0.03, 0.03, 0, 0.32, -0.03, frame);
      // Markers on a whiteboard's tray.
      if (board.kind === 'whiteboard') ['#1f3a93', '#c0262d', '#1b1b1b'].forEach((c, i) => {
        const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
        pen.position.set(w * 0.3 + i * 0.13, cy - h / 2 - border - 0.002, 0.05);this.group.add(pen);
      });
    }
  }

  /** A pull-down projector screen: its case under the ceiling, the fabric hanging from it and a weighted bar. */
  private buildProjector(w: number, h: number, cy: number) {
    const top = cy + h / 2 + 0.05;
    const casing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.11, 0.12), new THREE.MeshStandardMaterial({ color: '#e9eaec', roughness: 0.4, metalness: 0.2 }));
    casing.position.set(0, top + 0.055, 0.02);casing.castShadow = true;this.group.add(casing);
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.13), new THREE.MeshStandardMaterial({ color: '#2a2c31', roughness: 0.5 }));
      cap.position.set(side * (w / 2 + 0.12), top + 0.055, 0.02);this.group.add(cap);
    }
    // The fabric hangs from its top edge: built with its top at y 0, so scaling it down rolls it up.
    const fabric = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), new THREE.MeshBasicMaterial({ color: '#e7e8eb', toneMapped: false, side: THREE.DoubleSide }));
    fabric.position.set(0, top, 0.025);this.group.add(fabric);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 0.04, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.4, metalness: 0.4 }));
    bar.castShadow = true;this.group.add(bar);
    this.fabric = { mesh: fabric, bar, top };
  }

  /** The middle of the surface, in the world. */
  get centre() { return this.group.localToWorld(new THREE.Vector3(0, this.group.userData.surfaceCentre as number, 0)); }

  /** Shows the board as it stands at `time`. */
  update(board: Board, time: number) {
    // A board made again (an edit) is drawn again, even when nothing on it moved in time.
    if (board !== this.board) { this.board = board;this.drawn = ''; }
    if (this.fabric) {
      // Rolling: plain fabric; down: the picture (a projector's light on it).
      const r = boardRoll(board, time), { mesh, bar, top } = this.fabric, down = r > 0.995;
      mesh.visible = r > 0.002;mesh.scale.y = Math.max(0.002, r);
      bar.position.set(0, top - this.height * r - 0.01, 0.03);
      if (down !== (mesh.material.map === this.texture)) { mesh.material.map = down ? this.texture : null;mesh.material.color.set(down ? '#ffffff' : '#e7e8eb');mesh.material.needsUpdate = true; }
      if (!down) return;
    }
    // Redraw only when something on the board has moved on: an item drawing, appearing or being cleared, or what it
    // does afterwards (code's highlights and fixes, an image's zooms and highlights) still under way.
    const key = board.items.map((i) => (time < i.start ? 0 : time >= boardItemEnd(i) + 1 ? 2 : Math.round(time * 60) + 3)).join(',') + board.kind + board.font;
    if (key === this.drawn) return;
    this.drawn = key;
    drawBoard(this.canvas.getContext('2d')!, board, time, this.canvas.width, this.canvas.height);
    this.texture.needsUpdate = true;
  }

  /** Draws again on the next update (its font has loaded). */
private board?: Board;
    invalidate() { this.drawn = ''; }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    this.texture.dispose();
    this.group.removeFromParent();
  }
}
