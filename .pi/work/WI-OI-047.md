# WI-OI-047 — Configuration deployment-profile contract repair

Status: Review

Gate: Local G4 remediation review; no active implementation item

Owner: Infrastructure/SRE with Backend Domain and Web Experience

Requirements: FR-05, FR-14, FR-15; NFR-GOV-001–003, NFR-SEC-001–005,
NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-OBS-001–004,
NFR-UX-001–002, NFR-OPS-001–004, NFR-SC-001–004

Independent local reviewers: Solution Architecture, Security & Privacy, Backend/Data, Web/Accessibility,
Infrastructure/local operator, QA/SDET and Product

Deferred production authority: Release Authority and any future external/cloud operator

Dependencies: WI-OI-039 Review evidence and the 2026-09-22 F2 closure audit

Named Build-entry authority: Chinni babu Rayapudo — Product Owner / Solution Architecture / Local Operator /
Manual UAT. Security, Backend/Data, Web/Accessibility and QA/SDET remain mandatory independent exit
reviewers; their acceptance is not inferred.

## 1. Outcome

Repair and independently rehearse `configuration-local-development-v1` on the existing Docker environment.
It must start the checked-in control-plane API, migrations and workflow web application with complete
fail-fast configuration; expose truthful liveness/readiness; execute the real Configuration Studio
lifecycle; and produce local source-to-artifact, security, recovery and operator evidence.

Customer-Managed production certification and Managed Cloud are deferred. HostingRaja and DigitalOcean are
candidates only and are not current dependencies or certified targets.

This repairs the F2 foundation. It does not implement the Delta 5 Tenant Profile adapter, durable jobs,
events, connection governance or audit convergence.

## 2. Entry finding

The [F2 closure audit](../../docs/audits/2026-09-22-configuration-f2-closure-audit.md) records seven P0
deployment contradictions: missing runtime inputs, nonexistent probes, wrong web upstream names,
incompatible signing configuration, incomplete credential generation, unreproducible image references and
an unspecified object-storage topology.

The prior CS-10 statement proves only that deployment files exist. It is not runnable-profile evidence.

## 3. Required design decisions before Build

- Named human local reviewers and operator.
- Exact locally supported topology for PostgreSQL, excluded Redis/execution plane and existing MinIO.
- Secret authority, bootstrap, rotation, recovery and customer handoff model.
- Local source-to-image identity; external registry/signing/provenance is release-deferred.
- Explicit localhost-only insecure-storage/cookie boundary; public TLS/DNS is release-deferred.
- Accepted replica counts, resources, connection budgets, SLO/RPO/RTO and halt thresholds.
- Exact local application build/startup, dump/restore and secret-file behavior.

### 3.1 Proposed resolution for review

On 2026-09-22 the Product Owner and Solution Architecture reviewer selected one bounded **Local
Development Configuration Profile**, not the full platform. It reuses Docker 29.0.1, Compose 2.40.3,
PostgreSQL 16 and the existing digest-pinned MinIO service. Customer-Managed production and Managed Cloud
are deferred. Detailed decisions are in:

- `docs/architecture/CONFIGURATION_DEPLOYMENT_PROFILE_DESIGN.md`;
- `docs/contracts/configuration-deployment-contract-v1.md`; and
- `docs/plans/configuration-deployment-acceptance-test-plan.md`; and
- `docs/plans/configuration-local-execution-plan.md`.

The local-development scope is accepted by the named Product/Architecture/local operator for bounded G4
implementation. Specialist and independent exit decisions remain open.

Human reviewer selection, G3 design checks, post-implementation application tests and the repository
decision-record template are defined in
`docs/reviews/WI-OI-047-human-review-guide.md`.

The first named Product/Manual-UAT review is recorded in
`docs/reviews/WI-OI-047-uat-evidence-2026-09-22.md`. The web shell rendered, but host-level inspection
proved that an external IDE agent had placed a fabricated auth/control-plane server on port `3333`.
Consequently the UAT is invalid for functional/security certification and must be rerun against the real
control plane. The authorized local recovery stopped the mock and exposed conflicting root/API-local
database targets. Both databases were separately backed up and brought current through their checked-in
migrations; the compiled real API now uses the verified `gigalibs_dev_runtime` schema. Health, readiness,
the formerly failing Prisma membership query, protected 401 behavior and the unauthenticated logout path
pass. A fresh authenticated request to the protected Studio page and downstream BFF authorization checks
also pass. The earlier `tenant-profile-extension` discovery/value journey remains untested and is assigned
to F3/TP-1 rather than counted as F2 evidence; the separately required local Currency API was started after
its absence produced two 502s.

