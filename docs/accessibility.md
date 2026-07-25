# Accessibility

Practical WCAG AA goals for FPV Trainer UI.

## Requirements

- Semantic headings and landmarks
- Keyboard navigation for shell, dialogs, tabs
- Visible `:focus-visible` rings (`--fpv-focus-ring`)
- Color contrast on dark surfaces
- Labels and `aria-describedby` for auth validation
- `role="alert"` / `aria-live` for errors and status
- Table captions on leaderboards
- Dialogs: Escape closes, focus restore, backdrop click optional
- `prefers-reduced-motion` disables non-essential motion

## Do not rely only on

Color, icon, hover, or animation alone.

Status text must remain readable without color: Ahead, Behind, Verified, Pending, Rejected, Offline.
