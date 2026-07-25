import type { ResolvedAssembly } from '@fpv/drone-build-domain';
import { sum } from '@fpv/engineering-kernel';

export interface MassBreakdown {
  readonly dryMassKg: number;
  readonly batteryMassKg: number;
  readonly payloadMassKg: number;
  readonly propulsionMassKg: number;
  readonly electronicsMassKg: number;
  readonly totalTakeoffMassKg: number;
}

/** Aggregate mass exclusively from the active resolved assembly. */
export function aggregateMass(assembly: ResolvedAssembly): MassBreakdown {
  let dry = 0;
  let battery = 0;
  let payload = 0;
  let propulsion = 0;
  let electronics = 0;

  for (const s of assembly.revision.selections) {
    const c = assembly.componentBySelectionId.get(s.selectionId);
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

  return {
    dryMassKg: dry,
    batteryMassKg: battery,
    payloadMassKg: payload,
    propulsionMassKg: propulsion,
    electronicsMassKg: electronics,
    totalTakeoffMassKg: dry + battery + payload,
  };
}

export function sumAssemblyMass(assembly: ResolvedAssembly): number {
  return sum(
    assembly.revision.selections.map((s) => {
      const c = assembly.componentBySelectionId.get(s.selectionId);
      return c ? c.massKg * s.quantity : 0;
    }),
  );
}
