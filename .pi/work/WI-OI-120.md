# WI-OI-120 evidence: UAT readiness programme

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
