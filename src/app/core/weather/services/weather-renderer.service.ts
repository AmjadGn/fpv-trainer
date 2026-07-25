import { Injectable } from '@angular/core';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Points,
  PointsMaterial,
  type PerspectiveCamera,
  type Scene,
} from 'three';

import type {
  EnvironmentQuality,
  FogSettings,
} from '../../environment/models/environment.model';
import type { Vec3 } from '../../flight/models/flight-state.model';
import type { PrecipitationType, WeatherState } from '../models/weather.models';
import {
  precipitationBudget,
  precipitationFallDirection,
} from '../utils/precipitation-utils';

export interface WeatherVisualOptions {
  quality: EnvironmentQuality;
  fogEnabled: boolean;
  precipitationEnabled: boolean;
  reduceMotion: boolean;
  baseFog: FogSettings;
  environmentId: string;
}

/**
 * Owns ONLY visual weather particles/fog adjustments — not physics.
 * Driven by the main RAF via {@link update}; does not run its own loop.
 */
@Injectable({ providedIn: 'root' })
export class WeatherRendererService {
  private scene: Scene | null = null;

  private precipType: PrecipitationType = 'none';
  private precipEnabled = false;
  private maxParticles = 0;
  private fallSpeed = 8;
  private particleSize = 0.12;
  private particleColor = 0xa8c4d8;

  private positions: Float32Array | null = null;
  private geometry: BufferGeometry | null = null;
  private material: PointsMaterial | null = null;
  private points: Points | null = null;

  attach(scene: Scene, _camera: PerspectiveCamera): void {
    this.detach();
    this.scene = scene;
  }

  detach(): void {
    this.clearParticles();
    this.precipEnabled = false;
    this.scene = null;
  }

  applyWeatherState(state: WeatherState, options: WeatherVisualOptions): void {
    if (!this.scene) {
      return;
    }

    this.applyFog(state, options);

    const budget = precipitationBudget(
      state.precipitationType,
      state.precipitationIntensity,
      options.quality,
      {
        reduceMotion: options.reduceMotion,
        precipitationEnabled: options.precipitationEnabled,
      },
    );

    this.configurePrecipitation(state.precipitationType, budget.maxParticles);
    this.precipEnabled = budget.enabled;
    if (!budget.enabled) {
      this.clearParticles();
      return;
    }

    this.ensureParticleSystem(budget.maxParticles);
  }

  /** Call once per frame from the main RAF — no own RAF. */
  update(dt: number, cameraPosition: Vec3, windVelocity: Vec3): void {
    if (
      !this.precipEnabled ||
      !this.points ||
      !this.positions ||
      !this.geometry ||
      this.maxParticles <= 0
    ) {
      return;
    }

    const fall = precipitationFallDirection(
      windVelocity.x,
      windVelocity.z,
      this.fallSpeed,
    );

    const halfW = 28;
    const halfH = 18;
    const halfD = 28;
    const cx = cameraPosition.x;
    const cy = cameraPosition.y;
    const cz = cameraPosition.z;

    for (let i = 0; i < this.maxParticles; i++) {
      const i3 = i * 3;
      let x = this.positions[i3]! + fall.x * dt;
      let y = this.positions[i3 + 1]! + fall.y * dt;
      let z = this.positions[i3 + 2]! + fall.z * dt;

      // Dust drifts more horizontally / slower fall.
      if (this.precipType === 'dust') {
        x += fall.x * dt * 0.6;
        y += -Math.abs(fall.y) * 0.08 * dt;
        z += fall.z * dt * 0.6;
      }

      if (
        y < cy - halfH ||
        y > cy + halfH ||
        x < cx - halfW ||
        x > cx + halfW ||
        z < cz - halfD ||
        z > cz + halfD
      ) {
        x = cx + (Math.random() * 2 - 1) * halfW;
        y = cy + (Math.random() * 2 - 1) * halfH;
        z = cz + (Math.random() * 2 - 1) * halfD;
        if (this.precipType !== 'dust') {
          y = cy + halfH * (0.4 + Math.random() * 0.6);
        }
      }

      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = z;
    }

    const attr = this.geometry.getAttribute('position') as BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.detach();
  }

  private applyFog(state: WeatherState, options: WeatherVisualOptions): void {
    if (!this.scene) {
      return;
    }

    if (!options.fogEnabled || !options.baseFog.enabled) {
      this.scene.fog = null;
      return;
    }

    const base = options.baseFog;
    const visibility = Math.max(0.05, Math.min(1, state.visibility));
    const density = Math.max(0.05, Math.min(2, state.fogDensity));

    // Dense / low-visibility weather pulls far plane in; keep gates readable.
    const far = Math.max(
      90,
      base.far * visibility * (1.15 / (0.35 + density * 0.8)),
    );
    const near = Math.min(
      40,
      Math.max(
        1,
        base.near + (1 - visibility) * 22 + Math.max(0, density - 0.35) * 18,
      ),
    );

    const color = base.color;
    if (this.scene.fog instanceof Fog) {
      this.scene.fog.color.set(color);
      this.scene.fog.near = near;
      this.scene.fog.far = far;
    } else {
      this.scene.fog = new Fog(color, near, far);
    }
  }

  private configurePrecipitation(
    type: PrecipitationType,
    maxParticles: number,
  ): void {
    this.precipType = type;
    this.maxParticles = maxParticles;

    switch (type) {
      case 'rain':
        this.fallSpeed = 14;
        this.particleSize = 0.08;
        this.particleColor = 0x9eb8cc;
        break;
      case 'lightSnow':
        this.fallSpeed = 3.2;
        this.particleSize = 0.22;
        this.particleColor = 0xe8eef5;
        break;
      case 'dust':
        this.fallSpeed = 1.4;
        this.particleSize = 0.16;
        this.particleColor = 0xc4a882;
        break;
      default:
        this.fallSpeed = 8;
        this.particleSize = 0.12;
        this.particleColor = 0xa8c4d8;
        break;
    }
  }

  private ensureParticleSystem(count: number): void {
    if (!this.scene || count <= 0) {
      return;
    }

    if (
      this.points &&
      this.positions &&
      this.positions.length === count * 3
    ) {
      if (this.material) {
        this.material.color.set(this.particleColor);
        this.material.size = this.particleSize;
        this.material.opacity = this.precipType === 'dust' ? 0.35 : 0.55;
      }
      this.geometry?.setDrawRange(0, count);
      return;
    }

    this.clearParticles();
    this.maxParticles = count;

    this.positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.positions[i3] = (Math.random() * 2 - 1) * 28;
      this.positions[i3 + 1] = Math.random() * 24;
      this.positions[i3 + 2] = (Math.random() * 2 - 1) * 28;
    }

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3),
    );
    this.geometry.setDrawRange(0, count);

    this.material = new PointsMaterial({
      color: new Color(this.particleColor),
      size: this.particleSize,
      transparent: true,
      opacity: this.precipType === 'dust' ? 0.35 : 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private clearParticles(): void {
    if (this.points) {
      this.points.parent?.remove(this.points);
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.points = null;
    this.geometry = null;
    this.material = null;
    this.positions = null;
    this.maxParticles = 0;
  }
}
