import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';

export interface ParticlePoolOptions {
  maxParticles: number;
  color: number;
  size: number;
  opacity?: number;
}

interface Particle {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Fixed-size particle pool — no per-frame geometry allocation.
 */
export class ParticlePool {
  private readonly particles: Particle[];
  private readonly positions: Float32Array;
  private readonly geometry: BufferGeometry;
  private readonly material: PointsMaterial;
  readonly points: Points;
  private activeCount = 0;

  constructor(options: ParticlePoolOptions) {
    const n = Math.max(1, options.maxParticles);
    this.particles = Array.from({ length: n }, () => ({
      active: false,
      life: 0,
      maxLife: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    }));
    this.positions = new Float32Array(n * 3);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3),
    );
    this.geometry.setDrawRange(0, 0);
    this.material = new PointsMaterial({
      color: new Color(options.color),
      size: options.size,
      transparent: true,
      opacity: options.opacity ?? 0.65,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  addTo(scene: Scene): void {
    scene.add(this.points);
  }

  emit(
    origin: { x: number; y: number; z: number },
    count: number,
    speed: number,
    life: number,
    upwardBias = 0.4,
  ): void {
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= count) {
        break;
      }
      if (p.active) {
        continue;
      }
      p.active = true;
      p.life = life * (0.7 + (spawned % 5) * 0.06);
      p.maxLife = p.life;
      p.x = origin.x + ((spawned % 7) - 3) * 0.04;
      p.y = origin.y + 0.02;
      p.z = origin.z + ((spawned % 5) - 2) * 0.04;
      const ang = spawned * 1.7;
      p.vx = Math.cos(ang) * speed * (0.4 + (spawned % 3) * 0.2);
      p.vz = Math.sin(ang) * speed * (0.4 + (spawned % 3) * 0.2);
      p.vy = upwardBias * speed + (spawned % 4) * 0.05;
      spawned++;
      this.activeCount++;
    }
  }

  update(dt: number): void {
    if (this.activeCount === 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    let write = 0;
    let alive = 0;
    for (const p of this.particles) {
      if (!p.active) {
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 1.8 * dt;
      p.vx *= 1 - 1.2 * dt;
      p.vz *= 1 - 1.2 * dt;
      this.positions[write++] = p.x;
      this.positions[write++] = p.y;
      this.positions[write++] = p.z;
      alive++;
    }
    this.activeCount = alive;
    const attr = this.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
    this.geometry.setDrawRange(0, alive);
    const fade = alive > 0 ? 0.55 : 0;
    this.material.opacity = fade;
  }

  clear(): void {
    for (const p of this.particles) {
      p.active = false;
    }
    this.activeCount = 0;
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.points.parent?.remove(this.points);
  }
}
