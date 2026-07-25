# Drone Builder Engineering Core v1.1 — Architecture Decisions

## Status

**Engineering foundation stabilized for v1.1.1**; **v1.1.2 adds propulsion performance dataset architecture** (separate `@fpv/propulsion-data`, matching, interpolation, explicit legacy fallback). Measured commercial physical fidelity remains unclaimed.

Implementation lives under `packages/` and is consumed by the Angular app via path aliases (`@fpv/*`).

## Pipeline

```text
DroneBuildRevision + Catalog Component Revisions
        ↓
ResolvedAssembly  (authoritative compiler input)
        + Validation Policy + Versioned Engineering Models
        ↓
Pre-engineering validation → SI engineering → Post-engineering validation
        ↓
CompiledAircraftSpecification
  - physicalAssembly (SI)
  - performance (derived)
  - flightRuntime (solver-mapped)
  - validation (policy-scoped)
        ↓
Runtime Adapter (@fpv/aircraft-runtime-adapter)
        ↓
AircraftDefinition / Flight Simulation (v1.0 fixed-timestep runtime)
```

## ADRs

### ADR-001: Framework-independent core

Drone Builder engineering code does not depend on Angular, Three.js, Rapier, browser APIs, or IndexedDB. Persistence adapters may use IndexedDB behind ports.

### ADR-002: Unified aircraft pipeline

Factory and custom aircraft use the same build and compilation pipeline (`@fpv/aircraft-compiler`).

### ADR-003: Immutable component revisions

Published component engineering data cannot be modified in place. Corrections create new `ComponentRevisionId`s.

### ADR-004: Immutable published build revisions

Published builds are append-only revisions with parent references.

### ADR-005: Compiled specification as canonical engineering output

`CompiledAircraftSpecification` is the engineering source of truth. `AircraftDefinition` is a runtime integration format produced by the adapter.

### ADR-006: Deterministic canonical serialization

Fingerprints use sorted-key JSON, quantized floats, and FNV-style hashing (`@fpv/engineering-kernel`).

### ADR-007: SI units internally

Mass kg, distance m, force N, inertia kg·m², etc. UI conversions happen only at boundaries.

### ADR-008: Rule-based compatibility validation

Compatibility rules live in `@fpv/compatibility-engine`. Policies (free flight, ranked racing) parameterize limits. UI must not embed compatibility rules.

### ADR-009: Pipeline-based engineering compiler

Each stage (resolution, validation, mass, CoM, inertia, electrical, propulsion, aero, authority, integrity) has one responsibility.

### ADR-010: No full event sourcing for v1.1

Immutable revisions and parent references provide history without event-sourcing complexity.

### ADR-011: Server-authoritative competitive compilation

Browser compilation is not authoritative for future ranked multiplayer. Design supports server revalidation of fingerprints.

### ADR-012: Declarative community content

Marketplace/community components are data-only; no user-supplied executable code.

### ADR-013: ResolvedAssembly as authoritative compiler input

`resolveAssembly(revision, catalog)` produces the only model consumed by validation and engineering solvers. Downstream code must not search the full catalog for the active frame, motor, battery, or propeller. Catalog data and selected assembly data remain separate concepts.

### ADR-014: Build fingerprint versus compilation-context fingerprint

- **BuildFingerprint**: normalized build identity (selections with component revision IDs, quantities, slots/mounts, transforms, topology, propeller rotations, physics-affecting tuning, schema, catalog release). Excludes display name, description, notes, owner identity, timestamps, presentation metadata, and validation policy.
- **CompilationContextFingerprint**: validation policy id/version, every policy limit that affects eligibility (`maxTakeoffMassKg`, `minThrustToWeight`, `maxCellCount`, `maxPropDiameterM`, `allowedComponentSources`, `requireOfficialCatalog`), **propulsion `datasetPolicy` eligibility fields**, plus `validationRulesVersion`, `engineeringModelVersion`, `propulsionModelVersion`, `aerodynamicModelVersion`, and `compilerVersion`. There is no separate numeric-policy version — `policyVersion` covers numeric limits. Property order cannot affect the hash (canonical sorted-key serialization).
- **ArtifactFingerprint**: **physical engineering output only** (identity, physicalAssembly, propulsion SI fields including per-unit dataset source metadata, electrical, aerodynamics, control authority, engineering/compiler/propulsion model versions). Intentionally excludes `flightRuntime` / runtime-adapter outputs so adapter tuning does not rewrite physical goldens. Must not be used alone where runtime compatibility is required.
- **RuntimeCompatibilitySignature**: `runtimeAdapterVersion` + `flightModelCompatibilityVersion` only. Required alongside ArtifactFingerprint whenever solver-facing mapping must stay compatible.

