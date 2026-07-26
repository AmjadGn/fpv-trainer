import {
  createMissionFlightLaunchIntent,
  isMissionFlightLaunchIntent,
  validateMissionFlightLaunchIntent,
} from '../models/mission-launch-intent';
import type { FlightLaunchIntent } from '../../shell/app-shell.service';

describe('Flight launch intent discrimination', () => {
  it('keeps free-flight intent valid', () => {
    const intent: FlightLaunchIntent = { kind: 'free' };
    expect(intent.kind).toBe('free');
    expect(isMissionFlightLaunchIntent(intent)).toBe(false);
  });

  it('keeps training/course intents valid', () => {
    const training: FlightLaunchIntent = { kind: 'training', moduleId: 'first-flight-v1' };
    const race: FlightLaunchIntent = { kind: 'race', courseId: 'default' };
    expect(training.kind).toBe('training');
    expect(race.kind).toBe('race');
    expect(isMissionFlightLaunchIntent(training)).toBe(false);
    expect(isMissionFlightLaunchIntent(race)).toBe(false);
  });

  it('keeps Hangar test-flight and Builder compile-and-fly path valid', () => {
    const hangar: FlightLaunchIntent = { kind: 'test-flight', aircraftId: 'factory-a' };
    expect(hangar.kind).toBe('test-flight');
    expect(hangar.aircraftId).toBe('factory-a');
    expect(isMissionFlightLaunchIntent(hangar)).toBe(false);
  });

  it('discriminates mission intent correctly', () => {
    const created = createMissionFlightLaunchIntent({
      missionId: 'photo-ruins-1',
      locationId: 'mediterranean-expedition-region',
      aircraftId: 'factory-a',
      aircraftSourceType: 'factory',
      returnDestination: 'expeditions',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(isMissionFlightLaunchIntent(created.intent)).toBe(true);
    expect(created.intent.kind).toBe('mission');
    expect(created.intent.aircraftId).toBe('factory-a');
  });

  it('rejects malformed mission intent', () => {
    const bad = validateMissionFlightLaunchIntent({
      kind: 'mission',
      missionId: '',
      locationId: 'loc',
      aircraftId: 'a',
      aircraftSourceType: 'factory',
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) {
      return;
    }
    expect(bad.code).toBe('MISSION_LAUNCH_INTENT_INVALID');
  });

  it('rejects embedded definition objects in intent', () => {
    const bad = validateMissionFlightLaunchIntent({
      kind: 'mission',
      missionId: 'm1',
      locationId: 'l1',
      aircraftId: 'a1',
      aircraftSourceType: 'factory',
      missionDefinition: { huge: true },
    });
    expect(bad.ok).toBe(false);
  });

  it('preserves exact selected aircraft identity', () => {
    const intent = createMissionFlightLaunchIntent({
      missionId: 'm1',
      locationId: 'l1',
      aircraftId: 'exact-aircraft-id',
      aircraftSourceType: 'user-compiled',
    });
    expect(intent.ok).toBe(true);
    if (!intent.ok) {
      return;
    }
    expect(intent.intent.aircraftId).toBe('exact-aircraft-id');
    expect(intent.intent.aircraftSourceType).toBe('user-compiled');
  });
});
