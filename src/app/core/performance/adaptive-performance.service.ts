import { Injectable, inject, signal } from '@angular/core';
import { FeatureFlagService } from '../features/services/feature-flag.service';
import { TrainerSettingsService } from '../settings/services/trainer-settings.service';
import type { EnvironmentQuality } from '../settings/models/trainer-settings.model';
import { ProductAnalyticsService } from '../analytics/product-analytics.service';
import { AnalyticsEvents } from '../analytics/analytics-events';
import { recommendQualityPreset } from './quality-recommendation';

/**
 * Optional adaptive graphics. Does not change physics tick rate, controller
 * sampling, flight profiles, race timing, or competitive collision quality.
 */
@Injectable({ providedIn: 'root' })
export class AdaptivePerformanceService {
  private readonly flags = inject(FeatureFlagService);
  private readonly settings = inject(TrainerSettingsService);
  private readonly analytics = inject(ProductAnalyticsService);

  readonly enabled = signal(true);
  readonly lastAdjustment = signal<string | null>(null);
  private frameTimes: number[] = [];
  private lastSampleAt = 0;

  applyInitialRecommendation(force = false): EnvironmentQuality {
    const current = this.settings.environmentSettings().quality;
    if (!force && this.hasUserOverride()) return current;
    const rec = recommendQualityPreset();
    this.settings.patchEnvironment({ quality: rec.preset });
    this.analytics.setPerformanceCategory(rec.preset);
    return rec.preset;
  }

  setEnabled(value: boolean): void {
    this.enabled.set(value);
  }

  /** Call once per rendered frame with frame delta in ms. */
  sampleFrameTime(deltaMs: number): void {
    if (!this.enabled() || !this.flags.adaptiveGraphics()) return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 250) return;
    this.frameTimes.push(deltaMs);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    const now = performance.now();
    if (now - this.lastSampleAt < 5000) return;
    this.lastSampleAt = now;
    this.maybeAdapt();
  }

  private maybeAdapt(): void {
    if (this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 16;
    const current = this.settings.environmentSettings().quality;
    if (p95 > 28 && current !== 'low') {
      const next: EnvironmentQuality = current === 'high' ? 'medium' : 'low';
      this.settings.patchEnvironment({ quality: next });
      const msg = `Graphics reduced to ${next} to keep flight smooth.`;
      this.lastAdjustment.set(msg);
      this.analytics.track(AnalyticsEvents.performanceWarningTriggered, {
        from: current,
        to: next,
        p95,
      });
    }
  }

  private hasUserOverride(): boolean {
    try {
      return localStorage.getItem('fpv-trainer.quality-user-override') === '1';
    } catch {
      return false;
    }
  }

  markUserOverride(): void {
    try {
      localStorage.setItem('fpv-trainer.quality-user-override', '1');
    } catch {
      /* ignore */
    }
  }
}
