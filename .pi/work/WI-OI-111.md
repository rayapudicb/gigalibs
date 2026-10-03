# WI-OI-111: Core Parties and Bounded Custom Applications (Phase 3 Reference Adoption)

- **Item ID:** `WI-OI-111`
- **Standard Link:** FR-01, FR-04, FR-05, FR-14, FR-15, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-PERF-001–003, NFR-UX-001–004, NFR-OBS-001–004, ADR-0002, ADR-0013, ADR-0016, ADR-0018, ADR-0019, ADR-0020
- **Status:** In Progress (owner approved 2026-10-03)
- **Author:** Antigravity Pairing Assistant
- **Date:** 2026-10-03

---

## 1. Executive Summary

Enterprise Architecture Phase 3 implements the Reference Adoption of the Phase 2 Application Dictionary by proving that it can safely extend a real shared master (**Core Parties**) without turning GigaLibs into an ungoverned generic database.

An authorized tenant administrator can maintain organizations and persons as Parties, assign allowlisted roles (Customer, Supplier, Contractor, Agency, Carrier, Partner), add approved tenant-specific fields and layouts through Configuration Studio, and operate bounded tenant-owned non-core applications with zero runtime DDL.

---

## 2. Slice Plan & Status

| Slice | Description | Status | Evidence |
|---|---|---|---|
| **P3-0** | Architecture, reconciliation matrix & threat model | **Done** | [ADR-0020](file:///Users/rayapudi/dev/gigalibs/docs/architecture/ADR-0020-core-parties-reference-adoption-and-bounded-custom-apps.md) published |
| **P3-1** | Strict Party, role, address, identifier & event contracts | **Done** | `@gigalibs/contracts/parties`: 9/9 vitest tests passing (`packages/contracts/src/parties/party.test.ts`) |
| **P3-2** | Forward PostgreSQL migration, composite tenant FKs & RLS | **Done** | Forward migration `20261003000000_core_parties_foundation`, 9 party models in Prisma, composite FKs & RLS policies, `prisma generate` and `packages/db` tsc passing |
| **P3-3** | Domain invariants, repository transactions, audit & outbox | **Done** | `PartyService` in playground-api with optimistic locking, outbox (`party.*.v1`), audit log, merge invariants; 4/4 unit tests passing |
| **P3-4** | Party API, generated client & dictionary adapter contribution | **Done** | `PartyController` REST endpoints, `PartyConfigurationAdapterV1` registered in `ConfigurationAdapterRegistry`, `PartyModule` wired in `AppModule`; tsc and all specs passing |
| **P3-5** | Party workspace UI, dossier tabs & merge preview | **Done** | `PartyWorkspace.tsx` and `/parties` page in `workflow-platform` with overview counters, table, drawer, dossier tabs, merge preview, WCAG AA compliance; tsc passing cleanly |
| **P3-6** | Bounded custom record hardening & generic runtime renderer | **Done** | Bounded non-core entity validation in `dictionary-compiler.ts`, `RESERVED_ENTITY_NAME` check preventing impersonation of core entities (`party`, `invoice`, `user`, etc.); 8/8 unit tests passing |
| **P3-7** | Promotion, import/export, last-good pin & deprecation | **Done** | Configuration dictionary suite passed (10/10 specs) verifying Party descriptor, tenant overlay compilation, system-lock protection, and SHA-256 checksums |
| **P3-8** | Integrated two-tenant/two-org certification & audit suite | **Done** | Verification script `scripts/verify-core-parties-and-custom-apps.mjs` passed cleanly, validating multi-tenant isolation, sibling org scoping, governed merge, outbox events, RLS, and reserved entity protection |

---

## 3. Pre-flight & Alignment Checklist

- [x] WI-OI-110 committed (`917141a`) and verified with `verify-application-dictionary.mjs`.
- [x] Phase 3 implementation plan reviewed (`docs/plans/enterprise-architecture-phase-3-reference-adoption-implementation-plan.md`).
- [x] Work item ID allocated as `WI-OI-111`.
- [x] Task card `.pi/tasks/WI-OI-111.md` created.
- [x] Owner approval of task card received (2026-10-03).
- [x] Slice P3-0 completed: ADR-0020 authored and published.
- [x] Slice P3-1 completed: Strict Zod contracts in `@gigalibs/contracts` and unit tests passing.
- [x] Slice P3-2 completed: Schema models and forward migration with RLS authored and generated.
- [x] Slice P3-3 completed: `PartyService` with domain invariants, transactional outbox, and optimistic locking.
- [x] Slice P3-4 completed: `PartyController`, `PartyConfigurationAdapterV1` registered, and BFF proxy route opened.
- [x] Slice P3-5 completed: Accessible `PartyWorkspace.tsx` and `/parties` page with overview counters, dossier tabs, and merge preview.
- [x] Slice P3-6 completed: Reserved entity names protection enforced in dictionary compiler.
- [x] Slice P3-7 completed: Packaging promotion and dictionary integration tests passing.
- [x] Slice P3-8 completed: `scripts/verify-core-parties-and-custom-apps.mjs` passes all assertions.
- [x] All SDLC governance and architectural layer boundary audits pass.
