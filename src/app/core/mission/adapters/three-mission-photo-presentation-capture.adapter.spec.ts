import { describe, expect, it } from 'vitest';

import { PROJECTION_MODEL_VERSION } from '@fpv/simulation-contracts';

import { NullMissionPhotoPresentationCaptureAdapter } from './three-mission-photo-presentation-capture.adapter';
import {
  MISSION_PHOTO_PRESENTATION_HEIGHT,
  MISSION_PHOTO_PRESENTATION_WIDTH,
} from '../ports/mission-photo-presentation-capture.port';

describe('NullMissionPhotoPresentationCaptureAdapter', () => {
  it('returns a presentation failure without fabricating an image', async () => {
    const createObjectURL =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL.bind(URL)
        : null;
    const createElement =
      typeof document !== 'undefined' ? document.createElement.bind(document) : null;

    let createElementCalls = 0;
    let createObjectUrlCalls = 0;
    if (createElement && typeof document !== 'undefined') {
      document.createElement = ((...args: Parameters<Document['createElement']>) => {
        createElementCalls += 1;
        return createElement(...args);
      }) as Document['createElement'];
    }
    if (createObjectURL && typeof URL !== 'undefined') {
      URL.createObjectURL = ((...args: Parameters<typeof URL.createObjectURL>) => {
        createObjectUrlCalls += 1;
        return createObjectURL(...args);
      }) as typeof URL.createObjectURL;
    }

    try {
      const adapter = new NullMissionPhotoPresentationCaptureAdapter();
      const result = await adapter.capturePresentationFrame({
        captureId: 'cap-1',
        width: MISSION_PHOTO_PRESENTATION_WIDTH,
        height: MISSION_PHOTO_PRESENTATION_HEIGHT,
        cameraSnapshot: {
          worldPose: {
            position: { x: 0, y: 1, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          projection: {
            verticalFovDegrees: 90,
            aspectRatio: 16 / 9,
            nearMeters: 0.1,
            farMeters: 1000,
            projectionModelVersion: PROJECTION_MODEL_VERSION,
          },
        },
      });
      expect(result.ok).toBe(false);
      expect(result.diagnosticCode).toBe('PHOTO_PRESENTATION_CAPTURE_FAILED');
      expect(result.objectUrl).toBeUndefined();
      expect(result.blob).toBeUndefined();
      expect(createElementCalls).toBe(0);
      expect(createObjectUrlCalls).toBe(0);
    } finally {
      if (createElement && typeof document !== 'undefined') {
        document.createElement = createElement;
      }
      if (createObjectURL && typeof URL !== 'undefined') {
        URL.createObjectURL = createObjectURL;
      }
    }
  });
});
