# Replay Aircraft Versioning

Replays store `aircraftId`, definition / physics / collider / visual versions, livery, and camera profile.

Legacy replays without `aircraftId` fall back to Flux F5 (`LEGACY_FALLBACK_AIRCRAFT_ID`) for visuals only — transforms are not re-simulated.
