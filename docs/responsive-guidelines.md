# Responsive Guidelines

## Targets

- Desktop: 1920×1080, 1600×900, 1440×900, 1366×768, 1280×800
- Tablet: usable menus and account pages
- Mobile: bottom navigation + More sheet
- Flight: prioritize laptop/desktop; avoid unusable tiny layouts

## Shell

| Breakpoint | Behavior |
|---|---|
| ≥901px | Left sidebar (expanded or icon rail) |
| ≤900px | Top utility bar + bottom primary nav + More dialog |

Flight mode collapses the standard shell to a minimal exit bar.

## Content

- Use `.fpv-page` / `--fpv-content-max`
- Card grids: `repeat(auto-fill, minmax(240px, 1fr))`
- Leaderboards: table on desktop, stacked labeled rows under ~720px
- Avoid horizontal page scroll and clipped modals

## Flight HUD

- Keep primary telemetry clear of the center flight path
- Modes: Full / Compact / Minimal (`data-hud-mode`)
