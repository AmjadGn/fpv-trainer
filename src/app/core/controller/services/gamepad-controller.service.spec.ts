import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamepadControllerService } from './gamepad-controller.service';

interface MockGamepadOptions {
  id: string;
  index: number;
  axes?: number[];
  buttons?: Array<Partial<GamepadButton>>;
  mapping?: GamepadMappingType;
  timestamp?: number;
}

function createMockButton(
  partial: Partial<GamepadButton> = {},
): GamepadButton {
  return {
    pressed: partial.pressed ?? false,
    touched: partial.touched ?? false,
    value: partial.value ?? 0,
  };
}

function createMockGamepad(options: MockGamepadOptions): Gamepad {
  const buttons = (options.buttons ?? []).map((button) =>
    createMockButton(button),
  );

  const pad: Pick<
    Gamepad,
    'id' | 'index' | 'axes' | 'buttons' | 'connected' | 'mapping' | 'timestamp'
  > = {
    id: options.id,
    index: options.index,
    axes: options.axes ?? [],
    buttons,
    connected: true,
    mapping: options.mapping ?? 'standard',
    timestamp: options.timestamp ?? 1000,
  };

  return pad as unknown as Gamepad;
}

describe('GamepadControllerService', () => {
  let getGamepadsMock: ReturnType<typeof vi.fn>;
  let rafCallbacks: FrameRequestCallback[];
  let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;

  function flushAnimationFrame(): void {
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of callbacks) {
      callback(performance.now());
    }
  }

  function setGamepads(pads: Array<Gamepad | null>): void {
    getGamepadsMock.mockReturnValue(pads);
  }

  beforeEach(() => {
    rafCallbacks = [];
    getGamepadsMock = vi.fn(() => []);
    cancelAnimationFrameMock = vi.fn();

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      writable: true,
      value: getGamepadsMock,
    });

    TestBed.configureTestingModule({
      providers: [
        GamepadControllerService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports disconnected when no controller is present', () => {
    setGamepads([]);
    const service = TestBed.inject(GamepadControllerService);

    flushAnimationFrame();

    expect(service.apiAvailable()).toBe(true);
    expect(service.connected()).toBe(false);
    expect(service.controllerName()).toBeNull();
    expect(service.controllerIndex()).toBeNull();
    expect(service.axes()).toEqual([]);
    expect(service.buttons()).toEqual([]);
  });

  it('prefers a DJI controller when multiple pads are connected', () => {
    const generic = createMockGamepad({
      id: 'Xbox Controller',
      index: 0,
      axes: [0, 0],
      buttons: [{ pressed: false, value: 0 }],
    });
    const dji = createMockGamepad({
      id: 'DJI Virtual Joystick',
      index: 1,
      axes: [0.25, -0.5],
      buttons: [{ pressed: true, value: 1, touched: true }],
      mapping: '',
    });

    setGamepads([generic, dji]);
    const service = TestBed.inject(GamepadControllerService);

    flushAnimationFrame();

    expect(service.connected()).toBe(true);
    expect(service.controllerName()).toBe('DJI Virtual Joystick');
    expect(service.controllerIndex()).toBe(1);
  });

  it('maps axes with active state and normalized values', () => {
    const pad = createMockGamepad({
      id: 'DJI Virtual Joystick',
      index: 0,
      axes: [-0.5, 0.01, 0.8],
      buttons: [],
    });

    setGamepads([pad]);
    const service = TestBed.inject(GamepadControllerService);

    flushAnimationFrame();

    expect(service.axes()).toEqual([
      {
        index: 0,
        rawValue: -0.5,
        normalizedValue: -0.5,
        active: true,
      },
      {
        index: 1,
        rawValue: 0.01,
        normalizedValue: 0.01,
        active: false,
      },
      {
        index: 2,
        rawValue: 0.8,
        normalizedValue: 0.8,
        active: true,
      },
    ]);
  });

  it('maps buttons with pressed and touched state', () => {
    const pad = createMockGamepad({
      id: 'DJI Virtual Joystick',
      index: 0,
      axes: [],
      buttons: [
        { pressed: true, touched: true, value: 1 },
        { pressed: false, touched: true, value: 0.2 },
        { pressed: false, touched: false, value: 0 },
      ],
    });

    setGamepads([pad]);
    const service = TestBed.inject(GamepadControllerService);

    flushAnimationFrame();

    expect(service.buttons()).toEqual([
      { index: 0, value: 1, pressed: true, touched: true },
      { index: 1, value: 0.2, pressed: false, touched: true },
      { index: 2, value: 0, pressed: false, touched: false },
    ]);
    expect(service.mapping()).toBe('standard');
  });

  it('clears state when the controller disconnects', () => {
    const pad = createMockGamepad({
      id: 'DJI Virtual Joystick',
      index: 0,
      axes: [0.1],
      buttons: [{ pressed: false, value: 0 }],
    });

    setGamepads([pad]);
    const service = TestBed.inject(GamepadControllerService);
    flushAnimationFrame();
    expect(service.connected()).toBe(true);

    setGamepads([null]);
    window.dispatchEvent(new Event('gamepaddisconnected'));

    expect(service.connected()).toBe(false);
    expect(service.controllerName()).toBeNull();
    expect(service.axes()).toEqual([]);
    expect(service.buttons()).toEqual([]);
  });

  it('rescans pads when scanControllers is called', () => {
    setGamepads([]);
    const service = TestBed.inject(GamepadControllerService);
    flushAnimationFrame();
    expect(service.connected()).toBe(false);

    const pad = createMockGamepad({
      id: 'DJI Virtual Joystick',
      index: 0,
      axes: [0.4],
      buttons: [{ pressed: true, value: 1 }],
    });
    setGamepads([pad]);

    service.scanControllers();

    expect(service.connected()).toBe(true);
    expect(service.controllerName()).toBe('DJI Virtual Joystick');
    expect(service.axes()[0]?.rawValue).toBe(0.4);
  });

  it('marks the Gamepad API as unavailable when getGamepads is missing', () => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GamepadControllerService,
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    const service = TestBed.inject(GamepadControllerService);

    expect(service.apiAvailable()).toBe(false);
    expect(service.connected()).toBe(false);
    expect(rafCallbacks).toHaveLength(0);
  });
});
