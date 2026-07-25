# Aircraft Platform (v0.9)

## Architecture

There remains **one** simulator runtime:

- custom fixed-timestep flight solver (`FlightControllerService`)
- one Rapier world (`PhysicsWorldService`)
- one Three.js renderer / RAF (`ThreeRendererService`)
- one audio context (`AudioManagerService`)
- one replay / ghost / weather / race stack

Aircraft provide **data**, not duplicated gameplay systems.

## Definition lifecycle

1. `AircraftDefinition` loaded from local catalog
2. Validated (`validateAircraftDefinition`)
3. `AircraftRuntimeService.prepareForFlight` builds applied config
4. Flight solver, colliders, visuals, cameras, and audio consume profiles
5. Switching aircraft replaces drone rigid body / visual / audio voice only

## Reference vs commercial

- `ReferenceAircraftProfile` — internal engineering anchors (`internalOnly: true`)
- `CommercialAircraftDefinition` — selectable production aircraft with original names/geometry

Never expose reference profiles in public UI.

## Offline / online catalog boundary

Local built-in catalog always works offline. Remote overlays may enable/disable competitive use but must not silently replace core physics without a versioned client release.
