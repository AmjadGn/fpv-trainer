# Changelog

All notable releases of FPV Simulator are documented here.

## [1.3.0] — 2026-07-27 — Expeditions Preview

Public release of the implemented Expeditions Preview scope on top of the existing FPV simulator, training, Hangar, and Drone Builder functionality.

### Added

- Fly → Expeditions navigation
- Mediterranean Expedition Region
- Coastal Ruins playable area (repository-owned proxy art)
- Coastal Ruins Survey photography mission (three sequential objectives)
- Photography HUD and framing guide
- Deterministic evidence capture and photography scoring (Evidence Schema 2.0.0)
- Crash and out-of-bounds mission failure
- Session retry without location reload
- Local mission result history and Personal Bests
- Local Personal Best presentation photos
- IndexedDB mission persistence (`fpv-missions-v1`, schema `1.0.0`) via `@fpv/mission-persistence`
- Explicit memory fallback when IndexedDB is unavailable

### Included from prior releases

- Free flight and training functionality
- Drone Hangar and Drone Builder compatibility with Expeditions
- Controllers, aircraft catalog, and local replay tooling

### Known limitations

See [`docs/release/v1.3.0-known-limitations.md`](docs/release/v1.3.0-known-limitations.md).

This release does **not** include cloud sync, accounts-backed mission progress, online leaderboards, multiplayer, multiple Expedition locations, or final production art.

## [1.2.1] — 2026-07-26 — Yaw Axis Fix

- Yaw (Axis 3) inverted for stick-right-positive flight
- Existing controller calibrations migrate v1 → v2

## [1.2.0] — 2026-07-26 — Playable Drone Builder

- Simple and Advanced Drone Builder
- Hangar persistence and compile-and-fly lifecycle
