import { Injectable, inject } from '@angular/core';

import type { EnvironmentTheme } from '../../environment/models/environment-registry.model';
import type { PrecipitationType } from '../../weather/models/weather.models';
import { AudioManagerService } from './audio-manager.service';

/**
 * Procedural environment ambience + weather hiss.
 * Reuses AudioManagerService context — never creates its own AudioContext.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentAudioService {
  private readonly audio = inject(AudioManagerService);

  private enabled = true;
  private theme: EnvironmentTheme | 'fallback' = 'alpine';
  private windSpeed = 0;
  private precipType: PrecipitationType = 'none';
  private precipIntensity = 0;

  private started = false;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceVoice: GainNode | null = null;
  private rainSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainVoice: GainNode | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyLevels();
  }

  setTheme(theme: EnvironmentTheme | string): void {
    const next = normalizeTheme(theme);
    if (next === this.theme && this.started) {
      return;
    }
    this.theme = next;
    this.restartAmbience();
  }

  setWindSpeed(speed: number): void {
    this.windSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    this.applyLevels();
  }

  setPrecipitation(type: PrecipitationType, intensity: number): void {
    this.precipType = type;
    this.precipIntensity = Number.isFinite(intensity)
      ? Math.min(1, Math.max(0, intensity))
      : 0;
    this.applyLevels();
  }

  /** Ensure graph is running after audio unlock. Fail soft. */
  ensureStarted(): void {
    if (!this.enabled || this.started || !this.audio.isReady || !this.audio.context) {
      return;
    }
    try {
      this.buildGraph();
      this.started = true;
      this.applyLevels();
    } catch {
      this.started = false;
      this.disposeNodes();
    }
  }

  dispose(): void {
    this.disposeNodes();
    this.started = false;
  }

  private buildGraph(): void {
    const ctx = this.audio.context;
    const ambienceBus = this.audio.ambienceBus;
    const weatherBus = this.audio.weatherBus;
    if (!ctx || !ambienceBus || !weatherBus) {
      return;
    }

    this.ambienceVoice = ctx.createGain();
    this.ambienceVoice.gain.value = 0;
    this.ambienceFilter = ctx.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.Q.value = 0.6;
    this.applyThemeFilter();

    this.ambienceSource = ctx.createBufferSource();
    this.ambienceSource.buffer = createNoiseBuffer(ctx, 2.2, themeNoiseKind(this.theme));
    this.ambienceSource.loop = true;
    this.ambienceSource.connect(this.ambienceFilter);
    this.ambienceFilter.connect(this.ambienceVoice);
    this.ambienceVoice.connect(ambienceBus);
    this.ambienceSource.start();

    this.rainVoice = ctx.createGain();
    this.rainVoice.gain.value = 0;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 4200;
    this.rainFilter.Q.value = 0.7;
    this.rainSource = ctx.createBufferSource();
    this.rainSource.buffer = createNoiseBuffer(ctx, 1.4, 'pink');
    this.rainSource.loop = true;
    this.rainSource.connect(this.rainFilter);
    this.rainFilter.connect(this.rainVoice);
    this.rainVoice.connect(weatherBus);
    this.rainSource.start();
  }

  private restartAmbience(): void {
    if (!this.started || !this.audio.isReady || !this.audio.context) {
      return;
    }
    try {
      this.disposeNodes();
      this.buildGraph();
      this.started = true;
      this.applyLevels();
    } catch {
      this.started = false;
      this.disposeNodes();
    }
  }

  private applyThemeFilter(): void {
    if (!this.ambienceFilter) {
      return;
    }
    switch (this.theme) {
      case 'desert-industrial':
        this.ambienceFilter.frequency.value = 900;
        break;
      case 'coastal':
        this.ambienceFilter.frequency.value = 1600;
        break;
      case 'alpine':
      default:
        this.ambienceFilter.frequency.value = 1200;
        break;
    }
  }

  private applyLevels(): void {
    if (!this.started || !this.audio.context) {
      return;
    }
    const t = this.audio.now();
    const mute = !this.enabled || this.audio.isMuted ? 0 : 1;

    const base =
      this.theme === 'coastal'
        ? 0.08
        : this.theme === 'desert-industrial'
          ? 0.05
          : 0.06;
    const windBoost = Math.min(0.12, this.windSpeed * 0.012);
    const ambienceLevel = (base + windBoost) * mute;

    if (this.ambienceVoice) {
      safeSetTarget(this.ambienceVoice.gain, ambienceLevel, t, 0.25);
    }

    const rainActive =
      this.precipType === 'rain' || this.precipType === 'lightSnow';
    const rainLevel =
      rainActive && this.precipIntensity > 0.02
        ? Math.min(0.18, 0.04 + this.precipIntensity * 0.14) * mute
        : 0;
    if (this.rainVoice) {
      safeSetTarget(this.rainVoice.gain, rainLevel, t, 0.3);
    }
  }

  private disposeNodes(): void {
    try {
      this.ambienceSource?.stop();
    } catch {
      // ignore
    }
    try {
      this.rainSource?.stop();
    } catch {
      // ignore
    }
    try {
      this.ambienceSource?.disconnect();
      this.ambienceFilter?.disconnect();
      this.ambienceVoice?.disconnect();
      this.rainSource?.disconnect();
      this.rainFilter?.disconnect();
      this.rainVoice?.disconnect();
    } catch {
      // ignore
    }
    this.ambienceSource = null;
    this.ambienceFilter = null;
    this.ambienceVoice = null;
    this.rainSource = null;
    this.rainFilter = null;
    this.rainVoice = null;
  }
}

type NoiseKind = 'brown' | 'pink' | 'white';

function normalizeTheme(theme: string): EnvironmentTheme | 'fallback' {
  if (
    theme === 'alpine' ||
    theme === 'desert-industrial' ||
    theme === 'coastal' ||
    theme === 'fallback'
  ) {
    return theme;
  }
  return 'alpine';
}

function themeNoiseKind(theme: EnvironmentTheme | 'fallback'): NoiseKind {
  switch (theme) {
    case 'coastal':
      return 'pink';
    case 'desert-industrial':
      return 'brown';
    case 'alpine':
    default:
      return 'brown';
  }
}

function createNoiseBuffer(
  ctx: AudioContext,
  seconds: number,
  kind: NoiseKind,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'white') {
      data[i] = white * 0.35;
      continue;
    }
    if (kind === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
      continue;
    }
    // Approximate pink noise (Paul Kellet refined method).
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buffer;
}

function safeSetTarget(
  param: AudioParam,
  value: number,
  now: number,
  timeConstant: number,
): void {
  try {
    param.setTargetAtTime(Math.max(0, value), now, timeConstant);
  } catch {
    try {
      param.value = Math.max(0, value);
    } catch {
      // ignore
    }
  }
}
