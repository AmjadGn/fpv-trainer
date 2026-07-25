import type { ComponentRevision } from '@fpv/component-catalog';
import type { ComponentSelection } from '@fpv/drone-build-domain';

export interface CenterOfMassResult {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly offsetFromOrigin: { x: number; y: number; z: number };
  readonly confidence: 'high' | 'medium' | 'low';
}

export function solveCenterOfMass(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
): CenterOfMassResult {
  let mx = 0;
  let my = 0;
  let mz = 0;
  let total = 0;
  let lowConfidence = false;

  for (const s of selections) {
    const c = components.get(s.componentRevisionId);
    if (!c) continue;
    const mass = c.massKg * s.quantity;
    if (mass <= 0) continue;
    const lx = s.transform.position.x + c.localCenterOfMass.x;
    const ly = s.transform.position.y + c.localCenterOfMass.y;
    const lz = s.transform.position.z + c.localCenterOfMass.z;
    mx += mass * lx;
    my += mass * ly;
    mz += mass * lz;
    total += mass;
    if (c.dataQuality.confidence === 'low' || c.dataQuality.confidence === 'unknown') {
      lowConfidence = true;
    }
  }

  if (total <= 0) {
    return {
      x: 0,
      y: 0,
      z: 0,
      offsetFromOrigin: { x: 0, y: 0, z: 0 },
      confidence: 'low',
    };
  }

  const x = mx / total;
  const y = my / total;
  const z = mz / total;
  return {
    x,
    y,
    z,
    offsetFromOrigin: { x, y, z },
    confidence: lowConfidence ? 'low' : 'medium',
  };
}
