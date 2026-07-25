import type { ComponentRevision } from '@fpv/component-catalog';
import type { ComponentSelection } from '@fpv/drone-build-domain';

export interface ElectricalSystemResult {
  readonly nominalVoltage: number;
  readonly maxVoltage: number;
  readonly cellCount: number;
  readonly capacityAh: number;
  readonly internalResistanceOhm: number;
  readonly estimatedVoltageSag: number;
  readonly peakCurrentA: number;
  readonly continuousCurrentA: number;
  readonly escContinuousMarginA: number;
  readonly availableEnergyWh: number;
  readonly electronicsPowerW: number;
  readonly powerLossEstimateW: number;
}

export function solveElectricalSystem(
  selections: readonly ComponentSelection[],
  components: ReadonlyMap<string, ComponentRevision>,
): ElectricalSystemResult {
  let battery: ComponentRevision | undefined;
  let esc: ComponentRevision | undefined;
  let electronicsPowerW = 0;
  let motorPeakHint = 0;
  let motorCount = 0;

  for (const s of selections) {
    const c = components.get(s.componentRevisionId);
    if (!c) continue;
    if (c.engineering.type === 'battery') battery = c;
    if (c.engineering.type === 'esc') esc = c;
    if (c.engineering.type === 'motor') {
      motorCount += s.quantity;
      motorPeakHint += c.engineering.motor.maxContinuousCurrentA * s.quantity;
    }
    if (
      c.engineering.type === 'flight-controller' ||
      c.engineering.type === 'camera' ||
      c.engineering.type === 'video-transmitter' ||
      c.engineering.type === 'receiver' ||
      c.engineering.type === 'antenna' ||
      c.engineering.type === 'gps-module' ||
      c.engineering.type === 'payload'
    ) {
      electronicsPowerW += c.engineering.electronics.powerDrawWatts * s.quantity;
    }
  }

  if (!battery || battery.engineering.type !== 'battery') {
    return {
      nominalVoltage: 0,
      maxVoltage: 0,
      cellCount: 0,
      capacityAh: 0,
      internalResistanceOhm: 0,
      estimatedVoltageSag: 0,
      peakCurrentA: 0,
      continuousCurrentA: 0,
      escContinuousMarginA: 0,
      availableEnergyWh: 0,
      electronicsPowerW,
      powerLossEstimateW: 0,
    };
  }

  const b = battery.engineering.battery;
  const peakCurrentA = Math.min(
    motorPeakHint,
    b.capacityAh * b.dischargeCRating,
  );
  const continuousCurrentA = peakCurrentA * 0.65;
  const escCont =
    esc && esc.engineering.type === 'esc'
      ? esc.engineering.esc.continuousCurrentA
      : 0;
  const sag = b.voltageSagFactor * (peakCurrentA / Math.max(1, continuousCurrentA));
  const availableEnergyWh = b.nominalVoltage * b.capacityAh;
  const powerLossEstimateW =
    peakCurrentA * peakCurrentA * b.internalResistanceOhm * 0.25;

  return {
    nominalVoltage: b.nominalVoltage,
    maxVoltage: b.maxVoltage,
    cellCount: b.cellCount,
    capacityAh: b.capacityAh,
    internalResistanceOhm: b.internalResistanceOhm,
    estimatedVoltageSag: sag,
    peakCurrentA,
    continuousCurrentA,
    escContinuousMarginA: escCont - continuousCurrentA / Math.max(1, motorCount),
    availableEnergyWh,
    electronicsPowerW,
    powerLossEstimateW,
  };
}
