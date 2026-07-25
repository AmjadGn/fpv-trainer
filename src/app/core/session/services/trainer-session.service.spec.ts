import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerSessionService } from './trainer-session.service';

describe('TrainerSessionService', () => {
  let service: TrainerSessionService;
  let host: HTMLElement;
  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let resizeCalls: number;

  beforeEach(() => {
    fullscreenElement = null;
    resizeCalls = 0;

    requestFullscreen = vi.fn(async function (this: HTMLElement) {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });

    host = document.createElement('div');
    Object.defineProperty(host, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    document.body.appendChild(host);

    TestBed.configureTestingModule({
      providers: [TrainerSessionService],
    });
    service = TestBed.inject(TrainerSessionService);
    service.setResizeHandler(() => {
      resizeCalls += 1;
    });
  });

  afterEach(() => {
    service.clearMessage();
    service.setResizeHandler(null);
    host.remove();
    vi.restoreAllMocks();
  });

  it('starts outside fullscreen', () => {
    expect(service.isFullscreen()).toBe(false);
    expect(service.userMessage()).toBeNull();
  });

  it('enters fullscreen and syncs state', async () => {
    const ok = await service.enter(host);
    expect(ok).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(service.isFullscreen()).toBe(true);
    expect(resizeCalls).toBeGreaterThanOrEqual(1);
  });

  it('exits fullscreen and syncs state', async () => {
    await service.enter(host);
    const before = resizeCalls;
    await service.exit();
    expect(exitFullscreen).toHaveBeenCalled();
    expect(service.isFullscreen()).toBe(false);
    expect(resizeCalls).toBeGreaterThan(before);
  });

  it('toggles between enter and exit', async () => {
    expect(await service.toggle(host)).toBe(true);
    expect(service.isFullscreen()).toBe(true);
    expect(await service.toggle(host)).toBe(false);
    expect(service.isFullscreen()).toBe(false);
  });

  it('handles rejected fullscreen request without throwing', async () => {
    requestFullscreen.mockRejectedValueOnce(
      Object.assign(new Error('Denied'), { name: 'NotAllowedError' }),
    );

    const ok = await service.enter(host);
    expect(ok).toBe(false);
    expect(service.isFullscreen()).toBe(false);
    expect(service.userMessage()).toMatch(/Fullscreen unavailable/i);
  });

  it('synchronizes when fullscreenchange fires externally', async () => {
    await service.enter(host);
    expect(service.isFullscreen()).toBe(true);

    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(service.isFullscreen()).toBe(false);
    expect(resizeCalls).toBeGreaterThanOrEqual(2);
  });

  it('requests resize after fullscreen changes', async () => {
    resizeCalls = 0;
    await service.enter(host);
    expect(resizeCalls).toBeGreaterThanOrEqual(1);

    const afterEnter = resizeCalls;
    await service.exit();
    expect(resizeCalls).toBeGreaterThan(afterEnter);
  });

  it('arms and consumes auto-fullscreen once', () => {
    expect(service.consumeAutoFullscreenArm()).toBe(false);
    service.armAutoFullscreen();
    expect(service.consumeAutoFullscreenArm()).toBe(true);
    expect(service.consumeAutoFullscreenArm()).toBe(false);
  });
});
