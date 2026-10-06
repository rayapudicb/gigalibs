# WI-OI-120 evidence: UAT readiness programme

## Proposed all-module tenant-to-value acceptance plan — 2026-10-06

Owner requested an implementation and Playwright plan across all existing modules, starting with CMMS/EAM.
Created `docs/plans/tenant-to-value-all-modules-implementation-and-e2e-plan.md` and proposed WI-OI-120m.
Read current NOW, task template, orchestrator role, lifecycle/requirements/completeness guidance, U19a/EAM scope,
23 committed manifests and existing e2e harness/spec inventory. Plan includes explicit discovery denominator,
all-module journeys, shared controls, cross-module reconciliation, isolated test safety and independent gates.
No runtime checks, product changes, database writes, deployments or status/gate upgrades performed. Existing
approved work remains active; WI-OI-120m requires approval. Historical status contradictions remain explicit.
Documentation verification: `pnpm verify --audits` exited 0; audits/manifests passed, known WORKFORCE_API_URL
drift, 12 isolated proofs NOT RUN. No Playwright tests executed. `git diff --check` passed. Log:
`/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-06T04-45-12-790Z.log`.

Programme from the WI-OI-119 audit; plan in `docs/audits/2026-10-04-production-readiness/remediation-backlog.md`.
Owner decisions of 2026-10-05: fix every module for UAT and hide nothing; UAT on the existing local instance; UAT data
entered by Playwright business flows.

## WI-OI-120a (U1): reproducible build, working UAT instance, every module visible

Card: `.pi/tasks/WI-OI-120a.md`, approved by the owner on 2026-10-05. Part A (repository) below; part B (UAT
instance) waits for the owner's go.

### A1. Lockfile (P0-12)

- With pnpm's cached workspace state removed (`node_modules/.pnpm-workspace-state-v1.json`, which had hidden the
  drift), `pnpm install --frozen-lockfile` failed: `ERR_PNPM_OUTDATED_LOCKFILE … not up to date with
  apps/module-host/package.json`.
- `pnpm install` added the six missing lines (the `@gigalibs/financial-operations-api` link for `apps/module-host`
  and the `@gigalibs/financial-operations-web` link for `apps/workflow-platform`). This is identical to the drift
  recorded by WI-OI-119.
- `pnpm install --frozen-lockfile` then succeeded.

### A2. Finance schema contract (P1-01)

- `modules/financial-operations/db/runtime-manifest.txt` now lists `000007_finance_period_close_accruals_forecasting`.
- `pnpm modules:catalog` regenerated `infra/compose/generated/compose.module-host.yaml` (expected version 6 → 7,
  twice) and `infra/compose/generated/modules.json` (`migrationVersion` 6 → 7). `module-manifests.mjs --check`
  reports no errors (zero drift).
