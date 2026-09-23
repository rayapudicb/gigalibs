# WI-OI-047 — Configuration deployment-profile contract repair

Status: In Progress

Gate: Local G4 Build; sole active implementation item

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
- [x] WI-OI-047 is In Progress and the sole `activeImplementationWorkItems` entry.

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
- Independent humans accept the exact local artifacts; then WI-OI-047 may move to Review and F3 may request
  a separate local-development Build entry. F2 production closure remains deferred.

## 8. Current handoff

- Product/deployment code changed by WI-OI-047: LOCAL-1 deployment-contract implementation in progress;
  no application product behavior or database schema changed
- G2–G3 local architecture/contract/test design: complete for independent review
- Current recommendation: Go for bounded Local G4 implementation; no production-release recommendation
- External infrastructure: explicitly deferred; not a local G4 blocker and not credited as passing evidence
- Next authority: named local G3 reviewers and SDLC Orchestrator
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

Status remains In Progress at G4. No agent-level status change. Human sign-off gates (LOCAL-3 through LOCAL-5) are pending A3/A4/A5 execution.
