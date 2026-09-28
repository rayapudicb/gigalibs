# Configuration Reference Profile architecture

Status: Proposed G2–G3 design for WI-OI-047; not Build or release authorization

Date: 2026-09-22

Owners: Infrastructure/SRE, Release Operations, Backend Domain and Web Experience

Local reviewers required: Solution Architecture, Security & Privacy, Backend/Data, Web/Accessibility,
Infrastructure/local operator, QA/SDET and Product

Release-profile reviewer deferred: Release Authority and future external/cloud operator

## 1. Decision

The Product Owner and Solution Architecture reviewer narrowed the current execution target on 2026-09-22
to one bounded **Local Development Configuration Profile**:

- Compose-packaged API, web, one-shot migration job and PostgreSQL 16 on an operator-controlled local or
  on-premises host;
- the existing loopback MinIO S3-compatible endpoint for local development/demo evidence; and
- one API and one web process, with truthful single-host availability and recovery limits.

The Customer-Managed Local production candidate and Managed Cloud are deferred. HostingRaja and
DigitalOcean are possible future cloud candidates only; neither is selected, contracted, implemented or
certified. A future release profile receives a separate work item or accepted scope amendment, provider/
operator decision, contract update and complete rerun of the applicable acceptance matrix.

### 1.1 Local does not automatically mean production-certified

| Stage | Purpose | Claim boundary |
| --- | --- | --- |
| Current workstation runtime | Development and manual UAT on localhost | Useful evidence only; HTTP test storage, developer processes and source builds are not production certification |
| Current Local Development profile | Existing Docker dependencies plus repaired local application startup | May be declared ready only for continued development/demo after LOCAL-1–LOCAL-5 pass |
| Customer-Managed Local release candidate | Reproducible Compose deployment on an operator-controlled host with TLS storage, immutable images, independent backups and runbooks | Deferred production certification |
| Future cloud profile | Provider-specific hosted operation | Deferred; receives no evidence or claim from either local stage |

This profile proves the Configuration foundation required by the Tenant Profile adopter. It is not a
claim that the entire GigaLibs platform, execution plane, connector estate, CMMS, Analytics or every module
is deployed or production-certified.

The currently advertised “turnkey platform” and air-gap claims must be narrowed to this boundary until all
additional services receive their own deployment contracts and evidence.

## 2. Object-storage decision

The current local decision is to reuse the pinned MinIO service in `docker/docker-compose.dev.yml` over
loopback HTTP. `STORAGE_ALLOW_INSECURE=true` is accepted only for `configuration-local-development-v1`.

The deferred production decision is **external, operator-supplied TLS S3-compatible storage**.

- Customer-Managed Local requires the customer/operator to provide a supported S3-compatible endpoint, bucket,
  credential reference, CA trust and backup/retention policy.
- No object-store product or image is added to a release bundle by WI-OI-047. Bundling one for production requires a separate dependency
  decision covering license, SBOM, CVEs, upgrades, capacity, encryption, backup, restore and air-gap supply.
- Local verification may use the existing isolated S3-compatible test service, clearly identified as test
  infrastructure and never promoted as the production recommendation.

This avoids quietly introducing an unreviewed production dependency. The deferred Customer-Managed Local
release profile has an external object-store prerequisite and is not yet an all-in-one appliance. The
existing HTTP MinIO instance supports local development/UAT only; it is not production evidence and is
never silently promoted into the release profile.

## 3. Supported topology

```text
Browser
   |
   | HTTP on explicit loopback origin
   v
Workflow web (1 local-development process/container)
   |
   | authenticated server-side BFF
   v
Control-plane API (1 local-development process/container)
   |                 |
   |                 +--> existing MinIO over local Docker/loopback HTTP
   v
PostgreSQL 16
   ^
   |
one-shot forward migration job

PostgreSQL LISTEN/NOTIFY wakes Configuration cache invalidation.
PostgreSQL rows remain authoritative; notification or process cache loss is recoverable.
```

