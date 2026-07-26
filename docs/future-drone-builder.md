# Drone Builder

## Current (v1.2.0)

Playable Simple and Advanced Builder UI on a shared draft session:

- Intent-driven recommended builds
- Product-generated component imagery
- Compatibility diagnostics and engineering provenance
- Local IndexedDB draft persistence and immutable compiled revisions
- Compile & Fly into the shared simulator runtime (including body-frame flight controls from the mainline hotfix)

See [v1.2.0-playable-drone-builder.md](v1.2.0-playable-drone-builder.md).

## Engineering foundation (v1.1)

Implemented under `packages/` (`@fpv/*`):

- Component catalog, immutable revisions, build domain, compatibility engine, engineering solvers, compiler, fingerprints, persistence ports, factory manifests.

Factory commercial aircraft compile through the unified pipeline into `CompiledAircraftSpecification`, then adapt to `AircraftDefinition`. See [drone-builder-v1.1.md](architecture/drone-builder-v1.1.md).

## Still future

- Marketplace and cloud build sync
- Server-side competitive compilation
- Free/Pro enforcement and subscriptions
- Measured propulsion-data collection campaigns
