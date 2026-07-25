# Environment art

## Generation

Procedural environments are **seed-deterministic**:

- Terrain: `buildTerrainGrid` + `terrainVertexColor` (height, slope, noise bands)
- Props: `SeededRandom` + clearance discs from course gates
- Themes: alpine (`EnvironmentGeneratorService`), desert-industrial, coastal-ruins generators

## Quality profiles

`ENVIRONMENT_QUALITY_PROFILES` scales terrain segments, vegetation density, shadows, and optional caps (`maxDynamicProps`, `maxParticles`). Low quality trims decorative colliders but not collision-critical ones.

## Art vs physics

Rendered meshes may differ in detail from Rapier primitives (boxes, spheres, heightfields). `ENVIRONMENT_ART_VERSION` tracks visual changes separately from `COLLIDER_MANIFEST_VERSION`.

## Flatten zones

Start pad and gate areas flatten terrain for flyability; authoritative competitive ground collision still treats the heightfield as the surface.
