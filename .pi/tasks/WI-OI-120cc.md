# WI-OI-120cc: SPEED S9 — the speed-lab instance, Outcomes and the pilot

- **Status:** In progress (owner, 2026-10-21: "start S9"). Implementer: Claude Code, on the SPEED branch
  `feat/speed-s3-module` (worktree `gigalibs-speed-s3`), after WI-OI-120cb (`02bd35ff`).
- **Work item:** WI-OI-120bn, slice S9 (plan v1.4 §5.1); screen spec §3.4 (Outcomes).
- **Size:** M (four parts, built and committed one at a time).

## Where SPEED runs (plan v1.4, D1 and D7, approved 2026-10-20)

The pilot runs on a dedicated `speed-lab` instance; SPEED is never tested on UAT, which is the SaaS production. A SaaS
entitlement on UAT stays the owner's later decision, with its own release, Security review and rehearsal. So S9's
deployment work targets `speed-lab`, not UAT (this corrects the session's suggestion of 2026-10-21 to wire UAT first).

## Parts, in order

1. **S9a, a SPEED preview instance on this Mac** (so the owner sees every screen in a browser):
   - Compose project `gigalibs-speed-lab`, beside UAT and `gigalibs-test` and sharing nothing with them: its own
     PostgreSQL and MinIO volumes, network, ports (web `127.0.0.1:5190`) and git-ignored credential files
     (`infra/compose/.env.speed-lab*`, generated, mode 600, never printed), on the pattern of WI-OI-120bo's test stack.
   - Images built from the committed SPEED branch with the `.speed-lab` env suffix.
   - `SPEED_STORAGE_*` pointing at the instance's own MinIO and bucket.
   - One workspace labelled as a test workspace, with SPEED switched on and the five SPEED roles; administrator-made
     accounts (W2); the criteria and library imported from the TEST FIXTURE packs, labelled as such.
   - The browser check deferred since S5: 1366 × 768 and the keyboard-only route-to-dossier journey.
   - The module host runs every hosted module in one process and needs each one's settings, so the preview configures
     them all; only SPEED is switched on. A host carrying only the solution's modules is part 3.
2. **S9b, Outcomes** (screen spec §3.4; BO-1 to BO-5): `OutcomesPanel` from module data, page `/speed/outcomes` in the
   SPEED menu.
3. **S9c, the `speed-lab` bundle:** `solutions/speed-lab.yaml` (core plus SPEED); the module host and compose for a
   solution's modules only (platform change); the `pharma` industry pack for terminology with no demo data (it broke
   the Workforce packs in S3, whose pack format is Workforce vocabulary plus demo sizing); offline image transfer, TLS
   at the lab proxy, backup and restore drill, deployment guide.
4. **S9d, the pilot with one lab team:** real criteria and library packs reviewed by `licence_ip_reviewer` and the
   process safety specialist; the business owner's sign-off.

## S9a (2026-10-21, committed `5b74a503` on `feat/speed-s3-module`)

- **Kernel:** SPEED added to the kernel's organization delivery (`process-safety-screening.organization-sync`, as Product
  Catalogue's; tests). Without it no instance can give SPEED its sites, so no project can be created.