Redis is not required by the inspected Configuration runtime and is excluded from the F2 reference
topology. It may be added later for a real accepted consumer, never as decorative infrastructure.

## 4. Component boundary

| Component | Included behavior | Explicitly excluded |
| --- | --- | --- |
| Migration job | `packages/db` production forward migrations; one successful completion before API rollout | Schema mutation from API startup; reverse destructive migration |
| Control-plane API | Authenticated Configuration APIs, audit/outbox, manifest cache/invalidation, metrics, API health | F3 Tenant Profile runtime-scope/value certification, execution plane, arbitrary module services, bundled credentials |
| Workflow web | Authenticated Configuration Studio through the server BFF | F3 Tenant Settings value journey; claim that every visible module is certified by F2 |
| PostgreSQL 16 | Canonical configuration/auth/tenant state and `LISTEN/NOTIFY` | Cross-tenant shared session state without transaction controls |
| Object storage | Existing API startup dependency and selected export/artifact paths | Public customer-data objects, embedded credentials, unspecified retention |
| Observability | Authenticated metrics, structured logs, dashboard/alerts and operator runbook | Tenant/user/record identifiers as metric labels |

## 5. Health semantics

### API

- `GET /api/v1/health`: liveness only. A 200 means the process/event loop can serve HTTP. It does not mean
  PostgreSQL, storage or downstream modules are healthy.
- `GET /api/v1/ready`: readiness. At minimum it verifies PostgreSQL. Before certification, reviewers must
  decide whether Configuration invalidation-listener readiness is mandatory or separately exposed.
- Startup configuration is validated before listening. Missing/invalid required configuration exits
  non-zero and never reaches Ready.

### Web

Add explicit public process-liveness and dependency-readiness routes. Web readiness checks the configured
control-plane `/api/v1/ready` with a short timeout and no bearer forwarding. It returns a sanitized 503
when unavailable. It must not invent success or expose upstream bodies/topology.

Compose targets only implemented routes. Readiness prevents dependent work while unavailable; liveness
does not restart an otherwise healthy process merely because PostgreSQL is temporarily unavailable. A
future orchestrated profile must define its own traffic-removal and rolling-shutdown semantics.

## 6. Configuration and secret authority

The canonical contract is [Configuration deployment contract v1](../contracts/configuration-deployment-contract-v1.md).

- Non-secret configuration comes from the Compose environment.
- Secrets come from a customer-owned mode-0600 environment file/secret mechanism. Values are never
  committed, rendered into evidence or printed by bootstrap tools.
- Ed25519 signing keys are generated in the formats consumed by the application: PKCS#8 DER base64 for
  Configuration/Tenant Export and PEM for platform-context signing where that capability is enabled.
- AES-256 keys are canonical base64-encoded 32-byte values with explicit active key version and bounded
  prior-key ring during rotation.
- Connector host allowlists are explicit. Empty means no host, not allow all.
- Production uses HTTPS object storage and secure cookies. Insecure storage/HTTP flags are permitted only
  in isolated non-production certification with visible evidence attribution.

## 7. Local artifact and deferred supply-chain architecture

Each API, web and migration artifact has a reviewed multi-stage Containerfile and separate final image.

- Builder inputs are the exact lockfile, workspace manifests and source revision.
- Install uses the pinned package-manager version and frozen lockfile.
- Generated Prisma client and production application output are created in the builder.
- Final images contain only required runtime files/dependencies and a non-root user.
- Repository `.env`, Git data, test databases/evidence, local caches and credentials are excluded.
- Local builds use revision-qualified tags and record immutable local image IDs tied to the source
  revision. Migration and application images from different revisions cannot be mixed.
- Repository dependency/security gates and any locally available SBOM output remain mandatory.
- Remote registry promotion, signed image digests, external provenance and provider scanning are
  `DEFERRED_EXTERNAL` and remain required before a production release claim.

