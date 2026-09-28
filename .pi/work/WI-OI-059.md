# WI-OI-059 — Local Module Runtime Integration Foundation

Status: Review  
Gate: Bounded Local G4 Review  
Profile: `module-runtime-local-development-v1` layered on `configuration-local-development-v1`  
Owner: SDLC Orchestrator / Integration Connectors / Infrastructure-SRE / Backend Domain  
Requirements: FR-02, FR-03, FR-05, FR-08, FR-11, FR-12, FR-14, FR-15, FR-16; NFR-GOV-001–003,
NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-OBS-001–004,
NFR-OPS-001–004

## Outcome

Make the first external-data business path deployable in the existing local GigaLibs stack without
pretending that every module daemon is online:

```text
authenticated tenant session
  -> workflow-platform BFF
  -> Connector Hub / Analytics over exact Docker service DNS
  -> PostgreSQL-backed module schemas
```

This work item establishes runtime truth and does not certify the full external-data product journey.
Dataset authoring, semantic modelling, charts, dashboards and reporting remain owned by WI-OI-043.

## Bounded scope

- Connector Hub API and Analytics API exact-image Docker targets, with connector reference metadata only
  and no tenant/demo seed records.
- Separate ordered migration jobs; application services cannot start before successful migrations.
- Explicit required runtime configuration with no embedded database or encryption-key defaults.
- Database-backed readiness probes that fail with a non-success response.
- One canonical tenant session key (`app.tenant_id`) for Analytics RLS through a forward migration.
- Credential-free HTTP upstream origins restricted to exact loopback or named local Compose services.
- Non-root, read-only runtime containers with dropped capabilities and no host-published module ports.
- Focused configuration, migration, proxy-boundary, build and local runtime verification.

## Explicit exclusions

- Universal Reports containment removal.
- Production, cloud, public ingress, DNS/TLS, external registry or customer-managed release.
- Adding every module daemon to the local profile.
- Claiming that Analytics business outcomes, external providers or human UAT are complete.
- Editing previously applied migration files.
- Reusing AR, Spend, CMMS or any other domain as an Analytics prerequisite.

## Acceptance contract

1. A clean database replays all Connector Hub and Analytics migrations in deterministic order.
2. A migration failure prevents the corresponding API from starting.
3. Both APIs reject missing/invalid required configuration and fail startup when persistence is unavailable
   or behind the required migration level.
4. Readiness proves database connectivity and the expected migration ledger; liveness proves only process
   availability.
5. The workflow BFF accepts only exact approved local upstream origins and never arbitrary configured URLs.
6. Web-to-module traffic uses Compose service names, not container loopback or host port assumptions.
7. Runtime containers are non-root, read-only and not directly exposed on host ports.
8. Tenant A cannot read or mutate Tenant B rows under the runtime database role.
9. No production mock, fixture fallback, default tenant or embedded credential is introduced.
10. Evidence names exact source state, images, commands, outcomes and remaining limits.

## Planned evidence

- Design: `docs/architecture/LOCAL_MODULE_RUNTIME_INTEGRATION_DESIGN.md`
- Profile: `config/deployment-profiles/module-runtime-local-development-v1.json`
- Compose overlay and Docker targets under `infra/compose/`
- Focused unit and integration tests plus a local runtime certification result
- Independent review request after implementation; agents do not record human acceptance

## Verification recorded 2026-09-25

- Source revision: `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6`
- Source-state SHA-256: `b1d090c83fe39dbc5ae4b3a841249311ce847fef266aeb79a38e3fa771f9714f`
- Exact Connector Hub image: `sha256:ad5ac3698550ae8c99f8c584bd5fc808448e7d2afc2bb683a6b96d6d4a2b5726`
- Exact Analytics image: `sha256:16723b9a85de99981662fcf91238f3c96922fd749303ecca7ddc2072660463e8`
- Both images build successfully, run as `65532:65532`, use read-only root filesystems, drop capabilities
  through Compose, publish no host module port and report healthy readiness against PostgreSQL.
- Clean isolated replay applies Connector Hub migrations 1-4 and Analytics migrations 1-11. Dedicated
  non-superuser/non-BYPASSRLS roles see only their selected tenant in the two-tenant verification.
- Both exact images terminate instead of serving when persistence is unavailable.
- Connector Hub and Analytics typechecks pass. The focused runtime/configuration/tenant-truth matrix passes
  120 tests before the DI fix and 75 directly affected Analytics tests after it, including the new runtime
  module boundary regression.
- Trivy 0.74.0 reports zero Critical/High vulnerabilities for both exact images under the configured policy.
- Review request: `docs/reviews/WI-OI-059-local-runtime-review-request-2026-09-25.md`.

## Remaining limits

- This is technical Local Development evidence, not human acceptance, production/cloud release or external
  provider certification.
- Universal Reports remains contained and Analytics business completeness remains owned by `WI-OI-043`.
- Six older Analytics Jest-style business suites are not wired into the repository Vitest harness; they do
  not invalidate this runtime-foundation evidence and remain a `WI-OI-043` verification gap.
- The repository-wide workflow-platform typecheck currently exposes an unfinished GigaOps work-unit status
  mismatch. It is not hidden as a pass and is owned by the newly authorized bounded `WI-OI-060` slice.
