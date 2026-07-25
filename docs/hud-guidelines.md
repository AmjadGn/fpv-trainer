# HUD Guidelines

## Zones

| Zone | Content |
|---|---|
| Left | Controller + flight status |
| Center | Reticle, timer, gate feedback, warnings |
| Right | Minimap, ghost/race comparison |
| Bottom | Compact toolbar |

## Modes

Cycle via toolbar **HUD** control (persisted as `fpv.hud.mode`):

1. **Full** — all panels
2. **Compact** — hide silhouette / secondary chrome
3. **Minimal** — timer, gate, speed, altitude, essential warnings + toolbar

## Warnings priority

1. Critical — controller disconnect, crash, ranked invalid, replay error (may be central)
2. Important — low altitude, wrong gate, gust, session expiring
3. Informational — ghost ready, gate completed (brief, peripheral)

Do not stack multiple large warnings. Queue by priority.

## Performance

No full-viewport blur, no continuous DOM measurement, no per-frame Angular CD from HUD chrome. Prefer opacity/transform. Preserve the single RAF / Three.js ownership model.
