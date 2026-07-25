# Baseline verification — FPV Simulator v1.1.1

## Environment

- Required Node: **v22.22.3** (Angular CLI 22). Use `nvm use 22.22.3`.
- Default shell Node on some developer machines may still be v18 — that will fail Angular CLI checks.
- npm: 10.9.8 (`packageManager` field).

---

## Pre-stabilization (baseline before Engineering Core changes)

| Command | Result |
|---|---|
| `npm ci` | Succeeded after clean reinstall |
| `npm run build` (Node 18) | Failed: Angular CLI Node version requirement |
| `npm run test:ci` (Node 18) | Failed: same |
| `npm run test:engineering` (Node 18) | Failed: same |
| `npm run build` (Node 22.22.3) | Exit 134 (process aborted during `Building...`; consistent with memory pressure / SIGABRT) — **pre-existing environmental risk** |
| `npm run test:engineering` (Node 22.22.3) | **16 passed** (4 files under `src/app/core/engineering`) |
| `npm run test:ci` (Node 22.22.3) | **320 passed** at inspection start |
| `cd backend && php artisan test` | **73 passed** (194 assertions) |

### Confirmed pre-existing architectural defects

1. Catalog-wide `.find` for frame/prop in compiler output assembly.
2. Motor/prop pairing by array index in propulsion solver.
3. Compilation cache ignored validation policy.
4. Build fingerprint embedded engineering/validation versions.
5. Policy fields `minThrustToWeight`, `maxTakeoffMassKg`, `maxPropDiameterM` declared but not enforced.
6. Hard-coded expected motor count = 4.
7. Shallow publish + overwrite `saveRevision` / IndexedDB `put`.
8. SI inertia scaled inside physical estimator for flight solver.
9. No `packages/**/*.spec.ts` execution path; golden masters were ID lists only.
10. Stabilization ADRs (013–022) missing from architecture doc.

---

## Post-stabilization (verification for this release branch)

Recorded after Engineering Core Stabilization on branch `fix/v1.1.1-engineering-stabilization`.

| Command | Result |
|---|---|
| `node --version` | v22.22.3 |
| `npm ci` | Succeeded (484 packages) |
| `npm run test:engineering` | **34 passed** (7 files) initially; review hardening adds further package specs |
| `npm run test:ci` | **325 passed** (65 files) |
| `cd backend && composer install && php artisan test` | **73 passed** (194 assertions) |
| `npm run build` (memory-constrained / sandboxed) | **Exit 134** — process aborted during `Building...` with no Angular diagnostic output (SIGABRT / likely OOM under constrained address space) |
| `npm run build` (unrestricted host) | **Succeeded** — browser + SSR bundles in 8.6s; output `dist/fpv-trainer-web` |

### Production build status

**Unresolved release sensitivity:** exit 134 remains reproducible under constrained memory and must not be ignored for CI/CD sizing. On an unrestricted developer host with Node 22.22.3 the production build completed successfully (including Angular SSR server bundles). Do not treat “works on one machine” as proof that low-memory CI agents are safe.

GitHub-hosted `ubuntu-latest` runners typically provide ~7 GiB RAM. Unrestricted host measurement for this branch: **peak RSS ≈ 765 MiB** (`/usr/bin/time -l npm run build`, Node 22.22.3). Treat **≥2 GiB** free RAM as a practical minimum on developer hosts; CI retains `NODE_OPTIONS=--max-old-space-size=6144` as a Node heap ceiling only.

**Exit 134 reproduction:** Cursor/agent sandbox (restricted address space / syscalls) aborts `ng build` during `Building...` with exit **134** and no Angular diagnostic — consistent with SIGABRT/OOM outside V8 heap messaging. Unrestricted host and `NODE_OPTIONS=--max-old-space-size=2048` both succeeded locally. Raising heap does **not** fix OS-level address-space abortion.

### Approximate memory investigation checklist

```bash
nvm use 22.22.3
/usr/bin/time -l npm run build          # macOS: peak RSS in "maximum resident set size"
# or on Linux:
/usr/bin/time -v npm run build          # Maximum resident set size

NODE_OPTIONS=--max-old-space-size=4096 npm run build
NODE_OPTIONS=--max-old-space-size=6144 npm run build
```

Record whether failure is Node heap (`JavaScript heap out of memory`) versus external SIGABRT/OOM with no V8 message. Note browser vs SSR bundle stage from Angular log lines. Do not weaken production optimization solely to greenwash CI.

### CI commands (local parity)

```bash
nvm use 22.22.3
npm ci
npm run test:engineering
npm run test:ci
npm run build

cd backend && composer install --no-interaction --prefer-dist && php artisan test
```

Expected GitHub Actions jobs (see `.github/workflows/ci.yml`): frontend tests, frontend production build, backend tests.

**Release-targeted PRs require a green production build check before merge.** Measured physical fidelity is **not** part of v1.1.1 acceptance (ADR-021).

### Engineering goldens

```bash
# Fail on drift (default CI path)
npm run test:engineering

# Intentional refresh after reviewed engineering changes
UPDATE_GOLDENS=1 npm run test:engineering
```

CI must never set `UPDATE_GOLDENS`. See ADR-022.

### Approximation limitations (unchanged by this PR)

The architecture and regression baseline are stabilized, but propulsion, aerodynamic, and yaw-authority models remain approximations. This work does **not** claim measured commercial physical fidelity. See ADR-021.

### Git state note (PR #2)

- PR targets `upstream/main` at merge commit `d28501c` (PR #1).
- Local/fork `origin/main` may still sit at `4bb2613` (“Add code”) — that is simply behind the upstream merge, not a divergent rewrite. Do not reset or force-push `main`.

---
