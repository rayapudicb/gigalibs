# WI-OI-044 F1 specialist pre-review findings

Status: Agent-prepared review evidence; WI-OI-047 is in Review; no human specialist decision inferred

Date: 2026-09-22

Scope: Security/Privacy, Backend/Data, IAM/Tenancy, Data Portability/Privacy, SRE and QA consistency review

## 1. Conclusion

The Product Owner/Solution Architecture amendments resolved the F2/F3 boundary, removed the unjustified
scanner dependency, selected the existing Docker/PostgreSQL/MinIO local stack and deferred external release
infrastructure. WI-OI-047 completed bounded local technical certification and entered Review on
2026-09-23. The remaining named specialist decisions are acceptance and next-Build-entry requirements; no
production acceptance is inferred.

No AR, Analytics or CMMS dependency is required. Protected CMMS Phase 4 paths remain outside scope.

## 2. Design blockers before F1 closure

### F1-PR-001 — RESOLVED: F2/F3 Tenant Profile boundary

Original evidence (now amended):

- The original WI-OI-047 DEP-5 and acceptance text required both deployment profiles to complete the real
  Tenant Profile journey.
- The deployment contract says F3 will add `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` later.
- Current Tenant Profile and Configuration consumer paths still use `local-uat` and `all-users` defaults or
  literals in configuration contracts, the control-plane service and web consumers.
- WI-OI-045 correctly assigns authoritative environment/cohort resolution to TP-1/F3.

Risk: F2 either certifies a production profile with a local-UAT default or implements part of TP-1 without
the accepted work item. Both violate the planned boundary.

Accepted decision: F2 certifies deployment, authentication, maker/checker Configuration lifecycle,
explicit-scope runtime manifest, persistence, tenant-negative behavior and recovery. F3/TP-1 then
certifies the Tenant Profile consumer/value journey with authoritative runtime scope.

Do not certify `local-uat/all-users` as a production runtime default.

### F1-PR-002 — RESOLVED: no malware scanner in bounded F2

Original evidence (now amended):

- Configuration package import is a strict JSON API operation at `/configuration/packages/import`.
- The service validates the signed/checksummed package object; there is no arbitrary Configuration binary
  upload or object-store package ingestion in the inspected path.
- Tenant export artifacts are generated and signed by the platform.
- General source-file import exists elsewhere but is not part of the bounded F2 Configuration profile.

Risk: adding ClamAV to F2 introduces an unrelated production dependency, image, signature-feed lifecycle,
capacity cost and failure mode without a corresponding F2 threat reduction.

Accepted Product/Architecture amendment to D5-F1-021:

- Do not add a malware-scanner runtime to F2.
- Configuration imports remain strict, bounded, signed/checksummed JSON and fail closed before persistence.
- Generated tenant exports record `NOT_APPLICABLE_PLATFORM_GENERATED`, not a fabricated scan success.
- Unknown media types and arbitrary binaries remain unavailable.
- The first future arbitrary-upload work item must select and certify a real scanner before reachability.

If Product/Security intentionally add a binary package format later, scanner selection returns as a
separate accepted dependency decision.

### F1-PR-003 — RESOLVED FOR LOCAL DEVELOPMENT: concrete stack selected

Accepted local boundary: Docker 29.0.1, Compose 2.40.3, PostgreSQL 16 and the existing digest-pinned MinIO
in `docker/docker-compose.dev.yml`. Redis and the execution plane are not Configuration dependencies.
Loopback HTTP storage and local secret files are development-only exceptions. Exact local application image
IDs are produced during implementation. Production Linux support, TLS storage, external backup/KMS and
Managed Cloud are `DEFERRED_EXTERNAL`.

### F1-PR-004 — DEFERRED FOR RELEASE: privacy/legal retention

The specialist package provides defensible engineering defaults, but seven-year audit/configuration
archive, backup duration, legal-hold scope, residency and offboarding erasure are not legal conclusions.
The selling jurisdictions, customer terms and accountable Privacy/Legal human remain unnamed.

Local tests use attributable non-production data and must clean it after evidence capture. Privacy/Legal
must accept or replace every retention row before production/customer data is allowed; that decision is not
a blocker for the isolated local-development milestone and is not inferred here.

### F1-PR-005 — Remaining human specialists are unnamed

