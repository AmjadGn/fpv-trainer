# Collider authoring

## Entry point

`EnvironmentColliderBuilderService.build(GeneratedEnvironment)` → manifest of `EnvironmentColliderDefinition[]`.

Implementation: `environment-collider-builder.service.ts` — primitive shapes only (box, sphere, cylinder, heightfield).

## Fields

| Field | Purpose |
|---|---|
| `collisionGroup` / `collidesWith` | Rapier interaction groups |
| `collisionCritical` | Kept at all quality tiers; required for competitive fairness |
| `enabledByQuality` | Optional trim for decorative colliders |
| `sensor` | Water / gate triggers — no solid response |
| `dynamicProperties` | Mass, damping, break threshold for props |

## Heightfield

Terrain collider reuses the same `heights` Float32Array as the rendered mesh. Scale matches `worldSize`.

## Adding structures

Prefer extending existing `PlacementInstance` arrays in theme generators rather than new required `GeneratedEnvironment` fields. New manifest colliders should be deterministic from seed + layout tables.
