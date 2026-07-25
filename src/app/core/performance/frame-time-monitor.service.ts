import { Injectable, signal } from '@angular/core';

export interface FrameTimeSnapshot {
  fps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  physicsMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  qualityPreset: string;
  resolutionScale: number;
  aircraftId: string | null;
  environmentId: string | null;
}

/**
 * Internal performance monitor. Hidden in production UI by default.
 */
@Injectable({ providedIn: 'root' })
export class FrameTimeMonitorService {
  private frames: number[] = [];
  private physicsSamples: number[] = [];
  private renderSamples: number[] = [];

  readonly snapshot = signal<FrameTimeSnapshot>({
    fps: 0,
    avgMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    physicsMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    qualityPreset: 'medium',
    resolutionScale: 1,
    aircraftId: null,
    environmentId: null,
  });

  recordFrame(frameMs: number, physicsMs = 0, renderMs = 0): void {
    if (!Number.isFinite(frameMs) || frameMs <= 0) return;
    this.frames.push(frameMs);
    this.physicsSamples.push(physicsMs);
    this.renderSamples.push(renderMs);
    if (this.frames.length > 180) {
      this.frames.shift();
      this.physicsSamples.shift();
      this.renderSamples.shift();
    }
  }

  publish(meta: {
    drawCalls?: number;
    triangles?: number;
    qualityPreset?: string;
    resolutionScale?: number;
    aircraftId?: string | null;
    environmentId?: string | null;
  } = {}): void {
    const avg = average(this.frames);
    const p95 = percentile(this.frames, 0.95);
    const p99 = percentile(this.frames, 0.99);
    this.snapshot.set({
      fps: avg > 0 ? Math.round(1000 / avg) : 0,
      avgMs: round1(avg),
      p95Ms: round1(p95),
      p99Ms: round1(p99),
      physicsMs: round1(average(this.physicsSamples)),
      renderMs: round1(average(this.renderSamples)),
      drawCalls: meta.drawCalls ?? 0,
      triangles: meta.triangles ?? 0,
      qualityPreset: meta.qualityPreset ?? this.snapshot().qualityPreset,
      resolutionScale: meta.resolutionScale ?? this.snapshot().resolutionScale,
      aircraftId: meta.aircraftId ?? this.snapshot().aircraftId,
      environmentId: meta.environmentId ?? this.snapshot().environmentId,
    });
  }
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
