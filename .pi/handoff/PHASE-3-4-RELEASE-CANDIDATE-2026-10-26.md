# Phase 3 + Phase 4 — release candidate (2026-10-26)

> **Superseded 2026-10-27 — deploy guidance below is NOT valid for the current UAT.** Live UAT runs the
> `release/speed-uat` line (`a1eb8242…` / cmms `c88763ff…`), which diverged from this main-line tag `4e0a2f36…` at
> `37e55566` (main +264 / speed-uat +41). Deploying this build onto the current UAT would drop the 41 live
> speed-uat commits. This batch (now including Phase 5A) is held for an owner-led integration — see
> `PHASE-3-4-5A-INTEGRATION-HOLD-2026-10-27.md`. The image/migration inventory below remains accurate as a record.

**Built locally by the session; deploy is owner-run and gated on the Security + Finance review.** Not deployed.

## Release identity

- **Tag:** `4e0a2f3653bf-5bbcced2648c`
- **Revision:** `4e0a2f3653bfea061ce3f33ba4cda53dfe76ed72` (branch `feat/gigaops-convergence-core` HEAD)
- **Source-state:** `5bbcced2648c65a6f1acec0661d388ec3b6db76a735a34639b13a60169d71781`

## Images built (verified: user `65532:65532`, labels match the revision/source-state)

| Service | Image | Carries |
| --- | --- | --- |
| control-plane migrations | `gigalibs/control-plane-migrations:4e0a2f3653bf-5bbcced2648c` | the three migrations below |
| api + kernel-worker | `gigalibs/playground-api:4e0a2f3653bf-5bbcced2648c` | T9b, T8b, R15, + contracts/engine changes |
| web | `gigalibs/workflow-platform:4e0a2f3653bf-5bbcced2648c` | R16, S17, T11b, X1 |
| cmms-api | `gigalibs/cmms-api:4e0a2f3653bf-5bbcced2648c` | Phase-4 S13 numbering wiring |

Only these four services changed. The other module images (workforce, geospatial, analytics, connector-hub,
module-host and the generated module images) are **unchanged** and stay on their current tag — this is a partial
deploy of the four services, matching the repo's `--no-deps` recreate pattern.

## Migrations (control-plane, additive — run before/with the api rollout)

- `20261026000000_retention_classes`
- `20261026010000_usage_counters`
- `20261026020000_scim_group_role_mappings`

## Owner-run deploy runbook (after review sign-off)

1. **Review gate:** Security (R16 persona, R15 directory-grants, S17) + Finance (T8b placeholder rates). Do not deploy before this.
2. **Back up UAT:** `.pi/handoff/proof-scripts/backup-uat.sh`.
3. **Run the three migrations** via the `control-plane-migrations:4e0a2f3653bf-5bbcced2648c` image against the UAT control DB.
4. **Deploy the four changed services** at the new tag (api, kernel-worker, web, cmms-api) — a partial `--no-deps`
   recreate; the unchanged services keep running at their current tag. `deploy-uat.mjs` is pinned to the prior release
   and is Codex-owned (WI-OI-120y); use the release identity above to drive the deploy or to re-pin a fresh handoff.
5. **Read-only verify:** image digests/labels on the four services, the three new tables present and runtime-role
   read/write as designed, and a smoke of the new surfaces (persona nav, people console, usage/statement, retention
   classes, directory-group mappings).

## Notes

- `pnpm audit:design-tokens` still flags three files not created this session (`maps/page`, `AuthAtmosphere`,
  `PlantSpatial3DViewer`) — other sessions' work, stashed out during the build; not in these images.
- Full batch detail: `.pi/handoff/PHASE-3-BATCH-REVIEW-DEPLOY-2026-10-26.md` and the per-item cards.
