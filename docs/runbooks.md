# Runbooks

For a failed leaderboard or replay check, run the matching audit in dry-run
mode, inspect `integrity_audit_runs` and findings, then run an explicitly
approved repair. For stuck competitive transitions, run `seasons:status` and
`tournaments:transition`; never modify lifecycle status directly in SQL.
