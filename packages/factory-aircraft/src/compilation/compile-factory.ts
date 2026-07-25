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
  type FlightCharacterHints,
} from '@fpv/aircraft-runtime-adapter';
import {
  FREE_FLIGHT_POLICY,
  RANKED_RACING_POLICY,
  type ValidationPolicy,
} from '@fpv/compatibility-engine';
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
  options: {
    readonly policy?: ValidationPolicy;
    readonly competitiveMode?: boolean;
  } = {},
): CompiledFactoryAircraft {
  const manifest = getFactoryManifest(aircraftId);
  const revision = materializeFactoryRevision(manifest);
  const snapshot = buildOfficialCatalogSnapshot();
  const policy = options.policy ?? FREE_FLIGHT_POLICY;
  const compilation = compileAircraft(revision, [...snapshot.revisions.values()], {
    policy,
  });
  if (!compilation.ok || !compilation.specification) {
    const codes = compilation.validation.issues.map((i) => i.ruleCode).join(', ');
    throw new Error(
      `Factory aircraft ${aircraftId} failed compilation: ${codes || 'integrity'}`,
    );
  }

  const competitive =
    options.competitiveMode === true || policy.policyId === RANKED_RACING_POLICY.policyId;
  const hints: FlightCharacterHints = competitive
    ? { ...manifest.characterHints, competitiveAssistDisabled: true }
    : manifest.characterHints;

  const flightProfile = compiledToFlightProfile(
    compilation.specification,
    `flt-${aircraftId}`,
    hints,
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
