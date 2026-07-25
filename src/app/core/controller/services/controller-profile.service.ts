import { Injectable, computed, signal } from '@angular/core';
import {
  ACTIVE_CONTROLLER_PROFILE_KEY,
  CONTROLLER_PROFILES_KEY,
  type ControllerProfile,
} from '../models/controller-profile.model';
import { CALIBRATION_VERSION } from '../models/controller-calibration.model';

@Injectable({ providedIn: 'root' })
export class ControllerProfileService {
  private readonly profiles = signal<ControllerProfile[]>(this.readProfiles());
  private readonly activeId = signal<string | null>(this.readActiveId());

  readonly list = this.profiles.asReadonly();
  readonly activeProfile = computed(
    () => this.profiles().find((p) => p.id === this.activeId()) ?? null,
  );

  createFromCalibration(input: {
    displayName: string;
    gamepadId: string;
    axisMappings: Record<string, number>;
    inversion: Record<string, boolean>;
    deadZones: Record<string, number>;
  }): ControllerProfile {
    const now = new Date().toISOString();
    const profile: ControllerProfile = {
      id: `profile-${Date.now().toString(36)}`,
      displayName: input.displayName,
      gamepadIdPattern: escapeRegExp(input.gamepadId).slice(0, 80),
      axisMappings: input.axisMappings,
      buttonMappings: {},
      inversion: input.inversion,
      deadZones: input.deadZones,
      sensitivity: { throttle: 1, yaw: 1, pitch: 1, roll: 1 },
      throttleMode: 'mode2',
      calibrationVersion: CALIBRATION_VERSION,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.update((list) => [...list, profile]);
    this.activeId.set(profile.id);
    this.persist();
    return profile;
  }

  rename(id: string, displayName: string): void {
    this.profiles.update((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, displayName, updatedAt: new Date().toISOString() }
          : p,
      ),
    );
    this.persist();
  }

  duplicate(id: string): ControllerProfile | null {
    const source = this.profiles().find((p) => p.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: ControllerProfile = {
      ...source,
      id: `profile-${Date.now().toString(36)}`,
      displayName: `${source.displayName} (copy)`,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.update((list) => [...list, copy]);
    this.persist();
    return copy;
  }

  reset(id: string): void {
    this.profiles.update((list) => list.filter((p) => p.id !== id));
    if (this.activeId() === id) {
      this.activeId.set(this.profiles()[0]?.id ?? null);
    }
    this.persist();
  }

  setActive(id: string): void {
    if (!this.profiles().some((p) => p.id === id)) return;
    this.activeId.set(id);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(CONTROLLER_PROFILES_KEY, JSON.stringify(this.profiles()));
      if (this.activeId()) {
        localStorage.setItem(ACTIVE_CONTROLLER_PROFILE_KEY, this.activeId()!);
      } else {
        localStorage.removeItem(ACTIVE_CONTROLLER_PROFILE_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  private readProfiles(): ControllerProfile[] {
    try {
      const raw = localStorage.getItem(CONTROLLER_PROFILES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ControllerProfile[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private readActiveId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_CONTROLLER_PROFILE_KEY);
    } catch {
      return null;
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
