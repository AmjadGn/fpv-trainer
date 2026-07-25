# FPV Trainer v1.0.0-alpha.1

A browser-based FPV drone flight trainer: a Three.js/Angular flight
simulator with a multi-aircraft hangar platform and training academy,
backed by a Laravel API for accounts, ranked race submissions,
leaderboards, challenges, seasons, tournaments, ghost events, cosmetics,
notifications, and public-beta controls.

**Alpha focus:** Learn / Fly / Compete product paths, guest-first access,
first-run onboarding, feedback, privacy controls, and stabilization — not
new major gameplay systems.

This is a monorepo with three top-level pieces:

```
src/              Angular frontend — rendering, flight physics, training academy, HUD
backend/          Laravel 12 + Sanctum API — accounts, ranked races, leaderboards, challenges
shared/catalog/   JSON content shared by both apps — courses, environments, weather, achievements
docs/             Architecture, API reference, anti-cheat model, deployment, privacy, challenge ops
```

The frontend is fully playable/trainable offline with no backend at all;
the backend adds an optional competitive layer (accounts, verified race
times, leaderboards, challenges, cross-device progress sync) on top of it.

## Quick start

You'll typically want both apps running locally.

**Node.js 22.22.3+** is required for the Angular 22 frontend.

```bash
# Frontend (Angular), from the repo root
nvm use 22   # or any Node >= 22.22.3
npm install
npm start                    # http://localhost:4200

# Backend (Laravel API), in a second terminal
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate:fresh --seed
php artisan serve            # http://localhost:8000
```

Shared catalog assets:

```bash
npm run catalog:sync         # copy shared/catalog → public/catalog
npm run catalog:check        # fail if frontend catalog copy drifts
```

Default seeded admin (local only): `admin@fpv-trainer.test` / `password`

See [`backend/README.md`](backend/README.md) for backend-specific details
(env vars, queues, scheduler, tests), and the frontend sections below for
the Angular app.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — how the backend's domain modules fit together, request lifecycle for a race submission
- [`docs/api.md`](docs/api.md) — full API endpoint reference and payload schemas
- [`docs/competitive-integrity.md`](docs/competitive-integrity.md) — the anti-cheat model, and its honest limitations
- [`docs/challenge-operations.md`](docs/challenge-operations.md) — how daily/weekly challenge rotation works and how to operate/extend it
- [`docs/privacy-data-map.md`](docs/privacy-data-map.md) — what personal data is stored, where, and how account deletion works
- [`docs/deployment.md`](docs/deployment.md) — running this in production
- [`docs/operations.md`](docs/operations.md) — scheduled commands, integrity audits, and queue checks
- [`docs/seasons.md`](docs/seasons.md), [`docs/tournaments.md`](docs/tournaments.md), and [`docs/ghost-events.md`](docs/ghost-events.md) — competitive modes
- [`docs/competitive-rating.md`](docs/competitive-rating.md) and [`docs/rewards-and-cosmetics.md`](docs/rewards-and-cosmetics.md) — ratings and player rewards
- [`docs/public-beta.md`](docs/public-beta.md), [`docs/feature-flags.md`](docs/feature-flags.md), and [`docs/notification-policy.md`](docs/notification-policy.md) — release controls and pilot communication

## Frontend (Angular)

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.7.

### Development server

```bash
ng serve
```

Open `http://localhost:4200/`. The app reloads automatically as you edit source files.

### Building

```bash
ng build
```

Build artifacts are written to `dist/`; the production build is optimized
for performance and speed.

### Running unit tests

```bash
ng test
```

Runs the [Vitest](https://vitest.dev/) test suite.

### Running end-to-end tests

```bash
ng e2e
```

Angular CLI does not ship an e2e framework by default — choose one that
suits your needs.

### Additional resources

For more on the Angular CLI, see the
[Angular CLI Overview and Command Reference](https://angular.dev/tools/cli).

## Backend (Laravel API)

```bash
cd backend
php artisan test                       # PHPUnit suite (SQLite in-memory)
php artisan route:list --path=api      # full API surface
php artisan schedule:list              # challenge rotation + cleanup jobs
```

Full details in [`backend/README.md`](backend/README.md).
