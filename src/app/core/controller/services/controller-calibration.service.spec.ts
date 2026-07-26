import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALIBRATION_STORAGE_KEY,
  CENTER_CAPTURE_MS,
  ControllerCalibration,
  DEFAULT_CENTERED_DEADZONE,
} from '../models/controller-calibration.model';
import { AxisState } from '../models/controller-state.model';
import { GamepadControllerService } from './gamepad-controller.service';
import { ControllerCalibrationService } from './controller-calibration.service';

describe('ControllerCalibrationService', () => {
  let connected: ReturnType<typeof signal<boolean>>;
  let controllerName: ReturnType<typeof signal<string | null>>;
  let mapping: ReturnType<typeof signal<string | null>>;
  let axes: ReturnType<typeof signal<AxisState[]>>;
  let clockNow: number;

  function flush(): void {
    TestBed.flushEffects();
  }

  function setAxes(values: number[]): void {
    axes.set(
      values.map((rawValue, index) => ({
        index,
        rawValue,
        normalizedValue: rawValue,
        active: Math.abs(rawValue) > 0.03,
      })),
    );
    flush();
  }

  function connectController(
    id = 'DJI Virtual Joystick',
    axisValues: number[] = [0, 0, 0, 0],
  ): void {
    controllerName.set(id);
    mapping.set('none');
    connected.set(true);
    setAxes(axisValues);
  }

  function disconnectController(): void {
    connected.set(false);
    controllerName.set(null);
    mapping.set(null);
    axes.set([]);
    flush();
  }

  function createService(): ControllerCalibrationService {
    const service = TestBed.inject(ControllerCalibrationService);
    service.setClockForTests({
      now: () => clockNow,
    });
    flush();
    return service;
  }

  function sampleStableCenter(
    service: ControllerCalibrationService,
    values: number[] = [0, 0, 0, 0],
  ): void {
    service.startCalibration();
    flush();
    expect(service.activeStep()).toBe('center');

    for (let i = 0; i < 10; i++) {
      clockNow += 100;
      setAxes(values);
    }

    clockNow += CENTER_CAPTURE_MS;
    setAxes(values);

    expect(service.centerReady()).toBe(true);
    service.continueFromCenter();
    flush();
  }

  function identifyChannel(
    service: ControllerCalibrationService,
    moveIndex: number,
    baseline: number[] = [0, 0, 0, 0],
  ): void {
    setAxes(baseline);
    const moved = [...baseline];
    moved[moveIndex] = 0.9;
    setAxes(moved);
    setAxes(moved);

    expect(service.detectedAxis()).toBe(moveIndex);
    expect(service.identificationReady()).toBe(true);
    service.acceptDetectedAxis();
    flush();
  }

  function completeRange(
    service: ControllerCalibrationService,
  ): void {
    expect(service.activeStep()).toBe('range');

    // Sweep assigned axes through full ranges.
    setAxes([-1, -1, -1, -1]);
    setAxes([1, 1, 1, 1]);
    setAxes([-1, 0, 1, -0.5]);
    setAxes([1, -1, 0, 1]);

    expect(service.rangeReady()).toBe(true);
    service.finishRangeCapture();
    flush();
    expect(service.activeStep()).toBe('direction');
  }

  beforeEach(() => {
    clockNow = 1_000_000;
    localStorage.clear();

    connected = signal(false);
    controllerName = signal<string | null>(null);
    mapping = signal<string | null>(null);
    axes = signal<AxisState[]>([]);

    TestBed.configureTestingModule({
      providers: [
        ControllerCalibrationService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: GamepadControllerService,
          useValue: {
            connected: connected.asReadonly(),
            controllerName: controllerName.asReadonly(),
            mapping: mapping.asReadonly(),
            axes: axes.asReadonly(),
            controllerIndex: signal<number | null>(null).asReadonly(),
            buttons: signal([]).asReadonly(),
            lastUpdated: signal<number | null>(null).asReadonly(),
            apiAvailable: signal(true).asReadonly(),
            scanControllers: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('starts with no saved calibration', () => {
    const service = createService();

    expect(service.hasCalibration()).toBe(false);
    expect(service.calibration()).toBeNull();
    expect(service.calibratedInput()).toBeNull();
    expect(service.calibrationStatus()).toBe('uncalibrated');
  });

  it('migrates v1 calibrations by flipping yaw inversion', () => {
    const saved: ControllerCalibration = {
      version: 1,
      controllerId: 'DJI Virtual Joystick',
      controllerMapping: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      channels: {
        throttle: {
          axisIndex: 1,
          min: -1,
          center: -1,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        yaw: {
          axisIndex: 0,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        pitch: {
          axisIndex: 3,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        roll: {
          axisIndex: 2,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
      },
    };
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

    const service = createService();
    connectController('DJI Virtual Joystick', [0.5, 0, -0.25, 1]);

    expect(service.hasCalibration()).toBe(true);
    expect(service.calibration()?.version).toBe(2);
    expect(service.calibration()?.channels.yaw.inverted).toBe(true);
    expect(service.calibrationStatus()).toBe('calibrated');
    // v1→v2 flips yaw: 0.5 raw → ~0.4845 then inverted → negative
    expect(service.calibratedInput()?.yaw).toBeCloseTo(-0.4845, 3);

    const persisted = JSON.parse(
      localStorage.getItem(CALIBRATION_STORAGE_KEY)!,
    ) as ControllerCalibration;
    expect(persisted.version).toBe(2);
    expect(persisted.channels.yaw.inverted).toBe(true);
  });

  it('restores a valid calibration for the matching controller', () => {
    const saved: ControllerCalibration = {
      version: 2,
      controllerId: 'DJI Virtual Joystick',
      controllerMapping: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      channels: {
        throttle: {
          axisIndex: 1,
          min: -1,
          center: -1,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        yaw: {
          axisIndex: 0,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        pitch: {
          axisIndex: 3,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        roll: {
          axisIndex: 2,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
      },
    };
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

    const service = createService();
    connectController('DJI Virtual Joystick', [0.5, 0, -0.25, 1]);

    expect(service.hasCalibration()).toBe(true);
    expect(service.calibration()?.controllerId).toBe('DJI Virtual Joystick');
    expect(service.calibrationStatus()).toBe('calibrated');
    // 0.5 raw with 0.03 deadzone rescales to ~(0.5-0.03)/(1-0.03)
    expect(service.calibratedInput()?.yaw).toBeCloseTo(0.4845, 3);
  });

  it('handles invalid JSON in localStorage safely', () => {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, '{not-json');

    const service = createService();
    connectController();

    expect(service.hasCalibration()).toBe(false);
    expect(localStorage.getItem(CALIBRATION_STORAGE_KEY)).toBeNull();
  });

  it('ignores calibration belonging to another controller', () => {
    const saved: ControllerCalibration = {
      version: 2,
      controllerId: 'Xbox Controller',
      controllerMapping: 'standard',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      channels: {
        throttle: {
          axisIndex: 1,
          min: -1,
          center: -1,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        yaw: {
          axisIndex: 0,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        pitch: {
          axisIndex: 3,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        roll: {
          axisIndex: 2,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
      },
    };
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

    const service = createService();
    connectController('DJI Virtual Joystick');

    expect(service.calibration()).toBeNull();
    expect(service.hasCalibration()).toBe(false);
  });

  it('rejects start when fewer than four axes are available', () => {
    const service = createService();
    connectController('DJI Virtual Joystick', [0, 0]);

    service.startCalibration();

    expect(service.calibrationStatus()).toBe('error');
    expect(service.error()).toContain('fewer than four axes');
  });

  it('selects the strongest moved axis and prevents duplicates', () => {
    const service = createService();
    connectController();

    sampleStableCenter(service);
    expect(service.activeStep()).toBe('identify-throttle');

    identifyChannel(service, 1);
    expect(service.activeStep()).toBe('identify-yaw');

    // Axis 1 already assigned — moving it again should not win.
    setAxes([0, 0.95, 0, 0]);
    expect(service.detectedAxis()).toBeNull();
    expect(service.identificationReady()).toBe(false);

    identifyChannel(service, 0);
    expect(service.assignedAxes().throttle).toBe(1);
    expect(service.assignedAxes().yaw).toBe(0);
  });

  it('rejects insufficient movement during identification', () => {
    const service = createService();
    connectController();
    sampleStableCenter(service);

    setAxes([0.1, 0.05, 0.02, 0.01]);
    expect(service.detectedAxis()).toBeNull();
    expect(service.identificationReady()).toBe(false);
  });

  it('aborts calibration when the controller disconnects', () => {
    const service = createService();
    connectController();
    sampleStableCenter(service);

    disconnectController();

    expect(service.calibrationStatus()).toBe('error');
    expect(service.error()).toContain('disconnected');
    expect(service.activeStep()).toBe('welcome');
    expect(service.isCapturing()).toBe(false);
  });

  it('resets calibration and clears storage', () => {
    const saved: ControllerCalibration = {
      version: 2,
      controllerId: 'DJI Virtual Joystick',
      controllerMapping: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      channels: {
        throttle: {
          axisIndex: 1,
          min: -1,
          center: -1,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        yaw: {
          axisIndex: 0,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        pitch: {
          axisIndex: 3,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
        roll: {
          axisIndex: 2,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: DEFAULT_CENTERED_DEADZONE,
        },
      },
    };
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

    const service = createService();
    connectController();
    expect(service.hasCalibration()).toBe(true);

    service.resetCalibration();

    expect(service.hasCalibration()).toBe(false);
    expect(service.calibrationStatus()).toBe('uncalibrated');
    expect(localStorage.getItem(CALIBRATION_STORAGE_KEY)).toBeNull();
  });

  it('updates calibrated live input from raw axis signals', () => {
    const saved: ControllerCalibration = {
      version: 2,
      controllerId: 'DJI Virtual Joystick',
      controllerMapping: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      channels: {
        throttle: {
          axisIndex: 1,
          min: -1,
          center: -1,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        yaw: {
          axisIndex: 0,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        pitch: {
          axisIndex: 3,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
        roll: {
          axisIndex: 2,
          min: -1,
          center: 0,
          max: 1,
          inverted: false,
          deadzone: 0,
        },
      },
    };
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(saved));

    const service = createService();
    connectController('DJI Virtual Joystick', [0, -1, 0, 0]);
    expect(service.calibratedInput()?.throttle).toBeCloseTo(0);
    expect(service.calibratedInput()?.yaw).toBeCloseTo(0);

    setAxes([0.5, 1, -1, 0.25]);

    expect(service.calibratedInput()?.yaw).toBeCloseTo(0.5);
    expect(service.calibratedInput()?.throttle).toBeCloseTo(1);
    expect(service.calibratedInput()?.roll).toBeCloseTo(-1);
    expect(service.calibratedInput()?.pitch).toBeCloseTo(0.25);
  });

  it('saves a completed calibration workflow to localStorage', () => {
    const service = createService();
    connectController();

    sampleStableCenter(service);
    identifyChannel(service, 1); // throttle
    identifyChannel(service, 0); // yaw
    identifyChannel(service, 3); // pitch
    identifyChannel(service, 2); // roll
    completeRange(service);

    service.saveCalibration();

    expect(service.hasCalibration()).toBe(true);
    expect(service.activeStep()).toBe('complete');
    expect(service.calibrationStatus()).toBe('calibrated');

    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as ControllerCalibration;
    expect(parsed.version).toBe(2);
    expect(parsed.channels.throttle.axisIndex).toBe(1);
    expect(parsed.channels.yaw.axisIndex).toBe(0);
    expect(parsed.channels.yaw.inverted).toBe(true);
    expect(parsed.channels.pitch.axisIndex).toBe(3);
    expect(parsed.channels.roll.axisIndex).toBe(2);
  });

  it('cancels halfway and returns to welcome when uncalibrated', () => {
    const service = createService();
    connectController();
    sampleStableCenter(service);

    service.cancelCalibration();

    expect(service.activeStep()).toBe('welcome');
    expect(service.calibrationStatus()).toBe('uncalibrated');
    expect(service.isCapturing()).toBe(false);
  });
});
