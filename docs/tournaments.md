# Tournaments

Tournaments have date-driven registration, active, calculating, completed,
and archived phases. Ranked attempts require registration and observe
`max_attempts`; practice sessions never consume the limit. Submission IDs
make retries idempotent. Use `tournaments:transition` to advance phases.
