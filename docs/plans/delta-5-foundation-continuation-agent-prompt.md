# GigaLibs Delta 5 continuation and end-to-end closure agent prompt

Status: Continuation prompt updated from the measured local state on 2026-09-24  
Current authority: no G4 Build item is active; `WI-OI-042` and `WI-OI-047` are in Review  
Deployment boundary: Local Development only; no production, cloud, HA or release claim

Copy the complete prompt below into the implementing agent. Do not remove the current-state facts, gates,
stop conditions or evidence requirements.

---

## BEGIN IMPLEMENTATION PROMPT

**Review continuation checkpoint — 2026-09-24:** The Product Owner/Solution Architecture/Local Operator
accepted WI-OI-047 for the bounded local profile subject to the recorded independent decisions and
credential-rotation condition. Security pre-review records zero secret findings in the three exact images.
Backend/Data exact-image verification passed an empty-database replay of all 37 migrations and a
representative 35→37 upgrade, including state preservation, tenant-safe Department relationships and
idempotency, while identifying a P1 `departments.updatedAt` canonical-schema mismatch. Chinni babu
Rayapudo then authorized WI-OI-042 as the sole bounded G4 item for the exact correction and replacement
certification. That work is technically complete: the canonical field now declares
`@default(now()) @updatedAt @db.Timestamptz(3)`, applied migrations remain byte-identical, the live
database was not targeted, and replacement clean replay and representative upgrade both match the
canonical physical schema. Tenant-isolation, runtime, clean-target restore and exact-image
vulnerability/secret checks pass for the bounded profile. Read
`docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md` and its linked immutable evidence
before acting. WI-OI-042 has returned to `Review`; WI-OI-047 remains `Review`, WI-OI-046 remains
`Proposed`, and no G4 Build item is active. Independent Backend/Data review remains required before
acceptance.

**TP-1 pre-Build refresh — 2026-09-24:** all 15 proposed WI-OI-046 candidate files remain byte-identical
to the September 23 checkpoint. The refreshed focused baseline passes both package builds, 87 tests across
17 files, workflow typecheck and the Configuration contract, Local Development profile, observability and
SDLC audits. Read `docs/audits/2026-09-24-wi-oi-046-prebuild-collision-audit.md` and
`docs/audits/2026-09-24-wi-oi-046-focused-prebuild-baseline.md`. This completes agent-executable
preparation only; WI-OI-046 remains Proposed until the named independent specialist decisions and an
explicit Ready/sole-Build transition are recorded. The consolidated role-specific human handoff is
`docs/reviews/WI-OI-046-independent-specialist-decision-request-2026-09-24.md`.

**Superseding checkpoint — 2026-09-23:** WI-OI-047 completed its authorized supply-chain remediation and
returned to `Review`; no G4 Build item is active. The exact migrations/API/web images recorded in
`infra/compose/evidence/phase-a-20260923T180053Z/` are distroless, run as `65532:65532`, and pass a Trivy
0.74.0 policy of zero Critical and zero High findings. The affected F2 runtime, dependency-outage and fresh
checksum-bound clean-target restore verification also pass. Repository-wide Analytics/CMMS/quarantine
gates, credential-owner rotation evidence, manual accessibility and named independent reviews remain
open. This is not Acceptance or production/cloud authority. WI-OI-046 remains `Proposed`. Read
`docs/audits/2026-09-23-wi-oi-047-local-technical-closure.md` and
`infra/compose/evidence/phase-a-20260923T180053Z/phase-a-closure.json` before acting. Do not rerun Phase A
or start Phase B product code merely because the historical execution instructions remain below. The next
authorized action is named review and routing of recorded failures. Phase B agent preparation is also
complete: use `docs/reviews/WI-OI-046-g3-decision-request-2026-09-23.md`,
`docs/audits/2026-09-23-wi-oi-046-prebuild-collision-audit.md` and
`docs/plans/WI-OI-046-tp1-verification-plan.md`. Helm/cloud/customer-managed changes are excluded from the
current local TP-1 scope.

You are continuing an in-progress GigaLibs repository. You are not starting from a clean checkout and you
are not authorized to redesign the platform. Work from the repository's actual state, preserve all
unrelated changes and finish one bounded work item at a time.

Your objective is to complete the remaining Delta 5 foundation sequence with real local infrastructure and
truthful evidence, then hand off the source-agnostic Analytics business vertical slice. Do not treat a build,
unit test, screenshot, HTTP 200, package name or agent statement as production certification.

### 1. Non-negotiable operating rules

1. Work in `/Users/rayapudi/dev/gigalibs`.
2. Read `AGENTS.md` first and obey it.
3. Use the `sdlc_orchestrator` responsibility, represented in this repository by
   `.pi/agents/agile_delivery_orchestrator/AGENT.md`, for every state transition and behavior-changing
   handoff.
4. Read these files in this order before changing behavior:
   1. `.pi/PLAN.md`
   2. `.pi/WORK_ITEMS.md`
   3. `docs/REQUIREMENTS_BASELINE.md`
   4. `docs/SDLC_DEVELOPMENT_GUIDE.md`
   5. `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`
   6. the applicable `.pi/agents/*/AGENT.md` files
   7. the relevant work item, ADRs, contracts, migrations, acceptance plan and runbooks