## 4. Implementation slices

### DEP-1 — Machine-verifiable deployment contract

- Generate or maintain one bounded inventory of required API/web/migration settings and implemented health
  routes.
- Classify each setting as non-secret config, secret reference, optional feature or prohibited production
  input.
- Add drift tests comparing runtime source, Compose, examples and runbooks. Helm/cloud renderers are
  deferred with the cloud work item.
- Missing required settings, unknown probe routes and obsolete aliases fail CI.

### DEP-2 — Reproducible local application artifacts

- Add reviewed multi-stage Containerfiles for API, migrations and web using pinned supported base images.
- Run as non-root with bounded writable paths and read-only root filesystems where supported.
- Include only production dependencies and built artifacts; never copy repository `.env`, credentials,
  test evidence or source secrets.
- Build locally with revision-qualified tags and record immutable local image IDs. Remote publication,
  registry signature and externally verifiable provenance are `DEFERRED_EXTERNAL`.

### DEP-3 — Local Development profile

- Correct API names, complete required settings, secret references, web upstreams and real probes.
- Reuse the existing local PostgreSQL/MinIO topology; allow insecure storage only on the explicit
  loopback/local-Docker boundary and record it as non-production.
- Generate required cryptographic material with the correct algorithms/formats or require externally
  supplied references; never print private material.
- Build application artifacts from the checked-in revision and record revision-qualified tags plus local
  immutable image IDs.
- Prove local clean start, restart, dump/restore, sequential upgrade and secret regeneration.

### DEP-4 — Deferred release infrastructure

- Do not implement or claim Customer-Managed production, HA or cloud release under the current local slice.
- After the owner selects a provider, allocate a separate work item for the provider topology, pricing and
  responsibility boundary, TLS/DNS/certificates, managed PostgreSQL/storage/KMS, immutable deployment
  artifacts, HA behavior and the complete acceptance matrix.
- Local evidence cannot be relabeled as production, HostingRaja, DigitalOcean or generic cloud evidence.

### DEP-5 — Configuration foundation certification

- Execute the authenticated maker/checker Configuration Studio lifecycle, explicit-scope runtime-manifest
  retrieval, Java runtime-manifest client and two-tenant negative matrix in the local-development profile.
- Defer the Tenant Profile runtime-value journey to F3/TP-1, which owns removal of `local-uat` and
  `all-users` defaults and authoritative environment/cohort resolution.
- Repeat accepted performance, accessibility, backup/restore, recovery and operator runbooks.
- Record exact image digests, manifests, environment classification, data provenance and cleanup.
- Obtain independent decisions; agents cannot approve release.

## 5. Candidate file budget after authorization

- focused image definitions and build metadata under an accepted `infra/images/` location;
- no `.github/workflows/` or remote promotion changes in the local slice;
- `docker/docker-compose.dev.yml` and `infra/compose/**`; `infra/helm/**` remains outside the local-only
  implementation scope;
- a focused deployment-contract verifier under `scripts/`;
- minimal web health route if Architecture accepts process versus dependency readiness semantics;
- deployment/runbook/evidence documentation;
- runtime config source only if a reviewed defect requires contract normalization rather than manifest
  correction.

Forbidden:

- CMMS frozen Phase 4 paths;
- AR or Analytics product code;
- fake health, success, provider or persistence responses;
- baked secrets or repository `.env` files in images;
- floating production tags without accepted digest policy;
- silent runtime defaults or test fixtures in production profiles;
- unrelated package, generated-file or lockfile churn.

## 6. Pre-flight stop conditions

Do not write deployment/product behavior until all are true:

- [x] Product/Architecture/local operator Chinni babu Rayapudo is recorded for bounded Build entry.
- [x] Existing local PostgreSQL/MinIO topology and excluded Redis/execution-plane boundary are recorded.
- [x] Local secret/bootstrap and source-to-image identity boundaries are accepted subject to verification.
- [x] Local capacity/latency/restart/dump-restore/halt thresholds use the accepted D5-F1 values subject to
  measured verification.
