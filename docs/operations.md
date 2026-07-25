# Operations

Run the scheduler every minute in production: `php artisan schedule:run`.
All scheduled FPV operations use `withoutOverlapping()` and run in UTC.

## Scheduled work

- Season registration/open/close/finalize/archive runs nightly.
- `tournaments:transition` runs every five minutes.
- Expired notifications are deleted daily.
- Weekly dry-run integrity audits check leaderboards and replay storage.
- `fpv:weekly-summary` queues mail only for pilots who opt in.

## Operator commands

```bash
php artisan seasons:status
php artisan tournaments:transition
php artisan leaderboards:audit --dry-run=1
php artisan leaderboards:rebuild --dry-run=1 --course=starter-circuit
php artisan leaderboards:repair-entry 123 --dry-run=1
php artisan replay-storage:audit --dry-run=1
php artisan queue:fpv-status
```

Run every destructive-capable operation with `--dry-run=1` first. The
current progression, rewards, and season recalculation commands are
reporting/reconciliation scaffolding: review their counts and the related
audit records before adding automatic repair behavior.
