import { Injectable } from '@angular/core';
import type { Mesh, MeshStandardMaterial } from 'three';

import type { DroneDamageState } from '../../physics/models/collision.models';
import { DRONE_VISUAL_COLORS } from '../config/drone-visual.config';
import type {
  DroneNavLight,
  DronePropVisual,
  SharedDroneMaterials,
} from './drone-model.factory';

export interface DroneDamageVisualTarget {
  materials: SharedDroneMaterials;
  props: DronePropVisual[];
  lights: DroneNavLight[];
}

interface MaterialBaseline {
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  emissiveHex: number;
}

@Injectable({ providedIn: 'root' })
export class DroneDamageVisualService {
  private appliedState: DroneDamageState = 'pristine';
  private hiddenBlade: { mesh: Mesh; wasVisible: boolean } | null = null;
  private baselines = new Map<MeshStandardMaterial, MaterialBaseline>();

  reset(): void {
    this.appliedState = 'pristine';
    this.restoreHiddenBlade();
    this.baselines.clear();
  }

  apply(
    target: DroneDamageVisualTarget,
    state: DroneDamageState,
    animTime: number,
    crashFlash = 0,
  ): void {
    this.ensureBaselines(target.materials);

    if (state !== this.appliedState) {
      this.onStateTransition(target, state);
      this.appliedState = state;
    }

    this.applyMaterialWear(target.materials, state, animTime, crashFlash);
    this.applyNavLightDamage(target.lights, state, animTime, crashFlash);
  }

  private ensureBaselines(materials: SharedDroneMaterials): void {
    if (this.baselines.size > 0) {
      return;
    }
    const track = (mat: MeshStandardMaterial): void => {
      this.baselines.set(mat, {
        roughness: mat.roughness,
        metalness: mat.metalness,
        emissiveIntensity: mat.emissiveIntensity,
        emissiveHex: mat.emissive.getHex(),
      });
    };
    track(materials.carbon);
    track(materials.carbonDark);
    track(materials.motor);
    track(materials.motorBell);
    track(materials.prop);
    track(materials.battery);
    track(materials.ledFront);
    track(materials.ledRear);
  }

  private onStateTransition(
    target: DroneDamageVisualTarget,
    state: DroneDamageState,
  ): void {
    this.restoreHiddenBlade();

    if (state === 'critical' || state === 'crashed') {
      const prop = target.props[0];
      const blade = prop?.blades[0];
      if (blade) {
        this.hiddenBlade = { mesh: blade, wasVisible: blade.visible };
        blade.visible = false;
      }
    }
  }

  private restoreHiddenBlade(): void {
    if (this.hiddenBlade) {
      this.hiddenBlade.mesh.visible = this.hiddenBlade.wasVisible;
      this.hiddenBlade = null;
    }
  }

  private applyMaterialWear(
    materials: SharedDroneMaterials,
    state: DroneDamageState,
    animTime: number,
    crashFlash: number,
  ): void {
    const wear = this.wearProfile(state);
    const flicker =
      state === 'damaged' || state === 'critical' || state === 'crashed'
        ? 0.04 * Math.sin(animTime * (state === 'crashed' ? 18 : 12))
        : 0;

    const applyWear = (mat: MeshStandardMaterial): void => {
      const base = this.baselines.get(mat);
      if (!base) {
        return;
      }
      mat.roughness = Math.min(1, base.roughness + wear.roughnessBoost + flicker);
      mat.metalness = Math.max(0, base.metalness - wear.metalnessDrop);
      if (wear.emissiveFlicker > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 22);
        mat.emissiveIntensity =
          base.emissiveIntensity * (0.3 + pulse * wear.emissiveFlicker);
        mat.emissive.setHex(0x553322);
      } else {
        mat.emissive.setHex(base.emissiveHex);
        mat.emissiveIntensity = base.emissiveIntensity;
      }
    };

    applyWear(materials.carbon);
    applyWear(materials.carbonDark);
    applyWear(materials.motor);
    applyWear(materials.motorBell);
    applyWear(materials.prop);
    applyWear(materials.battery);

    if (state === 'crashed') {
      materials.carbon.color.setHex(0x0e1218);
      materials.carbonDark.color.setHex(0x101418);
    } else {
      materials.carbon.color.setHex(DRONE_VISUAL_COLORS.carbon);
      materials.carbonDark.color.setHex(DRONE_VISUAL_COLORS.carbonWeave);
    }

    if (crashFlash > 0) {
      const flash = 0.5 + 0.5 * Math.sin(animTime * 28);
      materials.carbon.emissive.setHex(0xff5533);
      materials.carbon.emissiveIntensity = flash * 0.25;
    } else if (state !== 'damaged' && state !== 'critical' && state !== 'crashed') {
      materials.carbon.emissive.setHex(0x000000);
      materials.carbon.emissiveIntensity = 0;
    }
  }

  private applyNavLightDamage(
    lights: DroneNavLight[],
    state: DroneDamageState,
    animTime: number,
    crashFlash: number,
  ): void {
    for (const light of lights) {
      const base = this.baselines.get(light.material);
      if (!base) {
        continue;
      }

      if (crashFlash > 0 || state === 'crashed') {
        const flash =
          crashFlash > 0
            ? 0.5 + 0.5 * Math.sin(animTime * 28)
            : 0.15 + 0.1 * Math.sin(animTime * 8);
        light.material.emissive.setHex(0xff5533);
        light.material.emissiveIntensity = flash * 1.4;
        continue;
      }

      light.material.emissive.setHex(base.emissiveHex);
      let intensity = base.emissiveIntensity;
      if (state === 'critical') {
        intensity *= 0.55 + 0.15 * Math.sin(animTime * 16);
      } else if (state === 'damaged') {
        intensity *= 0.75;
      }
      light.material.emissiveIntensity = intensity;
    }
  }

  private wearProfile(state: DroneDamageState): {
    roughnessBoost: number;
    metalnessDrop: number;
    emissiveFlicker: number;
  } {
    switch (state) {
      case 'scratched':
        return { roughnessBoost: 0.08, metalnessDrop: 0.02, emissiveFlicker: 0 };
      case 'damaged':
        return { roughnessBoost: 0.18, metalnessDrop: 0.06, emissiveFlicker: 0.35 };
      case 'critical':
        return { roughnessBoost: 0.28, metalnessDrop: 0.1, emissiveFlicker: 0.65 };
      case 'crashed':
        return { roughnessBoost: 0.38, metalnessDrop: 0.14, emissiveFlicker: 0.85 };
      default:
        return { roughnessBoost: 0, metalnessDrop: 0, emissiveFlicker: 0 };
    }
  }
}
