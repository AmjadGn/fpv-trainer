import type { ComponentRevision } from '@fpv/component-catalog';
import type { ComponentSelection } from '@fpv/drone-build-domain';
import { sum } from '@fpv/engineering-kernel';

export interface MassBreakdown {
  readonly dryMassKg: number;
  readonly batteryMassKg: number;
  readonly payloadMassKg: number;
  readonly propulsionMassKg: number;
  readonly electronicsMassKg: number;
  readonly totalTakeoffMassKg: number;
}

export function aggregateMass(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
): MassBreakdown {
  let dry = 0;
  let battery = 0;
  let payload = 0;
  let propulsion = 0;
  let electronics = 0;

  for (const s of selections) {
    const c = components.get(s.componentRevisionId);
    if (!c) continue;
    const m = c.massKg * s.quantity;
    switch (c.componentType) {
      case 'battery':
        battery += m;
        break;
      case 'payload':
        payload += m;
        break;
      case 'motor':
      case 'propeller':
      case 'esc':
        propulsion += m;
        dry += m;
        break;
      case 'flight-controller':
      case 'camera':
      case 'video-transmitter':
      case 'receiver':
      case 'antenna':
      case 'gps-module':
        electronics += m;
        dry += m;
        break;
      default:
        dry += m;
        break;
    }
  }

  const total = dry + battery + payload;
  return {
    dryMassKg: dry,
    batteryMassKg: battery,
    payloadMassKg: payload,
    propulsionMassKg: propulsion,
    electronicsMassKg: electronics,
    totalTakeoffMassKg: total,
  };
}

export function sumSelectionMass(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
): number {
  return sum(
    selections.map((s) => {
      const c = components.get(s.componentRevisionId);
      return c ? c.massKg * s.quantity : 0;
    }),
  );
}
