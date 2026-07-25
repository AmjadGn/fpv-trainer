# Drone Builder Engineering Core v1.1 — Architecture Decisions

## Status

**Engineering foundation stabilized for v1.1.1** (ResolvedAssembly, topology propulsion, policy-aware cache, SI/runtime split, immutable revisions).

This does **not** claim commercial physical fidelity. Propulsion and aero remain approximations pending measured datasets.

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

- **BuildFingerprint**: normalized build identity (selections, topology, tuning, schema, catalog release). Does not encode competition mode.
- **CompilationContextFingerprint**: validation policy id/version, every policy limit that affects eligibility, plus engineering/compiler/validation model versions.

### ADR-015: Policy-aware cache keys

Cache key = `BuildFingerprint + CompilationContextFingerprint + engineeringModelVersion + compilerVersion`.

A Free Flight compilation must never satisfy a Ranked Racing cache lookup.

### ADR-016: Validation reports are context-specific

Validation reports remain embedded on `CompiledAircraftSpecification` for convenience, but they are **policy-scoped compilation results**, not build identity. Competitive comparison must use BuildFingerprint + CompilationContextFingerprint (and optionally ArtifactFingerprint of physical fields). Changing policy alone must not rewrite BuildFingerprint.

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

Propulsion currently uses `peakThrustHintNewtons` fallback with explicit provenance `peak-thrust-hint-fallback` and low confidence. Aerodynamics are approximate/curated. Measured motor/prop tables may replace the approximation without changing the build domain. Do not fabricate manufacturer curves.

### ADR-022: Factory aircraft golden regression policy

Goldens live in `packages/engineering-testing/src/golden-files/factory-aircraft.golden.json` and include build/context/artifact fingerprints, mass, CoM, SI inertia, thrust, TWR, and key runtime adapter outputs for every factory aircraft. Refresh only with `UPDATE_GOLDENS=1` and intentional review. An ID list alone is not a golden test.

## Workspace decision

v1.1 uses path-aliased packages inside the existing Angular repo (no Nx). Full monorepo tooling may follow later.

Engineering tests run via `vitest.engineering.config.ts` (`npm run test:engineering`) because Angular's unit-test builder discovers specs under `src/` only.

## Factory aircraft

Each commercial craft is a factory build manifest under `@fpv/factory-aircraft`, compiled at catalog load time, then merged with curated presentation profiles (visual/audio/collision/camera/damage) in the Angular app.

`characterHints` are product-character / accessibility assistance only — not physical engineering inputs. Competitive adaptation sets `competitiveAssistDisabled`.
