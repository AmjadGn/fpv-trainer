export interface AudioProfile {
  id: string;
  version: string;
  idleFrequencyHz: number;
  maxFrequencyHz: number;
  harmonicRatio: number;
  filterBaseHz: number;
  filterThrottleSpanHz: number;
  baseGain: number;
  demandGain: number;
  resonanceQ: number;
  noiseGain: number;
  windLayerStrength: number;
  enclosedResonance: number;
  crashGain: number;
  crashFrequencyHz: number;
  startupPitchBend: number;
  disarmFadeSeconds: number;
}