- New rule in `scripts/module-manifests.mjs`: a hosted module's runtime manifest must list every migration file in
  its directory, in order. Shown to fail on the committed list ("missing
  000007_finance_period_close_accruals_forecasting.up.sql") and to pass after the fix.
- Fresh install on an isolated PostgreSQL 16 container (`wi120-migtest`, port 55433) with the real
  `run-module-migrations.mjs`: "Module schema gigalibs_finance is ready at migration 7".

### A3. CMMS and Workforce migration failures (P1-13)

- **Workforce:**
  - Cause: `modules/gigaops/db/runtime-foundation/000020`–`000025` (WI-WFO-001–006) create their objects but are
    the only Workforce migrations without the `schema_migrations` ledger row.
  - On the UAT instance they ran on 2026-10-04 07:06Z, so their tables exist, but the ledger stayed at 19 and the
    runner stopped ("ledger is 19; expected exactly 25").
  - Fix, without editing applied files:
    - new forward migration `000026_wfo_ledger_repair` (records 20–26, `ON CONFLICT (version) DO NOTHING`);
    - version pins moved from 25 to 26 in `infra/compose/compose.workforce.local.yaml` (two places) and
      `modules/gigaops/apps/api/src/runtime-config.ts`.
  - Isolated proof:
    - fresh install reaches 26;
    - with rows 20–26 removed (the UAT state), the runner fails with `relation "wfo_workers" already exists`;
    - after recording rows 20–25 once, it reaches 26. That one-time recording is a part B step on the UAT instance.
- **CMMS:**
  - Cause: committed migration `000017_eam_failure_hierarchy_and_job_plans` (WI-EAM-003) uses the undefined type
    `gigalibs_cmms.user_ref`. CMMS defines `principal_ref`, which 000015 and 000016 use.
  - 000017–000019 also lack the ledger row.
  - Reproduced on the isolated container from exactly the runtime-manifest files: 000015 and 000016 apply, then
    `type "gigalibs_cmms.user_ref" does not exist`.
  - None of 000017–000019 has ever been applied anywhere: 000017 rolls back in its single-statement transaction,
    and the runner stops there.
  - The proposed correction (type `principal_ref`, ledger rows) was tested on scratch copies only: CMMS then
    reaches 19.
  - **Editing the three committed files was refused by the session's permission system ("Modify Shared
    Resources"). Not done; the owner decides.**
- Other module migrations without a ledger row (older first migrations of AR 000006, analytics 000001–2,
  recovery, communications, document-scanner, esignature, geospatial 000001, multi-currency, ontology, saga, tax,
  connector-hub, data-studio, rule-pro, workflow-studio): not changed; recorded for a ledger-rule baseline in a
  later card.

### A4. UAT visibility

- New `apps/workflow-platform/lib/uat-module-status.ts`: setting `GIGALIBS_UAT_PREVIEW`; only the exact value
  `enabled` counts. It also holds the per-module status list: the four ERP workspaces are "sample-figures";
  other PLANNED/CONTAINED modules are "not-verified".
- `lib/module-access.ts`:
  - the readiness lock is lifted when the preview is on;
  - entitlements and permissions still apply;
  - the server reads the setting; client components receive the server's answer;
  - `module.yaml` readiness values are unchanged.
- `components/AppSidebar.tsx`: locked modules are listed with a "UAT" label (padlock when the setting is off).
- New `components/UatPreviewBanner.tsx`, mounted in `app/(app)/layout.tsx`: `role="status"` banner naming the
  module, its readiness and whether its figures are sample data (with the card that replaces them).
- Every API route and the module proxy use the same `canUseTenantModule` decision. All PLANNED/CONTAINED modules
  are already `entitlementEligible`, so the control plane can grant them.
- Deployment: `GIGALIBS_UAT_PREVIEW` added to the web service in `infra/compose/compose.yaml` (default
  `disabled`), to the profile contract's optional keys and to `.env.example`. The profile check reports only the
  known `WORKFORCE_API_URL` drift.
- Tests: `apps/workflow-platform/__tests__/module-access.test.ts` adds 5 UAT preview tests (exact value only;
  lock lifted but entitlement and permission still required; explicit client answer wins; navigation needs a
  tenant; labels). Result: 22 passed, 5 skipped (pre-existing `skipIf` for locked finance modules).
- Known gap: the Plan screen (`components/settings/TenantPlanEntitlements.tsx`, a client component) still shows
  locked modules as not openable. Testers reach them from the menu.

### A5. Finance proofs never write to the UAT database (P1-16)

- New `scripts/lib/isolated-proof-database.mjs`.
  - The seven finance proofs now require an explicit `PROOF_DATABASE_URL`.
  - They refuse any local URL on port 5440 (the UAT instance).
  - Otherwise they exit 78 ("NOT RUN"). The default URL with the dev password is gone.
- `scripts/verify.mjs` reports exit 78 as `NOT RUN` (never PASS), and the result line names the count.
- Checked: no URL → NOT RUN (exit 78); `localhost:5440` and `host.docker.internal:5440` → refused (exit 78).
- With `PROOF_DATABASE_URL` pointing at the isolated container, freshly migrated to finance 7, all seven proofs
  exit 0. (They remain raw-SQL proofs, not HTTP evidence; audit finding P0-11 stands.)

### A6. Images from a clean checkout (P0-12)

- **Method:**
  - `git worktree add --detach` of HEAD `de81f82` in the session scratchpad;
  - the U1 diff applied, plus only the new U1 files; no untracked modules present;
  - `docker build --pull=false --target <t>` with the same arguments as `build-images.sh` and
    `build-*-image.sh`;
  - tags `gigalibs/<image>:u1proof-<state>`, distinct from deployable tags;
  - the UAT instance's `infra/compose/.env` and secrets were not used.
- **First run (state `36cca04ad8de`):**
  - `migrations` OK: the control-plane migrations image, which failed before because of the untracked runner.
  - `module-host` OK.
  - `api`, `web` and `workforce-api` FAILED. Cause: `infra/compose/docker/pnpm-workspace.yaml` (the image
    workspace) never listed `modules/financial-operations/web`, which `apps/workflow-platform` has depended on
    since `a8207c4`.
    - The web build failed with `Cannot find module 'lucide-react'` in `FinancialOperationsWorkspace.tsx`.
    - The Workforce deploy step failed with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND … @gigalibs/financial-operations-web`.
    - So no web, API or Workforce image could have been built from any commit since Phase 8.
- **Fix:**
  - `modules/financial-operations/web` added to the image workspace.
  - New rule in `scripts/verify-configuration-local-profile.mjs` (`WORKSPACE_DEPENDENCY_MISSING`): every
    `workspace:` dependency of an image-workspace package must be in the image workspace. Shown to report exactly
    this defect before the fix, and only the known `WORKFORCE_API_URL` drift after.
- **Second run (state `66d281389651`, 2026-10-05):** `migrations`, `api`, `web`, `module-host` and
  `workforce-api` all OK, tagged `u1proof-66d281389651`. The tree was HEAD `de81f82` plus exactly the U1 changes, the
  same content as commit `03ebd0c` apart from its evidence text. P0-12 (cannot build from git) is closed for these
  five images; the CMMS, Analytics, Connector Hub and Geospatial images are built by the part B deploy builds.

### Verification

- `pnpm build`: 74/74 tasks successful (log in the session scratchpad).
- `pnpm test`: 292 test files passed (22 skipped); 2,431 tests passed (165 skipped); exit 0.
- Static audits: `audit:production-data` and `audit:all-runtime-data` PASS (after rewording the banner, which first
  tripped the fixture pattern with the phrase "sample data"; the gate was not changed). `audit:package-dependencies`,
  `audit:api-boundary`, `audit:navigation`, `audit:sdlc` and `audit:layers` PASS. `module-manifests.mjs --check`:
  no errors. Deployment profile: known `WORKFORCE_API_URL` drift only.
- `pnpm verify --audits`: `RESULT: PASS for the steps that ran (1 known drift; 7 not run)`. The UAT database was
  unchanged afterwards (newest finance row still 2026-10-04 16:19:09Z).
- Playwright smoke spec `e2e/specs/uat-preview-modules.spec.ts` (36 tests: the menu plus one per module, read-only)
  compiles (`--list`). It runs in part B against the UAT instance.

### Part B (UAT instance): status 2026-10-05 ~04:30Z

The owner gave the go on 2026-10-05. Done:

1. Backup `infra/compose/backups/gigalibs_backup_20261005_042254Z.dump`: 7,008,475 bytes; `shasum -c` OK. Its
   metadata names the running release `local-20261004T065227Z-007e686bebee-c1746f0b541b`, which is also the
   rollback tag.
2. `refresh-source-identity.sh`: env files now name commit `03ebd0c`, tag `03ebd0c366b6-ff554c98771d`, release
   `local-20261005T042338Z-03ebd0c366b6-ff554c98771d`. Secrets preserved.
3. `generate-generated-module-credentials.sh financial-operations` created `.env.module.financial-operations`:
   runtime role `gigalibs_finance_runtime`, key pair; values not printed.
4. `GIGALIBS_UAT_PREVIEW=enabled` appended to `infra/compose/.env`. `docker compose config` with all 10 env files
   and 5 compose files resolves: every service is on the new tag, and the web receives the setting.
5. Read-only check: all 13 tables created by Workforce 000020–000025 exist in `gigalibs_workforce`; the ledger is at 19.
6. Deploy images: the five build scripts are queued after the clean-worktree proof run.

Blocked by the session's permission system (not attempted another way):

- The one-time Workforce ledger record of rows 20–25 (a direct write to the UAT database) was refused ("Remote
  Shell Writes").
- A reduced deploy without Workforce was then refused as well ("Modify Shared Resources"). No container was
  recreated. The running instance is still entirely on `007e686bebee-c1746f0b541b`.
- The CMMS 000017–000019 correction remains refused (part A).

Prepared for the owner: the deploy script in the session scratchpad (`deploy-u1.sh`). It deploys the migrations
jobs and services with consumers first, skips CMMS, and stops at the first failure. Its Workforce job needs rows
20–25 recorded first.
- Deploy images for commit `03ebd0c` (tag `03ebd0c366b6-ff554c98771d`), built 04:29–04:45Z by the repository's five
  build scripts; all OK. Image IDs:
  - control-plane-migrations `1577704e28f0`
  - playground-api `dea8364f94be`
  - workflow-platform `726aa028b6a1`
  - cmms-api `488d84e8ebe1`
  - analytics-api `fa30b8f8fe8b`
  - connector-hub-api `10e372fae43b`
  - workforce-api `f8035c6e1151`
  - geospatial-api `b3ad9979857c`
  - module-host `a0f64c83e797`
- The running instance is still entirely on `007e686bebee-c1746f0b541b` (checked 04:45Z). The ledger record and the
  deploy wait for the owner: either run them, or switch the session out of auto mode so each step can be approved.

### Part B deploy: done for every module except CMMS (2026-10-05 04:55–04:57Z)

- The owner ran the one-time Workforce ledger record and `deploy-u1.sh` in a terminal, because the session's auto
  mode refused them. Full record: `infra/compose/evidence/wi-oi-120a-20261005T045500Z/README.md` (local; that folder
  is git-ignored).
- All migrations jobs exited 0. Ledgers: Workforce 26 (S-03 closed for Workforce), Finance 7, Geospatial 8, Connector
  Hub 8, Analytics 29, Catalogue 1, Inventory 2, Procurement 2, Orders 2.
- Nine services are healthy on `03ebd0c366b6-ff554c98771d`, including Workforce (running again) and the module host
  with Finance (running for the first time).
- `GIGALIBS_UAT_PREVIEW=enabled` is active in the web container.
- An unsigned Connector Hub request carrying only `X-Tenant-Id` is refused (401).
- Open:
  - CMMS (still on `007e686…`, not started, ledger 16; the 000017–000019 correction awaits the owner);
  - the Playwright smoke test (needs a UAT tenant administrator login);
  - U2 findings now visible at runtime, such as the revocation-schema mismatch expected to fail authenticated
    Inventory, Orders, Procurement and Finance routes.

## WI-OI-120b (U1b): design standard

Card `.pi/tasks/WI-OI-120b.md`, approved by the owner on 2026-10-05.

- **Finding:** see the WI-OI-119 post-audit finding. Owner rule `.pi/handoff/HANDOFF-2026-09-29.md:81`.
- **Check:** `scripts/verify-design-tokens.mjs` (`pnpm audit:design-tokens`, also in `pnpm verify`) with a ratchet
  baseline `config/design-token-baseline.json`.
  - First count: 92 files, 5,316 hard-coded colour classes across the web code; not only the Phase screens (for
    example E-Signature 321, Dynamic Forms 188, Ontology 187, Analytics 173, Master Data 171, Platform Control 164).
  - Counts may only fall; new files must be clean; the four U1b files must be zero.
  - It failed for the four files before the restyle and passes after. Total now 4,366 in 88 files.
- **Tailwind:** `apps/workflow-platform/tailwind.config.js` now scans `../../modules/*/web/src` and
  `../../packages/*-react/src`. Before this, classes used only inside module screens and React packages were never
  generated.
- **Restyle:** colour classes only, by a reviewed mapping (scratchpad `u1b_tokens.py`).
  - Dark screens (Catalogue 360, Parties 291): zinc-950/900/800 → `ui-bg-subtle/base/field`;
    `text-white`/`zinc-200`/`zinc-300` → `ui-fg-base`; `zinc-400` → `ui-fg-subtle`; `zinc-500`/`600` →
    `ui-fg-muted`; zinc borders and dividers → `ui-border-base`.
  - Light screens (Application Dictionary 252, form renderer 47): white/zinc-50/100 → `ui-bg-base/subtle/component`;
    zinc text shades → `ui-fg-base/subtle/muted`.
  - Status tints → `ui-tag-{green,red,orange,blue,purple}-{bg,text,border}`; errors → `ui-fg-error`; focus →
    `ui-border-interactive`.
  - Solid action buttons → `ui-button-inverted(-hover)` with `ui-contrast-fg-primary` text; overlays →
    `ui-bg-overlay`.
  - White text on a solid button becomes the button-text token; elsewhere the base text token. So the Catalogue
    title is no longer white on the light page, and the error banner reads as red on a red tint.
- **Not done (scope change):** swapping native elements for `@medusajs/ui` components moves to U5–U7.
- **Tests:** `apps/workflow-platform/__tests__/design-tokens.test.ts` (5 tests: the four files are clean and use
  tokens; the pattern ignores tokens): pass.
- **Verification (2026-10-05):**
  - `pnpm build` 74/74;
  - `pnpm test` 293 files passed (22 skipped), 2,436 tests passed (165 skipped), exit 0;
  - all eight static audits pass, including `audit:design-tokens`; `module-manifests.mjs --check` shows no errors.
- **Deploy:** not yet. After the owner commits, the images are rebuilt and the owner runs the deploy script (auto mode
  refuses deploys from the session).

## WI-OI-120c (U2): ERP module APIs accept, save and record real data

Card `.pi/tasks/WI-OI-120c.md`, approved by the owner on 2026-10-05.

- **Migrations (forward only; applied migrations untouched):**
  - Inventory, Orders and Procurement `000003_*_auth_revocation_shape`, and Finance `000008`. They give the
    revocation table the columns the SDK guard reads (all four tables were empty; `SET NOT NULL` fails loudly if not).
  - Finance `000008` also forces RLS on the three `org_replica_*` tables (P1-18) and adds the unique index
    `uq_gl_journals_source_document` (checked: 0 duplicates among 76 sourced journals on the UAT instance).
  - Contract versions are now Inventory, Orders and Procurement 3 and Finance 8; runtime manifests and compose
    regenerated.
  - Isolated PostgreSQL 16: fresh install reaches 3/3/3/8. Upgrade of a restore of the 2026-10-05 UAT backup also
    reaches 3/3/3/8, the SDK revocation query runs, replica RLS is on, and the index exists. The Orders ledger has
    no `name` column; caught on the restore and fixed.
- **One transaction per command (P0-09):**
  - `postJournal` takes the caller's transaction.
  - A journal for a source document is created once per book and entry type, and a retry returns it.
  - Journal numbers are taken under a per-tenant lock (the `COUNT(*)+1` race).
  - Callers pass their transaction: Costing ×4 (with sources: cost layer, landed-cost voucher, revaluation),
    Fixed Assets ×2 (the depreciation run id replaces a random id).
  - Consolidation: group creation, the run (journals, run, entries, eliminations, event) and sealing are each one
    transaction. Before this every statement was its own transaction.
  - Treasury fee: source is the statement line id. Line numbers restart per statement and would have falsely
    matched under the new index.
- **Events (P1-03):** new `modules/financial-operations/apps/api/src/outbox.ts`.
  - Every column is set, with the next aggregate version per record under a per-record lock (the unique key made a
    second event per record fail).
  - Used by Finance, Costing ×5, Budgeting ×4, Close ×5 (which now have their event type) and Consolidation ×3
    (which wrote to a table that does not exist).
- **Orders (P1-09):** allocation and dispatch events take the next version per record, under a lock.
  - Found during the proof: reusing one parameter in a subquery fails with "inconsistent types". Fixed by reading
    the version first.
  - A double comma in the parameter list was also caught before the run.
- **Proxy (P1-23):** `forwardedWriteHeaders` forwards a UUID `Idempotency-Key` and an entity-tag or version
  `If-Match` on writes, and rejects malformed values with 400. Unit test: 11 pass.
- **Finance period creation (found during U2):** no route created fiscal periods, so nothing could ever be posted.
  Added `POST /v1/fiscal-years/standard` (contract `GenerateStandardFiscalYearInputV1Schema`, permission
  `finance:periods:manage`).
- **HTTP proof:** `scripts/verify-u2-module-host-http.mjs`, also in `pnpm verify`, NOT RUN without
  `PROOF_DATABASE_URL`. It runs the real `apps/module-host/dist` against an isolated database with signed tokens
  for two tenants. **39/39 PASS:**
  - migrations for the five modules; host start;
  - signed-in reads in all five modules;
  - tenant B gets 404 on tenant A's warehouse;
  - book, account, consolidation group and budget structure, with both events in the outbox;
  - fiscal year with 12 periods; seven costing accounts; cost profile;
  - forced event failure after the journal → the command fails, leaving 0 journals and 0 layers;
  - receipt layer posts one balanced journal (2,500/2,500) linked to its layer, with one event;
  - subledger lock and its event;
  - order created, read back, confirmed, allocated twice (events version 1 and 2);
  - UOM; product created, then retried with the same key → same id, one row.
- **Not covered by U2 (recorded, not hidden):**
  - request-level idempotency for Inventory, Orders, Procurement and Finance commands (F1);
  - the Treasury fee adjustment's match is still a separate transaction (a retry now reuses the journal);
  - Finance PUT and DELETE routes are outside the gateway's GET/POST/PATCH contract (F0 standardizes updates on
    PATCH);
  - the screens are still the hand-written ones (U7–U18 on F0).
- **Verification:** `pnpm build` 74/74; `pnpm test` 294 files and 2,446 tests passed (165 skipped); eight static
  audits pass; manifest check clean; deployment profile shows the known drift only.
- **Not deployed yet:** waits for the owner's "commit"; then images are rebuilt and the owner runs the deploy.

## U2 commit handoff and proposed U3.1 (2026-10-05)

- Verified U2 commit `220508e` with `git log`; no tracked modifications at handoff, only the previously protected
  untracked material. This supersedes the earlier wait-for-commit note; no new deployment was observed or performed.
- Prepared `.pi/tasks/WI-OI-120d.md` from the task template: Proposed, SCIM P0-06 only. Existing code confirms
  fallback/caller-selected tenant in the controller and unvalidated role assignment in create/PATCH. Existing
  tenant-member administration supplies permission, last-admin and revocation patterns to reuse.
- Product code unchanged while the owner reviews this bounded card, per AGENTS.md session rule 2. Updated NOW and
  added a dated status note to the investigation without rewriting its historical evidence or claiming closure.
- Capacity statement: a reported 40% agent allowance is not a measure of remaining engineering effort. The target
  is one bounded tested slice, with implementation, independent review and deployment tracked separately; no
  percentage of the 421-line report is promised.
- Planning-document verification: `PROOF_DATABASE_URL= pnpm verify --audits`, exit 0; eight audits and manifest
  check passed, known `WORKFORCE_API_URL` drift, eight isolated-database proofs NOT RUN. `git diff --check` passed.
  Log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-05T07-11-27-811Z.log`.

## U3.1 SCIM implementation (2026-10-05; WI-OI-120d)

- Owner authorized implementation with "proceed". Scope is P0-06, not all U3. No commit, deployment, migration
  change, UAT write, credential rotation or production-gate upgrade was performed.
- Users/Groups obtain tenant authority from verified context, never header/query/default tenant. Permissions:
  Users GET and Groups GET `users:read`; Users POST `users:create`; PATCH `users:update`; DELETE `users:delete`.
  Discovery/schema endpoints remain public. Input validates supported tenant roles and complete PATCH batches;
  platform-only roles, unsupported attributes and malformed states are rejected.
- Mutation transactions lock the tenant, recheck actor authority and reuse the tenant-administration last-active-
  administrator invariant. Membership changes, scoped session revocation and actor-attributed audit commit together.
  Existing multi-tenant identities are not globally suspended/deleted or renamed by this path.
- Compatibility: POST is create-only (duplicate membership 409), repeated unchanged PATCH is a no-op, repeated
  DELETE is 404, concurrent conflicts are 409 and require reload. Existing-identity externalId assignment is
  explicitly unsupported (409); newly created externalIds are only returned to their originating tenant.
  No external IdP credential/service-account integration or full SCIM interoperability certification is claimed.
- Targeted verification: 27 tests pass (14 validation, seven HTTP guard tests with storage doubles, six real-
  PostgreSQL integration tests). Integration covers create/reload, cross-tenant denial, malicious batch atomicity,
  last-admin protection, multi-tenant session isolation, audit-failure rollback and competing admin removal.
  The rollback fault-injection case invokes the service directly; the other integration cases use actual HTTP.
- Proof infrastructure: separate disposable container `wi120d-scim-proof-20261005`, localhost port 55541,
  database `scim_proof`, committed control-plane migrations applied through the existing runner. Fixtures carry
  WI/run attribution and do not enter customer reporting. The suite refuses other host/port/database identities.
- Initial proof uncovered an existing audit-checkpoint ID length constraint: it constructs `tenantId:scope` in a
  varchar(30) column. Production-generated 25-character CUIDs plus `:scim` fit; oversized test IDs did not. Fixtures
  now match that production format. Arbitrary longer legacy tenant IDs remain a shared audit compatibility concern,
  not certified by this slice; no migration or shared audit redesign was silently added.
- Independent Security/QA review and named human acceptance remain pending. Session revocation proof here covers
  the control-plane guard; downstream module revocation propagation and other U3 findings are not certified.
- Full `SCIM_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55541/scim_proof pnpm verify` exited 0: build,
  tests, runtime/security-boundary/static audits and manifests passed; known WORKFORCE_API_URL drift only.
  Eight unrelated Finance/U2 proofs NOT RUN (no PROOF_DATABASE_URL). Log:
  `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-05T07-41-46-884Z.log`.
- Full-suite totals: 74/74 build tasks; 297 test files / 2,473 tests passed, 165 tests skipped.
  The isolated SCIM container was stopped after proof; its data remains available for review. UAT was untouched.

### WI-OI-120d (U3.1): second review by the primary session (2026-10-05)

Reviewed read-only before commit, on the owner's instruction (option 1). This is an independent agent review, not
the named human Security review that production requires.

- **Controller** (`scim.controller.ts`):
  - the tenant comes only from the verified login (`CurrentTenant`); header, query and `default-system-tenant`
    fallbacks are removed;
  - permissions per action (`users:read`, `create`, `update`, `delete`);
  - input validated by strict zod schemas (`scim.validation.ts`); page sizes bounded (count ≤ 100).
- **Service** (`scim.service.ts`): every write re-checks the actor's active membership and permission from the
  database inside a tenant-locked transaction. Create refuses an existing membership, so create is not an update
  path.
- **Last administrator:** protected by `assertTenantAdministratorRetained`.
- **Roles:** exactly one role from `TenantMemberRoleSchema`; `SUPER_ADMIN` is not assignable. Built-in roles: only
  `TENANT_ADMIN` holds `users:*`; `MANAGER` has `users:read`.
- **Residual finding (P2, for U3):** a tenant-defined custom role that includes `users:create` or `users:update`
  could assign `TENANT_ADMIN`. Role assignment should need its own permission, or be capped at the actor's own role.
- **Checks run by the primary session:**
  - `scim.validation`, `scim.controller` and `scim.integration` tests: 21 passed, 6 skipped (the integration suite
    needs its test database; the authoring session reports 27/27 with it);
  - `pnpm install --frozen-lockfile` succeeds;
  - the deployment profile shows the known drift only (`rbac-core` is in the image workspace).

## Deploy of `5ceba59` (U1b, U2, U3.1) to the UAT instance (2026-10-05 09:05–09:08Z)

- Images built by the primary session from commit `5ceba59` (tag `5ceba59d0963-b53e290e718f`), 07:59–08:42Z.
  - The first module-image attempt failed on a transient npm-registry error and was rebuilt unchanged.
  - The first Workforce attempt stopped on stale image names in three local env files; the source-identity refresh
    was re-run.
- Backup before the deploy: `gigalibs_backup_20261005_084054Z` (checksum OK, 20 module schemas), labelled with the
  running release `03ebd0c366b6-ff554c98771d`.
- The owner ran `deploy-u1.sh`. All migrations jobs exited 0. Inventory, Orders and Procurement are now at 3, Finance
  at 8. Nine services are healthy on the new tag.
- Read-only re-check:
  - the revocation columns exist in all four modules (P1-02);
  - Finance's three `org_replica_*` tables force row-level security (P1-18);
  - `uq_gl_journals_source_document` exists (P1-23);
  - no error-level log lines since 09:06Z.
- Full record: `infra/compose/evidence/wi-oi-120c-20261005T090556Z/README.md` (local; git-ignored).
- Open:
  - the five ERP entitlements (owner, Platform Control Tower), after which U2 can be exercised on this instance;
  - CMMS (000017–000019 correction);
  - Playwright smoke (UAT administrator login);
  - independent Security review of U3.1 before P0-06 closes.
- Rollback: tag `03ebd0c366b6-ff554c98771d` plus that backup. The disk guard removed the other `007e686…` images.

## WI-OI-120e (U3.2): security defects in code that runs on the UAT instance (2026-10-05)

Approved by the owner 2026-10-05 with the proposed lockout (5 failures / 15 minutes). Implemented by the primary
session. Each finding has a test that fails on the old code. Nothing is closed until the named Security reviewer (D7)
accepts it.

### P1-20 Login throttle and lockout

- **Change:**
  - `packages/auth-nest/src/login-throttle.ts`, used by `AuthService.login`.
  - Control migration `20261005000000_login_throttle` and Prisma model `LoginThrottle`.
  - The control plane's retention worker removes idle rows after a day.
- **Behaviour:**
  - Failures are counted per SHA-256 of the normalised email. Unknown, disabled and password-less accounts are counted
    the same way and pay for a password check against a dummy hash.
  - The fifth failure within 15 minutes locks the email for 15 minutes. While locked, the login answers 429
    `LOGIN_LOCKED` before any lookup.
  - A success clears the count. Times come from the database clock.
  - A lock on an existing account is audited (`login_throttle`, `LOCKED`). If the audit write fails, the answer is
    still 401.
- **Web sign-in:** says "Try again in N minute(s)" and passes `Retry-After`.
- **Tests:**
  - `login-throttle.spec.ts`: 8 tests; 6 fail on the old code.
  - `login-throttle.integration.test.ts`: 7 tests on an isolated PostgreSQL 16 database (`login_throttle_proof` on
    the throwaway server, port 55433). They cover:
    - the lock on the fifth failure;
    - the restart after the lock expires;
    - the restart after the window passes;
    - 20 concurrent failures all counted;
    - clearing after a success;
    - pruning;
    - hash-only keys.
  - `login-lockout-message.test.ts`: 3 tests. `auth-boundary-regression.test.ts` still passes (69 tests).
- **Limits:**
  - Per-network-address limits belong at the ingress (production track).
  - Anyone who knows an email can lock that account for 15 minutes; this is inherent to account lockout.

### P0-04 Rule Studio

- **Change:**
  - Update, hijack and delete act only on the signed-in tenant's own rules. Another tenant's rule, and a
    `GLOBAL_SYSTEM` rule, answer 404.
  - Only listed fields can change: never `id`, `tenantId`, `systemLocked` or the statistics.
  - A tenant cannot create or move a rule into `GLOBAL_SYSTEM`, which would run for every tenant.
  - New: changing a rule needs `rules:write`. Before this, `rules:read` was enough.
- **Tests:**
  - `rule-kernel-tenant-boundary.test.ts`: 6 tests; 5 fail on the old code. The sixth is the positive control.
  - `universal-rule-kernel.test.ts` is updated for the tenant argument.
- **Still open:**
  - In-memory storage and the seeded rules (U21).
  - No built-in role holds any `rules:` permission, so only a custom role can open Rule Studio. Which roles should
    get it is decided in U21.

### P0-08 Connector Hub inbound webhook

- **Change:**
  - Hub migration `000009_inbound_webhook_endpoints`:
    - adds an unguessable `webhook_endpoint_id` (UUID) to every connection, backfilling existing ones;
    - adds a SECURITY DEFINER `resolve_webhook_endpoint` that returns only the tenant and the connection.
  - Contract 8 → 9 in the runtime config, both compose pins and the tests.
- **The webhook:**
  - It is `POST /api/connectors/v1/webhooks/{endpointId}`. The tenant comes only from the endpoint, and `X-Tenant-Id`
    is ignored.
  - A connection without a signing secret refuses.
  - The HMAC is checked over the raw request bytes (Nest `rawBody`). `payload_sha256` hashes those bytes.
  - `Authorization` and cookie headers are no longer kept in the journal.
- **New finding, fixed here:** `GET connections/{id}` returned the signing secret to any user with
  `connections:read`, who could then forge webhooks.
  - The secret is now shown once, at creation.
  - Reads give `webhook_secret_configured` and the endpoint ID.
- **Connections page:**
  - The simulate panel sent a fixed `tenant-corp-01` to a route the proxy does not expose. It is now "Send test
    webhook" on the signed route `connections/{id}/test-webhook` (`connections:test`); the hub signs and ingests the
    test for the caller's tenant.
  - The panel shows the endpoint path. The "PORT 4100 LIVE" claim and the seeded default slug are gone.
- **Tests:**
  - `webhooks.service.test.ts`: 14 tests.
  - `webhooks.integration.test.ts`: 6 tests over real HTTP on PostgreSQL, using the real migrations and the
    non-superuser runtime role (RLS forced). They cover:
    - the header-only forgery (401);
    - a wrong secret (401);
    - raw-bytes acceptance once, then a duplicate;
    - 404 and 400 endpoints;
    - the test delivery by tenant and permission;
    - a connection without a secret (401).
  - Whole hub suite with the integration database: 63 tests.
  - `connector-hub-boundary.test.ts`: 4 tests.
- **Migration proof:**
  - 000001–000009 on an empty database.
  - 000009 on a restore of backup `gigalibs_backup_20261005_084054Z`: 16 of 16 connections got distinct endpoint IDs,
    and the ledger is at 9.
- **Note:** explicit `@Inject` was added to the webhook controllers, the service and the hub guard, so tests can wire
  Nest without decorator metadata. Production behaviour is unchanged.
- **Still open:**
  - Dispatch to Workflow Studio still sends `x-tenant-id`. This is P0-05 scope; Workflow Studio is not deployed.
  - Webhook secrets are stored unencrypted (new P2).
  - The generic HMAC does not cover the timestamp header. Replay protection rests on the idempotency key.

### P1-25 Offline punch queue

- **Change:**
  - `lib/offline-punch-queue.ts`. The queue in `TimeAndAttendance` is keyed by tenant and user.
  - It is read and replayed only after `/api/auth/context` names that person.
  - The old shared queue is discarded unsent, because it cannot be attributed to anyone.
  - Signing out (`UserNav`) removes every queue on the device.
- **Tests:** `offline-punch-queue.test.ts`, 3 tests. The component wiring has no DOM test, because this repository has
  no DOM test harness.
- **Trade-off:** a punch still queued at sign-out is lost.

### P1-24 Dictionary renderer

- **Change:**
  - `permissions` defaults to none.
  - New generator option `sessionPermissions: true` (`scripts/module-manifests.mjs`). Catalogue, Inventory, Orders,
    Procurement and Finance use it: their generated pages read the server-side session and pass the user's
    permissions to the workspace, which hands them to the renderer.
- **Tests:** `dictionary-renderer-permissions.test.tsx`, 2 tests. They failed against the previous build of the
  package.
- **Note:** the built-in ERP manifests declare no views, so those screens show "No view layout declared"; F0 fixes
  this.

## WI-OI-120f (F0): metadata-governed windows (approved 2026-10-05)

Owner decisions: a module's baseline dictionary activates automatically when the module is enabled for a tenant (a
tenant's own published version stays in force); the Inventory screen's hard-coded figures and simulated results are
removed.

### F0.1 Contract and compiler (committed with this entry)

- `DictionaryFieldV1.scale` (0–8) for exact NUMBER and CURRENCY fields; their values travel as decimal strings.
  CURRENCY without a scale compiles with two decimal places.
- `DICTIONARY_EXECUTABLE_CAPABILITIES` (version 1) in the contracts lists the field types, component keys, reference
  types, action types (COMMAND, NAVIGATE) and view modes the metadata window executes.
- `configuration-core/src/dictionary-capabilities.ts`, called by `compileDictionaryPackage`, refuses at publish time:
  - unsupported types, components and actions;
  - lookups without a resolver, and SELECT fields without a value list;
  - tabs, child tabs, sections, placements and search, filter or sort fields that point at nothing;
  - incomplete, ambiguous or malformed rule expressions.
- One evaluator, in `configuration-core` (the renderer's copy is removed and re-exported from the browser-safe
  `@gigalibs/configuration-core/dictionary-evaluator`). It fails closed (incomplete comparisons, empty groups and
  unknown operators are false) and compares numbers exactly, as numbers or decimal strings (M-03).
- Published manifests on the UAT instance use only the TEXT, TEXTAREA, SELECT, BOOLEAN and CURRENCY types, which stay
  supported.
- **Tests:**
  - `dictionary-capabilities.test.ts`: 8 tests.
  - The configuration suites still pass (267 before this change).
  - Full `pnpm test`: 2,503 passed, 184 skipped.
  - The web app and control plane type-check.
  - `pnpm verify` passes (known drift; 8 proofs NOT RUN).
- **Process note:** these files were first edited while the U3.2 images were building, and the build reads the
  working tree.
  - The build was stopped and this work parked as a patch.
  - The web, control-plane and migrations images were checked clean of F0.1 code.
  - The module images were rebuilt from the clean commit `828b75a` (state hash unchanged throughout); then the work
    was restored.

## Deploy of `828b75a` (U3.2) to the UAT instance (2026-10-05 11:55–11:57Z)

- The owner ran `deploy-u1.sh`. All migrations jobs exited 0. Control plane: `20261005000000_login_throttle` applied.
  Connector Hub: 9.
- Read-only re-check:
  - nine services healthy;
  - `login_throttles` exists;
  - 16 of 16 connections have endpoint IDs;
  - unknown endpoint → 404, slug plus tenant header → 400;
  - no error-level logs.
- Record: `infra/compose/evidence/wi-oi-120e-20261005T115528Z/README.md` (local). Backup
  `gigalibs_backup_20261005_105426Z`; rollback `5ceba59d0963-b53e290e718f`.
- The five ERP entitlements are still not granted (owner, Platform Control Tower).

### F0.2 Module windows and their activation

- **Window files:**
  - A module ships each window as `modules/<module>/dictionary/<surface>.window.json`: an Application Dictionary
    change-set definition plus the window's route, label and read permission.
  - `pnpm modules:catalog` checks each file against its module and surface, and the reserved package-key suffix
    `-module-baseline`, then generates `packages/contracts/src/configuration/window-baselines.generated.ts`.
  - `moduleWindowBaselines()` parses the files with `ModuleWindowBaselineV1Schema`.
  - A configuration-core test compiles every shipped window with the publish-time capability checks. None ship yet;
    Inventory's arrive in F0.5.
- **Reserved key:** the compiler refuses the `-module-baseline` suffix in a tenant's package. An active version
  carrying it is therefore known to be the module's own baseline, not a tenant customisation.
- **Control plane:**
  - Each shipped window registers as a surface through `ModuleWindowConfigurationAdapterV1`: storage
    `MODULE_RECORD_DISPATCHER` (records live in the module), no extension values, and the module's resolvers and
    action handlers as the registered set.
  - `ConfigurationStudioService.activateModuleBaseline` publishes and activates a window in one transaction with the
    usual change set, version, activation, audit and outbox records, as the administrator recorded on the entitlement:
    - nothing active → ACTIVATED;
    - the same baseline → UNCHANGED;
    - an older baseline → UPGRADED (the previous version is reused when the checksum matches);
    - the tenant's own version → CUSTOMISED_KEPT, with a tenant audit entry (once per baseline version) saying an
      update waits for review.
- **Trigger:**
  - Platform Control Tower's licensed-module save now writes `tenant.entitlements.changed.v1` to the control outbox
    in the same transaction.
  - The control outbox worker applies the windows of the tenant's enabled modules (idempotent; retried on failure).
  - At start-up, `ModuleWindowBaselineService.reconcileAll` covers tenants that enabled a module before its windows
    shipped. It can be switched off with `GIGALIBS_MODULE_WINDOW_RECONCILE=disabled`.
- **Tests:**
  - `module-window-baselines.spec.ts`: 7 tests (registration, all four outcomes, the reserved key, actor and module
    selection).
  - `control-outbox.worker.spec.ts`: 2 new tests (applied then marked published; a failure is retried).
  - `platform-entitlements-outbox.test.ts`: 1 test (the event is written in the entitlement transaction).
  - The shipped-window compile test.
- Checks: full `pnpm test` 2,514 passed, 184 skipped; `pnpm verify` passes (known drift; 8 proofs NOT RUN); the web
  app and control plane type-check. Not deployed: F0 deploys as a whole after F0.5.

## CMMS migrations 000017–000019 corrected; tenant admins get the licensed ERP modules (2026-10-05)

### CMMS (owner-approved, U1 open item; applied by the owner)

- The session's permission system refused edits to committed migrations, so the session wrote a patch
  (`scratchpad/cmms-fix/cmms-migrations-17-19.patch`) and the owner applied it with `git apply`. The applied files are
  byte-identical to the tested copies.
- None of the three had run on any database (UAT ledger 16). Corrections:
  - 000017 used the undefined domain `gigalibs_cmms.user_ref`; it now uses `principal_ref`, as 000018 and 000019 do.
  - All six tenant policies were `AS RESTRICTIVE` with no permissive policy, which under FORCE ROW LEVEL SECURITY
    denies every row to the runtime role. They are now the 000016 pattern: `FOR ALL`, `USING` and `WITH CHECK` on
    `app.tenant_id`.
  - Each file now runs in one transaction and writes its own ledger row (17, 18, 19), as the module migration
    runner requires.
- Proof on a throwaway restore of backup `gigalibs_backup_20261005_084054Z` (`wi120-migtest`, `uat_copy_u32`):
  - the real runner moved the copy from 16 to 19;
  - as the CMMS runtime role (not superuser, no BYPASSRLS), tenant A created and saw one failure code and one
    storeroom;
  - tenant B saw none and was refused when writing a row for tenant A.

### Role-based ERP access (owner: "we need to enable for the role")

- **Licences:** the owner ran `scratchpad/enable-erp-modules.sh`, which calls Platform Control Tower's own service as
  `newuser@gigalibs.io`. The session's permission system refused to run it itself.
  - The first run refused the retired `reports` key and changed nothing.
  - The second enabled Catalogue, Inventory, Procurement, Orders and Finance for GigaLibs Global Enterprise at
    12:31Z, with an audit record.
- **Tenant administrator role** (`packages/rbac-core/src/default-roles.ts`): now holds `parties:*`, `products:*`,
  `product-categories:*`, `uoms:*`, `catalogues:*`, `pricing:*`, `inventory:*`, `procurement:*`, `orders:*` and
  `finance:*`.
  - The module entitlement still gates each module. Other members get the module's own roles.
  - Catalogue versions and Inventory adjustments still refuse self-approval. Procurement, Orders and Finance have no
    approval checks yet (P1-06).
- **Tests:** `session-permissions.spec.ts` has 2 new tests. The tenant-admin test fails on the old definition; MANAGER,
  MEMBER and VIEWER get no ERP permission from their base role.
- Checks for both changes: full `pnpm test` 2,518 passed, 184 skipped; `pnpm verify` passes (known drift; 8 proofs
  NOT RUN). The next deploy brings CMMS back (migrations 17–19, then its service) and gives tenant admins the ERP
  modules.

## Deploy of `996abae` to the UAT instance (2026-10-05 13:03–13:05Z)

- The owner ran `deploy-u1.sh`, which now includes CMMS. CMMS migrations 16 → 19, and `cmms-api` healthy: CMMS runs
  again.
- Also live:
  - tenant administrators hold the five licensed ERP modules' permissions and `parties:*`;
  - F0.1 and F0.2 (no module ships windows yet).
- Read-only re-check:
  - ten services healthy;
  - the six new CMMS tables have PERMISSIVE tenant policies;
  - no error-level logs.
- Record: `infra/compose/evidence/wi-oi-120-20261005T130319Z/README.md` (local). Backup
  `gigalibs_backup_20261005_130000Z`; rollback `828b75af9a28-af904a40a84c`.

### F0.3 Record dispatcher on the module SDK

- **`RecordDispatcher`** (`packages/module-sdk/src/record-dispatcher.ts`): every list, read, create, update, action
  and lookup goes to a typed adapter that the module registers and that calls its own domain service (ADR-0019 tenet
  11). Action buttons bind only to registered actions (tenet 13). The dispatcher enforces:
  - each entity's permission per operation, from the signed principal;
  - field permissions: undeclared fields are never returned, unreadable ones are left out, and unknown, system-set or
    unpermitted writes are refused (400/403);
  - declared search, filter and sort fields only, with pages of at most 100 rows;
  - `If-Match` on updates (428 when missing, 412 when stale);
  - an `Idempotency-Key` UUID on creates and actions: a repeat returns the first answer, a different body under the
    same key gets 409, and a failed request releases its key.
- **`ModuleIdempotencyStore`**: keys live in each module's own `record_idempotency` table, under forced RLS. A claim
  abandoned for more than 10 minutes can be taken over.
- **`createRecordController`**: the six routes under `v1/records` and `v1/lookups`. The module's signed-context guard
  checks the entitlement and the module's read permission as the floor. Updates and reads return the version as an
  `ETag`.
- **Gateway generator:** `spec.gateway.records: true` adds the record routes to the web gateway, with the catalogue
  entry's read permission. The new `{entity}` and `{key}` path placeholders take dictionary entity keys and
  action/lookup keys.
- **Tests:**
  - `record-dispatcher.test.ts`: 11 tests (idempotent create and replay, field visibility and write refusal, tenant
    separation, permissions, If-Match, query allow-list, actions, release on failure, lookups, misconfiguration).
  - `record-idempotency.integration.test.ts`: 4 tests on PostgreSQL 16, as a restricted role under forced RLS (claim
    and replay, release, abandoned-claim takeover, tenant separation), on the throwaway server.
  - `apps/module-host/src/record-routes.http.test.ts`: 3 tests over real HTTP (201 and ETag, replay, 412 and 428, the
    guard floor and entity permissions, tenant separation).
- Checks: full `pnpm test` 2,532 passed, 188 skipped (the PostgreSQL proofs skip without their test database);
  `pnpm verify` passes (known drift; 8 proofs NOT RUN). No module mounts the record routes yet: Inventory is first,
  in F0.5.

### Incident: local CMMS signing key shown in session output (2026-10-05 ~13:30Z)

- While diagnosing `/cmms/spaces`, a session command meant to mask environment values failed to match
  `CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64` (its name contains digits). The value of the UAT instance's CMMS
  platform-context signing key was printed in the session output.
- Scope: local UAT instance only; the key never left the machine apart from the session transcript.
- Recommendation: rotate the key pair (web private key, CMMS public key) and redeploy. This is the owner's decision,
  recorded with D6.
- The session no longer prints environment values with that masking pattern.
- `/cmms/spaces`:
  - CMMS answers on `cmms-api:4200`, and the spaces route refuses unsigned calls (401);
  - all CMMS tables have permissive tenant policies;
  - the tree query runs cleanly as `gigalibs_cmms_runtime` for GigaLibs Global Enterprise and returns 0 spaces.
  - The on-screen symptom is awaited from the owner.

### F0.4 Metadata window (renderer)

- `packages/configuration-react/src/window/`. Exported as `MetadataWindow`, `createRecordClient`,
  `usePublishedManifest` and `metadataWindowModel`.
- **`window-model.ts`:** pure, unit-tested window logic:
  - the LIST view and its main tab;
  - level-1 child tabs, linked by the declared relationship's foreign-key field;
  - deny by default: fields without read permission are not drawn, fields without write permission are read-only;
  - visibility, read-only and required rules;
  - value lists and lookup resolvers;
  - actions shown only on their own entity (handler `<entity>.<action>`), when permitted and visible for the record;
  - exact decimals sent as strings, with their scale checked;
  - only changed, writable values sent on an update;
  - API failures as user-facing states.
- **`record-client.ts`:** calls the module's signed gateway (`/api/<module>/v1/records/...`). It sends a UUID
  `Idempotency-Key`, made once per form so a retry cannot save twice, and `If-Match` with the version read. Lookups
  can be served by another module's gateway.
- **`use-published-manifest.ts`:** loads only the tenant's published manifest for the surface. Missing (404), refused
  (403) and empty answers are shown as such, never a built-in copy.
- **`MetadataWindow.tsx`:**
  - a record list with search, sort and paging;
  - a create form;
  - the record view with edit, action buttons (with confirmation) and child tabs that list and create child records;
  - states: loading, empty, refused, not found, changed by someone else (412), unavailable.
  - ui-* design tokens only: the design-token audit finds no violations, and every token used exists in the Medusa
    preset.
- **Tests:** `apps/workflow-platform/__tests__/metadata-window.test.tsx`, 10 tests (model, client, manifest states, render), through the package's public exports. On-screen interaction is
  proven by F0.5's Playwright flow on Inventory.
- Checks:
  - full `pnpm test` 2,542 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 8 proofs NOT RUN);
  - the web app type-checks.
  - The first verify run failed twice on my own test file: the package build compiled the test and found two typing
    mistakes, and the dependency audit refused its undeclared `react-dom` and `vitest` imports. Both were fixed by
    correcting the test and moving it to the web app's tests; no dependency was added.

### F0.5 Inventory on metadata windows

- **Backend:**
  - Inventory migration `000004_inventory_record_idempotency` (contract 3 → 4) and Catalogue migration
    `000002_catalogue_record_idempotency` (contract 1 → 2), each with forced tenant RLS.
  - `InventoryRecordsService`:
    - paged, tenant-bound SQL reads with allow-listed search, filter and sort columns, for warehouses, locations,
      items, lots, receipts, receipt lines, balances and the ledger;
    - the missing warehouse update (version-checked);
    - adding a line to a DRAFT receipt;
    - warehouse and location lookups.
  - `inventory-record-adapters.ts`: eight adapters over the existing domain methods and contract schemas, with the
    same permissions as Inventory's own routes. Receipts have a registered `complete` action.
  - The Catalogue serves `catalogue-products` and `catalogue-uoms` lookups (`products:read`, `uoms:read`).
  - Both modules mount the record routes; `spec.gateway.records: true` adds them to the web gateway.
- **Windows:** `modules/universal-inventory/dictionary/` has six window files:
  - Warehouses, with a Locations child tab;
  - Items;
  - Lots;
  - Receipts, with a Lines child tab and the "Complete receipt" action (visible only on DRAFT);
  - Balances;
  - Stock ledger.

  All six compile with no findings under the publish-time checks. Two definition errors were caught there and fixed:
  a three-part permission on the ledger window's read setting, and lookups naming an entity outside their package.
- **Screen:**
  - The Inventory page is now tabs of `MetadataWindow`, each loading its published manifest, plus a barcode lookup
    that calls `POST /v1/barcodes/resolve`.
  - The hand-written screen with hard-coded figures, a simulated scanner and a constant dictionary is removed (owner
    decision); git keeps it.
- **Renderer additions:**
  - "New" appears only when the user may fill a field (none on Balances or the ledger);
  - lookup columns show labels, one lookup per column per page;
  - value-list columns show option labels.
- **Proof:** `scripts/verify-f0-inventory-windows.mjs`, 27 of 27 checks over HTTP through the real module host, on an
  isolated database (`f0_proof` on the throwaway server). Real migrations and the restricted runtime roles. It
  covers:
  - Catalogue lookups per tenant;
  - idempotent create and key reuse;
  - a child location;
  - If-Match 412 and 428;
  - field and permission refusals and another tenant's 404;
  - item, receipt and line;
  - Complete sent twice posting once (one ledger entry, a balance of 5);
  - a completed receipt refusing lines;
  - ledger read permission.

  It is part of `pnpm verify` (NOT RUN without PROOF_DATABASE_URL).
- **Playwright:** `e2e/specs/inventory-business-flow.spec.ts` enters Inventory's UAT data on the windows:
  - a warehouse with its location;
  - an item, with the product picked from the Catalogue;
  - a receipt with a line, completed;
  - then the balance and ledger.

  The Catalogue unit and product go through the app's Catalogue API. **Not yet run: it needs
  E2E_UAT_ADMIN_EMAIL/PASSWORD.**
- **Found for U8 (not changed here):**
  - `createItem` updates an existing item for the same product;
  - a receipt with no lines can be completed;
  - receipt completion compares a numeric string with 0.
- **Access note:** Inventory roles hold no `products:read`, so only roles that do (tenant admins, catalogue roles) can
  use the product picker. U8 decides the role grants.
- **Checks:**
  - `pnpm build` passes.
  - Full `pnpm test`: 2,542 passed, 188 skipped. The first run failed one control-plane test that hard-coded seven
    configuration adapters; it now expects the seven plus one per shipped window, each a MODULE_RECORD_DISPATCHER
    surface.
  - `pnpm verify` passes (known drift; 9 proofs NOT RUN without PROOF_DATABASE_URL, including the new Inventory proof,
    which the session ran: 27/27).
- **Not deployed yet.** After the deploy, the control plane activates the six Inventory windows for GigaLibs Global
  Enterprise at start-up (F0.2 reconciliation, as the administrator who enabled Inventory).

### F0.5 deploy and the manifest fix (2026-10-05)

- **Deployed by the owner:** `bf049e1f50ca-9e71babfe73c` (api, kernel worker, module host, web: healthy). At start-up the
  control plane activated the six Inventory windows for GigaLibs Global Enterprise (15:33:51Z, one view each): F0.2
  reconciliation worked on a real tenant.
- **Defect found by the owner on /inventory:** every window said "This window is not available — The published
  definition for this window declares no view."
  - **Cause:** `manifestState` looked for `manifestVersion` and `views` on the endpoint's answer. The runtime endpoint
    answers `{ activationId, publishedVersionId, activatedAt, manifest, checksum, scope, adapter }`
    (`ConfigurationRuntimeManifestCurrentResponseSchema`), so the manifest is its `manifest` member. The F0.4 test
    passed a bare manifest, which hid the mistake.
  - **Fix:** `manifestState` reads the `manifest` member and refuses a bare manifest. The test now uses the
    endpoint's real wrapped answer.
  - **Checked:** the per-user filter (`filterDictionaryManifest`) keeps views, references and relationships and removes
    only unreadable fields and unpermitted actions; the renderer skips a placement whose field was removed.
  - **Same mistake in the Catalogue page's old loader**, which is why it always fell back to its constant manifest.
    U7 (WI-OI-120g) removes that loader; not patched here.
- **Checks:** `pnpm build` passes; `pnpm test` 2,542 passed, 188 skipped; `pnpm verify` passes (known drift; 9 proofs
  NOT RUN without PROOF_DATABASE_URL).
- **Not deployed yet.** After deploy: /inventory draws all six windows for a tenant administrator.

### 2104f91 deploy (2026-10-05)

- **Deployed by the owner at 17:31Z:** `2104f91bb696-3f2dc65953ad`. All 21 services are on the tag and healthy, every
  migration job exited 0, and the kernel worker and web logs show no errors (read-only check, 18:09Z).
- **Backup before the deploy:** `infra/compose/backups/gigalibs_backup_20261005_172250Z.dump`, labelled with the release
  that was running (`local-20261005T144131Z-bf049e1f50ca-9e71babfe73c`); checksum verified.
- **Still to confirm:** the owner's on-screen check that /inventory draws the six windows (the control plane does not
  log individual requests).
- **Build note:** the first image build stopped because the image identities had not been refreshed for the new
  commit; the refresh now runs first.

### U19a: CMMS screens reach their API (WI-OI-120h, 2026-10-05)

Approved by the owner, option A (the gateway forwards PUT and DELETE on listed routes). The owner then approved
widening the card to fix the API faults the proof found.

- **Owner's findings in UAT:**
  - Assets and Meters said "Unsupported CMMS route";
  - `/cmms/spaces` crashed in the browser;
  - deletes and the two PUT updates could not pass the web gateway.
- **Causes:**
  - **Missing routes:** 36 routes the CMMS API served and the screens called were missing from the gateway list
    in `module.yaml`.
  - **Wrong path:** the screen called `spaces/{id}/cad-layer`; the API serves `cad-layers`.
  - **Methods:** the web gateway answered GET, POST and PATCH only.
  - **List shape:** the space tree and a space's assets were plain lists, while the screen reads `{ items }`.
  - **Empty answers:** the three 204 deletes had no body for the screen's client to read.
- **API faults found by the new proof** in routes no screen could reach before:
  - **Version 0:** five commands wrote an outbox event with version 0, which the `aggregate_version > 0`
    constraint refuses (500). They were deleting a meter trigger, a failure code or a storeroom; applying a job plan;
    recording failure attribution.
  - **Missing column:** issuing parts to a work order queried `work_orders.currency_code`, which does not exist
    (500); returning parts then failed because nothing had been issued.
  - **Retry keys:** issue and return ignored the caller's retry key, so a retried issue would take stock twice.
  - **Unused version:** applying a job plan and recording failure attribution required `expectedVersion` but never
    checked it or advanced the work order's version, and the screens did not send it (400).
- **Fixes:**
  - **Gateway:**
    - 36 routes added to the CMMS gateway list, each with the permission its API controller requires;
    - `[gateway]` exports PUT and DELETE;
    - the signed proxy treats them as writes: same-site check, write headers, body.
  - **CMMS API:**
    - the space lists answer `{ items }`;
    - a deletion records the record's next version;
    - the two work-order commands lock the order, check `expectedVersion`, advance the version and refuse a stale
      one (409);
    - issue no longer reads a currency from the work order;
    - issue and return replay a repeated caller key.
  - **CMMS screens:**
    - `cad-layers`;
    - 204 answers read as empty;
    - the work order's version sent on both commands.
- **Tests:** `cmms-gateway-screens.test.ts`, run on every `pnpm test`:
  - every one of the 76 calls in the screen client has a gateway route with a permission;
  - every gateway route is served by a CMMS controller. Against the old files it fails and lists the unrouted calls;
  - PUT forwards body and retry key;
  - DELETE forwards no body and passes 204 back;
  - a cross-site DELETE, an unlisted method and a read-only user are refused.

  Also: the equivalence oracle covers the 36 routes, with permissions transcribed from the controllers, and
  `spaces.controller.spec.ts` checks the `{ items }` answers.
- **HTTP proof:** `scripts/verify-u19a-cmms-screen-routes.mjs` passes 56/56 on an isolated database (`u19a_proof` on
  the throwaway server). It installs the migrations the image ships (`db/runtime-manifest.txt`) with the real runner
  and runs the built CMMS API. Each call passes the generated allow-list and is signed with only the permission the
  gateway requires. It covers:
  - spaces, classifications, spec definitions and asset specs (PUT);
  - the equipment tree and a status cascade;
  - job plans, meter triggers and telemetry;
  - failure codes;
  - a work order with its job plan and failure attribution (a stale version is refused);
  - storerooms and balances (PUT);
  - issue and return, where the same issue sent twice takes stock once;
  - the TCO;
  - four deletes;
  - another tenant's 404 and a read-only user's 403.

  It is part of `pnpm verify` (NOT RUN without PROOF_DATABASE_URL).
- **Checks:**
  - `pnpm build` passes;
  - `pnpm test`: 2,549 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 10 proofs NOT RUN without PROOF_DATABASE_URL, including this one, which the
    session ran: 56/56).
- **Not touched:**
  - the CMMS import/export files;
  - migrations;
  - other modules' routes.
- **Not deployed yet.**

### b872b9c deploy: U19a (2026-10-05)

- **Deployed by the owner at 18:33–18:36Z:** `b872b9cea154-d464f3b442b8`. All 21 services are on the tag and healthy,
  every migration job exited 0, and Connector Hub refuses an unsigned request (401).
- **Backup before the deploy:** `infra/compose/backups/gigalibs_backup_20261005_183154Z.dump`, labelled with the running
  release `local-20261005T154657Z-2104f91bb696-3f2dc65953ad`; checksum verified.
- **Read-only checks after the deploy:**
  - the running web build forwards the new CMMS routes and exports PUT and DELETE;
  - the CMMS API logged no errors.
- **Still to confirm:** the owner's on-screen check of Spaces, Assets, Meters, Parts and Work orders. The Reliability
  and Floor Kiosk pages are honest not-built notices (CM-07, CM-04), as before.

### U7: Product Catalogue on metadata windows (WI-OI-120g, 2026-10-05)

- **Catalogue API:**
  - `catalogue-records.service.ts`: paged, tenant-bound reads of eleven entities. Products, catalogues, price lists
    and what hangs off them are read with the caller's organization access, exactly as the list routes read them
    (`CatalogueService.readWithAccess`). Only declared columns are searched, filtered or sorted.
  - `catalogue-record-adapters.ts`: adapters over the existing commands and contract schemas, plus five pickers
    (products, units, categories, catalogues, price lists).
  - The product picker now applies organization visibility, which the old lookup did not.
  - `catalogue-lookups.ts` is removed (its pickers moved into the adapters).
- **Actions, each with a reason and the version the user read:**
  - products: archive and restore;
  - catalogue versions: submit, approve and publish;
  - price-list versions: submit, approve and activate.

  Maker-checker is the existing rule: whoever submitted a version cannot approve it.
- **Windows:** eight in `modules/product-catalogue/dictionary/`:
  - units with conversions;
  - categories;
  - attributes;
  - products;
  - catalogues with versions;
  - catalogue versions with entries;
  - price lists with versions;
  - price-list versions with prices.

  All 14 shipped windows compile with no findings.
- **Page:**
  - eight window tabs;
  - a price resolver;
  - an import/export panel (shown only with `products:import` or `products:export`).

  The constant dictionary and its silent fallback are gone.
- **Shared packages:**
  - the record dispatcher hands the caller's Idempotency-Key to adapters, and answers 412 (not 500) when an action
    meets a version conflict; 2 new SDK tests;
  - the window renderer asks for an action's declared parameters and sends the read version with every action.
- **Orders, Procurement and Finance:** their pages now show a "not connected yet" notice. The screens they replace
  had no API calls, hard-coded figures (Finance about 69) and buttons without actions. Owner-approved; their windows
  arrive with U9, U10 and U12–U18. The unreachable mock-up components are left for those cards to delete.
- **Proof:** `scripts/verify-u7-catalogue-windows.mjs` passes 26/26 through the real module host on an isolated
  database, signed as a maker and a checker. It covers:
  - units and a conversion; a conversion across dimensions is refused;
  - a category update with If-Match, where a stale one gets 412;
  - an attribute;
  - a product: an Idempotency-Key replay, an edit to Active, archive (needs a reason) and restore, where a stale
    restore gets 412;
  - a catalogue version: an empty submit is refused (409); an entry is added; the maker's approval is refused (403);
    the checker approves and publishes; then no more entries (409);
  - a price-list version: a price with list below standard is refused; then submit, maker refused, checker approves
    and activates;
  - price resolution gives one answer, and a 404 before the effective date;
  - the five pickers;
  - read-only users refused (403);
  - another tenant sees nothing.

  The F0.5 Inventory proof still passes 27/27 with the new pickers.
- **Playwright:** `e2e/specs/catalogue-business-flow.spec.ts` (maker and checker on screen; it type-checks). **Not
  run:** it needs E2E_UAT_ADMIN_* and E2E_UAT_APPROVER_* logins.
- **Checks:**
  - `pnpm build` passes;
  - `pnpm test`: 2,551 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 11 proofs NOT RUN without PROOF_DATABASE_URL, including U7's, which the
    session ran: 26/26).
- **Noted for later:** grid rows open only by mouse (no keyboard access), to fix in the renderer.

### Workforce "Unsupported Workforce route" (owner report, 2026-10-05; diagnosis only)

- **What the owner sees:** the Engagements, Worker Registry, Payroll and Pack Library screens answer "Unsupported
  Workforce route".
- **Why:**
  - **Gateway:** they call 57 `wfo/…` routes of the Workforce service, and the web gateway lists none of them. The
    service also serves them without the `v1` prefix the gateway adds.
- **What the routes are:** real service code.
  - There are 12 controllers, about 60 routes, behind the signed-context guard.
  - Their tables come from Workforce migrations 20–25, which are installed.
- **Security finding** (no exposure today, because the gateway does not forward them):
  - 22 routes name roles (`@RequireRoles`), and the guard deliberately refuses them as "prototype role-based routes
    contained until migrated to Workforce permissions".
  - The other 38 name **no permission at all**, so the guard admits any signed-in user of a Workforce tenant.
  - They must get Workforce permissions before any gateway route is added.
- **Proposed:** a U20a card. It needs owner approval and an independent Security review.

### 830a5a1 deploy: U7 (2026-10-05/06)

- **Images:** the build stalled for about 4.5 hours on a package download inside Docker (the Mac slept), was stopped
  and rerun from the same commit, and finished at 23:52Z with the source state unchanged. Builds now run under a
  stall watch.
- **Backup:** `infra/compose/backups/gigalibs_backup_20261005_235300Z.dump`, labelled with the running release
  `local-20261005T181124Z-b872b9cea154-d464f3b442b8`; checksum verified.
- **Deployed by the owner:** `830a5a190e80-100c91553735`. Web and module host are on it.

### UAT walk-through: starter data and screen board (owner-approved 2026-10-06)

- **UAT user:** `uat.admin@gigalibs.io`, which the owner registered and chose a password for.
  - Self-registration put it in its own trial tenant, "uat.admin".
  - The owner then ran `add-uat-admin.sh`, which uses `TenancyService.createInvite` then `acceptInvite`: the
    invitation code path, invited by the platform owner. The user is now a Tenant Admin of GigaLibs Global
    Enterprise.
  - The password is passed only as an environment variable to each run. It is in no file and in no log (checked
    before commit).
- **Tooling:**
  - `e2e/run-uat-walkthrough.sh`: asks for the login, checks it once (five failures lock it for 15 minutes), enters
    the starter data, walks every screen and opens the board.
  - `e2e/specs/uat-session.ts`: sign-in, choosing the tenant by name.
  - `uat-starter-data.spec.ts`: idempotent; it runs headed or recorded with UAT_VIDEO=on.
  - `uat-screen-inventory.spec.ts`: every route of the app plus the 13 Workforce sections.
- **Starter data, entered on the screens** in GigaLibs Global Enterprise:
  - units EA, BOX10 (10 EA) and KG;
  - categories Fasteners and Tools;
  - products UAT-BOLT-M8, UAT-NUT-M8, UAT-WASHER-M8 and UAT-DRILL-18V;
  - price list UAT-USD with a draft version and its first price;
  - warehouse WH-MAIN with locations RCV-01 and STO-A1;
  - four stocked items;
  - receipt UAT-ASN-001 (100 bolts, 200 nuts), completed, with balances and ledger.
- **Defects the walk-through found:**
  1. **Second price or entry (fixed here):** a second price in a price-list version, and a second entry in a catalogue
     version, failed with "service unavailable". Each one wrote its outbox event as version 1 of the parent version,
     and the second collided (duplicate key in the module host log). The U7 proof added only one of each.
     - **Fix:** a price or entry advances its draft version, and the event carries the new number. After a child is
       saved, the renderer quietly rereads the parent, so its actions use the current version.
     - **Proof:** extended to two entries and two prices per version and a stale submit (412): 27/27.
  2. **Save button covered:** the floating "Softphone & WhatsApp" button covers the Save button of forms at the bottom
     right (screenshots). It is for the quick-fixes batch.
- **Screen board** (`e2e/test-results/uat-screen-inventory/index.html`; local, not committed): of 105 screens, 57
  load without errors, 8 are honest not-built notices, 35 are broken and 5 crash. On every screen, the header's
  `GET /api/currency/v1/preferences` and `/pairs` answer 503 (Currency is not deployed). The causes:
  - **Service not deployed (U29):**
    - Tax (5);
    - AR (5, 3 of which crash);
    - Currency;
    - Spend;
    - Data Contracts (502);
    - Recovery.
  - **Workforce `wfo` routes (U20a):**
    - Workers;
    - Engagements;
    - Expenses;
    - Analytics;
    - Compliance (crashes).
  - **403 (permission or module):**
    - Communications (6);
    - Workflows (3);
    - Rules (2);
    - Saga;
    - Ontology;
    - E-Signature;
    - Scanner.
  - **Server error:** Parties, `GET /api/control/parties` → 500.
  - **Crash:** Marketplace, React hydration error #418.
  - **Called on load:** Opportunities runs a SAM.gov sync as it opens (503).
  - **Contained or not set up:**
    - the Analytics overview is contained (WI-OI-043) but shows as an error;
    - Places has no active configuration;
    - Attendance needs the user linked to a Workforce person.
- **Checks:**
  - `pnpm build` passes;
  - `pnpm test`: 2,551 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 11 proofs NOT RUN without PROOF_DATABASE_URL; U7's proof run by the session:
    27/27).

### bed4aa1 deploy and F0.6 "Add new" from pickers (2026-10-06)

- **bed4aa1 deploy:**
  - Deployed by the owner at 01:27–01:30Z: `bed4aa1d5fff-7f0b15eb3ad3`. All services are healthy, and every migration
    job exited 0.
  - Backup: `gigalibs_backup_20261006_012547Z.dump`, under the running release
    `local-20261005T233725Z-830a5a190e80-100c91553735`; checksum verified.
- **Starter data after the deploy:** the rerun added the remaining prices, so the UAT-USD draft version now holds four
  (read back through the API).
  - Locations: a check that read a child list before it loaded tried RCV-01 again. The warehouse refused the duplicate
    correctly, and child checks now wait for their list.
  - Two empty draft price-list versions were left by earlier runs. There is no command to delete a version.
- **UAT login note:** `uat.admin@gigalibs.io` belongs to GigaLibs Global Enterprise and to its own trial workspace,
  "uat.admin". Sign-in asks which, and the trial workspace has neither Catalogue nor Inventory. The owner was told to
  choose GigaLibs Global Enterprise.
- **F0.6 (WI-OI-120j):**
  - **Contract and field model:** `DictionaryReferenceV1.createWith { moduleKey, surfaceKey, permission }`;
    `PlacedField.createWith`.
  - **Generator:** refuses a `createWith` that names a window no module ships (checked by pointing one at a missing
    window: refused with the file and reference named).
  - **Renderer:**
    - each window keeps a dialog stack outside its forms;
    - a picker offers "+ Add new <label>" when the user holds the permission, and "Open" for the chosen record;
    - an empty picker says "No <label> records yet";
    - a created record is selected.
  - **Windows:** 13 shipped windows name their creating window:
    - product → `catalogue-products`;
    - unit → `catalogue-units`;
    - category → `catalogue-categories`;
    - catalogue → `catalogue-catalogues`;
    - price list → `catalogue-price-lists`;
    - warehouse → `inventory-warehouses`.

    Locations stay without, because they are added under their warehouse.
  - **Pages:** Inventory gives its windows the Catalogue's client.
  - **Tests:** a window-model test checks that the picker gets `createWith` and that the schema needs its permission.
    `e2e/specs/uat-add-new.spec.ts` runs on UAT after deploy.
  - **Checks:**
    - `pnpm build` passes;
    - `pnpm test`: 2,552 passed, 188 skipped;
    - `pnpm verify` passes (known drift; 11 proofs NOT RUN).

### QF1, Playwright status and the owner's Finance question (2026-10-06)

- **Approver user:** `uat.approver@gigalibs.io`, which the owner registered (shared to the session, passed only as
  an environment variable). It was added to GigaLibs Global Enterprise as Tenant Admin with `add-uat-admin.sh`.
- **Playwright on UAT** (passing):
  - starter data 6/6;
  - `uat-approvals` 2/2:
    - price list UAT-USD: uat.admin submits; uat.admin's own approval is refused; uat.approver approves and
      activates; the bolt resolves to 2.40 USD;
    - catalogue UAT-TRADE: built with four products and submitted; uat.approver approves and publishes;
  - `inventory-business-flow`;
  - `uat-preview-modules` 36/36.
- **Earlier failures in those specs were test-side:**
  - no workspace chosen (the UAT logins belong to two workspaces);
  - labels matching several fields ("Code" also matches "Barcode");
  - the persona-filtered side menu.
- **Tour:** `uat-tour-automate-intelligence.spec.ts` (shown to the owner) visits Execution Telemetry, Exceptions,
  Approval Queues, Workflow Studio, Value, Analytics, Explore and Data Contracts with captions. Automate & Run is
  empty because Workflow Studio is not deployed (U29). Analytics is contained until WI-OI-043. Data Contracts needs
  Data Studio (U29).
- **Defects seen:**
  - a version's title showed its catalogue's id (fixed in QF1);
  - "Submitted/Approved by" show user ids (needs a people lookup; open).
- **QF1 checks:**
  - `pnpm build` passes;
  - `pnpm test`: 2,553 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 11 proofs NOT RUN).
- **The owner's Finance question:** "not a single module is working".
  - The Financial Operations service runs in UAT (migration 8, 78 gateway routes, seven proofs). Its areas are the
    general ledger, treasury and bank reconciliation, fixed assets, consolidation, costing, budgeting and close.
  - Its screen was a mock-up, taken down in U7. The missing parts are the Finance metadata windows (U12–U18) and the
    postings from Inventory, Procurement and Orders (U22).


### U12: General ledger on metadata windows (WI-OI-120l, 2026-10-06)

- **Owner decision:** Option A. A manual journal is drafted, submitted and approved by a second person before it
  posts.
- **Finance migration 9** (`000009_finance_journal_drafts`, forward only):
  - `gl_journal_drafts` and `gl_journal_draft_lines`, plus `record_idempotency` for the record routes;
  - forced row-level security and tenant policies on all three;
  - a check that the approver is not the submitter.

  Verified with the real runner, down and up. The schema contract is 9.
- **Finance API:**
  - `journal-drafts.service.ts`:
    - create, edit, add and remove lines;
    - submit: at least two lines, balanced, non-zero, a period that is not locked;
    - approve: not by the submitter. Posts through `postJournal` in the same transaction, with the draft as the
      source document, so it posts exactly once;
    - return to the author with a reason.
  - `finance-records.service.ts`: paged, tenant-bound reads of books, accounts, periods, journals and drafts (with
    their lines), and the book and account pickers.
  - `finance-record-adapters.ts`: the record dispatcher. Each command keeps the permission of Finance's own route:
    - accounts (create, rename; book, code, class, subtype and balance cannot change);
    - periods: open, soft-close and lock (a reason is needed to close or lock);
    - journals: reverse (with a reason);
    - drafts: submit, approve and return.
- **Windows:** five in `modules/financial-operations/dictionary/`:
  - Journal entry (with lines);
  - Posted journals (with lines);
  - Chart of accounts;
  - Periods ("Open" shows only on future or soft-closed periods);
  - Books.

  All pass the window checks, and the gateway serves `records`.
- **Page** (`/finance`):
  - the five window tabs;
  - **Reports:** trial balance, income statement and balance sheet, by book and date, from posted journals only;
  - **Set up a book** (shown with `finance:books:manage`): pick the legal entity from Parties (organizations), then
    the book, its standard fiscal year and an optional 22-account starter chart (no amounts).

  The 2,546-line mock-up with sample figures is gone.
- **Proof:** `scripts/verify-u12-general-ledger.mjs` passes 25/25 through the real module host on an isolated
  database, as a maker and a checker. It covers:
  - set-up: book and twelve open periods;
  - accounts: an If-Match rename, where a stale one gets 412; a code change is refused;
  - pickers;
  - a draft: a line with both sides is refused; an unbalanced submit is refused; a line is removed;
  - submit: a stale submit gets 412; no lines after submit (409);
  - approval: the maker's own is refused (403); a reason is required; the checker approves; a retry replays; a second
    approval is refused (409); one journal is posted;
  - a draft returned with a reason, edited, resubmitted and posted;
  - a locked period: locking needs a reason; no reopen; no new draft in it; a submitted draft in it cannot post;
  - reversal: needs a reason;
  - trial balance and balance sheet balance; net income is correct;
  - permissions: read cannot draft, post cannot approve, approve cannot reverse (403);
  - another tenant gets 404, sees no journals and no picker options, and cannot add lines.

  Registered in `pnpm verify` as "general-ledger (U12)". The proof takes each module's migration version from its
  runtime manifest; `module-manifests --check` keeps the generated file in step.
- **Unit tests:** `finance-record-adapters.test.ts` (7). Every entity, action and picker the five windows name is
  registered. The rules that hold before any database call: fixed account fields, a draft's book, reasons, the 412
  mapping, and permissions.
- **Playwright on UAT:** `e2e/specs/uat-general-ledger.spec.ts`, run with `run-uat-walkthrough.sh --ledger` (also
  in `--all`):
  - creates the party UAT-CO;
  - creates the book UAT-GL from the set-up panel;
  - enters September of 2026 (opening balances, credit sale, stock purchase, rent, payroll, depreciation), each
    drafted and submitted by uat.admin;
  - shows uat.admin's own approval refused, then has uat.approver post each journal;
  - checks the three reports.

  It parses and type-checks. **Not run yet:** it needs the U12 deploy.
- **Checks** (after the `4d4ef4d` deploy, with `infra/compose/generated` regenerated for Finance migration 9):
  - `pnpm build` passes;
  - `pnpm test`: 2,560 passed, 188 skipped;
  - `pnpm verify` passes (known drift; 12 proofs NOT RUN without PROOF_DATABASE_URL).
  - With PROOF_DATABASE_URL (the throwaway server), the five HTTP proofs pass: U2, F0.5, U19a, U7 and U12.
  - The seven older Finance proofs (WI-OI-094 to 118) fail in that mode because they never install the Finance
    schema. Given a database migrated to 9 they all pass, exactly as at 8.
  - Two pre-existing faults in those scripts, unrelated to U12, are proposed for a separate fix:
    - they do not install the schema;
    - `verify-financial-operations.mjs` grants `rls_test_user` only when it creates the role, so its first run on a
      new database fails with "permission denied for schema gigalibs_finance".
- **Noted for later:**
  - amounts are typed in minor units (1250 is 12.50), as in the Catalogue and Inventory windows; a money field in the
    renderer would let people type 12.50;
  - "Submitted by" and "Approved by" show user ids (the people-lookup defect logged in QF1).

### 4d4ef4d deploy: F0.6 and QF1 (2026-10-06)

- **Deploy:** the owner deployed `4d4ef4d` (tag `4d4ef4d3cb4a-654f6f744c72`) at 03:26–03:28Z.
  - Every migration job exited 0; Finance stays at migration 8.
  - Ten services are healthy on the new tag; the 5180 checks answer 200.
  - Connector Hub refuses an unsigned request (401).
  - Backup beforehand: `gigalibs_backup_20261006_023322Z`.
  - Before the deploy, the images were checked to contain none of the uncommitted U12 work (built 02:24–02:33Z,
    before any U12 file was written; no Finance migration 9 or draft services in the module-host image).
- **Playwright on UAT:**
  - `uat-add-new` passes. Inside a new Inventory item, a product is created from its picker, and a unit from the
    product's picker over it; both are selected and the item saves.
  - The spec's last step was wrong: after saving, the window opens the item, so the spec now checks the opened item
    and returns to the list.
- **Screen board** (105 screens, after the app-wide Currency failure is set aside):
  - 38 work;
  - 21 load without data calls;
  - 10 not built (honest notices);
  - 31 broken;
  - 5 crash.

  The broken and crashing screens are modules not running here (AR, Tax, Currency, Spend, Communications, eSign,
  Workflows, Rules; U29) and the Workforce `wfo` routes (U20a).
- **Defect seen:** an Inventory item's page heading is its id (items have no code or name). Logged with the user-id
  defect.

### 7fcc5b1 deploy: U12, and the set-up route fix (2026-10-06)

- **Build and deploy:**
  - images built for `7fcc5b1` (tag `7fcc5b1d77c7-d6bcd4d77799`, 03:53–04:16Z);
  - backup `gigalibs_backup_20261006_041714Z` (labelled `4d4ef4d`, checksum verified);
  - the owner deployed at 04:21–04:25Z. Finance reached migration 9; ten services are healthy on the new tag;
  - all five Finance windows are published for GigaLibs Global Enterprise (signed-in check).
- **Defect found by the UAT walk-through:**
  - the set-up panel created the UAT-GL book, then its fiscal year was refused with "Unsupported Financial
    Operations route": `v1/fiscal-years/standard` was not on the web gateway's allow-list;
  - the HTTP proof called the module host directly, so it could not see the gateway;
  - UAT holds the UAT-GL book without a fiscal year or chart.
- **Fix:**
  - the route is listed in `module.yaml` (POST, `finance:periods:manage`); gateways regenerated;
  - the set-up panel reports the fiscal year and the starter chart separately, so one refusal does not hide the
    other;
  - "Add a fiscal year" can also add any standard accounts a book lacks (by code), so a part-way set-up is completed
    on screen;
  - the U12 proof checks every call against the generated gateway allow-list. Under the `7fcc5b1` list it flags the
    set-up call; it now passes 27/27;
  - the walk-through spec completes a part-way UAT-GL book from the panel.
- **Checks:** `pnpm verify` passes (build, tests, audits, manifests; known drift); U12 proof 27/27.

### 144c010 deploy, and a renderer race found by the ledger walk-through (2026-10-06)

- **Build and deploy:**
  - images built for `144c010` (04:40–05:06Z);
  - backup `gigalibs_backup_20261006_050906Z` (labelled `7fcc5b1`, checksum verified);
  - the owner deployed at 05:09–05:13Z; ten services are healthy on the new tag.
- **Walk-through rerun on UAT** (`uat-general-ledger`):
  - "Add a fiscal year" completed the part-way UAT-GL book (2026 periods and the starter chart), so the gateway
    route fix works on screen.
  - The spec read a journal's status from text that every status dropdown contains, so it skipped every journal.
    Fixed: it reads the Status field's value.
- **Product defect** (shared window renderer):
  - after a line is added, the record is reread in the background;
  - an action clicked before that reread lands carried the old version, and the person who added the line was told
    "Someone else changed this record";
  - seen on "Submit for approval" straight after the fourth line of the opening-balances journal.
- **Fix:** `MetadataWindow` disables the record's Edit button and actions (including an action's reason form) while
  the reread is pending. It applies to every window with child tabs: Catalogue and price-list versions, Inventory
  and Finance.
- **Checks:**
  - `pnpm verify` passes (known drift);
  - the renderer has no unit tests; the regression test is the ledger spec, which submits straight after adding
    lines (to run after deploy).

### WI-OI-120m discovery journey and WI-OI-120n batch 1 (2026-10-06)

- **Journey** (`e2e/specs/journey-tenant-to-value.spec.ts` with `journey-recorder.ts`; `run-uat-walkthrough.sh
  --journey`):
  - a new customer signs up and creates a trial workspace; builds the organization; invites a supervisor, technician,
    approver and auditor, who sign up and accept in their own browsers; assigns module roles; adds workers and links
    logins; runs CMMS from request to closure; the technician clocks in, out and submits a week; the approver approves
    it; the auditor reads but cannot change, and a direct API attempt is refused; modules outside the plan; phone width.
  - At every step it records the calls (data flow), refused or slow calls, page and console errors, technical messages
    and raw codes on screen, covered controls, overflow, unlabelled controls, an axe scan, and data not kept after a
    reload. A blocked step is recorded and the journey carries on. Board: `e2e/test-results/journey/index.html`.
  - Writes only inside the workspace it creates (`journey.<role>.<run>@gigalibs.test`).
- **Runs on UAT before the fixes** (`144c010`): `w9gxgq` (59 steps, 13 blocked) and `w9vlls` (59 steps, 9 blocked;
  journey faults fixed between the runs). Main findings:
  - **Every role but Tenant Admin had no CMMS, Workforce, Geospatial or Organization permission**: the supervisor,
    technician and auditor were refused on every maintenance screen. No custom role could carry those permissions
    either: the tenant permission check accepted only colon codes, and CMMS, Workforce and Geospatial check dotted
    codes, so such permissions were silently dropped from the session.
  - Workers cannot be added ("Add worker" calls WFO routes the gateway answers "Unsupported Workforce route": U20a).
    "Add worker" and Resources are separate worker records; CMMS keeps a third, and its own departments.
  - No screen linked a Workforce person to a login.
  - Modules outside the plan opened by link; every page called Currency, which trial workspaces lack.
  - Accepting an invitation left the person on the workspace chooser; raw codes on screen (TENANT_ADMIN, FLAT_TENANT,
    HUMAN, ACTIVE; an internal "ADR-0003 Phase 6" badge on the dashboard); Attendance refused non-worker administrators.
  - Layout: the side menu's workspace card covers the last menu items on every page; the Softphone button and other
    overlaps. Accessibility: serious colour-contrast failures, unlabelled inputs, a scrollable table without keyboard
    access. ~3.5 s first calls on CMMS and Workforce screens.
  - Not defects (handled in the screens' own words): Settings' "No active configured tenant fields" and Structure's
    "No version is in force yet".
- **Security finding (owner decided 2026-10-06):** the CMMS user import (protected import/export files) wrote
  workspace invitations into `public.tenant_invites` from the CMMS connection, accepted TENANT_ADMIN and returned no
  links. Switched off in batch 1; replaced by WI-OI-120p.
- **Owner decisions (2026-10-06):** worker link by picker now and by email later (WI-OI-120o); module roles rather than
  widening the generic roles (departments stay separate); modules outside the plan hidden and explained; department
  heads assign from an admin-approved list; no seats for now. Access model and bulk, delegated people administration:
  WI-OI-120p (proposed).
- **Batch 1 (WI-OI-120n), implemented:**
  - tenant and manifest permission checks accept dotted module codes (never wildcards or platform codes); a test
    keeps every module role whole in the session;
  - module roles: Maintenance technician, planner and viewer (CMMS) and Workforce member and supervisor, copied into
    a workspace when the module is on and assigned on Settings → Team; CMMS's menu also shows to read-only people;
  - Resources: an optional Login picker when adding a person, and link, change or clear on the person's details;
  - a page gate shows "not in your plan" or "you don't have access" with the menu's own decision (no data calls);
  - Currency is called only when the workspace has it and the person may read it;
  - accepting an invitation enters the workspace;
  - role, status, resource type and dashboard scope shown in words; the internal badge removed;
  - Attendance: a non-worker chooses a person for the week instead of a refusal;
  - the CMMS user import is refused at start and at commit;
  - the disk guard always keeps the images the current `.env` files name (it had removed `5ee536a`'s freshly tagged
    migrations image, which was rebuilt with the same command and checks).
- **Checks:** `pnpm verify` passes (build, tests, audits, manifests; known drift). The navigation test records the CMMS
  lens widening as an intended change. The journey reruns on UAT after deploy. Security review: pending (D7).

### WI-OI-120n batch 1: independent security review and fixes (2026-10-06)

- **Review:** a separate read-only reviewer agent (owner decision: interim independent review for UAT, GPT being
  unavailable), against `144c010..7485aec`. Verdict: **deploy after fixes**. I checked every High and Medium finding
  against the code before fixing.
- **High: login links could be re-pointed by any holder of `workforce.resources.manage`**, which the new Maintenance
  planner and Workforce supervisor roles held. A planner could link their own login to a worker's person, punch as
  that worker, re-link, and approve the week; the approval check compares only the submitter and the current link.
  **Fixed:** setting, changing or clearing a login link needs `workforce.resources.link`, held only through
  `workforce:*` (workspace administrators); every create and update audits the link before and after
  (`modules/gigaops/apps/api/src/resources/workforce-resources.service.ts`).
- **Medium: "own time" roles read everyone's time** (`workforce.time.read`). **Fixed:** removed from Maintenance
  technician and Workforce member; punching gives a person their own time and week.
- **Medium: `workforce.absences.request` acted on anyone's absence**, and approval compared only the requester.
  **Fixed:** removed from technician and member; nobody may decide an absence of the person linked to them
  (`availability.service.ts`).
- **Medium: Maintenance technician can change any work order** (`cmms.work-orders.write`). **Not fixed in batch 1**:
  needs "execute my own" in CMMS (M-CM1). **Accepted by the owner for UAT only, 2026-10-06**; closed before
  production by M-CM1.
- **Low, fixed:** role descriptions state their real reach (whole workspace until roles are held per unit,
  ADR-0034); the manifest check refuses module roles carrying workspace administration (users, roles, invitations,
  settings, billing, configuration, audit, organization); invitation links carry the token after `#` (never sent to a
  server or proxy log; old `?invite=` links still work); the journey asks for its own password for new sign-ups.
- **Low, deferred:** show the workspace name prominently after an accepted invitation switches workspace
  (WI-OI-120p); workspace-membership check on login links (WI-OI-120o); refuse a decision when the decider recorded
  punches in that week (U20a); `workforce.resources.read` lists linked user ids (M-WF1).
- **Correction to the batch 1 evidence:** "no custom role could hold a CMMS or Workforce permission" was inaccurate.
  Custom roles could already hold the wildcards `cmms:*` and `workforce:*`; what was impossible was holding a specific
  dotted permission (for example `cmms.work-orders.read` alone). The reviewer confirmed the wider pattern lets no code
  match more than an exact grant, and that no access decision is made only in the browser.
- **Tests added:** login-link refusals for managers, rename without touching the link, audit before and after
  (`workforce-resources.service.spec.ts`); own-absence refusal (`availability-decisions.spec.ts`); no module role
  carries workspace administration or the login link (`permission-code.test.ts`).
- **Checks:** `pnpm verify` passes (known drift).

### WI-OI-120q (R1): one permission matcher (2026-10-06)

- **Built** (`b7f8a53` images, backup `gigalibs_backup_20261006_091127Z` of the running `7485aec`; handed to the
  owner for deploy). UAT was already on batch 1 (`7485aec`), not `5ee536a` as said earlier in the session.
- **The matcher:** `permissionMatches` / `holdsPermission` in `packages/contracts/src/rbac/permission-match.ts`. A code
  is a family plus one to three parts, colons or dots (both spellings are the same code); a grant covers a code when it
  is `*`, the same code, or the family wildcard. Nothing else: no `all`, no `*:action`, no prefix, no shorter grant
  covering a longer code, no third part read as a scope. 46 table cases.
- **Delegating to it (17 sites):**
  - web `module-access.ts`;
  - renderer `window-model.ts`;
  - the CMMS, Geospatial, Analytics and Workforce guards;
  - Workforce bookings and time;
  - the module SDK guard (`hasModulePermission`) and record dispatcher (`holds`);
  - the control-plane evaluator (`PermissionEvaluator.match`; the rbac-nest guard and SCIM);
  - the Configuration Studio service;
  - the kernel module-call check;
  - Settings → Team;
  - the Configuration Studio workbench;
  - the Catalogue and Finance web.
  The inventory was larger than the card's twelve.
- **Dispatcher defect fixed and tested:** `cmms:*` now covers `cmms.work-orders.read` there
  (`record-dispatcher.test.ts`).
- **Equivalence check:** `pnpm exec tsx scripts/permission-equivalence.mts`. It evaluates 29 roles (6 base roles
  with inheritance and 23 module roles) against 296 permission codes, under each replaced rule and the new one. Codes
  come from manifest gateways, catalogue entries, windows, control-plane and module route decorators, and role grants.
  - **Result: 0 differences.** No shipped role gains or loses anything.
  - `--probe` adds grant sets no shipped role holds. It shows the intended changes and nothing else:
    - `all` and `*:read` stop matching in the control plane and Configuration Studio;
    - both spellings match;
    - another family's wildcard covers its own codes in the CMMS, Geospatial, Workforce bookings and time, and SDK
      guards.
  - A custom role holding only a module wildcard (for example `products:*`) no longer covers other families' codes at
    that module's API (`catalogues:read`, `uoms:manage`, `organization:activate`). Nothing a person can do changes:
    the web gateway (every routed call) and the kernel (`module-call.job.ts:278`, before signing) already refuse them
    with the same rule.
  - The check found three false alarms in its own first runs, each corrected before the result was read:
    - the eSignature guard does honour `esign:*`;
    - module-role grants are not API checks;
    - decorators in module APIs needed scanning.
- **Included by the owner's decision (2026-10-06, "include them"; first left out because each widens access):**
  - **The configuration `DictionaryRenderer`** (exact match only before). Tenant Admins now see 236 and Managers 5
    (`workflows:*`) dictionary-form field permissions they already held through a family wildcard. The equivalence
    check lists exactly these 241 differences; test `dictionary-renderer-permissions.test.tsx`.
  - **The eSignature, Ontology, Saga and Document Scanner guards.** They now honour their family wildcard, for custom
    roles that hold one; no shipped role changes. `@gigalibs/contracts` was added to these four API packages (lockfile
    links only; none of them ships an image).
  - **15 inline checks in 10 web files**, now `holdsAnyPermission`. They are equivalent for the colon codes they
    check.
- **Catalogue:**
  - Module permissions are generated into `packages/contracts/src/rbac/permission-catalogue.generated.ts` (140
    codes, from gateways, catalogue entries, module roles and windows).
  - Control-plane permissions are in `control-plane-permissions.ts` (72 codes). A test fails if any route decorator
    names a code missing from it.
  - Settings → Team lists the catalogue by family instead of 42 fixed codes. Two of those fixed codes are checked
    nowhere (`runs:cancel`, `contracts:update`) and are dropped. A role already holding one shows it under "Checked
    nowhere: remove before saving".
  - Saving a role with an uncatalogued code is refused (`CreateCustomRoleSchema`, `UpdateCustomRoleSchema`).
- **Dependencies:** `@gigalibs/contracts` added to `module-sdk` and `rbac-core` (two lockfile links only; frozen
  install passes).
- **Checks:**
  - `pnpm verify` passes (one known drift; database proofs not run without an isolated database).
  - The dispatcher-backed proofs pass on the isolated proof database (127.0.0.1:55433, never UAT):
    - module host over HTTP: 39/39;
    - Inventory windows: 27/27;
    - Catalogue windows: 27/27;
    - general ledger: 27/27;
    - CMMS screen routes: 56/56.
  - Touched suites: 192 files and 1912 tests pass. New tests: `permission-match.test.ts` (46),
    `permission-catalogue.test.ts` (7), evaluator cases in `rbac.test.ts`, and the dotted-code case in
    `record-dispatcher.test.ts`.
  - Not yet done: the independent Security review, and the journey after deploy.

#### WI-OI-120q (R1): owner decisions, independent Security review and fixes (2026-10-06)

- **Owner, 2026-10-06:**
  - "include them": the three groups left out above;
  - Security review: yes;
  - cards WI-OI-120r, s, t and u: approved.
- **Included:**
  - the configuration `DictionaryRenderer` (Tenant Admin gains 236 field permissions, Manager 5 through
    `workflows:*`; test in `dictionary-renderer-permissions.test.tsx`);
  - the eSignature, Ontology, Saga and Document Scanner guards;
  - 15 inline web checks, now `holdsAnyPermission`.
- **Independent read-only Security review: "ship after fixes".** No widening beyond the intended changes, and no
  shipped role, kernel job or system path loses access at runtime. Findings and what was done:
  - **Medium M1, fixed: the catalogue was incomplete.**
    - It missed module-API decorator codes, `@RequireAnyPermission`, kernel run permissions and checks outside
      decorators: about 72 codes, including `analytics:export`, which the old editor offered.
    - Saving a role would have refused real permissions, and the editor told admins to remove them.
    - **Fix:**
      - one source scanner, `scripts/lib/permission-scan.mjs`, finds codes in decorators, permission-check calls,
        permission keys and `permissions.includes(...)` across module APIs and web, the control plane, packages and
        the web;
      - the generator adds what it finds, so the catalogue now holds 274 module and platform codes plus the
        control-plane list;
      - the drift test uses the same scanner over all source (more than 200 codes, none missing).
    - **Saving:**
      - a new role is still refused an unchecked code;
      - an existing role keeps what it holds, and the update refuses only additions
        (`uncataloguedAdditions`, `tenancy.service.ts` `ROLE_PERMISSION_UNKNOWN`);
      - every catalogue entry is offered in a spelling a role can store (tested).
  - **Low L1, fixed:** the editor shows the whole-area grants a role holds (`cmms:*`), and any held code in another
    spelling or not in the list, so editing never drops them silently.
  - **Low L2, fixed: the matchers the first pass missed now delegate.**
    - AR, Spend and Tax: exact only, not even `*`. Tenant Admins (`ar:*`, `spend:*`, `tax:*`) were refused there
      although the web let them in. They now gain 13, 14 and 12 codes there, and Super Admin likewise.
    - Recovery and Currency (own family; Super Admin gains through `*`).
    - The four configuration adapters' `isAuthorizedForScope`.
    - The module-context guard's `@RequireScopes`.
    - `components/auth/Can.tsx`.
    - None of these five modules ships an image. `@gigalibs/contracts` was added to their API packages (lockfile
      links only).
    - Left as is: the communications route's `includes('*')` super-admin flag, which is equivalent under the rule.
  - **Low L3, fixed in the equivalence script:**
    - a malformed code in a permission position now fails the script;
    - the Analytics and Workforce main guards are modelled with their own wildcard covering every code. A holder of
      only `analytics:*` or `workforce:*` loses `organization:activate` at those APIs. That is harmless: the routes
      are in no gateway, and the kernel requires `organization:activate` before signing.
    - The script's Inventory attribution of `products:create` and `uoms:manage` (Catalogue inline-create codes) is
      noted, not changed.
  - **Low L4, fixed:** publishing a dictionary refuses a field, navigation or action permission that is not a
    permission code (`PERMISSION_INVALID`, `dictionary-capabilities.ts`).
  - **Low L5, fixed:** the unused own/team/all vocabulary is removed (`perm()`, the scope in `PermissionSchema`).
    `PermissionStringSchema` follows the one rule.
  - **Low L6, fixed:** rbac-nest `getUserPermissions` and SCIM filter a member's direct permissions with
    `isTenantPermissionCode`, as the session does.
- **Equivalence check after the fixes:** 29 roles × 296 codes, 325 differences, all intended:
  - the DictionaryRenderer: 241;
  - AR, Spend and Tax for Tenant Admin and Super Admin: 78;
  - Recovery and Currency for Super Admin: 6.
  No losses.
- **Raised by the review, outside R1 (for the owner):**
  - **A member with `users:update` can make anyone a Tenant Admin, themselves included**
    (`tenancy.service.ts` member update). No role creator is checked against what they hold either. Base Managers do
    not hold `users:update`; a custom role can, and the old editor already offered it. This belongs with R4
    (delegation), unless fixed sooner.
  - The Ontology, Saga and Document Scanner guards default to read/write/admin when a verified token carries no
    permissions claim, and in insecure mode. These modules ship no image.
- **Checks after the fixes:**
  - `pnpm verify` passes (one known drift).
  - The five dispatcher-backed proofs pass again on the isolated proof database: 39/39, 27/27, 27/27, 27/27 and
    56/56.
  - Contracts tests: 55, including the catalogue drift and saveability tests. Configuration-core tests: 72,
    including `PERMISSION_INVALID`.
- **Re-check by the same reviewer:** every finding resolved, with one cosmetic leftover in L3 (the Inventory
  attribution, noted). Its suites: 417 tests passed. Verdict: ship after one fix, (a) below.
  - **(a) Medium, fixed:** the scanner made `workforce.resources.link` an ordinary choice in the role editor.
    - The WI-OI-120n High fix relies on it being held only through `workforce:*` (administrators). With punch and
      timesheet approval it reopens "link your own login to a worker, punch as them, approve the week".
    - **Fix:** `NOT_DELEGABLE_PERMISSIONS` in `control-plane-permissions.ts`. It is excluded from the catalogue,
      refused on create, and refused as an update even on a role that held it. `workforce:*` stays assignable as
      the whole area. Tested.
  - (b) The scanner also reads the base-role grant arrays: `comments:create`, `content:read` and `dashboard:read`
    are catalogued although nothing checks them. Harmless; noted.
  - (c) `uncataloguedAdditions` has no spelling trick: one canonical form per code; the check runs inside the locked
    transaction.
  - (d) No shipped role gains more than the script reports. The AR gains cannot happen in practice yet: AR's claim
    check refuses any token containing `*` (before R1).
  - (e) Low, fixed: the drift test scans only folders with a manifest, as the generator does. Generate the
    catalogue from a clean working tree before an image build.
- **Tests after (a):** contracts, tenancy, rbac, module SDK, configuration-core, web and Workforce suites, 1312
  tests passed.

### WI-OI-120r (S1): field rules the server enforces too (2026-10-06, in progress)

- **Engine:** `packages/configuration-core/src/record-rules.ts`.
  - `entityRules` groups each record type's field rules (shown, locked, required, defaults) and validation rules
    across a module's windows.
  - A window's rules count only where it places the field: a child tab's parent link imposes nothing.
  - Conflicting rules for one field, or a validation rule reading two record types, are refused at start-up and in
    `record-rules.baselines.test.ts`. Catalogue, Finance and Inventory have none.
  - `checkRecord` checks a new record or a change as the window does, using the same evaluator:
    - required, always or by rule;
    - locked, always or by rule, on the record as changed;
    - hidden by rule;
    - not writable for this user;
    - ERROR rules refuse; WARNING and INFO are reported.
  - On a change, a field already empty in stored data is required only when the change touches it or makes it
    required, and a validation rule is checked only when the change touches a field it reads. Records saved before a
    rule existed can still be edited.
  - Defaults: fixed, or `{ "$default": "TODAY" | "NOW" | "CURRENT_USER" }`. The tokens are listed in
    `DICTIONARY_EXECUTABLE_CAPABILITIES.defaultTokens`.
- **Server:** `RecordDispatcher` takes `RecordRules` (`shippedRecordRules(moduleKey)` from the module's own windows).
  - On create, it applies defaults for fields the caller left out and may write, then checks.
  - On update, it reads the stored record, then checks.
  - Refusals are `422 RECORD_RULES` with `fields: { key: message }`.
  - Wired into Catalogue, Finance and Inventory; no new dependency.
- **Screen:**
  - `RecordClientError.fields` carries the server's per-field messages, shown under each field.
  - `validateValues` applies only the record type's ERROR rules. Before, every rule of the window applied to every
    form, child records included.
  - `formWarnings` shows WARNING rules without blocking.
  - `newRecordDefaults` fills fixed values, `TODAY` (local date) and `NOW`; the server fills `CURRENT_USER`.
- **Shipped windows** use only fixed required (53 fields) and read-only (83 fields): no conditional rules, validation
  rules or defaults yet. So nothing a tester does today changes, except that a direct API call is now refused what the
  screen prevents. Two Finance adapter tests now expect that earlier refusal.
- **Found:**
  - The Finance account window shows the account code as editable, though Finance refuses changing it (400). The
    window should lock it after creation. That is a window fix, and a check for S16.
  - The Catalogue, Inventory and Finance window generators are not in the repository (S16 brings them in).
- **Checks so far:**
  - `record-rules` tests (17); dispatcher tests (19, 5 new); window tests (16, 4 new).
  - Wide suites: 1552 passed.
  - Proofs on the isolated database with the rebuilt module host: module host 39/39, Inventory 27/27, Catalogue
    27/27, general ledger 28/28. The new check is a direct call without a description answering 422 `RECORD_RULES`
    naming the field and creating nothing.
- **Publish check (after the R1 commit):**
  - `DEFAULT_UNKNOWN` refuses an unknown token.
  - `DEFAULT_TYPE_MISMATCH` refuses a token on the wrong field type, or a fixed value that does not suit the field: a
    boolean, a whole number, a decimal within the scale, a date, a date-time, or one of a value list's values.
  - Tested; every shipped window still publishes.
- **Checks:**
  - `pnpm verify` passes (one known drift).
  - On the fresh build, the isolated proof database passes module host 39/39, Inventory 27/27, Catalogue 27/27,
    general ledger 28/28 and CMMS routes 56/56.
- **Ships in:** the module-host image (Catalogue, Finance, Inventory) and the web image (window form). Both are
  built after the `b7f8a53` deploy.

### WI-OI-120v: only a Tenant Admin grants or changes the Tenant Admin role (2026-10-06)

- **Owner:** "fix now" (found by the R1 Security review; it predates R1).
- **Change:** see `.pi/tasks/WI-OI-120v.md`.
  - `assertTenantAdminAuthority` is applied to member update, invitation, invitation acceptance (the sender must
    still be an active administrator), and SCIM create, change and delete.
  - Settings → Team offers "Tenant Admin" only to administrators.
- **Proof:**
  - Unit tests: 8.
  - SCIM integration on the disposable `wi120d-scim-proof-20261005` database (started for the run, stopped after),
    over real HTTP: 7 of 7, including the new refusal case.
  - tenancy-nest suites: 61 passed.
- **Remaining for R4:** a role creator is not bounded by the permissions they hold.

### WI-OI-120s (S16): the conversion kit (2026-10-06)

- **Template:** `docs/guides/module-conversion-kit.md`. The steps in order: windows from a source; record adapters;
  gateway and pages; roles; registers, journey and proof; later the lifecycle and posting.
- **Window sources in the repository:**
  - The three generators lived only in the session scratch folder. Running the stale Inventory one dropped the F0.6
    "Add new" links from six committed windows; they were restored from git at once, before anything else ran.
  - Ported to Node: `scripts/lib/window-builder.mjs`, plus `modules/{product-catalogue,universal-inventory,
    financial-operations}/dictionary/windows.mjs`.
  - All 19 windows regenerate byte for byte (`node scripts/generate-windows.mjs --check`).
- **Check:** `scripts/verify-module-conversion.mjs`, logic in `scripts/lib/conversion-check.mjs`. It loads each
  converted module's built dispatcher (`RecordDispatcher.describe()`, new) and refuses:
  - windows that do not compile, or have conflicting rules;
  - a shown field the adapter does not declare, or one editable in the window that the adapter refuses;
  - an unregistered tab record type;
  - an unregistered action, or one with mismatched permissions;
  - an unserved lookup;
  - a window on a route that is not a module page, or a gateway without record routes;
  - a window permission no module role grants.
  Tested with a valid fixture and one broken copy per failure (`conversion-check.test.ts`, 9 tests).
- **Results:** Catalogue and Inventory pass. Finance passes with one listed finding: **no module role grants
  `finance:journals:approve`**, so only a Tenant Admin, or a custom role, can approve journals. That is the owner's
  decision (add a Finance approver role).
- **Checks:** `pnpm verify` passes, including the new steps "module windows (S16)" and "module conversions (S16)".
- **Owner, 2026-10-06: "add approver role".** Finance gains the module role **Journal Approver** (`journal-approver`):
  - it holds `finance:read`, `finance:journals:approve` and `finance:reports:view`, so it can approve and post, or
    return, journals someone else submitted;
  - it cannot draft, submit or post one itself; approving one's own journal stays refused by Finance.
  - The `KNOWN` entry is removed, and the conversion check passes all three modules with nothing listed.
  - The equivalence check grows by one code; its one new difference is the already-approved DictionaryRenderer case
    for Tenant Admin.
  - Like every module role, it becomes assignable in workspaces entitled to Finance the next time roles are listed;
    nobody gets it automatically.
- **Checks:**
  - `pnpm verify` passes.
  - A first run made during the owner's deploy timed out one Workforce test (`pay.rules.spec.ts`, 5 s, under load).
    It passed 3 of 3 alone, and the full rerun passes.

### b7f8a53 deploy (2026-10-06)

- Deployed by the owner at about 12:27Z, after the fresh backup `gigalibs_backup_20261006_122530Z` of `7485aec`.
- Read-only check:
  - all nine services run `b7f8a533f0b7-005b390612a5`, and every UAT container reports healthy;
  - `/login` answers 200;
  - the module migrations exited 0;
  - no error lines in the new containers' logs (the matches were route names containing "exception").
- Live: the WI-OI-120n security fixes (admin-only login links, narrower module roles, another manager decides one's
  own absence), ADR-0034 and ADR-0006 accepted.
- Next on UAT: one release with R1, S1, WI-OI-120v, S16 and the Journal Approver role.

### U12 ledger walk-through on UAT (b7f8a53), and a walk-through race (2026-10-06)

- **Passes:** `e2e/run-uat-walkthrough.sh --ledger`, 1 passed in 28 s. The six September journals are each posted
  once (checked read-only in `gigalibs_finance.gl_journal_drafts`), and the reports read from posted journals. U12
  is accepted on UAT.
- **The walk-through had a race; it is fixed.**
  - It searched the Journal entry list and decided after a fixed half-second pause. Twice the search had not
    answered yet, so it read "none" and drafted the same journal again. The approver then opened the empty duplicate
    and skipped it.
  - Two reruns while diagnosing added more duplicates. None was posted: the ledger and reports are unaffected.
  - **Fix (`e2e/specs/uat-general-ledger.spec.ts`):**
    - decisions (create, complete, approve) come from the records API the list itself calls;
    - the screen opens a draft only once the list shows the row with that description and status;
    - the approver never approves a journal that is already posted, so a duplicate can never post twice.
- **Left on UAT, five unposted duplicate drafts:**
  - office rent: one submitted, one draft;
  - opening balances: one submitted;
  - depreciation: two drafts.
  Not removed: removing them is a write to UAT and waits for the owner.
- **UX finding:** a search with no match shows "No records yet. Use New to create the first one". It should say that
  nothing matches the search. For the window polish card.
- **Owner clean-up, 2026-10-06 ("clean up"):**
  - Backup `gigalibs_backup_20261006_130635Z` taken first.
  - The owner ran the five-draft clean-up script, in one transaction refusing anything but the exact five unposted
    drafts with six lines: `INSERT 0 5` audit entries `JOURNAL_DRAFT_REMOVED` (actor `owner-cleanup`, with the
    reason and the backup name), `DELETE 6` lines, `DELETE 5` drafts, `COMMIT`.
  - Read-only check: six September drafts remain, each posted; no orphaned lines; six posted journals in the ledger.
- **Build of the next release** (`f330d32a4a65-c5601b2ae070`) started 13:07Z: R1, S1, WI-OI-120v, S16, the Journal
  Approver role and the walk-through fix.
- **Release `f330d32a4a65-c5601b2ae070` built**, all nine images.
  - **Disk:** the disk guard refused the module images at 57 GB free (minimum 60).
  - **Owner, 2026-10-06:** "remove 7485aec, and if still short use 50 GB for this build". The nine `7485aec`
    images were removed (no container used them; `b7f8a53`, running, stays as the rollback). Module images then
    passed the guard. Workforce, Geospatial and module host ran with `GIGALIBS_MIN_FREE_GB=50`.
  - **Content check:** each image holds this release's code (`holdsPermission` in Workforce and Geospatial,
    `TENANT_ADMIN_ONLY` in the control plane, `shippedRecordRules` in the module host, `holdsAnyPermission` in the
    web).
  - Backup `gigalibs_backup_20261006_133904Z` of the running `b7f8a53` taken; deploy files name `f330d32`. Handed to
    the owner.

### f330d32 deploy, walk-throughs and journey (2026-10-06)

- **Deployed by the owner** at 14:01–14:02Z (backup `gigalibs_backup_20261006_133904Z` first).
  - Migrations: nothing pending.
  - All nine services healthy on `f330d32a4a65-c5601b2ae070`; `/api/health/ready` 200; Connector Hub refuses
    unsigned requests (401).
  - Read-only check: no error lines in the new logs.
- **Ledger walk-through on f330d32:** passes in 13 s, with the S1 field rules now enforced by the server.
- **Tenant-to-value journey (owner's password, environment only).** The first two runs found two faults in the
  journey itself, not the product:
  - **Invitations:** it chose the invitation role by label using the role code (`MANAGER`). Since WI-OI-120n the
    labels are words ("Manager"), so no invitation was sent, and every later people step failed for want of members.
    Fixed: it chooses by the option's value, the code.
  - **Acceptance:** it read the address straight after accepting, while the person was being taken into the
    workspace (WI-OI-120n), and then waited for a chooser button that never appears. The screenshot shows the
    invitee in the workspace as Manager. Fixed: it waits for whichever happens first.
  - **Remaining product findings,** each owned by a planned card:
    - `/wfo/workers` answers 404 (U20a, WI-OI-120u);
    - no maintenance request screen (M-CM1, WI-OI-120t);
    - the auditor's work-order screen calls Geospatial and is refused without its entitlement (T3);
    - the administrator, not being a Workforce person, is refused the timesheet preview (an expected answer for the
      recorder).

### WI-OI-120w (R2) slice 1: the model and the move (2026-10-06, in progress)

- **Migration `20261006000000_member_role_assignments`:**
  - creates `member_role_assignments` (role at a scope; `MEMBER`, `WORKSPACE`, `UNITS` or `PLACES`; granted and
    revoked, never edited; checks on scope, reason and revocation; one live assignment of a role at a scope);
  - adds `custom_roles_tenantId_id_key` for the same-tenant foreign key;
  - **the move:** each `customRoleId` becomes one `MEMBER` assignment, with an id derived from the membership and
    the role.
  - Applied on the isolated `r2_proof` database after every earlier migration, with seeded members: three
    assignments for the three members with a custom role, none for the member without, and the second workspace
    kept apart.
- **Readers moved to assignments:**
  - the session (`auth.service.ts`: permissions and role names);
  - the control-plane guard (`rbac.service.ts`);
  - SCIM's actor check.
  All three go through `memberScopeRoles` (`packages/rbac-nest`), which reads only live `MEMBER` assignments and
  tenant codes.
- **Writer:** the member update (Settings → Team) revokes the old assignment, with who and why, grants the new one,
  and keeps `customRoleId` in step, so the previous release reads the same role on rollback.
- **Reconciliation report** (`scripts/verify-r2-assignments.mjs`, read-only): on `r2_proof`, 4 members, 3 with a
  custom role, 0 differences. A deliberately revoked assignment shows as 1 difference, then 0 once restored.
- **Tests:**
  - unit: session roles from several assignments; mocks updated (`session-permissions.spec.ts`,
    `scim.controller.test.ts`). Packages and control plane: 298 passed.
  - real PostgreSQL: `member-role-assignments.integration.test.ts` (4: grant, change, clear with history, a deleted
    role removes its assignments);
  - the SCIM integration suite on its disposable database with the migration applied (7 of 7, through the guard
    that now reads assignments).
- **Journey, made reliable (owner's password, environment only; each run creates its own workspace).**
  Further journey faults, found by reading each failing step's screenshot and call log:
  - **Accepting an invitation:** the chooser shows the workspace for a moment while the person is taken in; the
    journey now waits for the move.
  - **A pinned form:** "the first form not yet seen" moved to another form; the opened form is now pinned with its
    own marker.
  - **Styled checkboxes:** they are buttons with the checkbox role beside a hidden input that takes no clicks; they
    are now found by role.
  - **Parent types:** a unit type's parents are checkboxes labelled with the parent's code (an Area under `SITE`).
  - **The primary tree** is created in one step with no form.
  - **A reload returns Settings to its first tab;** the journey now looks again on the right tab before calling
    data lost.
- **Run `wt03e0` on f330d32:** 71 steps, 7 blockers (from 15). Every blocker is a known product gap owned by a card:
  - `/wfo/workers` 404, and so clock-in, the week and its approval (U20a, M-WF1, M-WF2);
  - no maintenance request screen, no technician labour, no supervisor close (M-CM1).
  New product findings:
  - **Structure:** the draft's Submit answers 400 "Request validation failed" (the screen does not ask for what the
    server requires);
  - **Settings:** a reload loses the tab (UX).
- **R2 slice 1 checks:**
  - `MemberRoleAssignment` classified as a core model (`config/package-layers.json`); it was refused as
    unclassified by the layer audit;
  - the privacy inventory lists it as `EXPORT`;
  - `pnpm verify` passes (one known drift).

#### WI-OI-120w slice 1: independent Security review and fixes (2026-10-06)

- **Owner:** "yes for security". The read-only reviewer read commit `c6e96e2`: **ship after fixes**.
  - No defect in the access logic.
  - The session, the guard and SCIM give the same permissions and role names as before for every well-formed
    member.
  - Tenant isolation is enforced by the database (composite keys) and by every query.
  - Reserved scopes are ignored fail-safe.
- **UAT pre-flight, read-only:**
  - 0 custom roles pointing at another workspace, so the migration cannot fail on UAT;
  - 28 members with a custom role;
  - no custom role named like a built-in role. The 8 near-matches are the module role "Workforce member" in journey
    workspaces, a persona word, not privileged, held by no one.
- **Fixed:**
  - **Medium M1, a removed role coming back.** A role removed through an earlier release (deploy window or
    rollback) would have come back on roll-forward.
    - New forward migration `20261006010000_member_role_assignments_follow_column`: a trigger on
      `tenant_members.customRoleId` keeps the member's `MEMBER` assignment in step whoever writes the column. The
      new release passes the actor and reason as transaction settings; an earlier release is recorded as
      `system:customRoleId`. A one-time alignment runs too.
    - The member update now hands the change to the trigger.
    - Real-database test: a column write that skips the service is followed, and the removed role stays removed.
  - **High P1, older than this commit: a custom role's name passed for a built-in role.**
    - The risk: a role named "tenant_admin" gave tenant-wide organization and place scope and the Tenant Admin
      persona. If named exactly `TENANT_ADMIN`, it also gave CMMS historical import.
    - Fixed: `RESERVED_ROLE_NAMES` / `isReservedRoleName` (contracts). Saving a custom role with a reserved name is
      refused, on create and update. The session leaves reserved names out of its role list, and organization and
      place scope are decided from the base role and platform roles only.
    - Tests: names refused in every spelling; the session ignores a legacy role named `TENANT_ADMIN`; a member stays
      scoped to their places.
  - **Low L1, history lost on delete.** Deleting a role, or SCIM deleting a member, now records the assignments in
    the audit entry before they cascade.
  - **Low L3, reasons counted differently.** The reason is counted in characters, as the database counts it.
  - **Low L4, explicit scopes.** `CHECK (scope = 'MEMBER')` until slice 2.
  - **Low L5, test gaps.** Unit tests for `RbacService.getUserPermissions` with assignments.
  - **Low L2, cross-tenant roles.** Pre-flight query run on UAT: 0.
- **Checks:**
  - suites 455 passed;
  - real PostgreSQL: assignments integration 6 of 6, SCIM integration 7 of 7;
  - reconciliation 0 differences;
  - `pnpm verify` passes.
- **Revocation note (ADR-0034 §4):** a role change takes effect on the next control-plane request and within
  300 s in modules, unchanged. The session-version bump comes with slice 2.
- **Re-check by the same reviewer: "ship".** Every finding is resolved and no fix introduced a problem.
  - The trigger covers writes before, between and after the two migrations, from any release.
  - The reserved-name filter changes only persona and sidebar for names it was meant to stop; no lockout. None of
    the 24 module role names is reserved; a test now guards that.
  - **Notes for later:**
    - personas still read non-reserved custom role names (navigation only; card R16 derives personas from
      assignments);
    - set `search_path` on the trigger function when slice 2 replaces it;
    - slice 2 must replace the trigger and the `MEMBER`-only check before members hold several roles;
    - run the cross-tenant pre-flight query on production before deploying there.
- **Release `2323b99860ac-dd5f6baf396c` built** (R2 slice 1 and its review fixes).
  - `build-images` passed with the owner's `GIGALIBS_MIN_FREE_GB=50` (57 GiB free); the module images passed the
    guard normally.
  - The images hold `memberScopeRoles` and `isReservedRoleName` (control plane); both migrations are in the
    control-plane migrations image.
  - Backup `gigalibs_backup_20261006_160704Z` of the running `f330d32`.
  - UAT pre-flight: 0 cross-tenant custom roles; 28 members with a custom role.
  - Handed to the owner. After deploy: the read-only reconciliation on UAT (each of the 28 roles moved, no access
    changed).

#### WI-OI-120w slice 2a: several roles per person (2026-10-06, owner "approved 2a")

- **Migration `20261006020000_member_role_assignments_several`:**
  - the trigger now revokes only the role the column named and grants the one it names; the member's other roles
    stay;
  - `search_path` is set on the function (review note);
  - explicit scopes stay refused until slice 2b.
- **API:**
  - `POST current/members/:memberId/role-assignments` and `…/:assignmentId/revoke`, both `roles:assign` (a new
    control-plane permission, catalogued; Tenant Admins hold it through `roles:*`);
  - the member list returns each member's live roles, oldest first.
  - Refused: a role of another workspace (400); a role already held (409); changing one's own roles unless a Tenant
    Admin (403 `ROLE_SELF_ASSIGNMENT`). Bounds on what an assigner may grant come with R4.
  - The old path was still open in 060d3cb: anyone with `users:update` could set their own role through the member
    update. The review fixes close it (M2 below).
  - Each change is audited (`member_role_assignment`, with reason). `customRoleId` follows the oldest live role, for
    display and for an earlier release.
- **Settings → Team:** each member's roles are tags with a remove button, plus "Add a role", a reason and "Add role".
  The single custom-role picker is gone.
- **Journey:** the technician receives Maintenance technician and Workforce member through the new cell. It runs
  after this slice is deployed.
- **Checks:**
  - real PostgreSQL: the several-roles suite 5 of 5, the slice 1 suite 6 of 6 (run one after the other);
  - `pnpm test`: 318 files and 2739 tests passed (28 files skipped);
  - `pnpm verify`: build and every audit pass. The deployment profile shows only the known `WORKFORCE_API_URL`
    drift, and the 12 proof steps need `PROOF_DATABASE_URL`.
  - The first verify flagged 7 hard-coded colours in the new roles cell; they are now `ui-*` tokens.
  - The second verify's test step failed on five timeouts with swap nearly full (12.7 of 13.3 GB) and no failed
    assertion. All five files pass alone, together, and in the full rerun above.
  - control plane and web typecheck.
- **When a change applies:** control-plane checks read live assignments on every request. A signed module context
  keeps the roles it was signed with for at most 300 s. Bumping the session version stays in slice 2b.

##### Security review of 060d3cb (owner "yes for security")

**Verdict: "ship after fixes".** No Critical or High findings. Fixed in the working tree:

- **M1, new in 060d3cb:**
  - **Finding:** someone holding `roles:assign` could add roles to, or take them from, a Tenant Admin, getting
    around WI-OI-120v.
  - **Fix:** the role-change endpoints now apply `assertTenantAdminAuthority` (touches an admin).
  - **Test:** a Manager holding the assigner role gets 403 on both endpoints.
- **M2, predates 060d3cb:**
  - **Finding:** the member update still accepted `customRoleId`, so `users:update` alone gave roles, including to
    oneself.
  - **Fix:** the contract refuses any `customRoleId` on the member update, and the service no longer writes the
    column. Roles change only through role assignments (`roles:assign`).
  - **Also closes L1:** a later change no longer silently revokes a role the old path added.
- **L2:**
  - **Finding:** a role held only as someone's second role showed "0 members" and could be deleted.
  - **Fix:** the role list counts live assignments, and deletion is refused while any are live.
- **L3:**
  - **Finding:** every member could read the reasons and grantors of role assignments.
  - **Fix:** the member list returns neither; both stay in the audit log.
- **Info:**
  - reasons are counted in characters, and an out-of-range reason is refused (400) rather than replaced;
  - a serialization conflict or a duplicate is 409 `ROLES_CHANGED`, not 500.
- **Left open for the owner:** M3, bounds on what an assigner may grant (card R4). Two holders of `roles:assign`, or
  one holder with an invited second address, can give each other a role carrying `roles:*`, and so reach every
  catalogued permission. They never reach Tenant Admin. This is no worse than `users:update` was before. The cheap
  interim rule is: a non-admin may grant only a role whose every permission they hold.
- **Not changed:** `search_path` is `public` without `pg_temp`. The reviewer judged it harmless, because the
  function is not SECURITY DEFINER.
- **Checks after the fixes:**
  - r2_proof: the several-roles suite 8 of 8 and the slice 1 suite 6 of 6;
  - contracts tenancy tests: 80;
  - affected suites: 111 files and 1137 tests;
  - control plane and web typecheck; design-tokens audit.
- **Re-check of the fixes: "ship".**
  - Every fix was verified in code. In this release the only runtime writer of `customRoleId` is
    `followOldestRole`: SCIM, OIDC sign-up, platform administration, tenant creation and invite acceptance do not
    set it.
  - r2_proof suites: 14 of 14; contracts and authority tests: 10 of 10.
  - `pnpm verify` on the fixes: PASS for every step that ran (build, tests, all audits, S16). Only the known
    `WORKFORCE_API_URL` drift shows; the 12 proof steps need `PROOF_DATABASE_URL`.
- **Deploy and rollback notes (reviewer, Info):**
  - While 2323b99 still serves, or after a rollback to it, its member update can write the column. A later role
    change then revokes that role without its own audit-log row.
  - After a rollback to 2323b99, Settings → Team shows only each member's oldest role. Their other roles still grant
    access and cannot be removed there; they need a forward fix, or an owner-run revoke.
  - Role holder counts are live assignments. They equal distinct members while only `MEMBER` scope exists; revisit
    in 2b.
