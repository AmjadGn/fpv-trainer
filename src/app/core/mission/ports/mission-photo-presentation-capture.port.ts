import { InjectionToken } from '@angular/core';

import type { CameraSnapshot } from '@fpv/simulation-contracts';

/**
 * Presentation-only photo frame capture seam.
 *
 * Scoring never depends on this port: evidence and evaluation are produced
 * from the authoritative fixed-step observation, and the resulting image is
 * a cosmetic artifact rendered afterwards. Failures here are reported as
 * `PHOTO_PRESENTATION_CAPTURE_FAILED` and never invalidate a passed capture.
 */

/** Fixed presentation frame width for mission photo capture. */
export const MISSION_PHOTO_PRESENTATION_WIDTH = 1280;

/** Fixed presentation frame height for mission photo capture (16:9). */
export const MISSION_PHOTO_PRESENTATION_HEIGHT = 720;

export interface MissionPhotoPresentationCaptureRequest {
  readonly captureId: string;
  /** Canonical, cosmetics-free camera snapshot for the scored fixed step. */
  readonly cameraSnapshot: CameraSnapshot;
  readonly width: 1280;
  readonly height: 720;
}

export interface MissionPhotoPresentationCaptureResult {
  readonly ok: boolean;
  /** Session-only object URL; the caller owns revocation. */
  readonly objectUrl?: string;
  readonly blob?: Blob;
  readonly diagnosticCode?: string;
  readonly diagnosticMessage?: string;
}

export interface MissionPhotoPresentationCapturePort {
  capturePresentationFrame(
    request: MissionPhotoPresentationCaptureRequest,
  ): Promise<MissionPhotoPresentationCaptureResult> | MissionPhotoPresentationCaptureResult;
}

export const MISSION_PHOTO_PRESENTATION_CAPTURE =
  new InjectionToken<MissionPhotoPresentationCapturePort>(
    'MISSION_PHOTO_PRESENTATION_CAPTURE',
  );
