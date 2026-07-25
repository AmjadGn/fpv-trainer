import { Injectable, computed, signal } from '@angular/core';
import {
  CONTINUE_STORAGE_KEY,
  CONTINUE_VERSION,
  type ContinueKind,
  type ContinueState,
} from './continue-state.model';

@Injectable({ providedIn: 'root' })
export class ContinueExperienceService {
  private readonly state = signal<ContinueState | null>(this.read());

  readonly snapshot = this.state.asReadonly();
  readonly hasContinue = computed(() => {
    const s = this.state();
    return !!s && !s.dismissed;
  });

  readonly prompt = computed(() => {
    const s = this.state();
    if (!s || s.dismissed) return null;
    return {
      title: s.label,
      kind: s.kind,
      aircraftId: s.aircraftId,
      environmentId: s.environmentId,
    };
  });

  remember(input: {
    kind: ContinueKind;
    label: string;
    aircraftId?: string | null;
    environmentId?: string | null;
    courseId?: string | null;
    moduleId?: string | null;
    weatherPresetId?: string | null;
  }): void {
    const next: ContinueState = {
      version: CONTINUE_VERSION,
      kind: input.kind,
      label: input.label,
      aircraftId: input.aircraftId ?? null,
      environmentId: input.environmentId ?? null,
      courseId: input.courseId ?? null,
      moduleId: input.moduleId ?? null,
      weatherPresetId: input.weatherPresetId ?? null,
      updatedAt: new Date().toISOString(),
      dismissed: false,
    };
    this.state.set(next);
    this.persist(next);
  }

  dismiss(): void {
    const current = this.state();
    if (!current) return;
    const next = { ...current, dismissed: true, updatedAt: new Date().toISOString() };
    this.state.set(next);
    this.persist(next);
  }

  clear(): void {
    this.state.set(null);
    try {
      localStorage.removeItem(CONTINUE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  private persist(value: ContinueState): void {
    try {
      localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  private read(): ContinueState | null {
    try {
      const raw = localStorage.getItem(CONTINUE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ContinueState;
      if (parsed.version !== CONTINUE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
