import type { ResolvedAssembly } from '@fpv/drone-build-domain';

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
  readonly escBurstMarginA: number;
  readonly batteryDischargeCapabilityA: number;
  readonly availableEnergyWh: number;
  readonly electronicsPowerW: number;
  readonly powerLossEstimateW: number;
  readonly connectorType: string | null;
}

export function solveElectricalSystem(
  assembly: ResolvedAssembly,
): ElectricalSystemResult {
  const battery = assembly.batteryComponent;
  const esc = assembly.escComponents[0];
  let electronicsPowerW = 0;
  let motorPeakHint = 0;
  let motorCount = 0;

  for (const s of assembly.revision.selections) {
    const c = assembly.componentBySelectionId.get(s.selectionId);
    if (!c) continue;
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
      escBurstMarginA: 0,
      batteryDischargeCapabilityA: 0,
      availableEnergyWh: 0,
      electronicsPowerW,
      powerLossEstimateW: 0,
      connectorType: null,
    };
  }

  const b = battery.engineering.battery;
  const batteryDischargeCapabilityA = b.capacityAh * b.dischargeCRating;
  const peakCurrentA = Math.min(motorPeakHint, batteryDischargeCapabilityA);
  const continuousCurrentA = peakCurrentA * 0.65;
  const escCont =
    esc && esc.engineering.type === 'esc' ? esc.engineering.esc.continuousCurrentA : 0;
  const escBurst =
    esc && esc.engineering.type === 'esc' ? esc.engineering.esc.burstCurrentA : 0;
  const perMotorContinuous = continuousCurrentA / Math.max(1, motorCount);
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
    escContinuousMarginA: escCont - perMotorContinuous,
    escBurstMarginA: escBurst - peakCurrentA / Math.max(1, motorCount),
    batteryDischargeCapabilityA,
    availableEnergyWh,
    electronicsPowerW,
    powerLossEstimateW,
    connectorType: b.connectorType,
  };
}
