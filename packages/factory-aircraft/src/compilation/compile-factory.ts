import {
  OFFICIAL_COMPONENT_REVISIONS,
  buildOfficialCatalogSnapshot,
} from '@fpv/component-catalog';
import { compileAircraft, type CompilationResult } from '@fpv/aircraft-compiler';
import {
  compiledToFlightProfile,
  compiledToPhysicsFields,
  type AdaptedFlightProfile,
  type AdaptedPhysicsFields,
} from '@fpv/aircraft-runtime-adapter';
import {
  FACTORY_BUILD_MANIFESTS,
  getFactoryManifest,
  materializeFactoryRevision,
  type FactoryAircraftId,
  type FactoryBuildManifest,
  type FactoryPresentationMeta,
} from '../manifests/manifests';

export interface CompiledFactoryAircraft {
  readonly manifest: FactoryBuildManifest;
  readonly presentation: FactoryPresentationMeta;
  readonly compilation: CompilationResult;
  readonly flightProfile: AdaptedFlightProfile;
  readonly physics: AdaptedPhysicsFields;
}

export function compileFactoryAircraft(
  aircraftId: FactoryAircraftId,
): CompiledFactoryAircraft {
  const manifest = getFactoryManifest(aircraftId);
  const revision = materializeFactoryRevision(manifest);
  const snapshot = buildOfficialCatalogSnapshot();
  const compilation = compileAircraft(
    revision,
    [...snapshot.revisions.values()],
  );
  if (!compilation.ok || !compilation.specification) {
    const codes = compilation.validation.issues.map((i) => i.ruleCode).join(', ');
    throw new Error(
      `Factory aircraft ${aircraftId} failed compilation: ${codes || 'integrity'}`,
    );
  }
  const flightProfile = compiledToFlightProfile(
    compilation.specification,
    `flt-${aircraftId}`,
    manifest.characterHints,
  );
  const physics = compiledToPhysicsFields(
    compilation.specification,
    flightProfile,
  );
  return {
    manifest,
    presentation: manifest.presentation,
    compilation,
    flightProfile,
    physics,
  };
}

export function compileAllFactoryAircraft(): CompiledFactoryAircraft[] {
  return FACTORY_BUILD_MANIFESTS.map((m) =>
    compileFactoryAircraft(m.presentation.aircraftId),
  );
}

export function validateAllFactoryManifests(): {
  ok: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  for (const m of FACTORY_BUILD_MANIFESTS) {
    try {
      compileFactoryAircraft(m.presentation.aircraftId);
    } catch (e) {
      failures.push(
        `${m.presentation.aircraftId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  // Ensure catalog revisions referenced exist
  const ids = new Set(OFFICIAL_COMPONENT_REVISIONS.map((r) => r.revisionId));
  for (const m of FACTORY_BUILD_MANIFESTS) {
    for (const rev of [
      m.frameRevisionId,
      m.motorRevisionId,
      m.propellerRevisionId,
      m.batteryRevisionId,
      m.escRevisionId,
      m.fcRevisionId,
      m.cameraRevisionId,
      m.vtxRevisionId,
      m.receiverRevisionId,
    ]) {
      if (!ids.has(rev as never)) {
        failures.push(`${m.presentation.aircraftId}: missing revision ${rev}`);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
