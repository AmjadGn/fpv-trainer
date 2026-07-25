import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CAMERA_EFFECTS_SETTINGS } from '../../settings/models/trainer-settings.model';
import type { CameraEffectsInput } from '../models/camera-effects.model';
import {
  NEUTRAL_CAMERA_EFFECTS,
  clampFovOffset,
  intensityMultiplier,
  shouldSuppressContinuousEffects,
} from '../models/camera-effects.model';
import { FlightCameraEffectsService } from './flight-camera-effects.service';

function baseInput(
  overrides: Partial<CameraEffectsInput> = {},
): CameraEffectsInput {
  return {
    position: { x: 0, y: 1, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    velocity: { x: 0, y: 0, z: -10 },
    angularVelocity: { pitch: 0, yaw: 0, roll: 0 },
    throttle: 0.5,
    armed: true,
    crashed: false,
    speed: 12,
    altitude: 5,
    paused: false,
    prefersReducedMotion: false,
    forceEffectsDespiteReducedMotion: false,
    settings: { ...DEFAULT_CAMERA_EFFECTS_SETTINGS },
    ...overrides,
  };
}

describe('FlightCameraEffectsService', () => {
  let service: FlightCameraEffectsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlightCameraEffectsService],
    });
    service = TestBed.inject(FlightCameraEffectsService);
  });

  afterEach(() => {
    service.reset();
  });

  it('returns near-neutral offsets when effects disabled', () => {
    const out = service.update(
      baseInput({
        settings: {
          ...DEFAULT_CAMERA_EFFECTS_SETTINGS,
          cameraEffectsEnabled: false,
        },
      }),
      1 / 60,
    );
    expect(Math.abs(out.positionOffset.x)).toBeLessThan(0.001);
    expect(Math.abs(out.fovOffsetDegrees)).toBeLessThan(0.05);
  });

  it('scales magnitude with intensity', () => {
    service.reset();
    const low = service.update(
      baseInput({
        settings: {
          ...DEFAULT_CAMERA_EFFECTS_SETTINGS,
          cameraEffectsIntensity: 'low',
          dynamicFovEnabled: true,
        },
        speed: 25,
      }),
      0.2,
    );
    service.reset();
    const high = service.update(
      baseInput({
        settings: {
          ...DEFAULT_CAMERA_EFFECTS_SETTINGS,
          cameraEffectsIntensity: 'high',
          dynamicFovEnabled: true,
        },
        speed: 25,
      }),
      0.2,
    );
    expect(high.fovOffsetDegrees).toBeGreaterThan(low.fovOffsetDegrees);
  });

  it('clamps dynamic FOV', () => {
    expect(clampFovOffset(20, 5)).toBe(5);
    expect(clampFovOffset(-1, 5)).toBe(0);
  });

  it('decays impact impulse over time', () => {
    service.triggerImpact(1);
    const first = service.update(baseInput(), 1 / 60);
    for (let i = 0; i < 40; i++) {
      service.update(baseInput(), 1 / 30);
    }
    const later = service.update(baseInput(), 1 / 60);
    const firstMag = Math.hypot(
      first.positionOffset.x,
      first.positionOffset.y,
      first.positionOffset.z,
    );
    const laterMag = Math.hypot(
      later.positionOffset.x,
      later.positionOffset.y,
      later.positionOffset.z,
    );
    expect(firstMag).toBeGreaterThan(laterMag);
  });

  it('suppresses continuous effects under reduced motion', () => {
    expect(
      shouldSuppressContinuousEffects({
        prefersReducedMotion: true,
        forceEffectsDespiteReducedMotion: false,
        paused: false,
        replayMode: false,
      }),
    ).toBe(true);
  });

  it('does not mutate provided simulation vectors', () => {
    const position = { x: 1, y: 2, z: 3 };
    const velocity = { x: 4, y: 5, z: 6 };
    service.update(baseInput({ position, velocity, speed: 15 }), 1 / 60);
    expect(position).toEqual({ x: 1, y: 2, z: 3 });
    expect(velocity).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('intensityMultiplier maps tiers', () => {
    expect(intensityMultiplier('off')).toBe(0);
    expect(intensityMultiplier('high')).toBeGreaterThan(
      intensityMultiplier('low'),
    );
  });

  it('exposes neutral constant', () => {
    expect(NEUTRAL_CAMERA_EFFECTS.fovOffsetDegrees).toBe(0);
  });
});