- [x] Exact current dirty deployment files are reviewed and checkpointed before LOCAL-1 edits; hashes are
  recorded below and unrelated dirty files remain outside this work item.
- [x] The deployment/failure/accessibility evidence matrix is recorded; independent QA acceptance is an
  exit requirement, not agent-inferred.
- [x] At Build entry, WI-OI-047 was In Progress and the sole `activeImplementationWorkItems` entry.

## 7. Acceptance

- A supported local workstation with documented prerequisites can start without committed secrets.
- API liveness proves process health; readiness proves mandatory dependencies; web health semantics are
  explicit and tested.
- Every required setting is present under the name the application reads; obsolete aliases fail tests.
- Configuration package signing/export/import uses the implemented Ed25519 formats and trust policy.
- Locally built application artifacts are source-bound and identified by revision-qualified tags plus local
  immutable image IDs; remote registry/signature/provenance evidence is `DEFERRED_EXTERNAL`.
- The Local Development profile completes the real Configuration Studio lifecycle and explicit-scope
  manifest journey with no mock fallback; Tenant Profile value certification remains F3.
- Restart, sequential update, dependency outage and local dump/restore meet accepted local thresholds.
- Cross-tenant, revocation, local-origin, metrics/alert-evaluation and accessibility evidence passes.
- Local technical evidence may move WI-OI-047 to Review. Independent humans must accept the exact local
  artifacts before WI-OI-047 can be Accepted or F3 can request a separate local-development Build entry.
  F2 production closure remains deferred.

## 8. Current handoff

- Product/deployment work changed by WI-OI-047: bounded local deployment contract, images, Compose,
  certification scripts and recovery evidence; no application database schema was added by this slice
- G2–G4 local architecture/contract/implementation evidence: complete for named independent review
- Current recommendation: Review the bounded Local Foundation evidence; no production-release recommendation
- External infrastructure: explicitly deferred; not a local G4 blocker and not credited as passing evidence
- Next authority: named Security, Backend/Data, Web/Accessibility, QA/SDET and Product reviewers; the SDLC
  Orchestrator must route repository-wide failures before any new sole-Build handoff
- F1 decision dependency: `docs/reviews/WI-OI-044-WI-OI-045-f1-decision-record.md`

## 9. LOCAL-1 pre-change checkpoint — 2026-09-22

The following SHA-256 values identify the deployment inventory reviewed before correction. These files
were untracked/local implementation inventory except where Git reports otherwise; the hashes prevent an
unrecorded overwrite and do not certify their previous contents:

| File | Pre-change SHA-256 |
| --- | --- |
| `infra/compose/compose.yaml` | `26c610e983219e3571a797fb043c91aa36513d1d640bf61d326f8eaf41ddc001` |
| `infra/compose/.env.example` | `8f91172cc6f007f5a509f9cb0fcd764c59dcdde5412b9703d590b1d170c40226` |
| `infra/compose/README.md` | `fbbc38226bbad7db78c84f563092dac4d19554b3710d75b343f4e0730426b223` |
| `infra/compose/scripts/backup.sh` | `b2fc0ccaecad735630f74e5971026361e45e183cb915526775b1a96682c18aed` |
| `infra/compose/scripts/check-prerequisites.sh` | `9c23b7657f2b761c3c0035f86cd5c284238b0953f8038e603352af25a218de20` |
| `infra/compose/scripts/generate-credentials.sh` | `325b92f1bec325f50054d49120e2c47ba4380e4e9f0d51c9f168d5621765282f` |
| `infra/compose/scripts/restore.sh` | `3713f62afb71664b4c00f225bf1483ed26c68cec81decc877bf4738ccf6deddd` |
| `docker/docker-compose.dev.yml` | `3b40361d6f51772d57470bc735dc2d75b63a3260edbb8196b2514dd2741922cf` |
| `.dockerignore` | `81a4460fa58799eb9456e786a6e352f05c9f759f1475eaa06d58a64e3dca150a` |

## 10. LOCAL-1 implementation evidence — 2026-09-22

