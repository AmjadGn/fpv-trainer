# Backup and Recovery

Back up the application database, replay storage, and the shared catalog
together. Restore into an isolated environment first, run migrations, check
`queue:fpv-status`, then use dry-run integrity audits before serving traffic.
Keep backup access restricted because it includes account and telemetry data.
