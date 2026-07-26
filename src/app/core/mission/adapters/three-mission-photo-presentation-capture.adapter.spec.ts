import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TestBed } from '@angular/core/testing';

import type { CameraSnapshot } from '@fpv/simulation-contracts';

import { ThreeRendererService } from '../../rendering/services/three-renderer.service';
import {
  NullMissionPhotoPresentationCaptureAdapter,
  ThreeMissionPhotoPresentationCaptureAdapter,
} from './three-mission-photo-presentation-capture.adapter';

const CAMERA_SNAPSHOT: CameraSnapshot = {
  worldPose: { position: { x: 0, y: 5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
  projection: {
    verticalFovDegrees: 90,
    aspectRatio: 16 / 9,
    nearMeters: 0.1,
    farMeters: 500,
    projectionModelVersion: '1.0.0',
  },
};

describe('NullMissionPhotoPresentationCaptureAdapter', () => {
  it('never touches document or URL: reported by a structural source check', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/app/core/mission/adapters/three-mission-photo-presentation-capture.adapter.ts',
      ),
      'utf8',
    );
    const start = source.indexOf('export class NullMissionPhotoPresentationCaptureAdapter');
    expect(start).toBeGreaterThan(-1);
    // The Null adapter is declared last (before the shared `failure` helper,
    // which also never touches document/URL), so slicing to EOF captures
    // its entire implementation.
    const rest = source.slice(start);
    expect(rest).not.toMatch(/\bdocument\b/);
    expect(rest).not.toMatch(/\bURL\b/);
  });

  it('always reports a presentation-only failure without calling URL.createObjectURL', () => {
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL');
    const adapter = new NullMissionPhotoPresentationCaptureAdapter();

    const result = adapter.capturePresentationFrame({
      captureId: 'capture-1',
      cameraSnapshot: CAMERA_SNAPSHOT,
      width: 1280,
      height: 720,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnosticCode).toBe('PHOTO_PRESENTATION_CAPTURE_FAILED');
    expect(result.objectUrl).toBeUndefined();
    expect(createObjectUrlSpy).not.toHaveBeenCalled();

    createObjectUrlSpy.mockRestore();
  });
});

describe('ThreeMissionPhotoPresentationCaptureAdapter', () => {
  function configure(renderer: Partial<ThreeRendererService>): ThreeMissionPhotoPresentationCaptureAdapter {
    TestBed.configureTestingModule({
      providers: [{ provide: ThreeRendererService, useValue: renderer }],
    });
    return TestBed.inject(ThreeMissionPhotoPresentationCaptureAdapter);
  }

  it('produces an object URL from the renderer-captured blob on success', async () => {
    const blob = new Blob(['fake-png-bytes'], { type: 'image/png' });
    const captureSpy = vi.fn().mockResolvedValue(blob);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

    const adapter = configure({ captureMissionPresentationFrame: captureSpy });
    const result = await adapter.capturePresentationFrame({
      captureId: 'capture-1',
      cameraSnapshot: CAMERA_SNAPSHOT,
      width: 1280,
      height: 720,
    });

    expect(result.ok).toBe(true);
    expect(result.objectUrl).toBe('blob:mock-url');
    expect(result.blob).toBe(blob);
    expect(captureSpy).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1280, height: 720 }),
    );

    createObjectUrlSpy.mockRestore();
  });

  it('degrades to a presentation-only failure when the renderer cannot produce a frame', async () => {
    const captureSpy = vi.fn().mockResolvedValue(null);
    const adapter = configure({ captureMissionPresentationFrame: captureSpy });

    const result = await adapter.capturePresentationFrame({
      captureId: 'capture-1',
      cameraSnapshot: CAMERA_SNAPSHOT,
      width: 1280,
      height: 720,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnosticCode).toBe('PHOTO_PRESENTATION_CAPTURE_FAILED');
  });

  it('degrades to a presentation-only failure when the renderer throws', async () => {
    const captureSpy = vi.fn().mockRejectedValue(new Error('renderer disposed'));
    const adapter = configure({ captureMissionPresentationFrame: captureSpy });

    const result = await adapter.capturePresentationFrame({
      captureId: 'capture-1',
      cameraSnapshot: CAMERA_SNAPSHOT,
      width: 1280,
      height: 720,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnosticMessage).toMatch(/renderer disposed/);
  });
});
