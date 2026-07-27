# Project Resume Handoff — 2026-08-11

Planned resume date: **2026-08-11** (15 days after the v1.3.0 release closure).

Active development was paused after shipping **FPV Simulator v1.3.0 — Expeditions Preview**. Do **not** treat Checkpoint 7 as started. Resume from this document and the deferred backlog issue.

## 1. Release tag

```text
v1.3.0
```

GitHub Release title: **FPV Simulator v1.3.0 — Expeditions Preview**

## 2. Final main SHA

Release commit tagged as `v1.3.0` (squash merge of release closure PR #14):

```text
00ba1ac5524b9d7d079958ec9965b7b6ca10aaf9
```

Checkpoint 6 squash merge (PR #12):

```text
c251d087a0423b601481750f4806acf1dcb7c5c6
```

After resume, verify with:

```bash
git fetch upstream
git rev-parse upstream/main
git rev-parse v1.3.0^{}
git show -s --oneline v1.3.0
```

## 3. Production URL

```text
https://amjadgn.github.io/fpv-trainer/
```

## 4. Deployment provider / mechanism

- **Provider:** GitHub Pages
- **Trigger:** push to `main` (workflow `Deploy GitHub Pages`) or `workflow_dispatch`
- **Workflow:** `.github/workflows/deploy-pages.yml`
- **Build:** static Angular production build with `--base-href=/fpv-trainer/`
- **Artifact:** `dist/fpv-trainer-web/browser` only (SPA `404.html` fallback included)
- **Environment:** `github-pages`

There was no prior Firebase / Vercel / Netlify / Wrangler production frontend host; Pages is the temporary public production-preview host for v1.3.0.

## 5. Release validation results

Accepted on Checkpoint 6 head `0ff6bc1` and again on `release/v1.3.0` (Node `v22.22.3`):

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.app.json --noEmit` | clean |
| `npx tsc -p tsconfig.spec.json --noEmit` | clean |
| `npm run test:engineering` | 699 passed |
| `npm run test:ci` | 809 passed |
| `npm run build` | successful |

Production deploy workflow run `30296638475` concluded **success** for commit `00ba1ac`. Live checks: root HTTP 200, hashed JS/CSS 200, catalog/asset files 200, version `1.3.0` present in deployed chunks, SPA refresh served via Pages `404.html` (HTTP 404 status with app shell HTML).

## 6. Current architecture checkpoints

Completed and merged into `main` for v1.3.0:

1. Repository audit
2. Domain foundations
3. Runtime integration foundations
4. Coastal Ruins location runtime
5. Photography mission loop
6. Mission persistence / Personal Bests

**Not started:** Checkpoint 7 / v1.4.0 post-release hardening.

Docs under `docs/architecture/v1.3.0-checkpoint-*.md`.

## 7. Database names and schema versions

| Store | Name / version |
| --- | --- |
| Mission IndexedDB | `fpv-missions-v1` |
| Mission IDB version | `1` |
| Mission persistence schema | `1.0.0` (`MISSION_PERSISTENCE_SCHEMA_VERSION`) |
| Evidence Schema | `2.0.0` (scoring authority; not altered by persistence) |
| Drone Builder IndexedDB | `fpv-drone-builder-v1` (separate; unchanged by CP6) |

## 8. Current mission / location IDs

| Concept | ID |
| --- | --- |
| Location | `mediterranean-expedition-region` |
| Subregion | `coastal-ruins` |
| Mission | `coastal-ruins-survey` |
| Mission title | Coastal Ruins Survey |
| Objectives | `obj-photo-arch`, `obj-photo-lookout`, `obj-photo-cliff` |
| Photography objective IDs | `photo-coastal-arch-01`, `photo-coastal-lookout-01`, `photo-coastal-cliff-01` |

Package versions (location / mission): `1.0.0`.

## 9. Known limitations

See [`docs/release/v1.3.0-known-limitations.md`](../release/v1.3.0-known-limitations.md).

Summary:

- One Expedition mission; proxy art
- No cloud / accounts / leaderboards / multiplayer
- Local-only mission data
- Deferred cross-tab sync and several hardening items

## 10. Deferred technical work

Tracked in GitHub issue **#13**. Includes:

- Settlement registry bounded cleanup and stress tests
- Cross-tab reactive synchronization
- Replay clear-data key mismatch
- Outer session/result ID infrastructure hardening
- Quota / long-session / corrupt-record persistence work
- Accessibility, browser matrix, fault-injection, performance instrumentation

## 11. Deferred product work

Also in issue **#13**:

- Additional Mediterranean subregions and Expedition missions
- Higher-quality location art
- Audio/environment polish
- Aircraft compatibility tuning
- Replay mission events, ghosts, seasonal challenges
- Leaderboards/backend only under a separately approved future release

## 12. Recommended first branch after the pause

```text
feature/v1.4.0-post-release-hardening
```

Do **not** create this branch during the pause unless resuming.

## 13. Recommended first task after the pause (2026-08-11)

1. Restore local context with the commands in §14
2. Re-read this handoff and `docs/release/v1.3.0-known-limitations.md`
3. Open issue **#13** and pick a **narrow first hardening slice** — recommended:
   - **Fix the replay clear-data key mismatch**, or
   - **Settlement-registry bounded cleanup**
4. Keep scoring, Evidence Schema `2.0.0`, and mission persistence schema `1.0.0` stable unless a dedicated migration is approved
5. Do not expand Expedition content until post-release hardening has a green baseline

## 14. Exact commands to restore local context

```bash
git fetch upstream --prune
git switch main
git pull --ff-only upstream main
git checkout v1.3.0   # optional: inspect the release tag

export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22.22.3
node --version   # expect v22.22.3

npm ci
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npm run test:engineering
npm run test:ci
npm run build

# Optional local static smoke (matches Pages base path for path assets):
npm run build -- --configuration=production --output-mode=static --base-href=/
npx --yes serve dist/fpv-trainer-web/browser -p 4173
```

## 15. Open GitHub issue for deferred work

```text
#13 — v1.4.0 — Post-release hardening and Expeditions expansion
https://github.com/AmjadGn/fpv-trainer/issues/13
```

## Related documents

- [`docs/release/v1.3.0-release-notes.md`](../release/v1.3.0-release-notes.md)
- [`docs/release/v1.3.0-known-limitations.md`](../release/v1.3.0-known-limitations.md)
- [`CHANGELOG.md`](../../CHANGELOG.md)
- Architecture: `docs/architecture/v1.3.0-checkpoint-1-*.md` … `checkpoint-6-*.md`