5. Canonical status is `.pi/WORK_ITEMS.md`; chat text never changes a gate.
6. Never have more than one G4 Build item in `activeImplementationWorkItems`.
7. Never perform behavior changes without a stable `WI-OI-NNN` that is `Ready` or `In Progress` and is the
   sole active Build item.
8. Never invent, infer or write a human approval. Agents may record a human's exact supplied decision and
   may issue a technical recommendation only.
9. Chinni babu Rayapudo is the Product Owner, Solution Architecture reviewer and local operator. That does
   not replace required independent Security, Backend/Data, Web/Accessibility or QA/SDET review.
10. Use targeted `rg`, `sed`, `git diff -- <path>` and focused tests. Do not repeatedly scan or rewrite the
    whole repository.
11. Use `apply_patch` for hand edits. Do not overwrite dirty files wholesale.
12. Do not reset, checkout, clean, delete or reformat unrelated user changes.
13. Do not run `git reset --hard`, `git checkout --`, broad `git clean`, recursive deletion, volume prune or
    system-wide Docker prune.
14. Do not commit, push, open a pull request, deploy externally or contact a provider unless the user
    explicitly requests that action.
15. Never print `.env` contents, passwords, tokens, signing keys, OAuth secrets, database credentials or
    private material. It is acceptable to report only whether a classified value is present or absent.
16. Never place `.env`, `.env.*`, credentials, Git metadata, private keys, test evidence or repository
    secrets in an image.
17. Never use a default tenant, caller-supplied tenant authority, production-reachable fixture, silent data
    fallback, fake provider result, fake health response or local/in-memory business source of truth.
18. Use PostgreSQL as authoritative persistence. Redis/`NOTIFY` may wake work but may not be the only record
    of a promised outcome.
19. Preserve the existing Configuration Studio compiler/lifecycle. Do not build a second metadata engine,
    generic CRUD gateway or universal SQL/query gateway.
20. Do not make AR, CMMS or another domain a prerequisite for Analytics. Analytics is external-source and
    source-agnostic.
21. External cloud infrastructure is not selected. HostingRaja and DigitalOcean are candidates only.
    Mark cloud, public DNS/TLS, external KMS, external object storage, remote registry, HA, external alert
    delivery, cross-host PITR and production observation as `DEFERRED_EXTERNAL`, never `PASS`.
22. If a mandatory check fails, record the exact failure. Do not weaken, skip, delete or rewrite the check
    merely to obtain green output.
23. If a failure belongs to another work item, do not fix it inside the active item. Route it through the
    Orchestrator, preserve evidence and continue only where the current gate permits.
24. Stop immediately for cross-tenant access, credential exposure, data corruption/loss, unsafe migration,
    production-reachable fake success or an unowned P0/P1 defect.

### 2. Product and architecture truth

The Delta 5 program converges five shared foundations around one real Tenant Profile reference journey:

1. governed metadata and code-owned module adapters;
2. durable asynchronous jobs;
3. transactional events and durable consumer receipts;
4. tenant-aware connection/binding governance; and
5. transaction-coupled audit evidence.

The first adopter is the existing Tenant Profile extension. Its target journey is:

1. an entitled Tenant Administrator activates an approved optional field;
2. an authorized user saves a real value in PostgreSQL;
3. a signed tenant export contains the governed value;
4. job, event, artifact, binding and audit evidence reconstruct the journey; and
5. a second tenant cannot observe or affect any identifier, value, manifest, cache, job, event, artifact,
   database state or audit record belonging to the first tenant.

This journey does not depend on AR, Analytics or CMMS. The external-source Analytics Studio remains a
separate business module and work item.

### 3. Protected code: verify before and after every slice

The paused CMMS import/export work must remain byte-for-byte unchanged until a later work item explicitly
resumes it. Before doing anything and at every handoff, run:

```text
shasum -a 256 \
  modules/physical-operations-cmms/apps/api/src/import-export/column-registry.ts \
  modules/physical-operations-cmms/apps/api/src/import-export/row-validator.ts \
  modules/physical-operations-cmms/apps/api/src/import-export/import-job.service.ts \
  modules/physical-operations-cmms/apps/api/src/import-export/types.ts \
  modules/physical-operations-cmms/db/migrations/000007_import_export_jobs.up.sql \
  modules/physical-operations-cmms/db/migrations/000008_custom_attributes.up.sql \
  modules/physical-operations-cmms/db/migrations/000009_column_alias_maps.up.sql
```

The required hashes, in the same order, are:

```text
0c60be762ba00ebe003300fd99554bda59331ce563daf2284eb118dff713e978
7fc1d71ec04d41027641a2d4f86ceea3de5897f228774d4bf4fdd5528c6f1ef1
7f67627b2e0f90d339fff52ba924a180f3a419bb829f308fbac392f416507567
baa6e407f0d2786cb85a61a35b37ddcfe0ae629aa06eec4cfc71c5acce30e621
71f9d2aff51de4cf71813a8cab13281d83a80a2eed475a09ec8a44493cf0afeb
959796b7568eb2abd6301cee92097551f8bf8717b5cdd413b15acae5da563eff
c8be29955b622b4fb9c3d5e4178f1443086f2dbfd329a3b06d9ba3a9adbd4825
```

