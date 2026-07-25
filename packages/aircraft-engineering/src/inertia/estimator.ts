import type { ComponentRevision } from '@fpv/component-catalog';
import type { ComponentSelection } from '@fpv/drone-build-domain';
import type { CenterOfMassResult } from '../center-of-mass/solver';

export interface InertiaEstimate {
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
  readonly motorPropRotational: number;
  readonly confidence: 'high' | 'medium' | 'low';
}

/**
 * Point-mass inertia estimate about center of mass + frame factor.
 * Values are scaled for the existing flight solver (dimensionless-ish).
 */
export function estimateInertia(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
  com: CenterOfMassResult,
  totalMassKg: number,
): InertiaEstimate {
  let Ixx = 0;
  let Iyy = 0;
  let Izz = 0;
  let rotational = 0;
  let frameFactor = 1;

  for (const s of selections) {
    const c = components.get(s.componentRevisionId);
    if (!c) continue;
    const mass = c.massKg * s.quantity;
    const dx = s.transform.position.x + c.localCenterOfMass.x - com.x;
    const dy = s.transform.position.y + c.localCenterOfMass.y - com.y;
    const dz = s.transform.position.z + c.localCenterOfMass.z - com.z;
    Ixx += mass * (dy * dy + dz * dz);
    Iyy += mass * (dx * dx + dz * dz);
    Izz += mass * (dx * dx + dy * dy);

    if (c.engineering.type === 'frame') {
      frameFactor = c.engineering.frame.frameInertiaFactor;
    }
    if (c.engineering.type === 'propeller') {
      rotational +=
        mass * c.engineering.propeller.rotationalInertiaFactor * s.quantity;
    }
  }

  // Map SI kg·m² into flight-solver scale used by existing profiles (~0.4–2.5).
  const scale = 180 / Math.max(0.05, totalMassKg);
  return {
    roll: Math.max(0.2, Ixx * scale * frameFactor + 0.3),
    pitch: Math.max(0.2, Iyy * scale * frameFactor + 0.3),
    yaw: Math.max(0.2, Izz * scale * frameFactor + 0.25),
    motorPropRotational: rotational,
    confidence: 'medium',
  };
}
