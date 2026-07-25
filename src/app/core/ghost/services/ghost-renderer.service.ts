import { Injectable } from '@angular/core';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  type Scene,
} from 'three';

import type { InterpolatedReplaySample } from '../../replay/utils/replay-interpolation';
import type { FlightReplay } from '../../replay/models/replay.model';

export interface GhostRenderAppearance {
  opacity: number;
  trailEnabled: boolean;
  visible: boolean;
}

export type GhostStyle = 'benchmark' | 'personal_best' | 'rival' | 'top';

interface GhostHandle {
  root: Group;
  props: Group[];
  trail: Line | null;
  disposables: Array<{ dispose: () => void }>;
  propSpin: number;
}

/**
 * Visual-only ghost drone. Does not cast shadows or participate in simulation.
 */
@Injectable({ providedIn: 'root' })
export class GhostRendererService {
  private scene: Scene | null = null;
  private readonly ghosts = new Map<string, GhostHandle>();
  private maxVisible = 2;
  private attached = false;

  attach(scene: Scene): void {
    if (this.attached && this.scene === scene) {
      return;
    }
    this.detach();
    this.scene = scene;
    this.attached = true;
  }

  detach(): void {
    this.clearAll();
    this.scene = null;
    this.attached = false;
  }

  /** Backward-compatible personal-best ghost controls. */
  setVisible(visible: boolean): void {
    this.setGhostVisible('personal_best', visible);
  }