If any hash differs, stop. Report the exact path and old/new hash. Do not restore or edit it without user
direction.

### 4. Exact continuation state

Treat this as a checkpoint to verify, not as a claim to repeat blindly:

- Image-build Git revision: `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6`.
- Image-build source-state SHA-256:
  `5b26b49527760b9aa6448810dea9a73b49ccf499069f01ad81e58a8b6250898e`.
- Final tag suffix: `5abfa667bb10-5b26b4952776`.
- Exact final image IDs are:
  - migrations: `sha256:5742649e57f5586c295dbd1dc381d975c713266a9673b57854dfb6e967e59f83`
  - API: `sha256:d34b1dfbeb0b5409f9420c09da723905586e543b0d1d4ed4a56a61b22b753aee`
  - web: `sha256:495a0553bbf3e35e52006eb67991a2f856d4a054e18957aa81c93775ad545a12`
- A checksum-recorded backup exists at
  `infra/compose/backups/gigalibs_backup_20260923_104850Z.dump`; preserve it.
- The database has 37 applied migrations. `restore-final.json` proves a clean disposable-target restore,
  32 active activations and preservation of the authoritative checksum set; the target was removed.
- No remote image was pushed.

Security history that must remain visible:

- An earlier image generation accidentally included nested repository `.env` files, including a web
  `.env.local` containing nonempty ACS/Twilio settings.
- The affected images were deleted locally and build cache was pruned; `.dockerignore`, the Dockerfile and
  the build script now recursively exclude/reject `.env*` files.
- The clean replacement images passed an independent filesystem scan.
- The credential owner must rotate the affected ACS/Twilio credentials before any external use. An agent
  must not rotate external credentials or claim rotation without account authority and evidence.

Measured local evidence against the exact final images:

- real registration and two tenant selections: PASS;
- authenticated surface discovery: PASS, four surfaces;
- distinct maker/checker submit, self-approval denial, approval, publish and explicit-scope activation:
  PASS;
- published manifest checksum persistence across API/web restart: PASS;
- cross-tenant change-set access denial: PASS;
- live role downgrade and membership suspension denial without service restart: PASS;
- logout revoked the browser session: PASS;
- no Tenant Profile values were written during F2: PASS;
- 250-field supported `custom-form` manifest with 20 required fields and three sections: PASS;
- 100 reads in batches of 10 concurrent reads: p50 `22.653 ms`, p95 `29.349 ms`, p99 `37.667 ms`, maximum
  `39.82 ms`; accepted API budgets were p95 <= 500 ms and p99 <= 1 second;
- PostgreSQL outage: API/web liveness stayed 200, API/web readiness became 503, recovery passed;
- MinIO outage: MinIO was unavailable, the bounded Configuration slice correctly remained ready because
  it has no object-storage operation in F2, then MinIO recovered;
- authenticated live metrics, bounded route labels, invalid-correlation replacement and secret/identity
  non-disclosure: PASS;
- Chromium axe automation: seven scans passed, including roving focus, responsive views, reduced motion,
  no page errors and no HTTP 5xx; manual screen-reader/zoom/high-contrast review remains open;
- focused Configuration/auth/health/containment tests: 21 files and 357 tests passed;
- all accumulated F2 certification users, tenants and memberships: zero active after cleanup.

Known open repository checks:

- Full `pnpm build` currently fails in the existing Analytics package because Jest globals/types and
  `AnalyticsPrincipal` fixtures are inconsistent.
- Full `pnpm test` reported 132 passing files, 14 failing files, 1,171 passing tests and 11 failing tests.
  Failures are in existing Analytics and protected CMMS work. The final focused WI-OI-047 suite passed
  357/357.
- `audit:production-data` and `audit:all-runtime-data` fail on the active web dependency/import of the
  quarantined data-import/export package and a hard-coded localhost Redis default in CMMS. Do not suppress
  these findings or edit protected CMMS files under WI-OI-047.
- Package dependency, API boundary, navigation, SDLC, Configuration contract, deployment-profile and
  static observability audits pass when their checked-in Node programs are run directly.
- Plain `pnpm <script>` may attempt to purge/reinstall the existing shared `node_modules`. Use
  `pnpm --config.verify-deps-before-run=false <script>` to execute the checked-in script without silently
  replacing the workspace install. This is not permission to ignore dependency drift.
- Historical CycloneDX SBOM generation passed through `docker scout sbom`, but the first local Trivy
  0.74.0 exact-image scan failed the zero-Critical/zero-High policy. The replacement
  `phase-a-20260923T180053Z` evidence resolves that condition: all three exact images report zero Critical
  and zero High findings under the pinned Trivy policy. Named Security/Supply-chain review remains open.

### 5. Required execution sequence

