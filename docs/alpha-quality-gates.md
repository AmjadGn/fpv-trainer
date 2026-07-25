# Alpha Quality Gates

Block release if: build fails, guest cannot fly, calibration/keyboard broken, NaN physics unrecovered, severe leaks, missing privacy/legal, secrets in frontend, main flow needs developer explanation.

## Engineering / CI gates (v1.1.1+)

For release-targeted PRs (including Drone Builder engineering stabilization):

1. **Node.js `22.22.3`** — required by Angular CLI 22.
2. GitHub Actions workflow `.github/workflows/ci.yml` must pass:
   - Frontend tests (`npm run test:engineering` + `npm run test:ci`)
   - Frontend production build (`npm run build`)
   - Backend tests (`php artisan test`)
3. Production build success is required before merging release-targeted PRs.
4. Engineering goldens must not be auto-updated in CI (`UPDATE_GOLDENS` unset).
5. Measured commercial physical fidelity is **not** a v1.1.1 acceptance gate (see ADR-021).

See [architecture/baseline-v1.1.1.md](architecture/baseline-v1.1.1.md) for memory notes and golden refresh procedure.
