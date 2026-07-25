# Baseline verification — FPV Simulator v1.1.2

## Environment

- Required Node: **v22.22.3**
- npm: 10.9.8
- Branch start commit: `9ec9302f245454dcb573b701402f8222fbc0593e` (v1.1.1 merge)

## Pre-change baseline (from `main` @ 9ec9302)

| Command | Result |
|---|---|
| `node --version` | v22.22.3 |
| `npm ci` | Succeeded (484 packages) |
| `npm run test:engineering` | **39 passed** (7 files) |
| `npm run test:ci` | **325 passed** (65 files) |
| `npm run build` | Passed (requires unrestricted memory; sandboxed builds may exit 134) |
| `cd backend && composer install && php artisan test` | **73 passed** (194 assertions) |

## Acceptance (this milestone)

| Criterion | Status |
|---|---|
| Propulsion data architecture implemented | Yes |
| Deterministic interpolation validated | Yes |
| Fallback behavior explicit | Yes |
| Factory runtime compatibility preserved | Yes |
| Measured commercial calibration complete | **No** |
