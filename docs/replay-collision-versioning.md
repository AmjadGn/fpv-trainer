# Replay & collision versioning

## Why version

Replays and competitive submissions must validate against a known physics/collision identity. Visual-only environment updates must not invalidate old runs.

## Client stamps

From `physics-versions.ts` (included in submission metadata via `PhysicsSessionService.getVersionMetadata()`):

| Key | Meaning |
|---|---|
| `physicsStackVersion` | Combined client stack |
| `physicsEngineVersion` | Rapier package identity |
| `collisionModelVersion` | Response thresholds / outcome taxonomy |
| `colliderManifestVersion` | Environment collider layout rules |
| `droneColliderVersion` | Drone compound collider layout |
| `environmentArtVersion` | Visual mesh / color generation |

## Bump rules

- **Bump `colliderManifestVersion`** when collider placement, shapes, or critical flags change competitively.
- **Bump `collisionModelVersion`** when impact thresholds or crash classification change.
- **Bump `environmentArtVersion`** for terrain color, vegetation, or mesh-only changes.
- **Do not bump** collision versions for purely cosmetic props with no colliders.

## Replay playback

Ghost / replay visuals use `REPLAY_VISUAL` collision group — no physical interaction with the live drone.