### ADR-015: Policy-aware cache keys

Combined compilation / artifact cache key (v1.1.1):

`BuildFingerprint + CompilationContextFingerprint + RuntimeCompatibilitySignature + engineeringModelVersion + compilerVersion`

A Free Flight compilation must never satisfy a Ranked Racing cache lookup. Runtime-adapter version bumps must not reuse cached `flightRuntime` payloads.

Preferred future separation (not required while the combined key remains safe):

```text
Physical compilation cache:     BuildFP + EngineeringModelFP
Eligibility/validation cache:   BuildFP + CompilationContextFP
Runtime adaptation cache:       ArtifactFP + RuntimeAdapterVersion + FlightModelCompatibilityVersion
```

### ADR-016: Validation reports are context-specific

Validation reports remain embedded on `CompiledAircraftSpecification` for convenience, but they are **policy-scoped compilation results**, not build identity. Competitive comparison must use BuildFingerprint + CompilationContextFingerprint (and ArtifactFingerprint of physical fields; RuntimeCompatibilitySignature when runtime mapping matters). Changing policy alone must not rewrite BuildFingerprint.

### ADR-017: Runtime-enforced immutable revisions

`readonly` / `immutable: true` flags are insufficient. Published revisions are deeply copied from drafts, deep-frozen outside production, and persisted via create-only `insertRevision` (memory + IndexedDB `add`). Overwriting an existing revision id with different content is a domain conflict; identical canonical content is idempotent. Updates create a new revision id with `parentRevisionId`.

### ADR-018: Topology-driven propulsion resolution

Motor↔propeller pairing uses topology edges (`propels`). Array index pairing is forbidden. Engineering solvers consume `ResolvedPropulsionUnit[]`.

### ADR-019: SI physical specification versus runtime adapter configuration

Physical estimators emit SI (kg, m, N, kg·m², rad/s²). Solver-specific inertia scaling, rate clamps, and response shaping live in compiler runtime-mapping / `@fpv/aircraft-runtime-adapter`. Deprecated `flightRuntime.*Inertia` fields remain populated for v1.0 compatibility.

Removal criteria for deprecated solver-scaled inertia fields: flight controller consumes SI inertia + adapter mapping exclusively; no profile reads `flightRuntime.rollInertia` as physical kg·m².

### ADR-020: Pre-engineering and post-engineering validation phases

Phases: resolution → structural → topology → mechanical → electrical → pre-engineering-ruleset → engineering calculation → post-engineering → integrity.

Rules requiring engineering outputs (minimum thrust-to-weight, max takeoff mass against computed mass) run in post-engineering and are never silently ignored.

### ADR-021: Approximation and confidence reporting

Propulsion resolves through `@fpv/propulsion-data` when a compatible dataset exists. Otherwise Free Flight uses explicit `peakThrustHintNewtons` fallback with provenance `peak-thrust-hint-fallback` and low confidence (ADR-031). Aerodynamics remain approximate/curated. Do not fabricate manufacturer curves or claim commercial physical fidelity from synthetic fixtures.

### ADR-022: Factory aircraft golden regression policy

Goldens live in `packages/engineering-testing/src/golden-files/factory-aircraft.golden.json`.

**Anchored fields (and why):**