Execute the following phases in order. Never implement two phases concurrently. After every phase, update
the canonical work item with evidence, open findings, owner and exact next gate.

## Phase A — recover and technically close F2 / WI-OI-047

**COMPLETED; DO NOT RE-EXECUTE WITHOUT A NEW AUTHORIZATION.** The first closure evidence remains immutable
history. The bounded remediation produced the replacement `phase-a-20260923T180053Z` bundle and returned
WI-OI-047 to Review. Sections A1–A6 below are retained as the executed method and are not current Build
authority.

### A1. Re-establish the factual machine state

1. Run `git status --short`; do not clean it.
2. Run the protected hashes from section 3.
3. Run `node scripts/verify-sdlc-governance.mjs` and confirm the active Build authority recorded for the
   execution; after closure the expected active list is empty.
4. Run `node scripts/compute-source-state-sha256.mjs` and record the result.
5. Check Docker daemon availability, host free space, Docker disk use, existing containers, volumes and
   the three expected final image tags.
6. If Docker Desktop is stopped and cannot be started safely through available tooling, report one precise
   human action: start Docker Desktop. Do not create a parallel database or Docker context.
7. After Docker returns, inspect all containers and volumes before deleting anything.
8. If capacity is insufficient, reclaim only BuildKit/build cache after inspection. Do not prune volumes,
   databases, MinIO data, backups or unrelated images/containers. State exactly what cache was removed.

### A2. Make certification reproducible

Temporary `/private/tmp` scripts were used for discovery. They are not durable repository evidence.

1. If these temporary files still exist, inspect them; do not trust them automatically:
   - `/private/tmp/gigalibs-local-f2-certification.mjs`
   - `/private/tmp/gigalibs-postgres-outage-certification.sh`
   - `/private/tmp/gigalibs-restore-certification.sh`
2. Add minimal, reviewed equivalents under `infra/compose/scripts/`:
   - `verify-local-f2-runtime.mjs`
   - `verify-postgres-outage.sh`
   - `verify-minio-outage.sh`
   - `verify-local-restore.sh`
3. Every verifier must:
   - reject `NODE_ENV=production`;
   - accept only loopback/local endpoints unless an explicit non-production override is supplied;
   - generate random attributable `.invalid` identities and strong ephemeral passwords;
   - print no credential, token, cookie, connection URL or business value;
   - use real PostgreSQL/API/web/MinIO, never a mock;
   - use two tenants and distinct maker/checker identities where applicable;
   - assert cleanup and leave zero active test identities/workspaces/memberships;
   - use a trap/finally block to restore every stopped dependency;
   - fail nonzero on any missing assertion;
   - emit compact JSON containing status, profile, image IDs, timings, outcomes and limitations;
   - write evidence only to an explicit path, never silently rewrite historical evidence.
4. The F2 runtime verifier must test the 250-field supported `custom-form` surface. Do not force 250 fields
   into `tenant-profile-extension`, whose intentional limit is 100.
5. The F2 verifier must not persist Tenant Profile values; F3/TP-1 owns that behavior.
6. Add focused package scripts only if they improve repeatability and do not add a dependency.
7. Add verifier paths to deployment documentation and the WI-OI-047 evidence map.
8. Because these scripts enter the Docker context fingerprint, rerun
   `infra/compose/scripts/refresh-source-identity.sh` after the final product/script changes and before the
   final build. Documentation-only changes must not alter the Docker-context fingerprint.

### A3. Finish final artifacts

1. Verify `infra/compose/.env` is mode `0600`; report only the mode and presence of required keys.
2. Run `node scripts/verify-configuration-local-profile.mjs`.
3. Render Compose using the ignored local env and require `docker compose ... config --quiet` to pass.
4. Build with `bash infra/compose/scripts/build-images.sh`.
5. Record all three final image tags, immutable local IDs, revision label, source-state label and profile
   label.
6. Independently scan each final `/app` filesystem for:
   - `.env` and `.env.*`;
   - `.git`;
   - `*.pem`, `*.key` and obvious credential files;
   - test evidence and package caches that are not required at runtime.
7. Require empty results. Delete/rebuild only the exact affected local image if a prohibited file exists;
   preserve volumes and backups.
8. Inspect final container configuration and require:
   - user `65532:65532` in the pinned distroless runtime;
   - read-only root filesystem;
   - all Linux capabilities dropped;
   - `no-new-privileges:true`;
   - bounded `tmpfs` writable paths;
   - migrations exit code 0.
9. Generate CycloneDX SBOMs for all three exact final images with Trivy 0.74.0. Record file hashes and
   component counts.
10. Scan the same three immutable image IDs with Trivy 0.74.0 and fail closed if any Critical or High
    finding exists, including an unfixed finding. Preserve raw JSON plus the policy summaries.

### A4. Rerun the complete local runtime matrix on the final images

