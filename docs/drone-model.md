# Drone model

## Flight (authoritative)

The drone is a 6-DOF custom model in `FlightControllerService`: thrust along body -Z, PID-style rate control, wind disturbance, battery optional. Quaternion integration with renormalization.

## Collision (approximate)

Rapier uses a compound collider set created in `DroneCollisionService`:

- Central fuselage box
- Prop guard spheres / capsules
- Optional prop-strike sensors for blade contact classification

Collider layout version: `DRONE_COLLIDER_VERSION` in `physics-versions.ts`.

## Damage

Accumulated damage from `resolveCollisionResponse` maps to states (`pristine` → `crashed`) via `damageStateFromAccumulated`. Competitive mode suppresses some soft-crash randomness when armed.

## Known limitations

- Collision mesh is simplified vs visual mesh.
- Prop strikes are heuristic, not blade-element physics.
- Water is a sensor plane, not buoyancy.
