import { TestBed } from '@angular/core/testing';

import { WindFieldService } from './wind-field.service';
import { ZERO_WIND_STATE } from '../models/wind.models';

describe('WindFieldService', () => {
  let service: WindFieldService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WindFieldService);
  });

  it('Calm / disabled returns zero wind', () => {
    service.setWindState({ ...ZERO_WIND_STATE });
    const sample = service.sample({ x: 0, y: 1, z: 0 }, 1.5);
    expect(sample.speed).toBe(0);
    expect(sample.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('same seed and time produce the same vector', () => {
    service.setWindState({
      enabled: true,
      baseDirection: { x: 1, y: 0, z: 0 },
      baseSpeed: 4,
      gustStrength: 1.5,
      gustFrequency: 0.12,
      turbulence: 0.3,
      verticalDraftStrength: 0.2,
      seed: 99,
    });
    const a = service.sample({ x: 3, y: 2, z: -5 }, 12.5);
    const b = service.sample({ x: 3, y: 2, z: -5 }, 12.5);
    expect(a.velocity.x).toBeCloseTo(b.velocity.x, 10);
    expect(a.velocity.y).toBeCloseTo(b.velocity.y, 10);
    expect(a.velocity.z).toBeCloseTo(b.velocity.z, 10);
  });

  it('different seeds differ', () => {
    service.setWindState({
      enabled: true,
      baseDirection: { x: 1, y: 0, z: 0 },
      baseSpeed: 3,
      gustStrength: 2,
      gustFrequency: 0.15,
      turbulence: 0.5,
      verticalDraftStrength: 0.3,
      seed: 1,
    });
    const a = { ...service.sample({ x: 1, y: 1, z: 1 }, 5).velocity };
    service.setWindState({
      enabled: true,
      baseDirection: { x: 1, y: 0, z: 0 },
      baseSpeed: 3,
      gustStrength: 2,
      gustFrequency: 0.15,
      turbulence: 0.5,
      verticalDraftStrength: 0.3,
      seed: 2,
    });
    const b = service.sample({ x: 1, y: 1, z: 1 }, 5).velocity;
    const same =
      Math.abs(a.x - b.x) < 1e-9 &&
      Math.abs(a.y - b.y) < 1e-9 &&
      Math.abs(a.z - b.z) < 1e-9;
    expect(same).toBe(false);
  });

  it('values remain finite and bounded', () => {
    service.setWindState({
      enabled: true,
      baseDirection: { x: 0.7, y: 0, z: 0.7 },
      baseSpeed: 9,
      gustStrength: 4,
      gustFrequency: 0.2,
      turbulence: 1.5,
      verticalDraftStrength: 2,
      seed: 42,
    });
    for (let t = 0; t < 20; t += 0.5) {
      const s = service.sample({ x: t * 3, y: 2, z: -t }, t);
      expect(Number.isFinite(s.velocity.x)).toBe(true);
      expect(Number.isFinite(s.velocity.y)).toBe(true);
      expect(Number.isFinite(s.velocity.z)).toBe(true);
      expect(s.speed).toBeLessThanOrEqual(12.001);
      expect(Math.abs(s.draftContribution.y)).toBeLessThanOrEqual(1.5);
    }
  });
});
