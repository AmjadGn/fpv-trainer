import type { MassBreakdown } from '../mass/aggregator';
import type { PropulsionSystemResult } from '../propulsion/solver';
import type { ElectricalSystemResult } from '../electrical/solver';
import type { ControlAuthorityResult } from '../control-authority/analyzer';
import type { AerodynamicResult } from '../aerodynamics/approximator';
import { clamp } from '@fpv/engineering-kernel';

export interface PerformanceMetrics {
  readonly hoverThrottle: number;
  readonly flightDurationMinutesMin: number;
  readonly flightDurationMinutesMax: number;
  readonly thrustToWeight: number;
  readonly agilityRating: number;
  readonly momentumRating: number;
  readonly efficiencyRating: number;
  readonly controlAuthorityRating: number;
  readonly weightClass: string;
  readonly suggestedSkillLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export function calculatePerformanceMetrics(
  mass: MassBreakdown,
  propulsion: PropulsionSystemResult,
  electrical: ElectricalSystemResult,
  authority: ControlAuthorityResult,
  aero: AerodynamicResult,
): PerformanceMetrics {
  const hoverCurrent =
    propulsion.hoverThrottleEstimate * electrical.continuousCurrentA;
  const enduranceHours =
    hoverCurrent > 0 ? electrical.capacityAh / hoverCurrent : 0;
  const minutes = enduranceHours * 60;

  const agility = clamp(
    (authority.maxRollRate + authority.maxPitchRate) / 2 / 8,
    0,
    1,
  );
  const momentum = clamp(mass.totalTakeoffMassKg / 1.2, 0, 1);
  const efficiency = clamp(1 - aero.linearDrag, 0, 1);
  const control = clamp(authority.authorityMargin / 3, 0, 1);

  let skill: PerformanceMetrics['suggestedSkillLevel'] = 'intermediate';
  if (agility < 0.45 && propulsion.thrustToWeight < 2.8) skill = 'beginner';
  else if (agility > 0.75) skill = 'expert';
  else if (agility > 0.6) skill = 'advanced';

  let weightClass = '5inch';
  if (mass.totalTakeoffMassKg < 0.2) weightClass = 'whoop';
  else if (mass.totalTakeoffMassKg < 0.5) weightClass = 'cine-micro';
  else if (mass.totalTakeoffMassKg > 0.9) weightClass = 'long-range';

  return {
    hoverThrottle: propulsion.hoverThrottleEstimate,
    flightDurationMinutesMin: Math.max(1, minutes * 0.7),
    flightDurationMinutesMax: Math.max(2, minutes * 1.15),
    thrustToWeight: propulsion.thrustToWeight,
    agilityRating: agility,
    momentumRating: momentum,
    efficiencyRating: efficiency,
    controlAuthorityRating: control,
    weightClass,
    suggestedSkillLevel: skill,
  };
}
