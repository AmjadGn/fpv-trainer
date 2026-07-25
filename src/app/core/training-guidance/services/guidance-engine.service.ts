import { Injectable, computed, signal } from '@angular/core';
import type { GuidanceAction, GuidanceProgress, GuidanceScript, GuidanceStep } from '../models/guidance-step.model';
import {
  evaluateStepTrigger,
  getGuidanceScript,
  type GuidanceRuntimeInput,
} from './guidance-trigger.service';

/**
 * Training guidance engine. Must not affect competitive modes.
 */
@Injectable({ providedIn: 'root' })
export class GuidanceEngineService {
  private readonly active = signal(false);
  private readonly script = signal<GuidanceScript | null>(null);
  private readonly stepIndex = signal(0);
  private readonly completed = signal<string[]>([]);
  private readonly overlayText = signal<string | null>(null);
  private readonly competitiveBlocked = signal(false);

  readonly isActive = this.active.asReadonly();
  readonly currentStep = computed<GuidanceStep | null>(() => {
    const s = this.script();
    if (!s) return null;
    return s.steps[this.stepIndex()] ?? null;
  });
  readonly message = this.overlayText.asReadonly();
  readonly progress = computed<GuidanceProgress | null>(() => {
    const s = this.script();
    if (!s) return null;
    return {
      scriptId: s.id,
      stepIndex: this.stepIndex(),
      completedStepIds: this.completed(),
      startedAt: this.startedAt,
      completedAt: this.finishedAt,
    };
  });

  private startedAt = '';
  private finishedAt: string | null = null;

  start(scriptId: string, opts: { competitive?: boolean } = {}): boolean {
    if (opts.competitive) {
      this.competitiveBlocked.set(true);
      this.stop();
      return false;
    }
    const script = getGuidanceScript(scriptId);
    if (!script || script.competitiveSafe !== false) {
      // Only allow scripts explicitly marked non-competitive.
      return false;
    }
    this.script.set(script);
    this.stepIndex.set(0);
    this.completed.set([]);
    this.active.set(true);
    this.competitiveBlocked.set(false);
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.showStep(script.steps[0] ?? null);
    return true;
  }

  stop(): void {
    this.active.set(false);
    this.script.set(null);
    this.overlayText.set(null);
  }

  skip(): void {
    this.stop();
  }

  advance(): void {
    const s = this.script();
    if (!s || !this.active()) return;
    const current = s.steps[this.stepIndex()];
    if (current) {
      this.completed.update((ids) => [...ids, current.id]);
    }
    const nextIndex = this.stepIndex() + 1;
    if (nextIndex >= s.steps.length) {
      this.finishedAt = new Date().toISOString();
      this.overlayText.set('Guided flight complete');
      this.active.set(false);
      return;
    }
    this.stepIndex.set(nextIndex);
    this.showStep(s.steps[nextIndex] ?? null);
  }

  tick(input: GuidanceRuntimeInput): GuidanceAction[] {
    if (!this.active() || this.competitiveBlocked()) return [];
    const step = this.currentStep();
    if (!step) return [];
    if (step.trigger.type === 'manual') return step.actions;
    if (evaluateStepTrigger(step, input)) {
      const actions = step.actions;
      this.advance();
      return actions;
    }
    if (input.crashed) {
      this.overlayText.set('Crashed — reset and retry this step. Training assistance is still on.');
    }
    return [];
  }

  private showStep(step: GuidanceStep | null): void {
    if (!step) {
      this.overlayText.set(null);
      return;
    }
    this.overlayText.set(`${step.title}: ${step.body}`);
  }
}
