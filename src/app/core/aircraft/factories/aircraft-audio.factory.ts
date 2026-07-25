import type { AudioProfile } from '../models/audio-profile.model';
import { AUDIO_FLUX_F5 } from '../data/shared-profiles';

export interface MotorVoiceParams {
  idleFrequencyHz: number;
  maxFrequencyHz: number;
  harmonicRatio: number;
  filterBaseHz: number;
  filterThrottleSpanHz: number;
  baseGain: number;
  demandGain: number;
  resonanceQ: number;
  noiseGain: number;
  crashGain: number;
  crashFrequencyHz: number;
}

/** Maps aircraft AudioProfile → procedural motor voice parameters. */
export function audioProfileToVoiceParams(
  profile: AudioProfile | null | undefined,
): MotorVoiceParams {
  const p = profile ?? AUDIO_FLUX_F5;
  return {
    idleFrequencyHz: p.idleFrequencyHz,
    maxFrequencyHz: p.maxFrequencyHz,
    harmonicRatio: p.harmonicRatio,
    filterBaseHz: p.filterBaseHz,
    filterThrottleSpanHz: p.filterThrottleSpanHz,
    baseGain: p.baseGain,
    demandGain: p.demandGain,
    resonanceQ: p.resonanceQ,
    noiseGain: p.noiseGain,
    crashGain: p.crashGain,
    crashFrequencyHz: p.crashFrequencyHz,
  };
}