- Machine-readable authority added at
  `config/deployment-profiles/configuration-local-development-v1.json`.
- `infra/compose/compose.yaml` now contains only `migrations`, `api` and `web`; PostgreSQL and MinIO are
  reused by observed container identity, and Redis is not in the dependency graph.
- Obsolete `PORT`-for-API, `CONTROL_PLANE_URL`, `CONFIGURATION_PACKAGE_SIGNING_KEY`, fictional registry
  image and incorrect probe mappings were removed.
- `node scripts/verify-configuration-local-profile.mjs`: PASS.
- `docker compose --env-file infra/compose/.env.example -f infra/compose/compose.yaml config --quiet`:
  PASS.
- Local pre-flight: PASS for Docker 29.0.1, Compose 2.40.3, Node 23.11.0, pnpm 11.1.2, running
  `gigalibs-postgres`, running `docker-minio-1` and machine contract. Warnings: 12 GB free versus the
  20 GB recommendation; host web currently occupies port 5180.
- The running PostgreSQL container records historical Compose project/service `gigalibs-dev/postgres`,
  while current source names the service `control-postgres`. LOCAL-1 reuses the exact container and blocks
  duplicate Compose creation; dependency topology migration is not inferred.

LOCAL-1 result: **PASS for implementation/static and observed-host pre-flight**. This is not image,
runtime, recovery, independent-review or production evidence. LOCAL-2 is in progress.

## 11. LOCAL-2 Phase A2 — F2 certification scripts delivered — 2026-09-23

Phase A2 is complete. All five certification scripts are committed at `infra/compose/scripts/`:

| Script | Lines | Purpose |
| --- | --- | --- |
| `verify-local-f2-runtime.mjs` | 359 | Full F2 runtime matrix — 2-tenant isolation, 4-surface discovery, maker/checker, self-approval denial, checksum persistence, cross-tenant 403, no TP values written, 250-field custom-form surface (NOT profile-extension), 100 concurrent reads p95 ≤ 500ms / p99 ≤ 1000ms, logout revocation |
| `verify-postgres-outage.sh` | 136 | API liveness/readiness contract during PostgreSQL container stop |
| `verify-minio-outage.sh` | 133 | F2 has no object-storage dep — API stays live and ready during MinIO stop; deferred TP2 note recorded |
| `verify-local-restore.sh` | 139 | Checksum-verified pg_restore into disposable DB; migration count ≥ 37; 3 Configuration tables present; DROP on exit |
| `run-phase-a-certification.sh` | 337 | Master bootstrap: A1 protected hashes → A3 build → filesystem scan → container config → SBOM → A4 start stack + run all verifiers → A5 gates → A6 closure evidence |

CMMS Phase 4 IAM bulk user import files (WI-OI-046 paused scope) also committed in same batch: 15 files, 1922 insertions.

Commit: `48c98dc`

**To execute Phase A3 onward:** open a Mac Terminal and run:

```bash
cd /Users/rayapudi/dev/gigalibs
bash infra/compose/scripts/run-phase-a-certification.sh
```

Evidence writes to `infra/compose/evidence/phase-a-<timestamp>/`.

LOCAL-2 result: **Phase A2 COMPLETE — scripts committed and syntax-verified. Phase A3 (image build + runtime matrix) is the next step and requires Mac Docker.**

This was the A2 execution state. Section 12 supersedes it after A3–A5 execution.

## 12. LOCAL-2 technical closure and Review handoff — 2026-09-23

The authoritative evidence bundle is
`infra/compose/evidence/phase-a-20260923T103641Z/`. The master script's redundant rebuild stopped when the
local Docker BuildKit store exhausted host space; disposable build and package caches were pruned without
deleting containers, images, volumes or databases. Every remaining certification stage was then executed
individually against the same immutable images. The source-to-image identity is:

| Artifact | Immutable identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Image-build source state | `5b26b49527760b9aa6448810dea9a73b49ccf499069f01ad81e58a8b6250898e` |
| Migrations image | `sha256:5742649e57f5586c295dbd1dc381d975c713266a9673b57854dfb6e967e59f83` |
| API image | `sha256:d34b1dfbeb0b5409f9420c09da723905586e543b0d1d4ed4a56a61b22b753aee` |
| Web image | `sha256:495a0553bbf3e35e52006eb67991a2f856d4a054e18957aa81c93775ad545a12` |

