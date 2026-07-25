# Drone Builder Engineering Core v1.1 — Architecture Decisions

## Status

Approved. Implementation lives under `packages/` and is consumed by the Angular app via path aliases (`@fpv/*`).

## Pipeline

```text
Versioned Components + Immutable Build Revision
        + Validation Policy + Versioned Engineering Models
        ↓
Deterministic Compilation
        ↓
CompiledAircraftSpecification
        ↓
Runtime Adapter
        ↓
AircraftDefinition / Flight Simulation
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

Mass kg, distance m, force N, etc. UI conversions happen only at boundaries.

### ADR-008: Rule-based compatibility validation

Compatibility rules live in `@fpv/compatibility-engine`. Policies (free flight, ranked racing) parameterize limits. UI must not embed compatibility rules.

### ADR-009: Pipeline-based engineering compiler

Each stage (mass, CoM, inertia, electrical, propulsion, aero, authority, integrity) has one responsibility.

### ADR-010: No full event sourcing for v1.1

Immutable revisions and parent references provide history without event-sourcing complexity.

### ADR-011: Server-authoritative competitive compilation

Browser compilation is not authoritative for future ranked multiplayer. Design supports server revalidation of fingerprints.

### ADR-012: Declarative community content

Marketplace/community components are data-only; no user-supplied executable code.

## Workspace decision

v1.1 uses path-aliased packages inside the existing Angular repo (no Nx). Full monorepo tooling may follow later.

## Factory aircraft

Each commercial craft is a factory build manifest under `@fpv/factory-aircraft`, compiled at catalog load time, then merged with curated presentation profiles (visual/audio/collision/camera/damage) in the Angular app.
