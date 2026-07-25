# UI Components

Reusable primitives live under `src/app/shared/ui/`.

| Component | Purpose |
|---|---|
| `fpv-icon` | Central SVG icon set |
| `button[fpvButton]` / `a[fpvButton]` | Primary / secondary / ghost / danger / ranked |
| `fpv-badge` | Compact tone badge |
| `fpv-status-badge` | Semantic status with visible text |
| `fpv-card` | Selectable content card |
| `fpv-panel` | Section panel (optional glass) |
| `fpv-page-header` | Eyebrow / title / support / actions |
| `fpv-tabs` | Accessible tablist |
| `fpv-progress` | Progress bar |
| `fpv-stat` | Label + mono value |
| `fpv-empty-state` | Empty + one action |
| `fpv-error-state` | Recoverable errors |
| `fpv-skeleton` | Loading placeholders |
| `fpv-dialog` | Modal with Escape + focus restore |
| `fpv-result-shell` | Results hierarchy shell |
| `fpv-network-status` | Compact online/offline indicator |

## Example

```html
<button type="button" fpvButton variant="ranked" (click)="startRanked()">
  Start Ranked Attempt
</button>

<fpv-empty-state
  title="No replay"
  body="Complete a run to create your first replay."
  icon="replay"
  actionLabel="Start Flight"
  (action)="start()"
/>
```

Icons: `src/app/shared/icons/fpv-icons.ts`  
Formatters: `src/app/shared/format/fpv-format.ts`
