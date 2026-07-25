# Seasons

Seasons progress from `draft`/`scheduled` to `registration`, `active`,
`calculating`, `completed`, then `archived`. Lifecycle calls are idempotent.
Only one primary season may be active. Pilots join while registration is open
or a season is active; banned or restricted accounts cannot join.
