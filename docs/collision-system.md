# Collision system

## Hybrid strategy

1. **Predict** — custom flight integrates one fixed step.
2. **Detect** — kinematic drone body in Rapier; contacts against terrain, structures, water sensors, dynamic props.
3. **Resolve** — `resolveCollisionResponse` classifies impact (scrape → catastrophic, safe/hard landing, water) and returns corrected state.
4. **Apply** — corrections feed back into custom flight; dynamic props receive impulses from Rapier.

## Groups

Bitmask groups in `collision-groups.ts`. Drone collides with terrain, static structures, dynamic props, and water — not ghost/replay/decoration sensors.

## Materials

`CollisionMaterialId` drives restitution, friction, and damage multipliers via `physics-body.models` / `CollisionMaterialService`.

## Competitive mode

Ranked sessions disable dynamic props and keep **collision-critical** colliders regardless of quality tier. Manifest generation is deterministic from environment seed + course layout.

## Debug

`EnvironmentCollisionDebugService` exposes dev flags and delegates pause/step/reset to `PhysicsWorldService`.
