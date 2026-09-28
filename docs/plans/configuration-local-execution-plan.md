# Configuration local execution plan

Status: Authorized Local G4 execution plan under WI-OI-047; not production-release authorization

Date: 2026-09-22

Work item: WI-OI-047

## 1. Current objective

Complete and verify the Configuration foundation on the existing local Docker environment without waiting
for a cloud provider or other externally operated infrastructure. This is the current development and demo
milestone. It is not Managed Cloud or production-release certification.

The execution profile key is `configuration-local-development-v1`. The stricter
`configuration-customer-managed-local-v1` release candidate remains deferred until its TLS, independent
backup and production secret/storage controls can be evidenced.

The local milestone may hand off to F3/TP-1 development after WI-OI-047 completes its bounded local slice
and moves to Review. Deferred external evidence remains required before any production/cloud release claim.

## 2. Existing stack to reuse

Observed locally on 2026-09-22:

| Component | Existing implementation | Current use |
| --- | --- | --- |
| Container runtime | Docker 29.0.1 | Reuse |
| Compose | Docker Compose 2.40.3 Desktop | Reuse |
| PostgreSQL | `postgres:16-alpine`, local image ID `sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229` | Reuse as authoritative local persistence |
| Object storage | MinIO `RELEASE.2025-09-07T16-13-09Z`, image digest `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` | Reuse over loopback HTTP for local-only evidence |
| Redis | `redis:7-alpine` is already running | Not required by the bounded Configuration slice; do not create an F2 dependency |
| Dependency Compose | `docker/docker-compose.dev.yml` | Reuse for PostgreSQL/MinIO; do not duplicate local dependencies |
| Customer bundle | `infra/compose/compose.yaml` | Repair before it can be treated as a runnable local application bundle |

The current `infra/compose/compose.yaml` is inventory, not passing evidence: it references unavailable or
unproven application images, obsolete environment names, Redis as an unnecessary dependency and probe
routes that do not match the applications.

## 3. Mandatory local work

These controls cannot be skipped because they are application correctness or tenant-safety requirements:

1. Replace every production-reachable mock/default tenant/fake success with real local behavior or an
   explicit unavailable state.
2. Use the real PostgreSQL schema and migrations; never substitute local JSON or in-memory business state.
3. Map the exact API/web environment names consumed by source and fail fast on missing/invalid values.
4. Reuse the existing MinIO service with `STORAGE_ALLOW_INSECURE=true` only for loopback local execution;
   record that classification in evidence.
5. Implement truthful API/web liveness and readiness routes and configure Compose to call those routes.
6. Build API, web and migration artifacts from the checked-in source revision without pulling fictional
   GigaLibs registry images.
7. Keep secrets in an ignored mode-0600 local file or process secret injection; never commit or print them.
8. Prove login, selected-tenant authority, maker/checker Configuration lifecycle, explicit-scope manifest,
   two-tenant denial, revocation and restart persistence against real services.
9. Prove local database dump/restore, API/web restart, PostgreSQL interruption/recovery and MinIO outage
   behavior without inventing success.
10. Run the mandatory repository gates and focused Configuration, BFF, accessibility and evidence checks.

## 4. Deferred external-infrastructure work

The following items are marked `DEFERRED_EXTERNAL`, not `PASS`. They do not block the local development/demo
milestone, but they block production, Managed Cloud and externally hosted availability claims:

| Deferred concern | Why deferred now | Future trigger |
| --- | --- | --- |
| HostingRaja, DigitalOcean or another cloud provider | No provider selected | Provider-specific work item and cost/responsibility decision |
| Kubernetes/Helm, cloud ingress and multi-replica HA | No cloud/orchestrated target | Accepted cloud or local-HA profile |
| Public DNS, public CA and internet-facing TLS | Localhost-only operation | External deployment origin selected |
| Managed KMS/secret manager | No external authority selected | Production/customer deployment contract |
| External S3 provider, cross-host replication and provider durability | Existing local MinIO is sufficient for local tests | Production storage provider selected |
| Remote container registry promotion and externally verifiable provenance | Images are built and consumed locally | Release/promotion environment selected |
| External IdP/SCIM interoperability | Local persisted authentication is the current test authority | Named enterprise identity provider selected |
| Pager/email/Slack alert delivery | No external notification provider selected | Production operations channel selected |
| Cross-host failover, external backup vault and provider PITR | Single workstation is the current boundary | Production RPO/RTO profile selected |
| G7 production observation window | No production cohort exists | Human-authorized production rollout |

Local image IDs, local SBOM output where tooling is available, local checksums and test artifacts must still
be recorded. Deferral is not permission to use mutable/fabricated application artifacts or expose secrets.

## 5. Ordered implementation slices

### LOCAL-1 — Contract and Compose correction

- Generate a machine-readable local runtime contract from the actual API/web configuration.
- Repair canonical names, required settings, deny-by-default connector inputs and dependency mapping.
- Make the existing local PostgreSQL/MinIO authority explicit and remove Redis from the Configuration
  dependency graph.

### LOCAL-2 — Reproducible local application artifacts

- Add focused API, web and migration container build definitions.
- Build from the frozen lockfile/source revision, run as non-root and exclude `.env`, Git and test evidence.
- Reference locally built revision-qualified images; record their local immutable image IDs.

### LOCAL-3 — Health, startup and migration

- Add or correct API/web liveness and readiness.
- Run the one-shot migration job before the API.
- Prove invalid configuration and unavailable PostgreSQL/MinIO fail truthfully.

### LOCAL-4 — Real Configuration journey

- Run authenticated maker/checker authoring, validation, approval, publication and activation.
- Fetch the active manifest using explicit test scope.
- Run tenant-negative, role downgrade and suspension checks.
- Do not count the Tenant Profile runtime-value journey; F3/TP-1 owns it.

### LOCAL-5 — Recovery and evidence

- Prove restart persistence, PostgreSQL outage recovery, local dump/restore and MinIO failure behavior.
- Run local performance/accessibility/observability checks and the mandatory repository gates.
- Freeze hashes and record every external row as `DEFERRED_EXTERNAL`.

## 6. Gate semantics

Passing LOCAL-1 through LOCAL-5 means **Local Foundation Ready for continued development/demo**. It may
support the next separately authorized F3/TP-1 Build slice. It does not mean `RELEASED`, production ready,
cloud certified, HA, externally recoverable or supported on HostingRaja/DigitalOcean.

WI-OI-047 is the sole active G4 work item. Chinni babu Rayapudo is the named Product Owner, Solution
Architecture reviewer and local operator for Build entry. Security, Backend/Data, Web/Accessibility and
QA/SDET remain mandatory independent exit reviewers; their decisions cannot be supplied by the producer.
External infrastructure operators are not required for the local milestone.
