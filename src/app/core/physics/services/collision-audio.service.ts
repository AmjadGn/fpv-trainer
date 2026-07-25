import { Injectable, inject } from '@angular/core';

import { AudioManagerService } from '../../audio/services/audio-manager.service';
import type { Vec3 } from '../../flight/models/flight-state.model';
import type { CollisionMaterialId } from '../models/collision.models';
import { getCollisionMaterial } from '../models/physics-body.models';

export interface ImpactAudioParams {
  material: CollisionMaterialId;
  strength: number;
  position?: Vec3;
}

export interface ScrapeAudioParams {
  material?: CollisionMaterialId;
  strength?: number;
}

type RateCategory =
  | 'impact'
  | 'scrape'
  | 'propStrike'
  | 'break'
  | 'splash'
  | 'severeCrash'
  | 'barrelRoll';

const RATE_LIMIT_MS = 80;

@Injectable({ providedIn: 'root' })
export class CollisionAudioService {
  private readonly audio = inject(AudioManagerService);
  private readonly lastPlayed = new Map<string, number>();
  private scrapeNodes: {
    src: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    panner: StereoPannerNode | null;
  } | null = null;

  playImpact(params: ImpactAudioParams): void {
    const profile = getCollisionMaterial(params.material);
    const cat = `impact:${profile.impactAudio}`;
    if (!this.allow(cat)) {
      return;
    }
    const s = clampStrength(params.strength);
    const gain = lerp(0.025, 0.11, s);
    const pitch = lerp(0.75, 1.35, s);

    this.withBus((ctx, bus) => {
      switch (profile.impactAudio) {
        case 'grass':
        case 'dirt':
          this.noiseBurst(ctx, bus, 0.12 + s * 0.08, gain * 0.9, 220 * pitch, params.position);
          this.tone(ctx, bus, 180 * pitch, 0.06, gain * 0.35, 'triangle', params.position);
          break;
        case 'rock':
        case 'concrete':
          this.noiseBurst(ctx, bus, 0.14 + s * 0.1, gain, 140 * pitch, params.position);
          this.tone(ctx, bus, 95 * pitch, 0.05, gain * 0.4, 'square', params.position);
          break;
        case 'metal':
          this.tone(ctx, bus, 420 * pitch, 0.07, gain * 0.55, 'triangle', params.position);
          this.schedule(
            () => this.tone(ctx, bus, 680 * pitch, 0.05, gain * 0.35, 'sine', params.position),
            35,
          );
          this.noiseBurst(ctx, bus, 0.08, gain * 0.45, 800 * pitch, params.position);
          break;
        case 'wood':
          this.tone(ctx, bus, 240 * pitch, 0.09, gain * 0.7, 'sine', params.position);
          this.noiseBurst(ctx, bus, 0.1, gain * 0.35, 300 * pitch, params.position);
          break;
        case 'plastic':
          this.tone(ctx, bus, 320 * pitch, 0.07, gain * 0.5, 'sine', params.position);
          this.noiseBurst(ctx, bus, 0.07, gain * 0.3, 400 * pitch, params.position);
          break;
        case 'splash':
          this.playSplashInternal(ctx, bus, s, params.position);
          break;
        default:
          this.noiseBurst(ctx, bus, 0.12, gain * 0.8, 180 * pitch, params.position);
      }
    });
  }

