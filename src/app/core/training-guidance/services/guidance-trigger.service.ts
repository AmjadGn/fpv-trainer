import { FIRST_FLIGHT_SCRIPT } from '../data/first-flight.script';
import type { GuidanceScript, GuidanceStep } from '../models/guidance-step.model';

export type GuidanceRuntimeInput = {
  elapsedSec: number;
  throttle: number;
  altitude: number;
  yawDelta: number;
  pitchDelta: number;
  rollDelta: number;
  gatePassed?: boolean;
  crashed?: boolean;
  landed?: boolean;
  controllerDisconnected?: boolean;
  inactiveSec?: number;
};

export function evaluateStepTrigger(
  step: GuidanceStep,
  input: GuidanceRuntimeInput,
): boolean {
  const t = step.trigger;
  switch (t.type) {
    case 'elapsed-time':
      return input.elapsedSec >= (t.value ?? 0);
    case 'throttle-threshold':
      return input.throttle >= (t.value ?? 0.2);
    case 'altitude-reached':
      return input.altitude >= (t.value ?? 1);
    case 'yaw-movement':
      return Math.abs(input.yawDelta) >= (t.value ?? 0.2);
    case 'pitch-movement':
      return Math.abs(input.pitchDelta) >= (t.value ?? 0.2);
    case 'roll-movement':
      return Math.abs(input.rollDelta) >= (t.value ?? 0.2);
    case 'gate-passed':
      return !!input.gatePassed;
    case 'crash-detected':
      return !!input.crashed;
    case 'landing-detected':
      return !!input.landed;
    case 'controller-disconnected':
      return !!input.controllerDisconnected;
    case 'inactivity':
      return (input.inactiveSec ?? 0) >= (t.value ?? 8);
    case 'manual':
      return false;
    default:
      return false;
  }
}

export function getGuidanceScript(id: string): GuidanceScript | null {
  if (id === FIRST_FLIGHT_SCRIPT.id) return FIRST_FLIGHT_SCRIPT;
  return null;
}
