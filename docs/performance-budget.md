# Performance budget

## Physics

| Tier | Target |
|---|---|
| Rapier step | ≤ 2 ms median on mid-tier laptop @ medium quality |
| Dynamic props | low: 8, medium: 24, high: 48 (see quality profiles) |
| Debris | low: 6, medium: 12, high: 24 |
| Colliders | Quality filter drops non-critical decorative colliders on low |

## Particles

Impact dust/sparks capped per quality (`maxParticles` in `ENVIRONMENT_QUALITY_PROFILES`). Weather precipitation has separate caps in `precipitation-utils`.

## Terrain

Segment counts: 64 / 128 / 160 for low / medium / high. Heightfield collider matches render grid — lowering segments helps both GPU and Rapier.

## Telemetry

`PhysicsWorldService.telemetry()` exposes step ms, body counts, contacts — use for profiling, not shipped to production UI by default.

## Known tradeoffs

- Heightfield + many box colliders scale with environment theme density.
- WASM init is one-time async cost on session start.
- Debug collision visualization (future panel) should be dev-only.