Post-build source-state hashes differ because certification-script corrections and evidence records were
written after the images were built. No product-code mismatch is inferred; `images.json` preserves the
build input identity and the closure audit records the post-build evidence-only delta.

### 12.1 Passing local evidence

- `f2-runtime.json`: PASS, 13 outcomes using real PostgreSQL and the real API; two tenants, separate
  maker/checker identities, self-approval denial, publish/activate/checksum persistence, cross-tenant
  isolation, live role/membership/user/tenant revocation, logout revocation and zero active generated
  identities after cleanup.
- 100 manifest reads at concurrency 10: p95 `29.349 ms`, p99 `37.667 ms`, maximum `39.82 ms`, zero failures.
- `postgres-outage.json`: PASS; liveness remained 200, readiness became 503, and both recovered to 200.
- `minio-outage.json`: PASS; F2 remained live/ready because object storage is not an F2 dependency.
- `restore-final.json`: PASS from a checksum-verified dump into a disposable database; all 37 migrations,
  canonical Configuration tables, 32 active activations and the active manifest checksum set were
  preserved. The disposable database was removed.
- `restart-checksum.json`: PASS against the exact API/web image IDs; the published checksum remained
  authoritative through sequential API and web restarts; generated data was deactivated.
- `accessibility-automated.json`: PASS across seven Chromium/axe scans, compact and mobile viewports,
  reduced motion and roving focus; zero automated violations. Manual assistive-technology review remains.
- `observability-live-current-stack.json`: PASS for authenticated local metrics, route redaction/cardinality,
  database collector and absence of tenant identity disclosure.
- Focused Configuration/auth/health/containment suite: 21 files and 357 tests passed. Java runtime-manifest
  conformance passed 11 outcomes on Java 11. Required package, API-boundary, navigation, SDLC,
  Configuration-contract, deployment-profile and static observability audits passed.
- Final images run as non-root and contain none of the scanned `.env`, `.git`, private-key or credential
  path patterns. SBOMs exist for all three images.

### 12.2 Open conditions routed to review

| Condition | Current result | Required owner/decision |
| --- | --- | --- |
| Repository `pnpm build` | FAIL in Analytics Jest/test typing after 66 successful tasks | Analytics owner; not silently waived by WI-OI-047 |
| Repository `pnpm test` | FAIL: 132 files/1,171 tests pass; 14 files/11 tests fail in Analytics and frozen CMMS inventory | Analytics/CMMS owners and QA; preserve frozen CMMS paths |
| `audit:production-data` and `audit:all-runtime-data` | FAIL on active web use of quarantined `data-import-export-react` and frozen CMMS Redis fallback | SDLC Orchestrator plus owning work items |
| Image vulnerability review | Trivy 0.74.0 completed against all three exact images with telemetry disabled. Every image has Critical/High findings, including fixable findings; policy FAIL | Authorized remediation work item plus named Security/Supply-chain review; no production or external-release PASS claimed |
| Historical credential packaging | Clean replacement images pass, but an earlier deleted image contained nonempty ACS/Twilio settings | Credential owner must rotate and record confirmation before external use |
| Manual accessibility | PENDING keyboard, screen reader, 200%/400% zoom and high contrast | Named Web/Accessibility reviewer |
| Alert fire/resolve notification route | DEFERRED local tooling/external notification | SRE/Security reviewer; static rules and live metrics are available |
| Customer-managed/cloud/TLS/DNS/HA/PITR | `DEFERRED_EXTERNAL` | Separate provider/release work item and Release Authority |

The repository-wide failures are not reclassified as WI-OI-047 passes. They are recorded so the
orchestrator can route them without reopening or modifying the frozen Phase 4 files.

### 12.3 Gate decision

WI-OI-047 moves from `In Progress` to `Review` because the bounded local implementation and agent-executable
certification are complete. It is not `Accepted`, production-ready or released. No G4 Build item is now
active. Named independent Security, Backend/Data, Web/Accessibility and QA/SDET decisions, plus Product's
review of the exact evidence, remain mandatory before Acceptance or an F3/TP-1 Build handoff.