| Field | Why |
|---|---|
| `buildFingerprint` | Build identity stability |
| `compilationContextFingerprint` | Free-flight policy/context identity |
| `rankedContextFingerprint` | Proves Ranked context differs from Free Flight |
| `artifactFingerprint` | Physical engineering output identity |
| `runtimeCompatibilitySignature` | Adapter/flight-model compatibility identity |
| `totalMassKg`, `centerOfMass`, `inertiaKgM2` | SI mass properties |
| `maxThrustNewtons`, `thrustToWeight` | Propulsion anchors |
| `propulsionSourceMode`, `propulsionConfidence`, `propulsionDatasetRevisionId`, `propulsionDatasetFingerprint`, `propulsionFallbackWarningPresent` | Dataset vs legacy fallback honesty |
| `runtimeRollInertia`, `runtimeMaxRollRate` | Runtime-mapping feel anchors (not SI) |

Goldens must not contain timestamps, absolute paths, machine-local data, durations, random values, or environment-specific values. Object-key order is normalized by JSON pretty-print of a deterministic capture array.

Refresh only with `UPDATE_GOLDENS=1` and intentional review. CI must never auto-update goldens. A changed golden fails the test until a developer regenerates and reviews the diff. An ID list alone is not a golden test.

### ADR-023: Body / solver axis conventions (v1.1.1)

| Concept | Convention |
|---|---|
| Handedness | Right-handed |
| Body axes | +X forward (nose), +Y left, +Z up (NED is **not** used for build transforms) |
| Origin | Frame geometric origin / mount-origin; CoM reported relative to this origin |
| Positive thrust | +Z (up) for multirotor hover thrust in the engineering model |
| Roll / pitch / yaw | Roll about +X, pitch about +Y, yaw about +Z in SI authority outputs |
| Motor numbering | Selection ids `motor-0`…; propulsion units sorted by motor `selectionId` for determinism — pairing is topology (`propels`), never array index |
| CW / CCW | Explicit `propellerRotation` on each propeller selection; missing rotation is a resolution error |
| Three.js mapping | App scene may remap; engineering SI positions remain body-frame as above |
| Rapier mapping | Runtime adapter / physics fields map roll→X, yaw→Y, pitch→Z angular limits for the fixed-timestep solver (see `compiledToPhysicsFields`) |
| Flight-controller axes | Same body frame for engineering; solver clamps live only in runtime mapping |

Solver-scaled inertia and rate clamps occur only in `@fpv/aircraft-compiler` runtime-mapping / `@fpv/aircraft-runtime-adapter`, never inside SI estimators.

### ADR-024: Catalog battery mount-zone provenance

`frame-racing-5in@1` and `frame-freestyle-5in@1` battery mount zones were widened in v1.1.1 to fit curated battery envelope dimensions already in the official catalog (e.g. `batt-6s-1500@1` 40×110×35 mm, `batt-6s-1800@1` 42×120×38 mm). Dimensions are **curated estimates** (`dataQuality: curated`), not measured CAD envelopes — confidence is medium. Widening is geometry-supported by those catalog batteries, not an empty validation bypass.

### ADR-025: Propulsion datasets as separately versioned engineering data

Propulsion performance tables live in `@fpv/propulsion-data`, not inside motor/propeller component revisions. Component revisions remain stable; new bench datasets publish as immutable dataset revisions referenced by ID. Policies may approve specific dataset releases without rewriting motor history. Factory builds stay deterministic via the default fixture catalog. Server-side compilation can later resolve the same dataset fingerprints. Large tables are not embedded in every motor revision.

### ADR-026: Dataset identity, fingerprinting, and immutable revisions

Datasets use branded `PropulsionDatasetId` / `PropulsionDatasetRevisionId` / optional release IDs. Physical fingerprints include every field capable of affecting interpolation or engineering output and exclude presentation-only notes. Published revisions are deeply frozen, create-only (memory repository), support parent revision references, detect revision-ID content conflicts, and serialize canonically via `hashCanonical`. Not coupled to IndexedDB or Laravel in v1.1.2 (memory ports only).

### ADR-027: Dataset matching and deterministic tie-breaking

