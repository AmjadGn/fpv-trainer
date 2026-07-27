import { Injectable, inject } from '@angular/core';

import { ThreeRendererService } from '../../rendering/services/three-renderer.service';
import type {
  MissionPhotoPresentationCapturePort,
  MissionPhotoPresentationCaptureRequest,
  MissionPhotoPresentationCaptureResult,
} from '../ports/mission-photo-presentation-capture.port';

/**
 * Three.js-backed presentation frame capture.
 *
 * Delegates to a single one-shot offscreen render in `ThreeRendererService`
 * driven by the authoritative camera snapshot — no RAF frame, no mutation of
 * the live camera, and no influence on scoring. Failures degrade to an
 * unsuccessful result carrying `PHOTO_PRESENTATION_CAPTURE_FAILED`.
 */
@Injectable({ providedIn: 'root' })
export class ThreeMissionPhotoPresentationCaptureAdapter
  implements MissionPhotoPresentationCapturePort
{
  private readonly renderer = inject(ThreeRendererService);

  async capturePresentationFrame(
    request: MissionPhotoPresentationCaptureRequest,
  ): Promise<MissionPhotoPresentationCaptureResult> {
    try {
      const blob = await this.renderer.captureMissionPresentationFrame({
        worldPose: request.cameraSnapshot.worldPose,
        projection: {
          verticalFovDegrees: request.cameraSnapshot.projection.verticalFovDegrees,
          aspectRatio: request.cameraSnapshot.projection.aspectRatio,
          nearMeters: request.cameraSnapshot.projection.nearMeters,
          farMeters: request.cameraSnapshot.projection.farMeters,
        },
        width: request.width,
        height: request.height,
      });
      if (!blob) {
        return failure('Renderer is not mounted or the frame could not be encoded');
      }
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return { ok: true, blob };
      }
      return { ok: true, blob, objectUrl: URL.createObjectURL(blob) };
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Null presentation capture for environments without a renderer (SSR, tests).
 * Never fabricates an image; always reports a presentation-only failure.
 */
@Injectable({ providedIn: 'root' })
export class NullMissionPhotoPresentationCaptureAdapter
  implements MissionPhotoPresentationCapturePort
{
  capturePresentationFrame(
    _request: MissionPhotoPresentationCaptureRequest,
  ): MissionPhotoPresentationCaptureResult {
    return failure('Presentation frame capture is not available in this environment');
  }
}

function failure(message: string): MissionPhotoPresentationCaptureResult {
  return {
    ok: false,
    diagnosticCode: 'PHOTO_PRESENTATION_CAPTURE_FAILED',
    diagnosticMessage: message,
  };
}