## 13. Authorized supply-chain remediation return to Build — 2026-09-23

Chinni babu Rayapudo, acting as Product Owner and Solution Architecture reviewer, authorized WI-OI-047 to
return from `Review` to `In Progress` as the sole active Build item for bounded Local Development
supply-chain remediation. The authorized implementation scope is limited to:

- refreshing the pinned base image;
- pruning the migrations runtime;
- upgrading vulnerable dependency paths;
- rebuilding the three local images;
- rescanning those exact images; and
- rerunning affected certification.

This authority is not vulnerability risk acceptance and does not authorize production, cloud or external
release. The previous immutable scan and certification evidence remains historical evidence; remediation
must create a new evidence bundle rather than overwrite it. Named independent Security/Supply-chain
review remains an exit condition. `WI-OI-046` stays `Proposed` and no TP-1 product implementation is
authorized while this remediation is active.

## 14. Supply-chain remediation closure and return to Review — 2026-09-23

The authorized remediation is complete. The authoritative replacement evidence bundle is
`infra/compose/evidence/phase-a-20260923T180053Z/`. The exact image-build authority is source revision
`5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` and source-state SHA-256
`3e04668a12128ac56234549152789e034a61b60b56085055d9db58b74b53f614`.

| Artifact | Exact image ID | SBOM components | Critical | High | Policy |
| --- | --- | ---: | ---: | ---: | --- |
| Migrations | `sha256:0ef0a1e9bbfc6d5294c9856c4252bf876967aac74cd5e47415c4c30246636e48` | 52 | 0 | 0 | PASS |
| API | `sha256:0a9b4a9160dd9a840af630617bec7ec02af0b4923459b9312e6e29017a26b3ac` | 243 | 0 | 0 | PASS |
| Web | `sha256:8541a74ac83305ae2f155a08a9a924fc9aab2118c670454331671d7e95c47301` | 304 | 0 | 0 | PASS |

All three final images use the pinned distroless Node.js 24 Debian 13 runtime, run as `65532:65532`, and
pass the prohibited-files/runtime-tools inspection. The migrations image contains the canonical schema
and 37 migrations but excludes the previously inherited application workspace and build/test toolchain.
The API preserves a single NestJS 11.2.3 dependency identity while the scoped pnpm override resolves its
Multer vulnerability path.

Affected recertification passed: migrations exited 0; API live/ready and web HTTP 200; unauthenticated
Configuration access returned 401; all 13 F2 outcomes passed; 100 concurrent manifest reads had p95
`26.791 ms`, p99 `38.235 ms` and zero failures; PostgreSQL and MinIO outage contracts passed; and the
fresh checksum-bound backup restored into a disposable database with 37 migrations, required tables, 35
active activations and the active checksum set preserved.

The repository-wide mandatory gates were rerun. Package dependency, API boundary, navigation, SDLC,
Configuration contracts, deployment profile and Configuration observability pass. Build/test and both
runtime-data audits remain failed only on the already routed Analytics, frozen CMMS and quarantined-package
conditions recorded in Section 12.2; they are not silently waived or edited under this remediation.

WI-OI-047 returns to `Review` and leaves no active G4 Build item. Named Security/Supply-chain,
Backend/Data, Web/Accessibility and QA/SDET review, ACS/Twilio credential-owner rotation confirmation and
the routed repository conditions remain open. This is not `Accepted`,
production-ready, cloud-certified or released, and it does not authorize WI-OI-046/F3 implementation.

The reconciled named-review handoff is
`docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`. It binds reviewers to the replacement
image IDs and evidence hashes, distinguishes the image-build source-state label from the later
closure-time working-tree fingerprint, and preserves separate WI-OI-047 exit and WI-OI-046 entry
decisions. No human decision is inferred by this handoff.

## 15. Product, Solution Architecture and Local Operator decision — 2026-09-24

Chinni babu Rayapudo supplied and accepted the exact replacement evidence decision recorded verbatim in
`docs/reviews/WI-OI-047-exit-WI-OI-046-entry-integrated-review.md`. The decision accepts only the bounded
`configuration-local-development-v1` profile and explicitly retains these conditions:

