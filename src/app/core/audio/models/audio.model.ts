export type AudioUnlockState = 'locked' | 'unlocking' | 'ready' | 'unavailable';

export interface AudioVolumes {
  master: number;
  motor: number;
  effects: number;
  ui: number;
}

export function volumeToGain(volume0to100: number): number {
  const v = Math.min(100, Math.max(0, volume0to100)) / 100;
  // Gentle curve so mid values feel usable without clipping.
  return v * v;
}
