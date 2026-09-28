# WI-OI-061 - Workforce resource and capability vertical slice

Status: Review  
Gate: Bounded Local G4 Build — resource/capability vertical  
Owner: SDLC Orchestrator / Workforce Domain / Web Experience  
Requirements: FR-01, FR-02, FR-04-FR-06, FR-08, FR-10-FR-12, FR-14-FR-16;
NFR-GOV-001-003, NFR-SEC-001-005, NFR-DATA-001-004, NFR-REL-001-003,
NFR-PERF-001-003, NFR-OBS-001-004, NFR-UX-001-004, NFR-OPS-001-004

## Outcome

Replace the GigaOps static containment page with the first real tenant-backed Workforce journey. A tenant
manager can create and maintain source-neutral Workforce resources, define capabilities and assign
effective-dated qualifications. The UI exposes the complete Workforce information architecture while
marking later scheduling, time, pay and compliance verticals truthfully unavailable.

CMMS remains the owner of assets and maintenance work. Its left-navigation entry is restored under a
dedicated Workforce & Operations group; it does not become the Workforce data owner.

## Authorized Build scope

1. Add an additive canonical Workforce migration for resources, capability definitions and resource
   qualifications with tenant-safe keys, forced RLS, optimistic versions and audit/outbox evidence.
2. Add versioned read/write APIs with signed context, granular read/manage permissions, bounded input,
   pagination, search, conflict handling and safe errors.
3. Replace the contained Workforce BFF with an allow-listed same-origin proxy that mints the canonical
   signed `PlatformContextV1` and never forwards browser credentials or tenant headers.
4. Deliver an accessible GigaOps workbench with overview, resource directory, capability catalogue and
   qualification assignment backed only by PostgreSQL API responses.
5. Show the full planned GigaOps submodule navigation with explicit availability states. No mock KPI,
   worker, schedule, time, pay or compliance records may appear.
6. Place both GigaOps and CMMS in a visible Workforce & Operations sidebar group without merging domain
   ownership or enabling contained CMMS People/Dispatch paths.
7. Rebuild and verify the exact local Workforce/web images, migration replay, two-tenant denial, restart
   persistence, tests, audits and zero Critical/High image policy.

## Explicit exclusions

- Jobs/positions, availability/absence, demand/scheduling, CMMS booking integration, time/attendance,
  pay readiness, jurisdiction policies and workforce analytics data.
- Applying or editing the legacy `gigalibs_gigaops` prototype migrations.
- CMMS People/Dispatch or duplicate technician master data.
- Production, cloud, public ingress, external providers or distribution authorization.

## Definition of Done

- Tenant A can create a resource and capability, assign the capability, search/read the persisted result
  after restart and update it with an expected version.
- Tenant B cannot list, read, modify or infer Tenant A records; unscoped database access returns no rows.
- Denied, empty, loading, validation, conflict, dependency failure, retry and success UI states exist.
- Every mutation records transactional audit/outbox evidence; no client data is used as tenant authority.
- GigaOps and CMMS are visible in the left sidebar for authorized/inspection personas with accurate states.
- Mandatory repository checks and slice-specific exact-image certification pass before Review.

## Authority — 2026-09-26

The repository owner, Product Owner and Solution Architect directed development to continue and requested
all GigaOps submodules to be visible in the UI plus CMMS in the left sidebar. WI-OI-060 has left Build for
Review, so this is the sole active implementation item. Human product/risk/release acceptance remains
required after measured verification.

## Owner-directed changes — 2026-09-26 (continuation)

1. **Tenant Admin access (approved "grant workforce:* to Tenant Admin").** `TENANT_ADMIN` holds
   `workforce:*` (`packages/rbac-core/src/default-roles.ts`). The web check now treats a resource wildcard as
   covering granular dotted permissions of the same resource (`apps/workflow-platform/lib/module-access.ts`),
   matching the Workforce API. Root cause: the dotted permissions were dropped by the session filter and held
   by no role, so only a platform `*` could use the workbench.
2. **Section-route crash.** Every `/gigaops/<section>` page failed with `GIGAOPS_SECTIONS.includes is not a
   function` because the server route imported a value from a `'use client'` module. The list moved to
   `components/gigaops/sections.ts`.