  startScrape(params?: ScrapeAudioParams): void {
    if (this.scrapeNodes) {
      this.withBus((ctx) => {
        const strength = clampStrength(params?.strength ?? 0.4);
        const g = lerp(0.012, 0.045, strength);
        try {
          this.scrapeNodes!.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
        } catch {
          // ignore
        }
      });
      return;
    }
    if (!this.allow('scrape')) {
      return;
    }
    this.withBus((ctx, bus) => {

      const material = params?.material ?? 'concrete';
      const profile = getCollisionMaterial(material);
      const strength = clampStrength(params?.strength ?? 0.4);
      const gainVal = lerp(0.012, 0.045, strength);

      let cutoff = 600;
      if (profile.scrapeAudio === 'scrapeMetal') {
        cutoff = 1200;
      } else if (profile.scrapeAudio === 'scrapeHard') {
        cutoff = 450;
      } else if (profile.scrapeAudio === 'splash') {
        cutoff = 900;
      }

      try {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 54321;
        for (let i = 0; i < data.length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          data[i] = (seed / 0xffffffff) * 2 - 1;
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = cutoff;
        filter.Q.value = 0.8;
        const gain = ctx.createGain();
        src.connect(filter);
        filter.connect(gain);
        gain.connect(bus);
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, gainVal), now + 0.04);
        src.start(now);
        this.scrapeNodes = { src, filter, gain, panner: null };
      } catch {
        // ignore
      }
    });
  }

  stopScrape(): void {
    const nodes = this.scrapeNodes;
    if (!nodes) {
      return;
    }
    this.scrapeNodes = null;
    const ctx = this.audio.context;
    if (!ctx) {
      try {
        nodes.src.stop();
      } catch {
        // ignore
      }
      return;
    }
    try {
      const now = ctx.currentTime;
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      const stopAt = now + 0.08;
      nodes.src.stop(stopAt);
      nodes.src.onended = () => {
        try {
          nodes.src.disconnect();
          nodes.filter.disconnect();
          nodes.gain.disconnect();
          nodes.panner?.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      try {
        nodes.src.stop();
      } catch {
        // ignore
      }
    }
  }

  playPropStrike(strength = 1): void {
    if (!this.allow('propStrike')) {
      return;
    }
    const s = clampStrength(strength);
    this.withBus((ctx, bus) => {
      const pitch = lerp(0.9, 1.5, s);
      this.noiseBurst(ctx, bus, 0.06 + s * 0.04, lerp(0.04, 0.09, s), 600 * pitch);
      this.tone(ctx, bus, 880 * pitch, 0.04, lerp(0.03, 0.07, s), 'square');
    });
  }

  playBreak(strength = 1): void {
    if (!this.allow('break')) {
      return;
    }
    const s = clampStrength(strength);
    this.withBus((ctx, bus) => {
      this.noiseBurst(ctx, bus, 0.16 + s * 0.1, lerp(0.05, 0.1, s), 280);
      this.tone(ctx, bus, 180, 0.08, lerp(0.04, 0.08, s), 'triangle');
      this.schedule(() => this.noiseBurst(ctx, bus, 0.1, lerp(0.03, 0.06, s), 120), 60);
    });
  }

  playSplash(strength = 1): void {
    if (!this.allow('splash')) {
      return;
    }
    this.withBus((ctx, bus) => {
      this.playSplashInternal(ctx, bus, clampStrength(strength));
    });
  }

  playSevereCrash(strength = 1): void {
    if (!this.allow('severeCrash')) {
      return;
    }
    const s = clampStrength(strength);
    this.withBus((ctx, bus) => {
      this.noiseBurst(ctx, bus, 0.32 + s * 0.12, lerp(0.08, 0.14, s), 90);
      this.tone(ctx, bus, 70, 0.14, lerp(0.05, 0.1, s), 'sine');
      this.schedule(() => this.noiseBurst(ctx, bus, 0.2, lerp(0.04, 0.08, s), 60), 80);
      this.schedule(() => this.tone(ctx, bus, 45, 0.18, lerp(0.03, 0.06, s), 'triangle'), 120);
    });
  }

  playBarrelRoll(strength = 0.6): void {
    if (!this.allow('barrelRoll')) {
      return;
    }
    const s = clampStrength(strength);
    this.withBus((ctx, bus) => {
      const pitch = lerp(0.85, 1.2, s);
      this.tone(ctx, bus, 520 * pitch, 0.06, lerp(0.025, 0.05, s), 'sine');
      this.schedule(() => this.tone(ctx, bus, 640 * pitch, 0.07, lerp(0.02, 0.04, s), 'triangle'), 55);
      this.schedule(() => this.noiseBurst(ctx, bus, 0.05, lerp(0.015, 0.035, s), 400 * pitch), 90);
    });
  }

  dispose(): void {
    this.stopScrape();
    this.lastPlayed.clear();
  }

  private playSplashInternal(
    ctx: AudioContext,
    bus: GainNode,
    s: number,
    position?: Vec3,
  ): void {
    const gain = lerp(0.04, 0.1, s);
    this.noiseBurst(ctx, bus, 0.14 + s * 0.08, gain, 700, position);
    this.tone(ctx, bus, 220, 0.1, gain * 0.4, 'sine', position);
    this.schedule(
      () => this.noiseBurst(ctx, bus, 0.08, gain * 0.5, 400, position),
      70,
    );
  }

  private allow(category: RateCategory | string): boolean {
    if (this.audio.isMuted || !this.audio.isReady) {
      return false;
    }
    const now = performance.now();
    const last = this.lastPlayed.get(category) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      return false;
    }
    this.lastPlayed.set(category, now);
    return true;
  }

  private withBus(fn: (ctx: AudioContext, bus: GainNode) => void): void {
    if (this.audio.isMuted || !this.audio.isReady) {
      return;
    }
    const ctx = this.audio.context;
    const bus = this.audio.effectsBus;
    if (!ctx || !bus) {
      return;
    }
    try {
      fn(ctx, bus);
    } catch {
      // ignore
    }
  }

  private tone(
    ctx: AudioContext,
    bus: GainNode,
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    position?: Vec3,
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.connect(gain);
      this.connectToBus(gain, bus, position);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.03);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }

  private noiseBurst(
    ctx: AudioContext,
    bus: GainNode,
    duration: number,
    gainValue: number,
    cutoff: number,
    position?: Vec3,
  ): void {
    try {
      const buffer = ctx.createBuffer(
        1,
        Math.max(1, Math.floor(ctx.sampleRate * duration)),
        ctx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      let seed = 98765;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 0xffffffff) * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      src.connect(filter);
      filter.connect(gain);
      this.connectToBus(gain, bus, position);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      src.start(now);
      src.stop(now + duration + 0.02);
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }

  private connectToBus(gain: GainNode, bus: GainNode, position?: Vec3): void {
    if (position && typeof gain.context.createStereoPanner === 'function') {
      try {
        const panner = gain.context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, position.x * 0.15));
        gain.connect(panner);
        panner.connect(bus);
        return;
      } catch {
        // fall through
      }
    }
    gain.connect(bus);
  }

  private schedule(fn: () => void, ms: number): void {
    window.setTimeout(fn, ms);
  }
}

function clampStrength(strength: number): number {
  if (!Number.isFinite(strength)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, strength / 12));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
