# Drone Hangar

Premium selection experience (`/hangar` route + shell view).

## Sections (v1.2.0)

1. **Factory Aircraft** — original catalog craft with Select, Inspect, Duplicate into Builder, Test Flight, and Select & Fly. Factory definitions are never modified by user builds.
2. **User Build Drafts** — editable local drafts with Edit, Duplicate, Rename, View revisions, Compile, Compile & Fly, and Delete. Drafts do not expose a normal Fly action until compiled.
3. **Compiled User Aircraft** — immutable revisions with Select, Inspect, Fly, Duplicate/Rebuild, and Delete revision. Orphan revisions (source draft deleted) remain flyable when runtime-compatible.

## Platform behavior

- Isolated Three.js showcase with lifecycle disposal (inactive during flight)
- Search, filters, favorites, comparison, liveries for factory craft
- Keyboard navigation, reduced-motion (auto-rotate off), responsive layout
- IndexedDB-backed drafts/compiled revisions via `HangarLibraryService`
- Exact-id flight selection for compiled aircraft (`trySelectExact`) — no silent factory fallback
- Storage-unavailable and partial-recovery banners preserve valid records

See [v1.2.0-playable-drone-builder.md](v1.2.0-playable-drone-builder.md) for persistence, recovery, and smoke checklist.
