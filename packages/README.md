# Drone Builder Engineering Core — Dependency Direction

```text
engineering-kernel
        ↑
component-catalog
drone-build-domain   (+ ResolvedAssembly joins selected catalog revisions)
compatibility-engine
propulsion-data      (datasets, matching, interpolation, calibration)
aircraft-engineering
        ↑
aircraft-compiler
        ↑
aircraft-runtime-adapter
drone-build-persistence
factory-aircraft
engineering-testing
        ↑
Angular application (src/app)
```

## Rules

- Domain packages must not import `@angular/*`, `three`, or `@dimforge/rapier3d-compat`.
- Engineering packages must not import persistence implementations.
- Compiler depends on interfaces / pure domain types, not UI.
- Runtime adapter depends on compiler outputs, not the reverse.
- UI talks to application services only.
- Validation and engineering consume `ResolvedAssembly`, never full-catalog `.find` for selected hardware.

## Workspace shape (v1.1)

Path-aliased TypeScript modules under `packages/` (no Nx/pnpm workspaces yet).
Import via `@fpv/<package-name>`.

Engineering package tests: `npm run test:engineering` → `vitest.engineering.config.ts`.

## Mission / location domain packages (v1.3.0)

```text
                 simulation-contracts
                  ↑        ↑        ↑
                  │        │        │
          location-domain  │  photography-domain
                           │
                     mission-domain

location-validation
    ├── depends on simulation-contracts
    ├── depends on location-domain
    ├── depends on mission-domain
    └── depends on photography-domain
```

- Domain packages must not import `@angular/*`, `three`, `@dimforge/rapier3d-compat`, IndexedDB, or `src/app`.
- Mission and photography must not import controller-calibration models.
- `mission-domain` does not depend on `photography-domain` (no circular edge); photography results cross the boundary via explicit score/evidence contracts joined in `location-validation`.
- `@fpv/location-validation` validates location, mission, and photography content for versioned location/mission packages. A future rename to `@fpv/content-validation` may be considered only if responsibilities expand beyond that curated content.
- `@fpv/mission-persistence` is pure contracts for durable mission results / Personal Bests (no IndexedDB, Blob, or Angular). Application adapters live under `src/app/core/mission-persistence/`.
