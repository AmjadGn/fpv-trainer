import { Injectable } from '@angular/core';
import type { Scene } from 'three';

import { ParticlePool } from '../../flight-feedback/utils/particle-pool';
import type { Vec3 } from '../../flight/models/flight-state.model';
import type { EnvironmentQuality } from '../../settings/models/trainer-settings.model';

export type ImpactParticleType =
  | 'dust'
  | 'grass'
  | 'sparks'
  | 'concrete'
  | 'wood'
  | 'splash'
  | 'smoke'
  | 'debris';

export interface ImpactEmitParams {
  type: ImpactParticleType;
  point: Vec3;
  normal: Vec3;
  velocity: Vec3;
  strength: number;
  quality: EnvironmentQuality;
}

interface PoolConfig {
  color: number;
  size: number;
  opacity: number;
  maxLow: number;
  maxMedium: number;
  maxHigh: number;
}

const POOL_CONFIGS: Record<ImpactParticleType, PoolConfig> = {
  dust: { color: 0xb8a078, size: 0.12, opacity: 0.45, maxLow: 24, maxMedium: 40, maxHigh: 64 },
  grass: { color: 0x6a9e4a, size: 0.1, opacity: 0.55, maxLow: 20, maxMedium: 32, maxHigh: 48 },
  sparks: { color: 0xffc857, size: 0.07, opacity: 0.75, maxLow: 16, maxMedium: 28, maxHigh: 48 },
  concrete: { color: 0x9a9590, size: 0.11, opacity: 0.5, maxLow: 20, maxMedium: 36, maxHigh: 56 },
  wood: { color: 0x8b6914, size: 0.13, opacity: 0.55, maxLow: 18, maxMedium: 28, maxHigh: 40 },
  splash: { color: 0x7ec8e3, size: 0.14, opacity: 0.6, maxLow: 20, maxMedium: 32, maxHigh: 48 },
  smoke: { color: 0x888888, size: 0.18, opacity: 0.35, maxLow: 16, maxMedium: 28, maxHigh: 44 },
  debris: { color: 0x6b5b4f, size: 0.15, opacity: 0.6, maxLow: 14, maxMedium: 24, maxHigh: 36 },
};

const EMIT_CAPS: Record<EnvironmentQuality, { min: number; max: number; speedMul: number }> = {
  low: { min: 1, max: 4, speedMul: 0.85 },
  medium: { min: 2, max: 8, speedMul: 1 },
  high: { min: 4, max: 16, speedMul: 1.15 },
};

@Injectable({ providedIn: 'root' })
export class ImpactParticleService {
  private pools = new Map<ImpactParticleType, ParticlePool>();
  private scene: Scene | null = null;
  private quality: EnvironmentQuality = 'medium';

  setScene(scene: Scene, quality: EnvironmentQuality = 'medium'): void {
    this.disposePools();
    this.scene = scene;
    this.quality = quality;
    for (const [type, cfg] of Object.entries(POOL_CONFIGS) as [ImpactParticleType, PoolConfig][]) {
      const pool = new ParticlePool({
        maxParticles: poolMax(cfg, quality),
        color: cfg.color,
        size: cfg.size,
        opacity: cfg.opacity,
      });
      pool.addTo(scene);
      this.pools.set(type, pool);
    }
  }

  emit(params: ImpactEmitParams): void {
    const pool = this.pools.get(params.type);
    if (!pool) {
      return;
    }

    const caps = EMIT_CAPS[params.quality];
    const s = clampStrength(params.strength);
    const count = Math.round(lerp(caps.min, caps.max, s));
    if (count <= 0) {
      return;
    }

    const speed =
      (0.8 + s * 2.4 + speedFromVelocity(params.velocity)) * caps.speedMul;
    const life = 0.35 + s * 0.55;
    const upwardBias = Math.max(-0.2, Math.min(1.2, params.normal.y + 0.35));

    pool.emit(params.point, count, speed, life, upwardBias);
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) {
      pool.update(dt);
    }
  }

  dispose(): void {
    this.disposePools();
    this.scene = null;
  }

  private disposePools(): void {
    for (const pool of this.pools.values()) {
      pool.dispose();
    }
    this.pools.clear();
  }
}

function poolMax(cfg: PoolConfig, quality: EnvironmentQuality): number {
  switch (quality) {
    case 'low':
      return cfg.maxLow;
    case 'high':
      return cfg.maxHigh;
    default:
      return cfg.maxMedium;
  }
}

function clampStrength(strength: number): number {
  if (!Number.isFinite(strength)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, strength / 10));
}

function speedFromVelocity(v: Vec3): number {
  const mag = Math.hypot(v.x, v.y, v.z);
  return Math.min(2.5, mag * 0.15);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
