# Physics architecture

FPV Trainer uses a **hybrid physics stack**: custom flight integration remains authoritative; Rapier handles world-object collisions and dynamic props.

## Layers

| Layer | Owner | Role |
|---|---|---|
| Flight | `FlightControllerService` | Thrust, torque, wind, attitude — fixed timestep |
| Collision response | `resolveCollisionResponse` | Maps Rapier contacts → velocity/position corrections, crash outcomes |
| World | `PhysicsWorldService` | Single Rapier `World`, stepped from the same fixed loop |
| Session | `PhysicsSessionService` | Loads collider manifests, wires drone body, drains events |

## Stepping

- Fixed dt from `FLIGHT_CONFIG.physicsStep` — **no RAF inside physics services**.
- `PhysicsSessionService.onFixedStep` syncs drone pose → `world.step()` → applies corrections via `FlightControllerService.applyCollisionCorrection`.

## Fallback

If Rapier WASM fails to init, the sim falls back to legacy ground collision (`y = 0`). Competitive runs remain valid; only world-object interaction is reduced.

## Version stamps

See `physics-versions.ts`: `PHYSICS_STACK_VERSION`, `COLLIDER_MANIFEST_VERSION`, `DRONE_COLLIDER_VERSION`, `ENVIRONMENT_ART_VERSION`. Visual art may change without bumping collision versions.