- **speed-lab files:** `compose.speed-lab.yaml` (own PostgreSQL, own MinIO with a bucket and key for the platform and
  another for SPEED's dossiers, `SPEED_STORAGE_*` on the module host); `generate-speed-lab-credentials.sh`,
  `refresh-speed-lab-identity.sh`, `build-speed-lab-images.sh`, `up-speed-lab.sh`, `stop-speed-lab.sh`,
  `speed-lab-compose.sh` (refuses every project but `gigalibs-speed-lab`); `seed-speed-lab.ts` (accounts in the lab
  database before the API starts; then, through the API and the web gateway only: SPEED roles for the admin, an
  organization of two lab sites made by the admin and approved by the second admin, the TEST FIXTURE criteria and
  library in force, the reference route entered step by step).
- **Build fix:** the Dockerfile's Debian pins (`ca-certificates 20250419~deb12u1`, `openssl 3.0.20-1~deb12u2`) are no
  longer served, so every image build fails; pinned to the current security versions (`20250419~deb12u2`,
  `3.0.22-1~deb12u1`) in the Dockerfile and the deployment profile. Main has the same failure; the release worktree
  carries another session's uncommitted unpinning of the same lines.

- **Running (2026-10-21):** `gigalibs-speed-lab` is up at `http://127.0.0.1:5190`, images `02bd35ffc7a3-b105b7c51621`
  (SPEED branch plus these uncommitted S9a changes; the tag's state hash names that tree). Workspace "SPEED Lab Preview
  (TEST)"; accounts in the SPEED worktree's `infra/compose/.env.speed-lab.accounts` (mode 600). Checked end to end
  through the web gateway: the reference route's 5 steps pass the gate, the roll-up is computed, a dossier is generated
  by the worker into the lab's MinIO and the PDF downloads with a matching SHA-256; the kernel delivered the
  organization to SPEED (READY, 2 units). Every SPEED screen was drawn at 1366 × 768 in Chromium (Playwright): the
  sidebar section, Projects, Routes, the workbench, Oxygen balance, Thermal & runaway, Interactions, Green metrics,
  Dossier, the library and the criteria. Not yet done: the keyboard-only journey.
- **Found on the way (Finance, not SPEED):** on a fresh database Finance migrations 000012, 000013 and 000015 grant to
  `gigalibs_finance_runtime` (and Inventory to its runtime role) before the migration runner creates the role, so a
  new instance or a restore stops at Finance migration 12. `up-speed-lab.sh` creates the hosted modules' runtime roles
  without login first; the fix belongs to Finance and Inventory (their migrations or the runner's order).
- **Checks:** `pnpm verify`: build and every audit pass, 3279 tests pass; it fails only where the base commit fails
  (Finance's window from `b85a4244`; two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION`).
- **Small SPEED gaps seen on screen:** the workbench's "Data gaps" tile still says "Not computed yet" (it is not wired to
  `actionList`, which the dossier uses: 10 data gaps); the Interactions matrix does not tell two materials of the same
  substance apart (the dossier now names them with their role).

## R1 completion (2026-10-21, committed `fb21e5c8` on `feat/speed-s3-module`; owner: "complete all the modules for a business use case then we can have the deployment process")

- **S9b Outcomes:** `GET v1/outcomes` (`speed.routes.read`) over the routes the member reads: BO-1 hazards (High and
  Medium findings, steps of class 3 or worse, gas-forming steps), BO-2 median time to the first dossier, BO-3 routes
  with a dossier, BO-4 dossiers showing route PMI and AE, the portfolio's worst class; page `/speed/outcomes` with the
  BRD targets as page settings (2 h, 100 %), "What the client receives". The dossier model gains `facts` (the summary's
  numbers as data). Tested on PostgreSQL with the reference route (6 High findings; steps 3 and 4 at class 3 or worse,
  step 3 by BRD TC-08).
- **S8 Write-up parser:** `parseWriteup` and `recogniseReagents` in the engine package (deterministic, no network, no
  model); 20 annotated TEST FIXTURE procedures (98/98 quantities, none invented; written for the test, so the pilot
  lab's annotated procedures remain the acceptance set, S9d); panel `speed.writeup-parser` on the route's tab 5, shown
  on draft routes to `speed.routes.write`, applying confirmed Tp or confirmed reagents with the dictionary's reason.
- **Audit trail (screen spec §3.3; it was not in any slice):** `GET v1/audit-events` (all with `speed.audit.read`, own with
  `speed.audit.read-own`, else 403) and CSV (`speed.audit.read`); page `/speed/audit` with route, person, action and
  day-range filters, one row per changed field, people by name.
- **Screen gaps fixed:** the workbench's Data gaps tile counts the dossier model's data gaps (blue when any); a
  substance charged twice in a step is named with its role on the Interactions matrix too (`materialLabel`, shared
  with the dossier).
- **Checks:** 238 SPEED, engine, panel and kernel tests on PostgreSQL and 15 dossier tests on MinIO pass; conformance 15/15;
  `pnpm verify` fails only where the base commit fails (3304 tests pass).
- **Moved to the deployment phase:** S9c (speed-lab bundle, solution-scoped module host, offline image transfer, TLS,
  restore drill, deployment guide) and S9d (pilot), with the keyboard-only journey check, on the instance being
  deployed.

## Done when

- [ ] S9a: the owner opens the preview instance and walks project → route → steps → screens → dossier (built and
      committed `5b74a503`; the instance is running; the owner's walk is open).
- [ ] S9b to S9d as their parts above; restore drill recorded; pilot sign-off by the business owner.
- [ ] Each part: `pnpm verify` passes (base-commit failures aside), card and `.pi/NOW.md` updated, committed on
      "commit".

## Stop and ask if

- the owner wants SPEED on UAT (SaaS) rather than on `speed-lab` (a reversal of D1 and D7);
- a part needs anything on UAT, `gigalibs-postgres`, `gigalibs-test` or their volumes and networks.
