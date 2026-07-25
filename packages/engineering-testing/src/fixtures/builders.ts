import type { ComponentRevision } from '@fpv/component-catalog';
import {
  createQuadSelections,
  createDraft,
  publishRevision,
  DEFAULT_TUNING,
} from '@fpv/drone-build-domain';
import { OFFICIAL_CATALOG_RELEASE } from '@fpv/component-catalog';

export function buildRacingQuadFixture(components: {
  frame: string;
  motor: string;
  prop: string;
  battery: string;
  esc: string;
}) {
  const { selections, topology } = createQuadSelections({
    frameRevisionId: components.frame,
    motorRevisionId: components.motor,
    propellerRevisionId: components.prop,
    batteryRevisionId: components.battery,
    escRevisionId: components.esc,
    fcRevisionId: 'fc-f7-standard@1',
    cameraRevisionId: 'cam-fpv-standard@1',
    vtxRevisionId: 'vtx-25-800@1',
    receiverRevisionId: 'rx-elrs@1',
    armPositions: [
      { x: 0.08, y: 0.08, z: 0 },
      { x: -0.08, y: 0.08, z: 0 },
      { x: -0.08, y: -0.08, z: 0 },
      { x: 0.08, y: -0.08, z: 0 },
    ],
  });
  const draft = createDraft({
    buildId: 'fixture-racing',
    name: 'Racing Fixture',
    catalogReleaseId: OFFICIAL_CATALOG_RELEASE.releaseId,
    selections,
    topology,
    tuning: { ...DEFAULT_TUNING, thrustCurveExponent: 1.0 },
  });
  return publishRevision(draft, 'fixture-racing@1');
}

export function componentMap(
  revisions: readonly ComponentRevision[],
): Map<string, ComponentRevision> {
  return new Map(revisions.map((r) => [r.revisionId, r]));
}