Selection order: exact measured → voltage-compatible measured → curated estimate → legacy `peakThrustHint` fallback. Match never uses catalog insertion order. Tie-break: quality rank, then `|ΔV|`, then `revisionId` lexicographic. Ambiguous equal-rank distinct fingerprints emit `PROP_MATCH_AMBIGUOUS_TIE_BROKEN_BY_REVISION_ID`. Unused datasets must not change output.

### ADR-028: Interpolation and extrapolation policy

v1.1.2 uses piecewise-linear interpolation on `normalizedDriveCommand` only (`1.1.2-piecewise-linear`). Extrapolation is disabled by default. Out-of-envelope queries clamp with reduced confidence and a stable warning. No hidden smoothing inside the solver. Preprocessing/normalization is a separate versioned operation (not implemented here).

### ADR-029: Voltage compatibility and interpolation behavior

Distinguish battery nominal, fully charged, sagged, dataset test, and interpolated operating voltages. v1.1.2 presets use exact-voltage matching within `exactVoltageToleranceV` (0.05 V). Voltage interpolation between datasets is policy-gated and disabled in Free Flight / Ranked presets. Legacy fallback retains documented `nominalVoltage / 14.8` factor with explicit low confidence — not a measured voltage model. Model version: `1.1.2-exact-voltage`.

### ADR-030: Provenance and confidence model

Provenance categories: manufacturer-published, independent-bench-measurement, community-measurement, internally-measured, curated-estimate, synthetic-fallback. Curated/synthetic must never be labeled measured. Missing provenance reduces confidence / competitive eligibility. Synthetic fixtures for architecture validation are explicitly `curated-estimate` with `competitiveEligible: false`.

### ADR-031: Explicit legacy peakThrustHint fallback

When no compatible dataset matches and policy allows, the solver uses `peakThrustHintNewtons * (0.85 + Ct) * legacyVoltageFactor`. Source mode `peak-thrust-hint-fallback`, confidence `low`, stable warning `PROP_LEGACY_PEAK_THRUST_HINT_FALLBACK`. RPM/current/efficiency are not claimed as measured; electricalDemandA / rpm range remain null under fallback.

### ADR-032: Calibration profile architecture

Versioned calibration profiles apply explicit thrust/current/RPM/response/spool/density/bench-to-flight scales on top of a dataset without mutating it. Profiles are fingerprinted and alter ArtifactFingerprint when applied. Identity calibration documents the architecture without changing output. Do not calibrate merely to force golden passes.

### ADR-033: Dataset eligibility in competitive policies

`ValidationPolicy.datasetPolicy` carries min confidence, allowed provenance, measured-data-required, synthetic/legacy fallback flags, voltage tolerances, interpolation distance, and calibration allowlist. Changes hash into `CompilationContextFingerprint` only. Ranked policy is stricter on provenance/confidence but keeps `measuredDataRequired: false` and `legacyPeakThrustHintAllowed: true` until qualifying measured datasets exist for factory content.

### ADR-034: Factory-aircraft migration and golden policy

Do not fabricate measured data for all factory aircraft. Fixtures: Apex R5 and Velocity X use clearly labeled synthetic curated datasets approximating prior hint continuity for architecture validation — not commercial calibration. Remaining four crafts stay on explicit legacy fallback. Goldens gain propulsion source mode, dataset revision/fingerprint, confidence, and fallback warning anchors. Refresh only with `UPDATE_GOLDENS=1`. Measured commercial physical fidelity remains unclaimed.

## Workspace decision

v1.1 uses path-aliased packages inside the existing Angular repo (no Nx). Full monorepo tooling may follow later.

Engineering tests run via `vitest.engineering.config.ts` (`npm run test:engineering`) because Angular's unit-test builder discovers specs under `src/` only.

## Factory aircraft

Each commercial craft is a factory build manifest under `@fpv/factory-aircraft`, compiled at catalog load time, then merged with curated presentation profiles (visual/audio/collision/camera/damage) in the Angular app.

`characterHints` are product-character / accessibility assistance only — not physical engineering inputs. Competitive adaptation sets `competitiveAssistDisabled`.
