import type { ResolvedAssembly } from '@fpv/drone-build-domain';
import type { CenterOfMassResult } from '../center-of-mass/solver';

/**
 * Physical (SI) inertia estimate about center of mass.
 * Units: kg·m². Solver-specific scaling belongs in @fpv/aircraft-runtime-adapter.
 */
export interface InertiaEstimate {
  /** Ixx about CoM (kg·m²) — roll axis in body frame approximation. */
  readonly roll: number;
  /** Iyy about CoM (kg·m²). */
  readonly pitch: number;
  /** Izz about CoM (kg·m²). */
  readonly yaw: number;
  /** Diagonal tensor [Ixx, Iyy, Izz] in kg·m². */
  readonly tensorDiagonalKgM2: readonly [number, number, number];
  readonly motorPropRotational: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly units: 'kg·m²';
  readonly modelVersion: string;
}

export function estimateInertia(
  assembly: ResolvedAssembly,
  com: CenterOfMassResult,
  _totalMassKg: number,
): InertiaEstimate {
  let Ixx = 0;
  let Iyy = 0;
  let Izz = 0;
  let rotational = 0;
  let frameFactor = 1;

  for (const s of assembly.revision.selections) {
    const c = assembly.componentBySelectionId.get(s.selectionId);
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

  const roll = Math.max(1e-8, Ixx * frameFactor);
  const pitch = Math.max(1e-8, Iyy * frameFactor);
  const yaw = Math.max(1e-8, Izz * frameFactor);

  return {
    roll,
    pitch,
    yaw,
    tensorDiagonalKgM2: [roll, pitch, yaw],
    motorPropRotational: rotational,
    confidence: 'medium',
    units: 'kg·m²',
    modelVersion: '1.1.1-point-mass',
  };
}
