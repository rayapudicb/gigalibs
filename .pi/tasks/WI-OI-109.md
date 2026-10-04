# WI-OI-109: Universal organization hierarchy and enterprise scope

- **Status:** Review (109a–109g deployed to bounded Local Development; native empty-tenant cleanup and fresh-install/upgrade paths verified; live certification and independent review remain)
- **Work item:** WI-OI-109. Evidence goes in `.pi/work/WI-OI-109.md`.
- **Size:** L, delivered as independently verified vertical slices

## Goal

Give every tenant a governed, versioned organization model that an authorized administrator can configure without
developer work for a company, government, nonprofit or multi-site operator. Tenant remains the hard SaaS isolation
boundary; organization units become the shared business scope used consistently by IAM, modules, analytics, reports
and future mobile clients.

## Product and architecture invariants

- No fixed hierarchy such as Company -> Division -> Department -> Store is encoded in code. Tenants configure unit
  types, labels and parent/child rules; packs may propose templates but cannot silently activate them.
- Configurability does not weaken semantics. Unit types carry controlled capabilities such as legal entity,
  operational, reporting, workforce, cost-accounting or place-operating scope.
- No magic `Org 0`, default tenant, client-supplied authority, production mock, or cross-tenant parent/edge is allowed.
  Tenant-shared master data is an explicit scope, not a special organization row.
- `Tenant` remains the customer security boundary. `Place` remains the physical/geospatial hierarchy. Organization
  units may operate or own places through effective-dated links but do not replace them.
- Existing `Department`, `Tenant.parentTenantId`, member department scope and module-specific scope are reconciled
  additively. There is one canonical write authority; no permanent dual-write or duplicate hierarchy service.
- Draft edits never affect runtime authorization. A validated, immutable hierarchy version is approved/published and
  activated atomically, with effective dates, optimistic concurrency, impact preview, audit and outbox evidence.
- Runtime scope is resolved server-side and fails closed. Modules receive a versioned, signed organization context and
  apply tenant plus organization predicates in APIs, jobs, events, exports, caches, analytics and reports.

## Scope

- **May change:** `.pi` governance/evidence; ADR-0003 through a superseding ADR; shared organization and context
  contracts; canonical control-plane Prisma schema and forward migrations; `packages/tenancy-nest` domain/API;
  control-plane BFF routes; `/settings/organization`; authorization/scope utilities; generated API clients; audit and
  outbox contracts; focused adapters in Workforce, CMMS, Geospatial, Analytics and Reports; tests and local proof
  scripts.
- **Must not change:** Gemini's uncommitted WI-OI-103 files; applied migration files; CMMS import/export files;
  module-owned business records unrelated to scope; mobile repository; secrets; cloud/production configuration; the
  running database or web on port 5180 without separate owner authorization.

## Read first

- `.pi/PLAN.md`; requirements FR-04, FR-05, FR-14 and FR-15; applicable NFRs and SDLC G0-G5.
- `docs/architecture/ADR-0003-cross-domain-identity-hierarchy-and-workforce-primitives.md` and ADR-0006.
- Existing `Tenant`, `Department`, `TenantMember`, Place and `PlatformContextV1` implementations and migrations.
- iDempiere reference only: `MOrg`, `MOrgInfo`, `MTree`, `MTreeNode`, `MRole` and organization-access behavior under
  `/Users/rayapudi/idem`; adopt concepts, not Java structure, magic IDs or global mutable context.

## Slices and steps

1. **109a - Reconciliation and ADR:** inventory every current hierarchy/scope reader and writer; classify iDempiere
   behavior; decide canonical ownership, unit-type capabilities, primary versus alternate trees, effective dating,
   shared-master scope, legal-entity semantics, place links, scope inheritance, compatibility and retirement. Record
   ADR-0018, threat model, data classification, permission matrix and migration/forward-fix plan before G4 code.
2. **109b - Contracts and persistence:** add strict versioned contracts and additive tenant-bound tables for unit
   types, units, immutable hierarchy versions/edges, closure or equivalent proven traversal, place links, member/role
   scope grants, idempotency and audit/outbox. Enforce RLS, composite tenant keys, cycle prevention, bounded traversal,
   effective-date consistency and clean-install plus representative-upgrade evidence.
3. **109c - Domain and APIs:** implement server-authoritative CRUD and search, draft validation, move/reparent impact
   preview, maker-checker publish/activate, archive/restore and historical/as-of reads. Publish OpenAPI/AsyncAPI,
   idempotency, ETag/version conflicts, pagination, safe errors, audit and transactional outbox behavior.
4. **109d - Administration UI:** replace the department-only page with an accessible tree/table administration
   experience for unit types, units, relationships, legal/operational details, effective dates, preview, approval and
   activation. Cover loading, empty, denied, validation, conflict, stale, dependency failure, retry and success states.
5. **109e - IAM and module scope:** issue signed server-resolved organization context; prove permission inheritance and
   revocation; bridge existing Department assignments; link Place without merging the models; adapt one complete
   cross-module vertical path through Workforce/CMMS, Analytics and Reports before expanding other consumers.
6. **109f - Mobile/API readiness:** publish client contracts and capability-driven navigation/forms needed by tablet
   and phone teams, without putting hierarchy authority or business rules in the client and without changing the
   separate mobile repository in this item.
7. **109g - Certification:** prove retail, government and manufacturing structures using isolated attributable test
   tenants; verify arbitrary business labels/levels, two-tenant and sibling isolation, cycles, reparent concurrency,
   revocation, historical accuracy, audit reconstruction, accessibility, bounded performance, fresh install, upgrade,
   backup/restore and failure recovery. Re-run the deferred WI-OI-103/WI-OI-106 live proofs with organization scope.

## Done when

- [ ] Outcome -> requirement -> ADR/contracts -> migration/code -> tests -> evidence is complete for every slice.
- [ ] An authorized tenant administrator creates and publishes different retail, government and manufacturing trees
      without code changes; unauthorized or unpublished changes cannot influence runtime scope.
- [ ] Tenant, sibling-unit, historical/as-of, Place-link and module-query isolation pass at API and database layers.
- [ ] Existing Department data and consumers have an evidenced compatibility path with no data loss or split authority.
- [ ] Web administration is keyboard/screen-reader usable and every action is backed by real APIs and persistence.
- [x] Fresh installation, representative upgrade and forward-fix paths pass. Bounded organization scale evidence is recorded separately in 109g.
- [x] `pnpm verify` passes with only the explicitly known `WORKFORCE_API_URL` drift.
- [ ] Evidence is recorded in `.pi/work/WI-OI-109.md`, and `.pi/NOW.md` is updated.

## Stop and ask if

- a decision would change Tenant as the hard isolation boundary, merge Organization with Place, introduce a new
  service/database, permit cross-tenant organization edges, or require destructive migration;
- implementation would overlap uncommitted work, change a running service/database, or require production/cloud data;
- legal-entity, financial consolidation, data residency or government classification semantics are assumed rather
  than explicitly designed and reviewed.

## Report

At most five bullets: changed behavior, evidence, deferred/external items, next slice and owner decision. Commit only
when the owner says the literal word `commit`.