  setOpacity(opacity: number): void {
    const o = Math.min(0.85, Math.max(0.1, opacity));
    const ghost = this.upsertGhost('personal_best', 'personal_best');
    ghost.root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const mat of mats) {
          const m = mat as MeshStandardMaterial;
          if ('opacity' in m) {
            m.transparent = true;
            m.opacity = o;
            m.depthWrite = false;
          }
        }
      }
    });
  }

  applySample(sample: InterpolatedReplaySample | null, dt: number): void {
    this.updateGhostSample('personal_best', sample, dt);
  }

  upsertGhost(id: string, style: GhostStyle = 'personal_best'): GhostHandle {
    const existing = this.ghosts.get(id);
    if (existing) return existing;
    const handle: GhostHandle = { root: this.buildGhostDrone(style), props: [], trail: null, disposables: [], propSpin: 0 };
    handle.root.traverse((child) => {
      if (child.name === 'ghost-prop') handle.props.push(child as Group);
    });
    handle.root.visible = false;
    this.scene?.add(handle.root);
    this.ghosts.set(id, handle);
    return handle;
  }

  setMaxVisible(max: number): void {
    this.maxVisible = Math.max(1, Math.min(4, Math.floor(max)));
    const visible = [...this.ghosts.values()].filter((ghost) => ghost.root.visible);
    for (const ghost of visible.slice(this.maxVisible)) ghost.root.visible = false;
  }

  setGhostVisible(id: string, visible: boolean): void {
    const ghost = this.upsertGhost(id);
    if (visible && !ghost.root.visible) {
      const count = [...this.ghosts.values()].filter((item) => item.root.visible).length;
      if (count >= this.maxVisible) return;
    }
    ghost.root.visible = visible;
    if (ghost.trail) ghost.trail.visible = visible;
  }

  updateGhostSample(id: string, sample: InterpolatedReplaySample | null, dt: number): void {
    if (!sample) return;
    const ghost = this.upsertGhost(id);
    ghost.root.position.set(
      sample.position.x,
      sample.position.y,
      sample.position.z,
    );
    ghost.root.quaternion.set(
      sample.orientation.x,
      sample.orientation.y,
      sample.orientation.z,
      sample.orientation.w,
    );

    const throttle = Math.min(1, Math.max(0, sample.throttle));
    const spinRate = sample.armed ? 8 + throttle * 40 : 0;
    ghost.propSpin += spinRate * dt;
    for (let i = 0; i < ghost.props.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      ghost.props[i].rotation.y = ghost.propSpin * dir;
    }
  }

  setTrailFromReplay(replay: FlightReplay | null, enabled: boolean): void {
    this.setGhostTrail('personal_best', replay, enabled);
  }

  setGhostTrail(id: string, replay: FlightReplay | null, enabled: boolean): void {
    this.clearGhostTrail(id);
    if (!enabled || !replay || !this.scene) {
      return;
    }
    const frames = replay.frames;
    if (frames.length < 2) {
      return;
    }

    // Decimate trail for performance.
    const stride = Math.max(1, Math.floor(frames.length / 400));
    const positions: number[] = [];
    for (let i = 0; i < frames.length; i += stride) {
      const p = frames[i].position;
      positions.push(p.x, p.y, p.z);
    }
    const last = frames[frames.length - 1].position;
    positions.push(last.x, last.y, last.z);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({
      color: 0x5ec8ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const line = new Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 1;
    this.scene.add(line);
    const ghost = this.upsertGhost(id);
    ghost.trail = line;
    ghost.disposables.push(geo, mat);
  }

  clearTrail(): void {
    this.clearGhostTrail('personal_best');
  }

  clearGhostTrail(id: string): void {
    const ghost = this.ghosts.get(id);
    if (!ghost?.trail) return;
    this.scene?.remove(ghost.trail);
    ghost.trail = null;
  }

  clearGhost(id: string): void {
    const ghost = this.ghosts.get(id);
    if (!ghost) return;
    this.scene?.remove(ghost.root);
    if (ghost.trail) this.scene?.remove(ghost.trail);
    for (const item of ghost.disposables) item.dispose();
    ghost.root.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
    });
    this.ghosts.delete(id);
  }

  clearAll(): void {
    [...this.ghosts.keys()].forEach((id) => this.clearGhost(id));
  }

  dispose(): void {
    this.detach();
  }

  private buildGhostDrone(style: GhostStyle): Group {
    const group = new Group();
    group.name = 'ghost-drone';
    const palette = ghostPalette(style);

    const bodyMat = new MeshStandardMaterial({
      color: palette.body,
      emissive: new Color(palette.accent),
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.15,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const accentMat = new MeshStandardMaterial({
      color: palette.accent,
      emissive: new Color(palette.accent),
      emissiveIntensity: 0.25,
      roughness: 0.45,
      metalness: 0.1,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const propMat = new MeshStandardMaterial({
      color: palette.prop,
      emissive: new Color(palette.accent),
      emissiveIntensity: 0.15,
      roughness: 0.7,
      metalness: 0.05,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: DoubleSide,
    });
    const bodyGeo = new BoxGeometry(0.28, 0.08, 0.36);
    const noseGeo = new BoxGeometry(0.1, 0.06, 0.08);
    const armGeo = new BoxGeometry(0.06, 0.04, 0.55);
    const bladeGeo = new BoxGeometry(0.26, 0.012, 0.03);
    const body = new Mesh(bodyGeo, bodyMat);
    body.castShadow = false;
    body.receiveShadow = false;
    group.add(body);

    const nose = new Mesh(noseGeo, accentMat);
    nose.position.set(0, 0.02, -0.2);
    nose.castShadow = false;
    group.add(nose);

    const armPositions: Array<[number, number, number, number]> = [
      [0.18, 0, -0.18, Math.PI / 4],
      [-0.18, 0, -0.18, -Math.PI / 4],
      [0.18, 0, 0.18, -Math.PI / 4],
      [-0.18, 0, 0.18, Math.PI / 4],
    ];
    for (const [x, y, z, rot] of armPositions) {
      const arm = new Mesh(armGeo, accentMat);
      arm.position.set(x, y, z);
      arm.rotation.y = rot;
      arm.castShadow = false;
      group.add(arm);
    }

    const propOffsets: Array<[number, number, number]> = [
      [0.28, 0.05, -0.28],
      [-0.28, 0.05, -0.28],
      [0.28, 0.05, 0.28],
      [-0.28, 0.05, 0.28],
    ];
    for (const [x, y, z] of propOffsets) {
      const propGroup = new Group();
      propGroup.name = 'ghost-prop';
      propGroup.position.set(x, y, z);
      const bladeA = new Mesh(bladeGeo, propMat);
      const bladeB = new Mesh(bladeGeo, propMat);
      bladeB.rotation.y = Math.PI / 2;
      propGroup.add(bladeA, bladeB);
      group.add(propGroup);
    }

    // Soft vertical marker so ghost stays readable against terrain.
    const markerGeo = new CylinderGeometry(0.02, 0.02, 0.6, 6);
    const markerMat = new MeshStandardMaterial({
      color: palette.accent,
      emissive: new Color(palette.accent),
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const marker = new Mesh(markerGeo, markerMat);
    marker.position.y = -0.35;
    marker.castShadow = false;
    group.add(marker);
    const label = createLabel(palette.label, palette.accent);
    if (label) {
      label.position.y = 0.6;
      label.scale.set(0.7, 0.18, 1);
      group.add(label);
    }

    return group;
  }
}

function ghostPalette(style: GhostStyle): { body: number; accent: number; prop: number; label: string } {
  switch (style) {
    case 'benchmark': return { body: 0x5a4811, accent: 0xffdf78, prop: 0xffffff, label: 'BENCHMARK' };
    case 'rival': return { body: 0x5a173e, accent: 0xff8a3d, prop: 0xffb1df, label: 'RIVAL' };
    case 'top': return { body: 0x294348, accent: 0xdde7e8, prop: 0xa9c5c7, label: 'ELITE' };
    default: return { body: 0x123d48, accent: 0x5ec8ff, prop: 0xa8e6ff, label: 'PERSONAL BEST' };
  }
}

function createLabel(text: string, color: number): Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = 'bold 24px sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#ffffff';
  context.fillText(text, 128, 40);
  const material = new SpriteMaterial({ map: new CanvasTexture(canvas), color, transparent: true, depthWrite: false });
  return new Sprite(material);
}
