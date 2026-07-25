import { Injectable, computed, signal } from '@angular/core';
import type { ComponentType } from '@fpv/component-catalog';

import type {
  BuilderCompileResultView,
  BuilderMode,
  BuilderPhase,
  BuilderSessionSnapshot,
  BuildIntentId,
} from '../models/drone-builder-view.models';

/**
 * Transient UI session state for the shared builder core.
 * Does not implement domain engineering equations.
 */
@Injectable({ providedIn: 'root' })
export class DroneBuilderSessionService {
  private readonly _phase = signal<BuilderPhase>('idle');
  private readonly _mode = signal<BuilderMode>('simple');
  private readonly _intentId = signal<BuildIntentId | null>(null);
  private readonly _buildId = signal<string | null>(null);
  private readonly _buildName = signal('Untitled Build');
  private readonly _dirty = signal(false);
  private readonly _activeCategory = signal<ComponentType>('frame');
  private readonly _selectedRevisionIdsBySlot = signal<
    Readonly<Record<string, string>>
  >({});
  private readonly _canCompile = signal(false);
  private readonly _compileBlockedReason = signal<string | null>(null);
  private readonly _lastCompile = signal<BuilderCompileResultView | null>(null);
  private readonly _launchAircraftName = signal<string | null>(null);

  readonly phase = this._phase.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly intentId = this._intentId.asReadonly();
  readonly buildId = this._buildId.asReadonly();
  readonly buildName = this._buildName.asReadonly();
  readonly dirty = this._dirty.asReadonly();
  readonly activeCategory = this._activeCategory.asReadonly();
  readonly selectedRevisionIdsBySlot =
    this._selectedRevisionIdsBySlot.asReadonly();
  readonly canCompile = this._canCompile.asReadonly();
  readonly compileBlockedReason = this._compileBlockedReason.asReadonly();
  readonly lastCompile = this._lastCompile.asReadonly();
  readonly launchAircraftName = this._launchAircraftName.asReadonly();

  readonly snapshot = computed<BuilderSessionSnapshot>(() => ({
    phase: this._phase(),
    mode: this._mode(),
    intentId: this._intentId(),
    buildId: this._buildId(),
    buildName: this._buildName(),
    dirty: this._dirty(),
    activeCategory: this._activeCategory(),
    selectedRevisionIdsBySlot: this._selectedRevisionIdsBySlot(),
    canCompile: this._canCompile(),
    compileBlockedReason: this._compileBlockedReason(),
    lastCompile: this._lastCompile(),
    launchAircraftName: this._launchAircraftName(),
  }));

  setPhase(phase: BuilderPhase): void {
    this._phase.set(phase);
  }

  setMode(mode: BuilderMode): void {
    this._mode.set(mode);
  }

  setIntentId(intentId: BuildIntentId | null): void {
    this._intentId.set(intentId);
  }

  setBuildIdentity(buildId: string, buildName: string): void {
    this._buildId.set(buildId);
    this._buildName.set(buildName);
  }

  setBuildName(name: string): void {
    this._buildName.set(name);
    this._dirty.set(true);
  }

  setDirty(dirty: boolean): void {
    this._dirty.set(dirty);
  }

  setActiveCategory(category: ComponentType): void {
    this._activeCategory.set(category);
  }

  setSelectedRevisionIdsBySlot(
    slots: Readonly<Record<string, string>>,
  ): void {
    this._selectedRevisionIdsBySlot.set({ ...slots });
  }

  patchSelectedRevision(slot: string, revisionId: string): void {
    this._selectedRevisionIdsBySlot.update((current) => ({
      ...current,
      [slot]: revisionId,
    }));
    this._dirty.set(true);
  }

  setCompileGate(canCompile: boolean, reason: string | null): void {
    this._canCompile.set(canCompile);
    this._compileBlockedReason.set(reason);
  }

  setLastCompile(result: BuilderCompileResultView | null): void {
    this._lastCompile.set(result);
    this._launchAircraftName.set(result?.aircraftDisplayName ?? null);
  }

  setLaunchAircraftName(name: string | null): void {
    this._launchAircraftName.set(name);
  }

  resetSession(): void {
    this._phase.set('idle');
    this._mode.set('simple');
    this._intentId.set(null);
    this._buildId.set(null);
    this._buildName.set('Untitled Build');
    this._dirty.set(false);
    this._activeCategory.set('frame');
    this._selectedRevisionIdsBySlot.set({});
    this._canCompile.set(false);
    this._compileBlockedReason.set(null);
    this._lastCompile.set(null);
    this._launchAircraftName.set(null);
  }
}