## 8. Deployment flow

1. Validate profile schema, secret references, DNS/TLS and dependency reachability.
2. Verify the source revision, revision-qualified local tags and immutable local image IDs.
3. Take/verify the required backup or recovery checkpoint.
4. Run the migration job once with bounded deadline and database migration authority only.
5. Deploy API; require startup validation and readiness before traffic.
6. Deploy web; require control-plane readiness before traffic.
7. Run smoke, authenticated Configuration and tenant-negative journeys.
8. Import dashboards, verify scrape authentication and fire/resolve test alerts.
9. Observe the accepted window; halt/roll forward on threshold breach.

Database changes roll forward. Application rollback is allowed only while the previous image is compatible
with the migrated schema. A failed migration blocks API rollout; it never triggers an automatic destructive
schema rollback.

## 9. Availability and failure model

- Local Development starts with one API/web instance and truthfully has workstation-level downtime.
- PostgreSQL outage makes API readiness fail and Configuration commands return sanitized retryable errors.
- A disconnected invalidation listener bypasses process cache and reads authoritative PostgreSQL according
  to the existing Configuration policy.
- Object-storage outage makes dependent export/artifact operations unavailable; Configuration metadata
  operations continue only where the accepted contract does not require storage.
- No profile reports Ready because a dependency check was mocked or disabled.

The deferred Managed Cloud profile may later introduce replicas, disruption budgets and topology
spreading. None of those capabilities or availability claims are part of the current Local Development
milestone.

## 10. Observability and data handling

- Structured logs carry correlation, service, release and bounded failure codes; never credentials,
  configuration values or raw customer records.
- Metrics use bounded service/profile/version/result labels. Tenant, actor, record, event and raw URL values
  are prohibited labels.
- Secret validation errors name only the setting, never its value.
- Evidence captures image/config schema hashes, aggregate outcomes and test-attributable identifiers.
- Backups, storage artifacts and logs follow accepted classification, retention, hold and deletion policy.

## 11. Compatibility

- Existing API routes and Configuration data are unchanged by deployment repair.
- Deployment contract v1 is additive until first acceptance. Removing or renaming a required setting,
  secret, probe, image component or dependency is breaking and requires a new contract version/migration.
- F3 may add `CONFIGURATION_RUNTIME_ENVIRONMENT_KEY` only through its accepted contract change; every
  claimed deployment profile must update before the F3 artifact is deployable.
- The old `PORT`, `CONTROL_PLANE_URL` and `CONFIGURATION_PACKAGE_SIGNING_KEY` aliases are not silently
  honored. Manifests are corrected to canonical names and drift tests prohibit their return.

## 12. Ownership

| Concern | Owner |
| --- | --- |
| Profile boundary and architecture | Solution Architecture |
| Runtime configuration and health | Infrastructure/SRE with Backend/Web owners |
| Secret/key policy | Security & Privacy / IAM |
| PostgreSQL migration and recovery | Backend/Data |
| Storage classification/retention | Data Portability |
| Local image identity and build evidence | Infrastructure/local operator with application owners |
| Remote SBOM/provenance/promotion | Release Operations — deferred until a release profile exists |
| Contract/fault/accessibility evidence | QA/SDET and Web/Accessibility |
| Scope/value acceptance | Human Product Owner |
| Production rollout | Human Release Authority |

## 13. G4 entry decision

This design records one bounded Local Development profile and defers production/customer-managed/cloud
certification. The current implementation scope is defined in
`docs/plans/configuration-local-execution-plan.md`. Chinni babu Rayapudo accepted the bounded Build entry
as Product Owner, Solution Architecture reviewer and local operator, and WI-OI-047 is the sole active Build
item. Independent Security, Backend/Data, Web/Accessibility and QA/SDET exit acceptance remains open.
This document does not authorize production or external deployment.
