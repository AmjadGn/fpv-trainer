# Dynamic props

## Scope

Crates, barrels, cones, pallets — Rapier **dynamic** bodies spawned from collider manifest when `allowDynamicProps` is true (free flight / training). Disabled in competitive mode.

## Caps

`PhysicsWorldService.setDynamicCaps` limits active dynamic bodies and debris. Quality tiers may define suggested caps via `ENVIRONMENT_QUALITY_PROFILES.maxDynamicProps`.

## Breakables

`breakThreshold` on `DynamicPropProperties` — impacts above threshold spawn debris (subject to debris cap) via `DynamicPropPhysicsService`.

## Reset

`PhysicsWorldService.resetDynamicProps()` restores initial poses and clears velocities. `EnvironmentCollisionDebugService.resetDynamicProps()` delegates here.

## Sleep

Props with `canSleep: true` may sleep when settled; debug `showSleeping` flag reserved for future visualization.