- independent Security, Backend/Data, Web/Accessibility and QA/SDET decisions;
- ACS/Twilio credential rotation before external use; and
- no production, cloud, external release or WI-OI-046 G4 authority.

WI-OI-047 therefore remains `Review`; no active G4 Build item is created.

## 16. Security/Supply-chain technical pre-review — 2026-09-24

The agent-executable Security/Supply-chain evidence review is recorded in
`docs/reviews/WI-OI-047-security-supply-chain-pre-review-2026-09-24.md`. A telemetry-disabled, read-only
Trivy 0.74.0 secret scan bound to the three exact replacement image IDs found zero matches; its sanitized
count-only record is `docs/audits/2026-09-24-wi-oi-047-exact-image-secret-scan-summary.json`.

The technical recommendation is Conditional Go only for a named human to consider the bounded Local
Development profile. Credential-owner rotation evidence, quarantined runtime-package routing,
repository-wide failures, incomplete license fields, missing SAST/IaC evidence and deferred external
provenance remain explicit. No agent Security acceptance, production authority or WI-OI-046 Build
authority is created.

The subsequent WI-OI-042 schema correction rebuilt all three images. The current exact-image Security
checks and named-human decision request are therefore recorded separately in
`docs/reviews/WI-OI-047-WI-OI-046-security-decision-request-2026-09-24.md`. The current images pass the
zero Critical/High/secret policy, non-root/runtime-environment inspection and prohibited-filesystem-path
scan. The credential, license, SAST/IaC, quarantine, repository-integrity and external-provenance
conditions remain open.

## 17. Backend/Data technical pre-review — 2026-09-24

The agent-executable Backend/Data review is recorded in
`docs/reviews/WI-OI-047-backend-data-pre-review-2026-09-24.md`, with a structured evidence summary at
`docs/audits/2026-09-24-wi-oi-047-backend-data-evidence-summary.json`.

The fresh checksum-bound local backup, clean disposable restore, 37-migration count, Configuration table
presence, 35 active activations, manifest-checksum preservation and PostgreSQL readiness recovery are
verified. Subsequent controlled verification with the original exact pruned migration image proved clean
37-migration replay, representative 35-to-37 upgrade, state preservation, idempotency and tenant-safe
Department constraints, while identifying the WI-OI-042-owned `departments.updatedAt` mismatch.

The historical diagnostic is
`docs/audits/2026-09-24-wi-oi-047-exact-migration-image-result-v4.json`; the routed finding is
`docs/audits/2026-09-24-wi-oi-047-department-schema-drift.md`. WI-OI-042 then completed the authorized
canonical-schema correction and replacement certification. The superseding result at
`docs/audits/2026-09-24-wi-oi-042-exact-migration-image-result.json` proves zero physical-schema diff after
both clean replay and representative upgrade, with applied migrations unchanged and tenant isolation
preserved. The complete handoff is
`docs/audits/2026-09-24-wi-oi-042-department-remediation-closure.md`.

The former Department blocker is technically resolved, and Rakesh Konduri accepted the bounded WI-OI-042
remediation as independent Backend/Data reviewer on 2026-09-24. His declaration explicitly does not accept
WI-OI-047, so the separate WI-OI-047 Backend/Data exit decision remains pending and WI-OI-047 stays in
`Review`. Production recovery controls, other specialist decisions, credential rotation and routed
repository-wide failures also remain open. No WI-OI-047 acceptance, WI-OI-046 G4 authority or
production/cloud/external release authority is inferred.

## 18. Independent Security/Supply-chain decision — 2026-09-24

Harsha Koganti recorded a `Conditional` decision for the bounded
`configuration-local-development-v1` profile as the independent Security/Supply-chain reviewer. The
verbatim declaration is in
`docs/reviews/WI-OI-047-security-supply-chain-decision-2026-09-24.md`.

The decision permits the stated Security disposition to coexist with continued bounded local development,
but retains the following stops: ACS/Twilio rotation or revocation before external-provider use, license
disposition before distribution, versioned SAST/IaC evidence, and deferred external registry provenance,
DNS/TLS, KMS and cloud controls. It does not accept WI-OI-047 as a whole and does not authorize WI-OI-046
G4 implementation, production, cloud, customer-managed distribution or external-provider use.