1. Start only the app bundle with the canonical Compose file. Reuse the existing PostgreSQL and MinIO.
2. Verify migration job `Exited (0)`, API healthy and web healthy.
3. Verify API liveness and readiness directly on the mapped API port.
4. Verify web liveness and readiness on port 5180.
5. Verify unauthenticated Configuration BFF routes return 401, not 404 or fabricated empty data.
6. Verify logout succeeds and revokes cookies/session even across safe upstream failure behavior.
7. Run the durable F2 verifier and require all results from section 4 on the final image IDs.
8. Run the PostgreSQL outage verifier and prove liveness/readiness separation plus recovery.
9. Run the MinIO outage verifier. In F2, prove only the non-dependent Configuration journey remains
   available and MinIO itself recovers. Do not claim artifact-operation coverage until TP-2.
10. Run backup and clean-target restore. Verify migration history, required Configuration tables and the
    active manifest checksum, then drop only the explicitly generated disposable restore database.
11. Run authenticated live metrics verification and static dashboard/alert/runbook conformance.
12. Evaluate/fire/resolve local alert rules if the required local Prometheus tooling exists. External
    notification delivery remains `DEFERRED_EXTERNAL`.
13. Run Chromium automated accessibility. If Firefox/WebKit are installed, include them; otherwise record
    the exact browser matrix.
14. Do not call accessibility complete until a human records keyboard-only, focus order, error
    announcements, 200%/400% zoom, high contrast and screen-reader results.
15. Query read-only cleanup counts and require zero active F2 users, tenants and memberships.
16. Recheck protected hashes.

### A5. Run gates without hiding unrelated failures

Run:

```text
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false audit:production-data
pnpm --config.verify-deps-before-run=false audit:all-runtime-data
pnpm --config.verify-deps-before-run=false audit:package-dependencies
pnpm --config.verify-deps-before-run=false audit:api-boundary
pnpm --config.verify-deps-before-run=false audit:navigation
pnpm --config.verify-deps-before-run=false audit:sdlc
pnpm --config.verify-deps-before-run=false audit:configuration-contracts
pnpm --config.verify-deps-before-run=false audit:configuration-deployment-profile
pnpm --config.verify-deps-before-run=false audit:configuration-observability
```

Also run the focused Configuration/auth/health/containment suite.

Rules for failures:

1. Fix only a defect introduced by WI-OI-047 or inside its explicit deployment/profile boundary.
2. Do not modify Analytics or protected CMMS to make WI-OI-047 appear green.
3. Record each unrelated failure with exact owning work item, paths, impact and next action.
4. If a mandatory global gate remains red, WI-OI-047 may be technically ready for independent review but
   may not be marked `Accepted`, `Released` or production-ready.
5. Route Analytics build/test failures to the Analytics owner/work item.
6. Route CMMS/import-export failures to the paused owning item; do not resume protected files implicitly.
7. Route active-web/quarantine dependency findings through a separate bounded remediation decision. The
   options are an authorized promotion under `docs/runtime-quarantine.md` or removal of the active runtime
   dependency. Never add an audit allowlist merely to suppress the finding.

### A6. Freeze F2 evidence truthfully

1. Create a new dated technical closure artifact; do not erase the historical invalid mock-based UAT.
2. Update `.pi/work/WI-OI-047.md` with LOCAL-1 through LOCAL-5 status, exact image IDs, source-state hash,
   test commands/results, SBOM hashes, known failures and external deferrals.
3. Update `.pi/WORK_ITEMS.md` only to the state supported by evidence.
4. Update `docs/reviews/WI-OI-047-human-review-guide.md` with a compact retest checklist and exact local
   URLs.
5. Append or supersede `docs/reviews/WI-OI-047-uat-evidence-2026-09-22.md` explicitly; preserve its old
   invalid finding as historical evidence.
6. Record the prior accidental credential packaging and the required ACS/Twilio rotation as an open
   security action until a human credential owner confirms it.
7. Record cloud/production rows as `DEFERRED_EXTERNAL`.
8. Technical completion may move WI-OI-047 to `Review`. Only named humans may accept it.

F2 exit required before requesting F3 Build:

- all WI-OI-047-scoped local P0/P1 assertions pass on the exact final images;
- durable verifiers and evidence exist;
- no secret is present in images/logs/evidence;
- no active certification data remains;
- known cross-repository failures are routed, not hidden;
- Product/local-operator review is recorded; and
- required independent Security, Backend/Data, Web/Accessibility and QA decisions are recorded or the
  item remains in Review.

## Phase B — authorize F3 / TP-1 through WI-OI-046

Do not write TP-1 product code merely because WI-OI-047 has exited Build. WI-OI-046 remains `Proposed` and
its named-review and explicit sole-Build handoff conditions still apply.

The decision request, fresh candidate hashes/collision audit and proposed QA verification plan are now
complete. Do not regenerate them without a factual drift. Product/Solution Architecture accepted D1–D6
and the recommended SP-01–SP-07 amendments on 2026-09-23. The current action is to collect the remaining
named specialist decisions and WI-OI-047 exit reviews. The specialist pre-review remains a No-Go for G4
until those independent decisions are recorded. If they are missing, stop product implementation.

The exact amendment request and consolidated WI-OI-047-exit/WI-OI-046-entry human record now exist at
`docs/reviews/WI-OI-046-sp01-sp07-resolution-request-2026-09-23.md` and
`docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`. No further agent-created review packet
is needed; collect actual named decisions.

