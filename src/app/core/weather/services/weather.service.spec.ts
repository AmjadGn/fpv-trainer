import { TestBed } from '@angular/core/testing';

import { WeatherService } from './weather.service';
import { WindFieldService } from './wind-field.service';

describe('WeatherService', () => {
  let weather: WeatherService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WeatherService, WindFieldService],
    });
    weather = TestBed.inject(WeatherService);
  });

  it('defaults to calm', () => {
    expect(weather.presetId()).toBe('calm');
    expect(weather.state().wind.enabled).toBe(false);
    expect(weather.recordCategory()).toBe('standard');
  });

  it('applies crosswind as challenge category', () => {
    weather.applyPreset('crosswind');
    expect(weather.presetId()).toBe('crosswind');
    expect(weather.recordCategory()).toBe('challenge');
    expect(weather.state().wind.enabled).toBe(true);
    expect(weather.state().wind.baseSpeed).toBeGreaterThan(0);
  });

  it('locks weather during race (no mid-race transition)', () => {
    weather.applyPreset('calm');
    weather.lockForRace();
    weather.transitionToPreset('gusty');
    expect(weather.presetId()).toBe('calm');
    expect(weather.transitioning()).toBe(false);
  });

  it('interpolates free-flight transitions', () => {
    weather.applyPreset('calm');
    weather.unlock();
    weather.transitionToPreset('light-breeze');
    expect(weather.transitioning()).toBe(true);
    for (let i = 0; i < 40; i++) {
      weather.update(0.25);
    }
    expect(weather.transitioning()).toBe(false);
    expect(weather.presetId()).toBe('light-breeze');
  });

  it('falls back for unknown presets', () => {
    weather.applyPreset('not-a-real-preset');
    expect(weather.presetId()).toBe('calm');
  });
});
