import { Injectable } from '@angular/core';
import type { MeshBasicMaterial } from 'three';

import type { DronePropVisual } from './drone-model.factory';

export interface PropellerAnimInput {
  throttle: number;
  armed: boolean;
  crashed: boolean;
  paused: boolean;
  propellerBlurEnabled: boolean;
  quality: 'low' | 'medium' | 'high';
  dt: number;
}

@Injectable({ providedIn: 'root' })
export class PropellerAnimationService {
  private rpm = 0;

  reset(): void {
    this.rpm = 0;
  }

  getRpm(): number {
    return this.rpm;
  }

  update(props: DronePropVisual[], input: PropellerAnimInput): number {
    if (props.length === 0) {
      return this.rpm;
    }

    let targetRpm = 0;
    if (input.armed && !input.crashed && !input.paused) {
      targetRpm = 8 + input.throttle * 42;
    } else if (input.armed && !input.crashed) {
      targetRpm = 2;
    }

    const alpha = 1 - Math.exp(-6 * input.dt);
    this.rpm += (targetRpm - this.rpm) * alpha;

    const blurOn =
      input.propellerBlurEnabled &&
      input.quality !== 'low' &&
      this.rpm > 22;

    for (const prop of props) {
      prop.group.rotation.y += this.rpm * prop.spinDir * input.dt;
      const blurMat = prop.blur.material as MeshBasicMaterial;
      if (blurOn) {
        prop.blur.visible = true;
        blurMat.opacity = Math.min(0.35, (this.rpm - 22) / 40);
        const showBlades = this.rpm < 30;
        for (const blade of prop.blades) {
          blade.visible = showBlades;
        }
      } else {
        prop.blur.visible = false;
        blurMat.opacity = 0;
        for (const blade of prop.blades) {
          blade.visible = true;
        }
      }
    }

    return this.rpm;
  }
}