Product and Solution Architecture acceptance is recorded. Security/Privacy, Backend/Data, IAM/Tenancy,
the local operator, API Contracts, Web/Accessibility and QA/SDET remain unnamed. Data Portability/Privacy
and Release Authority remain required before production. Agent analysis cannot fill these names or accept
their risks.

## 3. F2 implementation obligations, not F1 design blockers

These findings must remain visible but are expected WI-OI-047 implementation work after authorization:

| ID | Finding | Required F2 outcome |
| --- | --- | --- |
| F2-OB-001 | Compose uses obsolete or missing application environment names; the audited Helm issue is deferred with cloud scope | Machine-readable local deployment schema and drift test match actual API/web consumers |
| F2-OB-002 | Probes target nonexistent routes and web lacks explicit health routes | Implemented liveness/readiness semantics with sanitized failure |
| F2-OB-003 | Referenced API/web/migration images have no checked-in build path | Reproducible non-root local images with revision-qualified tags and local immutable IDs; remote signature/provenance is deferred |
| F2-OB-004 | The audited Helm `poolSize` is not consumed and no local profile enforces the Prisma pool maximum | Explicit driver pool maximum and local-profile connection-budget verification |
| F2-OB-005 | Direct database listener uses one session per API replica | Budgeted session-capable route; listener loss forces cache bypass and resynchronization |
| F2-OB-006 | Deployment signing variable/key format does not match Ed25519 runtime inputs | Correct PKCS#8/SPKI generation, trust ring, rotation and negative tests |
| F2-OB-007 | Current object writes do not prove the local MinIO boundary | Loopback-only endpoint, public-access denial, persistence and outage evidence; TLS/external durability is deferred |
| F2-OB-008 | Current retention worker covers source payloads, not the full proposed matrix | Clean attributable local test data; production retention/hold remains deferred |
| F2-OB-009 | Current audit log is not the accepted transaction-safe Delta 5 integrity chain | Do not claim Delta 5 audit completion in F2; implement under the separately authorized audit slice |
| F2-OB-010 | Local database/runtime roles are not target-profile least-privilege evidence | Separate migration/runtime roles, no owner/superuser/BYPASSRLS runtime and positive/negative tests |
| F2-OB-011 | RPO/RTO values have only local logical restore/process-restart evidence | Repeat clean-target local dump/restore and process recovery; WAL/PITR/cross-host recovery is deferred |
| F2-OB-012 | Existing performance evidence is single-machine/single-API characterization | Repeat the accepted load from the source-bound Local Development artifacts |

## 4. Role-by-role preliminary recommendation

These are review recommendations, not human decisions.

| Role | Preliminary recommendation | Conditions before acceptance |
| --- | --- | --- |
| Security & Privacy | Conditional | Accept local secret/MinIO boundary; confirm fail-closed import, role isolation and no secret leakage |
| Backend/Data | Conditional | Accept explicit pool configuration, connection budgets, role separation and local dump/restore behavior |
| IAM/Tenancy | Conditional | Verify the accepted F1-PR-001 boundary; never accept local-UAT scope as production authority |
| Data Portability / Privacy or Legal | Release-deferred | Local tests clean attributable data; production retention/hold/residency remains unresolved |
| Infrastructure/SRE | Conditional | Confirm the recorded local stack, capacity, dump/restore and operator ownership |
| API Contracts | Conditional | Resolve scope contract and retain strict versioned/fail-closed package import |
| Web/Accessibility | Conditional | F2 authenticates and renders Configuration lifecycle states; F3 owns scoped Tenant Profile consumer journey |
| QA/SDET | Conditional | Verify the amended F2 matrix, then require real local-profile, tenant-negative, recovery and accessibility evidence |

## 5. Required architecture amendment packet

Completed Product/Architecture amendments:

1. F1-PR-001 selected and updated consistently across WI-OI-047 and its test/design contracts.
2. D5-F1-021 amended to remove the unjustified F2 scanner dependency.
3. Current execution narrowed to Local Development; customer-managed production and cloud are deferred.
4. Exact existing Docker/PostgreSQL/MinIO boundary recorded in the local execution plan.

Still required before Local Foundation Acceptance or TP-1 Build entry:

1. Name the remaining local specialists and capture their decisions against the amended hashes.
2. Accept the exact local thresholds and evidence matrix.

WI-OI-047 has completed LOCAL-1–LOCAL-5 and is in Review. It cannot become Accepted, and WI-OI-046 cannot
enter Build, until the applicable named decisions are recorded. Production Privacy/Legal and
external-infrastructure evidence remain separately deferred.
