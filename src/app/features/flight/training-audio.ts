/**
 * Optional Web Audio beeps for countdown / gate pass.
 * Created only after a user gesture; safe to no-op when muted or unsupported.
 *
 * Prefer AudioManagerService + GameplayAudioService for new call sites.
 */
export class TrainingAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private unlocked = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /** Call from a click / key handler so AudioContext can start. */
  unlock(): void {
    if (this.unlocked) {
      return;
    }
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) {
        return;
      }
      this.ctx = new Ctx();
      void this.ctx.resume();
      this.unlocked = true;
    } catch {
      this.ctx = null;
    }
  }

  beepCountdown(step: number): void {
    const freq = 440 + (3 - Math.min(3, Math.max(1, step))) * 120;
    this.tone(freq, 0.08, 0.04);
  }

  beepGo(): void {
    this.tone(880, 0.16, 0.06);
  }

  beepGate(): void {
    this.tone(660, 0.07, 0.045);
    window.setTimeout(() => this.tone(880, 0.07, 0.04), 70);
  }

  beepInvalid(): void {
    this.tone(180, 0.22, 0.05);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.unlocked = false;
  }

  private tone(frequency: number, duration: number, gainValue: number): void {
    if (this.muted || !this.ctx) {
      return;
    }
    try {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Ignore audio failures.
    }
  }
}