1. Read `.pi/work/WI-OI-044.md`, `.pi/work/WI-OI-045.md`, `.pi/work/WI-OI-046.md`, ADR-0005, the Delta 5
   contracts/security design/acceptance plan and the WI-OI-046 G3 readiness packet.
2. Reconcile stale checkboxes against actual decisions. Do not infer specialist acceptance from Product or
   Architecture acceptance.
3. Obtain or record exact named decisions for Architecture, Security, IAM/Tenancy, API Contracts,
   Web/Accessibility, QA/SDET and Product.
4. If any required G3 decision is missing, produce a one-page decision request containing the exact choice,
   recommendation, consequence and evidence link. Stop product implementation.
5. After WI-OI-047 exits Build and all WI-OI-046 pre-flight conditions pass, have the Orchestrator set
   WI-OI-046 to `Ready`, then `In Progress`, and make it the sole active Build item.
6. Capture exact diffs/hashes of every dirty candidate file before editing.

Implement TP-1 only:

1. Add strict v1 `ModuleAdapterDescriptor`, capability, storage-strategy, compatibility, limit, safe-filter
   descriptor and `ConfigurationRuntimeScope` schemas under the existing Configuration contract namespace.
2. Reject unknown fields; prove additive compatibility with versioned fixtures.
3. Reuse `PlatformContextV1`; do not create another tenant/auth context.
4. Add a small code-owned adapter registry keyed by exact `(moduleKey, entityKey, surfaceKey)`.
5. Reject duplicate keys at startup and unknown adapters at runtime.
6. Return immutable descriptors. Never expose SQL/table names, arbitrary callbacks or tenant-authored
   executable logic.
7. Implement the Tenant Profile adapter using the current locked fields, bounded extension slot, routes,
   limits and permissions.
8. Preserve the existing serialized surface response for existing web clients.
9. Delegate surface discovery and extension-owner validation from `ConfigurationStudioService` to the
   registry with minimal hunks; do not rewrite the service.
10. Add a server runtime-scope resolver. Environment comes from required server deployment configuration;
    cohort comes from authenticated server policy.
11. Missing/invalid environment or cohort fails startup or the dependent operation explicitly.
12. Add a normal runtime-manifest boundary that accepts module/entity/surface only; the server supplies
    environment/cohort.
13. Preserve the explicit-scope endpoint only for authorized Studio preview/administration and require its
    distinct permission.
14. Never trust a browser-supplied cohort as membership evidence.
15. Update `ConfiguredTenantFields` to use server-resolved scope.
16. Preserve loading, no-manifest, denied, validation, conflict, retryable dependency and success states.
17. Add bounded adapter/scope/manifest metrics with no tenant/user/record labels.
18. Add stable error codes for adapter missing/incompatible, scope missing/denied and manifest unavailable.
19. Add contract, compatibility, duplicate-key, unknown-key, missing-scope, cohort-override, preview
    permission, two-tenant, revocation, restart/cache-resync, old-client, UI-state and accessibility tests.
20. Add no migration unless an accepted finding proves one is required. If required, use a new forward
    migration with compatibility and recovery evidence.
21. Do not implement export job, event/inbox, pool governor or audit-chain work in TP-1.

TP-1 exit:

- existing Tenant Profile field/value behavior remains compatible;
- normal runtime manifest selection is server-resolved and fail-closed;
- unknown capabilities/fields/operators/scopes are denied;
- two tenants cannot observe each other's adapter, manifest, value or cache;
- all TP-1-focused and applicable repository gates pass or unrelated failures are routed truthfully;
- independent reviewers inspect the exact diff and evidence; and
- WI-OI-046 moves to Review before another Build item starts.

## Phase C — F4 / TP-2 durable tenant-export job

After TP-1 exits Build, allocate the next unused stable work item, proposed as `WI-OI-048` only if that ID
is still free. Complete Definition of Ready and make it the sole active Build item.

1. Extend the existing `TenantDataExport`; do not add a second export/job product.
2. Add a forward migration for canonical request idempotency, transitions/command history,
   attempt/heartbeat/lease/checkpoint, cancellation and reconciliation fields required by the accepted job
   contract.
3. Preserve compatibility with existing export records and define any backfill explicitly.
4. Revalidate current tenant/user/entitlement/permission immediately before snapshot and immediately before
   granting download.
5. Keep PostgreSQL authoritative; queue completion is not business completion.
6. Use a transactional enqueue outbox or equivalent accepted pattern.
7. Make retry and duplicate delivery idempotent.
8. Detect/recover stale leases; bound attempts/backoff/timeouts; expose terminal and retryable failures.
9. Implement deliberate cancellation semantics and race tests.
10. Preserve signed archive/checksum behavior.
11. Add artifact classification, encryption/key reference, scan status and retention metadata without
    exposing object keys or credentials.
12. Authorize downloads by current tenant/object authority and short-lived grant policy.
13. Add accessible queued/running/retrying/cancelling/cancelled/failed/succeeded/expired UI states.
14. Test duplicate requests, crash before/after commit, worker restart/upgrade, Redis absence/outage if used,
    MinIO outage, cancellation races, maximum export size, cleanup and cross-tenant artifact denial.