3. **Lexicon (approved "renaming CREW to TEAM").** Forward migration
   `000004_workforce_resource_type_team.up.sql` renames any `CREW` rows with a version bump and audit record
   and replaces the check constraint; `WorkforceResourceTypeV1Schema` and the UI use `TEAM`. The V1 contract
   was corrected in place because WI-OI-061 was never released and no `CREW` row existed (0 resources).
   Migration 000003 keeps its historical text; installed migrations are never edited.
4. **Schema contract.** `WORKFORCE_SCHEMA_CONTRACT_VERSION = 4` replaces a hard-coded bound of 3 that stopped
   the API after migration 4 (web was started with `--no-deps` during the forward fix); a test now pins the
   constant to the last runtime-foundation migration. Compose, verification script, `.env.example` and the
   stale deployment profile (was migration 2, business API/UI "disabled") were corrected.
5. **Geospatial containment (directed "Mark Geospatial Studio unavailable").** WI-OI-061 placed Geospatial in
   the Workforce & Operations group, so its accurate state is in scope here: catalogue `CONTAINED`, not
   entitlement- or trial-eligible; `/maps` renders the contained status; `/api/maps/*` returns
   `503 GEOSPATIAL_CONTAINED` after session verification and never contacts an upstream. The former proxy
   forwarded browser `Authorization` and caller `x-tenant-id`/`x-user-id` headers and defaulted to
   `127.0.0.1:3018`; originals are preserved in `scratch/wi-oi-063-originals/`. `@gigalibs/maps-react` was
   removed from the web manifest (three lockfile lines) because nothing imports it now. Certification is
   WI-OI-063.

## Verification evidence — 2026-09-26

Source `5abfa667bb10` / state `e349c2d4a6d7…`; all images tagged `5abfa667bb10-e349c2d4a6d7`.

| Check | Result |
| --- | --- |
| `pnpm build` | 106/106 tasks |
| `pnpm test` | 191/191 files, including Python execution-plane tests |
| `audit:production-data`, `audit:all-runtime-data`, `audit:package-dependencies`, `audit:api-boundary`, `audit:navigation`, `audit:sdlc` | all passed (SDLC: 63 items, WIP 1 = WI-OI-061) |
| Exact images | migrations, api, web, workforce-api built from the recorded identity; analytics and connector-hub rebuilt so `.env.modules` names existing images |
| Deployment | all five services healthy; control-plane migrations up to date; `gigalibs_workforce` at migration 4; live constraint `HUMAN`/`TEAM`/`POOL` |
| `verify-workforce-http.sh` | passed: missing token, wrong audience, wrong module, missing scope denied; tenant binding; resources and capabilities readable with scopes |
| `verify-workforce-runtime.sh` | passed: empty-database replay 000001–000004, least privilege, forced RLS, append-only audit, ledger protected |
| `verify-workforce-journey.sh` (new) | passed, run `20260926T063727Z`: tenant A creates capability and `TEAM` resource, `CREW` rejected (400), assigns, survives API restart, reads, updates with expected version (v2), stale update 409; tenant B list empty and read/update/assign 404; exactly 4 audit and 4 outbox rows for A, 0 for B |
| Image policy (Trivy 0.74.0, unfixed included) | migrations, api, web, workforce-api: 0 Critical, 0 High; SBOMs and reports in `infra/compose/evidence/wi-oi-061-20260926T063809Z/` |
| New tests | session permissions built through `AuthService.getSessionContext` (Tenant Admin holds `workforce:*`, Manager/Member/Viewer none); dotted wildcard coverage; Tenant Admin proxy path; section route and client-boundary guard; schema-contract pin; Geospatial containment (catalogue, 401, 503 on every method, no upstream call) |

Observed outside this slice: `apps/workflow-platform/__tests__/configuration-surface-bff.test.ts` failed
intermittently. Root cause (found under WI-OI-063): the test built its token twice and each embeds the
current second, so a second boundary between the calls changed the expected value. Fixed by reusing one
token; five consecutive isolated runs pass.

## Open for Review

- Independent reviewer for the permission change (the author cannot be the only reviewer).
- Human product acceptance of the resource, capability and qualification journeys.
- Owner commit decision for the working tree (about 600 changed files across work items).
