import { TestBed } from '@angular/core/testing';

import { EnvironmentRegistryService } from './environment-registry.service';
import {
  ALPINE_ENVIRONMENT_ID,
  COASTAL_ENVIRONMENT_ID,
  DESERT_ENVIRONMENT_ID,
} from '../models/environment-registry.model';

describe('EnvironmentRegistryService', () => {
  let service: EnvironmentRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EnvironmentRegistryService);
  });

  it('returns registered alpine environment', () => {
    const alpine = service.get(ALPINE_ENVIRONMENT_ID);
    expect(alpine).toBeTruthy();
    expect(alpine!.name).toContain('Alpine');
    expect(alpine!.enabled).toBe(true);
  });

  it('lists desert and coastal as enabled', () => {
    const ids = service.listEnabled().map((e) => e.id);
    expect(ids).toContain(ALPINE_ENVIRONMENT_ID);
    expect(ids).toContain(DESERT_ENVIRONMENT_ID);
    expect(ids).toContain(COASTAL_ENVIRONMENT_ID);
  });

  it('falls back to alpine for unknown ids', () => {
    const resolved = service.resolve('does-not-exist');
    expect(resolved.id).toBe(ALPINE_ENVIRONMENT_ID);
  });

  it('rejects invalid definitions on register', () => {
    const before = service.listAll().length;
    service.register({
      id: '',
      version: 0,
      name: '',
      description: '',
      theme: 'alpine',
      difficulty: 'beginner',
      worldSize: -1,
      supportedCourses: [],
      supportedTrainingModules: [],
      recommendedQuality: 'medium',
      supportsVegetation: true,
      supportsPrecipitation: ['none'],
      supportsFog: true,
      supportsWind: true,
      thumbnail: {
        style: 'generic',
        primaryColor: '#000',
        secondaryColor: '#111',
        accentColor: '#222',
      },
      enabled: true,
      comingSoon: false,
      defaultWeatherPresetId: 'calm',
      definition: service.getDefinition(ALPINE_ENVIRONMENT_ID),
    });
    expect(service.listAll().length).toBe(before);
  });

  it('reports course compatibility', () => {
    expect(service.supportsCourse(ALPINE_ENVIRONMENT_ID, 'starter-circuit')).toBe(
      true,
    );
    expect(
      service.supportsCourse(DESERT_ENVIRONMENT_ID, 'industrial-sprint'),
    ).toBe(true);
    expect(service.supportsCourse(DESERT_ENVIRONMENT_ID, 'starter-circuit')).toBe(
      false,
    );
  });

  it('ignores duplicate ids', () => {
    const alpine = service.get(ALPINE_ENVIRONMENT_ID)!;
    service.register({ ...alpine, name: 'Duplicate Alpine' });
    expect(service.get(ALPINE_ENVIRONMENT_ID)!.name).not.toBe('Duplicate Alpine');
  });
});