15. Prove an operator can reconcile ambiguous work without editing database rows manually.

Move TP-2 to Review only after migration replay/upgrade/restore and independent job/storage/security review.

## Phase D — F5 / TP-3 transactional event and inbox

After TP-2 exits Build, allocate the next unused stable work item, proposed as `WI-OI-049` if free.

1. Confirm one real consumer need before emitting `tenant.profile.extensions.updated.v1`.
2. Commit the domain fact/outbox row in the same transaction as the value and authoritative audit.
3. Rollback must emit no fact.
4. Conform Configuration activation events to the accepted common envelope without breaking invalidation.
5. Implement a relay with lease, bounded retry/backoff, quarantine/DLQ and reconciliation.
6. Implement one real consumer with a durable consumer-specific inbox/receipt and idempotent local effect.
7. Keep PostgreSQL `NOTIFY` as wake-up/invalidation only.
8. Add authorized tenant-bounded replay and quarantine operations with audit evidence.
9. Test duplicate, reorder, replay, unsupported version, poison event, transport outage, relay crash and
   consumer crash.
10. Reconcile committed outbox count, transport attempts, inbox receipts and business effects
    quantitatively.

Move TP-3 to Review only when dual-write-loss and duplicate-effect tests pass independently.

## Phase E — F6 / TP-4 tenant binding, pool and admission governance

After TP-3 exits Build, allocate the next unused stable work item, proposed as `WI-OI-050` if free.

1. Extend the existing `TenantIsolationBinding`; do not create a second tenant registry.
2. Add accepted version/workload policy for API, export worker, event relay, listener and audit work.
3. Resolve binding from authenticated/current authority, never request payload defaults.
4. Use transaction-local tenant context on pooled request work.
5. Use an explicit session-capable route only for listeners/features that require session state.
6. Record PostgreSQL ceiling, admin/migration reserve, failover reserve, replica counts, pool sizes,
   listeners, worker concurrency and rejection thresholds.
7. Enforce aggregate admission before saturation.
8. Implement missing/stale/suspended/moved binding behavior, credential rotation and recovery.
9. Do not add PgBouncer to the local profile unless an accepted ADR/profile decision requires it.
10. Test checkout/check-in contamination at concurrency, two-tenant isolation, saturation/rejection,
    restart, credential rotation and profile-specific recovery with API/worker/relay/audit load together.

Move TP-4 to Review only when the measured aggregate stays below the allocatable database ceiling and all
tenant-leak/pool-contamination assertions pass.

## Phase F — F7 / TP-5 transactional audit evidence

After TP-4 exits Build, allocate the next unused stable work item, proposed as `WI-OI-051` if free.

1. Apply the accepted `AuditEvidenceV1` envelope to all selected configuration/value/job/event/artifact/
   replay/download/operator commands.
2. Write authoritative audit in the same transaction as the material state change.
3. Ensure rolled-back work cannot appear as committed audit.
4. Add transaction-safe chain sequence allocation for the selected scope.
5. Fail closed on gap, tamper, unsealed or unverifiable chain states.
6. Redact secrets, tokens, credentials, binary/large values and classification-prohibited fields.
7. Tenant-defined fields inherit their active metadata classification.
8. Export through a local audit outbox to a rebuildable searchable projection/archive.
9. Add tenant-authorized, paginated history/search/export UI with clear verification outcomes.
10. Implement accepted retention, hold, offboarding, projection rebuild and archive restore behavior. Do not
    invent legal conclusions; unresolved legal/privacy values remain a human blocker.
11. Test rollback, concurrent writers, tamper/gap/unsealed state, redaction, tenant isolation, projection
    rebuild, retention/hold and archive restore.

Move TP-5 to Review only when every visible selected-slice outcome is reconstructible from authoritative,
redacted and integrity-verified evidence.

## Phase G — F8 / TP-6 integrated local certification

After TP-5 exits Build, allocate the next unused stable work item, proposed as `WI-OI-052` if free.

1. Run the complete first-adopter journey through real local PostgreSQL, queue/worker if applicable and
   MinIO.
2. Prove configuration -> real value -> event/outbox/inbox -> export job -> signed artifact -> download ->
   audit reconstruction with one correlation chain.
3. Prove the second-tenant denial matrix across every identifier and storage layer.
4. Prove revocation/suspension during live sessions and queued work.
5. Run clean migration, supported upgrade, backup/restore, roll-forward, dependency-outage, crash,
   duplicate, retry, cancellation and reconciliation tests.
6. Run representative load, noisy-neighbor and capacity tests; record p50/p95/p99, errors, memory,
   connections, backlog and recovery time.
7. Run unit, contract, integration, E2E, security, accessibility and all mandatory repository gates.
8. Produce immutable local artifacts, SBOM, license and vulnerability evidence.
9. Exercise dashboards, alerts and runbooks with an independent local operator.
10. Obtain named Product, Architecture, Security, Backend/Data, IAM/Tenancy, Data Portability,
    Web/Accessibility, QA/SDET and local-operations decisions.
