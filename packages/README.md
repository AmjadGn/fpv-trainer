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
