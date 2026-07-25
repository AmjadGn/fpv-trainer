# FPV Trainer UI Design System

Dark-first control-room visual language for the browser FPV Trainer (v0.7).

## Direction

- Technical, fast, clean, premium, readable
- Not neon cyberpunk, not arcade, not generic admin dashboard
- Dark neutral surfaces, one teal accent (`--fpv-accent`), limited semantic colors
- Solid surfaces for data pages; glass only for HUD / floating overlays
- Depth via surface contrast and thin borders — not heavy blur or glow

## Tokens

Tokens live in `src/styles.scss` as CSS custom properties.

### Surfaces

| Token | Role |
|---|---|
| `--fpv-bg` | App background |
| `--fpv-surface` | Shell / sticky chrome |
| `--fpv-surface-elevated` | Elevated chrome |
| `--fpv-panel` | Cards / panels |
| `--fpv-border` / `--fpv-border-strong` | Dividers |

### Text

`--fpv-text`, `--fpv-text-secondary`, `--fpv-text-muted`, `--fpv-mono-text`

### Semantic

`--fpv-accent`, `--fpv-accent-strong`, `--fpv-success`, `--fpv-warning`, `--fpv-danger`, `--fpv-info`, `--fpv-ghost`, `--fpv-ranked`, `--fpv-offline`

### Spacing / radius / shadow / motion / z-index

Use `--fpv-space-*`, `--fpv-radius-*`, `--fpv-shadow-*`, `--fpv-motion-*`, `--fpv-z-*`.

Do not hardcode random hex values in feature components.

## Typography

- Display / headings: Barlow Condensed
- Body: Barlow
- Telemetry: IBM Plex Mono

## Status copy

Always pair color with text: Verified, Pending, Rejected, Offline, Ahead, Behind.

## Light mode

`html[data-theme='light']` and `data-theme='system'` + `prefers-color-scheme: light` are preserved.