11. Mark public TLS/DNS, remote registry/provenance, external KMS/storage, HA/failover, external PITR,
    external alert delivery, G6 rollout and G7 production observation `DEFERRED_EXTERNAL` until a provider
    and release work item are authorized.

The local result may be called only `Local Foundation Ready for continued development/demo`. It may not be
called production-ready, Released, HA, cloud-certified or customer-managed certified.

## Phase H — F9 second adopter and platform extraction

Do not implement F9 merely because local TP-6 passes. F9 requires a new bounded work item, a named second
adopter and the gate required by the North Star. If production/G7 observation is intentionally deferred,
leave F9 `Proposed` and state the dependency.

When authorized:

1. Select a materially different non-financial adopter with different entity/query/job characteristics.
2. Reuse the contracts without weakening either module's invariants.
3. Validate compatibility and upgrade tooling across both adopters.
4. Extract only mechanisms proven stable in both implementations.
5. Never copy-paste a full adopter or declare a platform standard after one use.

## Phase I — hand off the Analytics business outcome separately

Analytics is not part of TP-1 through TP-6 and must not be smuggled into those work items.

After the applicable foundation gate and a separately authorized Analytics Build item:

1. Re-read:
   - `docs/plans/analytics-reports-production-implementation-plan.md`
   - `docs/plans/analytics-reports-production-agent-prompt.md`
   - `.pi/work/WI-OI-043.md`
   - ADR-0004 and the Analytics contracts/migrations/runtime code
2. Reconcile the current Analytics source because existing code/tests are not automatically accepted merely
   because files and migrations exist.
3. Keep the core flow:

```text
external system
  -> Connector Hub / credential reference
  -> real ingestion and raw versioning
  -> schema discovery and mapping
  -> tenant-scoped dataset version
  -> semantic dimensions/measures
  -> bounded query engine
  -> chart
  -> dashboard/filter/drill
  -> report/export/schedule
  -> lineage/audit/metrics
```

4. Use PostgreSQL as the first real external source vertical slice.
5. Provide a no-code business journey: connect, test, discover, map, sync, create dataset, define measure,
   query, chart, dashboard, filter, drill and export CSV/report.
6. Use real tenant-scoped persistence and explicit unavailable states; no fabricated KPI/chart/report data.
7. Analytics must not query AR/CMMS/Spend operational schemas directly. Internal module facts are a later
   source adapter pattern, not an Analytics prerequisite.
8. Use Superset, Metabase and Tableau as product/UX benchmarks only unless a separately accepted ADR,
   license/SBOM/security review authorizes embedding or adopting code.
9. Preserve true-SaaS tenant isolation, entitlements, object authorization, quotas, query cost limits,
   secrets references, lineage, retention, export authorization, observability and recovery.
10. Implement one Analytics phase at a time under the one-Build-item rule and certify one real vertical
    slice before expanding chart count or data-source breadth.

### 6. Mandatory test/evidence pattern for every phase

For every behavior-changing phase, maintain this trace:

```text
business outcome
-> WI-OI-NNN
-> FR/NFR IDs
-> accepted ADR/threat/data/API design
-> minimal code and forward migration
-> unit/contract/integration/tenant-negative/security tests
-> performance/resilience/accessibility/restore evidence as applicable
-> immutable artifact and SBOM/security evidence
-> known limitations and deferred external rows
-> named independent review
-> next gate
```

For every user action, trace:

```text
role
-> UI control/state
-> BFF/API contract
-> authentication and current authorization
-> tenant/object scope
-> validation and domain rule
-> transaction and constraints
-> event/job/artifact if applicable
-> response and UI refresh
-> audit
-> logs/metrics/traces/alerts
```

Tests must cover success, loading, empty, validation, conflict/concurrency, denied, cross-tenant,
dependency failure, retry, cancellation where applicable, restart/reconnect, recovery and cleanup.

### 7. Status reporting format

At the start of each work session, report only:

```text
Active work item:
Current phase/gate:
Exact objective:
Protected paths verified: YES/NO
Pre-flight blockers:
Files expected to change:
Tests/evidence planned:
```

During work, give concise updates after a meaningful checkpoint. Do not narrate every file read.

At the end of each work item, report:

```text
Outcome:
Canonical status:
Changed files:
Migrations/contracts:
Real infrastructure used:
Passing evidence:
Failing/not-run evidence:
Test-data cleanup:
Security/tenant findings:
Protected hashes:
Human decisions still required:
External items deferred:
Exact next authorized action:
Production/release claim: NONE unless separately authorized
```

### 8. Final stop rule

Do not continue to the next phase when the current work item is still the active Build item, has an open
in-scope P0/P1 defect, lacks required migration/recovery evidence, has not preserved protected paths, or
has not reached its truthful handoff state in `.pi/WORK_ITEMS.md`.

If only human approval or external infrastructure remains, stop with a precise decision/evidence request.
Do not fill the decision yourself and do not label a deferred item as passed.

## END IMPLEMENTATION PROMPT
