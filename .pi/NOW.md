# NOW: where the work stands

Updated 2026-09-29 by Claude (WI-OI-102d done, uncommitted). Keep this file to one page. Replace old content rather than
appending to it, and update it at the end of every task.

## State

- **Branch:** `feat/gigaops-convergence-core`, local only, never pushed.
- **Latest commits:**
  - `6dda714` agriculture proposal;
  - `76af949` WI-OI-085f;
  - `80de9af` handover brief;
  - `9db88a3` WI-OI-085e shared module host.
- **Active work item: WI-OI-102**, foundation boundaries (ADR-0016). WI-OI-103 to WI-OI-107 are Proposed and
  follow in order. WI-OI-085 is in Review.
- **Wave 0:** WI-OI-080, 081, 082, 083 and 085 are in Review, waiting for human reviews. WI-OI-084 (mobile) has
  not started.
- **Running locally** (never touch it during a proof):
  - web on 5180: `a255e935c80e-2e98e70d8d0e`;
  - cmms and workforce: `88967ea35011-9ffa1e2a8005`;
  - the other services: `5abfa667bb10-7507432cb066`.

## Owner decisions, 2026-09-29 (handover Task 2)

- **Offline mobile:** SQLite on the device, with changes synced as queued commands that the server validates
  (plan §5.1). Update the vision's CRDT wording in ADR-0014.
- **App-store presence:** decide later, before Release 1.
- **Vision-derived items:** register **catalogue truth** (six maturity states). The others were not chosen.
- **Order:** the **foundation comes first.** The owner approved ADR-0016 F1–F17 on 2026-09-29. Revocation and
  mobile come after.

## Next

Write and do the **102e** card: module triage and catalogue truth.
- The six maturity states go into manifests, the catalogue and the screens.
- Each of the 14 code-only modules gets an outcome for the owner to approve: run in the host, freeze, or retire.

After that:
- **102f:** package inventory. It parks the Python plane, retires the retired engines and the dead
  `cmms-ledger-settlement-service`, and also removes the 3 legacy manifest-reading tests behind 17 baseline
  entries.
- **102g:** merge `platform-rbac` into the kernel.
- Then WI-OI-103 to WI-OI-107.

102d (2026-09-29):
- the AP catalogue entries are labelled "hosted by the core until Procurement exists";
- the 3 core workflow tables are module-owned;
- the fence rule is `FENCED_MODEL_WRITE`, with 13 existing writes baselined;
- the layer baseline has 40 named entries.

102b decisions (2026-09-29):
- Workflow Studio is the one workflow engine;
- the Python execution plane is parked;
- the 17 core pipelines are all test data and go when the core workflow tables retire.

Open for later:
- Geospatial `mobile/sync`: adopt or replace (when mobile starts);
- agriculture sources and pack (`.pi/proposals/agriculture-package-plan.md`, phases 4 and 5).

## Watch-outs

- One agent in the repository at a time. Commit only on the owner's literal "commit".
- `pnpm verify` reports the deployment-profile `WORKFORCE_API_URL` drift as KNOWN. Do not fix it without the
  owner.
- 60 active sessions of old UAT test accounts (2026-09-13 to 23) remain. Revoke them only with the owner's OK.
- The GPT agent's Codex account is usage-limited until 2026-10-03.

## Where things are

- **Rules:** `AGENTS.md` ("Every session: start here"). Owner rules and architecture are in
  `.pi/handoff/HANDOFF-2026-09-29.md` §1–§3.
- **Status:** `.pi/WORK_ITEMS.md`; read only your item's row. Evidence is in `.pi/work/WI-OI-*.md`.
- **Task cards:** `.pi/tasks/` (template: `.pi/tasks/TEMPLATE.md`). Proposals: `.pi/proposals/`.
- **Vision:** `docs/GIGALIBS_PRODUCT_VISION.md`. Plan: `docs/plans/manufacturing-package-solution-plan.md`.
