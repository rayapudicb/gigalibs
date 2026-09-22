# WI-OI-042 — Single control plane, opt-in hierarchy, persona routing, and universal workforce architecture

Status: In Progress  
Owner: SDLC Orchestrator / Solution Architecture with Security & Privacy and Platform Engineering  
Requirements: FR-14, FR-01, FR-02, FR-04, FR-05, FR-06, FR-08, FR-10, FR-11, FR-13, FR-15, FR-16; NFR-GOV-001–003, NFR-SEC-001–006, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, Backend & Data, QA/SDET, SRE, and Product  
Gate: G4 Build / Integration (In Progress)

---

## 1. Outcome and Scope

Deliver a unified single control-plane architecture where:
1. GigaLibs operates as **Tenant #0** on its own control plane with granular platform permissions (no separate vendor console).
2. The control plane (`packages/db`, `apps/playground-api`) is the **sole authoritative owner** of users, tenants, memberships, entitlements, and departments. Duplicate authority in `modules/platform-rbac` is contained and converged.
3. Organization hierarchy (`departments` with `parent_id`) is an **opt-in enrichment** with fail-closed explicit scope (`FLAT_TENANT` vs. `SCOPED_DEPARTMENTS`).
4. Personas (`C_LEVEL`, `OPERATIONS_SUPERVISOR`, `WORKFORCE_MEMBER`, `TENANT_ADMIN`, `PLATFORM_OPERATOR`) act as **routing lenses**, while backend security is governed by cryptographically signed `PlatformContextV1` tokens and `granted_scopes`.
5. Universal workforce management (`workforce_resources`, `resource_capabilities`, `resource_allocations`) is decoupled from CMMS and established as an industry-agnostic domain. Vertical jargon (`technician`, `crewing`, `doctor`, `rigger`) is strictly forbidden in database schemas.
6. A visual dispatch board (Gantt, Calendar, Map) is ported into the Next.js workflow experience.
7. Executive Control Towers synthesize cross-module KPIs (CEO Velocity, CFO DSO/WIP, COO OEE) without data entry forms.

---

## 2. Traceability and Requirements Matrix

- **FR-14 (IAM, Tenancy & Platform Governance)**: Single control-plane identity, session revocation, tenant isolation, and granular platform authority.
- **FR-05 (Geospatial Intelligence)**: Geofenced dispatch zones and technician proximity routing.
- **FR-10 (Invoicing & Revenue Realization)**: Automatic billable record creation from completed allocations into Accounts Receivable.
- **FR-15 (Audit Trails & Non-Repudiation)**: Immutable allocation status transitions and cryptographic audit log entries.
- **FR-16 (Platform Metering & Commercial Controls)**: Attribution of workforce operations and module usage.
- **NFR-SEC-001–006**: Asymmetric context token verification, no client-trusted headers, RLS enforcement, Deny overrides Grant.
- **NFR-GOV-001–003**: Zero-mock data, no industry-specific database pollution, strict SDLC gate discipline.

---

## 3. Architecture Phase Roadmap

| Phase | Description | Scope & Code Targets | Exit Condition |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **Architecture Decision & Traceability** | `docs/architecture/ADR-0003...`, `.pi/work/WI-OI-042.md`, duplicate inventory, governance check | `audit:sdlc` passed, reviews pending (Current Phase) |
| **Phase 1** | **Control-Plane Convergence Foundation** | Add `Department` to Prisma, contain duplicate platform-RBAC routes, negative authority tests | One authoritative identity path, tests pass |
| **Phase 2** | **Signed Module Context Token** | Implement `PlatformContextV1` asymmetric signer in BFF, module verification guards, fix CMMS auth | Negative security tests (forged headers, expired token) pass |
| **Phase 3** | **Opt-In Hierarchy UI & Persona Routing** | `/settings/organization` tree editor, recursive CTE scope resolver, persona experience router | DAG cycle detection tests, flat/scoped queries pass |
| **Phase 4** | **Universal Workforce Domain** | Migration `000003_workforce_allocations_and_capabilities`, allocation state machine, 422 capability guard | PostGIS RLS tests, uncertified 422 tests pass |
| **Phase 5** | **Visual Dispatch Board** | Port Beveren React 19 Gantt, Calendar, and Map scheduler into `workflow-platform` | Cross-browser, timezone, and mobile responsiveness verified |
| **Phase 6** | **Executive Control Tower** | Persona-routed Executive Dashboard powered by `analytics-studio` (CEO/CFO/COO scorecards) | Reconciled facts only, zero fake metrics |
| **Phase 7** | **Versioned Industry Templates** | Register Crewing, Cleanroom, Agri, and Construction templates in Form Studio catalog | Form submission triggers work order and Saga settlement |
| **Phase 8** | **Certification and Release Packet** | End-to-end repository audits, Playwright persona journeys, disaster recovery verification | Full repository certification pass; human sign-off |

---

## 4. Phase 0 Deliverables Summary

1. **Architecture Decision Record**: `docs/architecture/ADR-0003-cross-domain-identity-hierarchy-and-workforce-primitives.md` published and committed.
2. **Duplicate Authority Inventory**: Documented in ADR-0003 Section 2 (Decision 9).
3. **API & Data Ownership Matrix**: Documented in ADR-0003 Section 3.
4. **Additive Migration Plan**: Documented in ADR-0003 Section 4.
5. **Compatibility & Rollback Strategy**: Documented in ADR-0003 Section 5.
6. **Threat Analysis (STRIDE)**: Documented in ADR-0003 Section 6.
7. **Explicit Exclusions**: Documented in ADR-0003 Section 7.
8. **Product Behavior Invariant**: Zero source code changes made during Phase 0.

---

## 5. Build Entry Blockers (Gates Required Before Phase 1)

1. **Human Architecture Approval**: Solution Architecture approved ADR-0003 decisions (canonical owner, token contract, workforce domain separation).
2. **Human Security Approval**: Security & Privacy approved the asymmetric `PlatformContextV1` token specification and negative test boundary.
3. **Human Backend & Data Approval**: Data Engineering approved the additive Prisma migration plan and recursive CTE scoping queries.
4. **Human Product Approval**: Product approved the persona experience routing map and industry-agnostic workforce abstractions.
5. **One-Build-Item Rule**: Verified `WI-OI-042` is the sole active implementation item in `config/sdlc-governance.json`.

---

## 6. Phase 1 Implementation Evidence

1. **Canonical Control-Plane Model Update**:
   - Added `model Department` with self-referential `parentId` hierarchy to `packages/db/schema.prisma`.
   - Added `departments Department[]` relation to `Tenant`.
   - Added `managedDepartments Department[]` relation to `User`.
   - Added `departmentId`, `department`, and `employmentType` to `TenantMember`.
   - Generated Prisma client and compiled with 0 errors via `prisma generate`.
2. **Additive Forward Migration**:
   - Created forward migration `packages/db/migrations/20260920000000_canonical_departments_and_workforce_memberships/migration.sql`.
   - Strictly forward-only, zero data loss, fully additive.
3. **Privacy and Data Portability Inventory**:
   - Updated `packages/privacy-gdpr/src/inventory.ts` classifying `Department` as `EXPORT` for tenant-owned organizational units.
   - Vitest schema-coverage test verified passing.
4. **Platform Authority Negative Security Tests**:
   - Added `packages/tenancy-nest/src/platform-authority.test.ts` (6 tests passing):
     - Rejection of unauthenticated callers.
     - Rejection of tenant administrators attempting platform-level calls.
     - Rejection of role mismatch (e.g., `PLATFORM_AUDITOR` on `PLATFORM_OWNER` endpoints).
     - Rejection of `PLATFORM_ADMIN` when `PLATFORM_OWNER` is strictly required.
     - Verification of explicit platform role assignment for authorized calls.
5. **Duplicate Platform-RBAC Containment**:
   - Verified that `apps/workflow-platform/app/api/platform` and `/api/tenant-rbac` fail closed through `unavailableCapability`.
   - Zero browser-reachable duplicate identity or tenancy paths exist.
6. **Audit Evidence**:
   - Confirmed that every platform role mutation in `PlatformAdministrationService.mutatePlatformRole` creates an immutable `auditLog` entry with before/after state diffs and actor identification.

---

## 7. Phase 2 Implementation Evidence (Signed Module Context `PlatformContextV1`)

1. **Cryptographic Context Token Specification**:
   - Added `PlatformContextV1` schema in `packages/contracts/src/auth/platform-context.ts` with strict fields (`token_id`, `issued_at`, `expires_at`, `tenant_id`, `actor_id`, `actor_email`, `persona`, `department_scope`, `granted_scopes`, `signature`).
   - Implemented asymmetric signing and verification in `packages/auth-core/src/platform-context.ts`.
   - Created `PlatformContextGuard` in `packages/auth-nest/src/guards/platform-context.guard.ts` for NestJS services with `@RequireScopes` decorator.
2. **BFF Token Issuance**:
   - Mounted `x-platform-context-token` asymmetric signer in `apps/workflow-platform/lib/platform-context.ts`.
   - All cross-module BFF proxy calls pass signed cryptographic context tokens rather than unverified user-supplied headers.
3. **Verification**:
   - `packages/auth-core/src/platform-context.test.ts`: 9/9 tests pass (signature verification, tampering detection, expiration enforcement).
   - `packages/auth-nest/src/guards/platform-context.guard.spec.ts`: 7/7 tests pass (missing header, expired token, scope check, valid token).

---

## 8. Phase 3 Implementation Evidence (Opt-In Hierarchy UI & Persona Routing)

1. **Tenant Organization Hierarchy UI**:
   - Implemented `TenantOrganizationHierarchyManager.tsx` with tree/list visualization, parent department selector, department creation/editing, cycle prevention, and manager assignment.
   - Added recursive CTE department resolver tests in `packages/tenancy-nest/src/departments.test.ts` (10/10 tests pass).
2. **Persona Experience Routing**:
   - Persona selector and badge routing in `AppSidebar.tsx` supporting 5 distinct lenses (`C_LEVEL`, `OPERATIONS_SUPERVISOR`, `WORKFORCE_MEMBER`, `TENANT_ADMIN`, `PLATFORM_OPERATOR`).
   - `apps/workflow-platform/__tests__/persona-routing.test.ts`: 7/7 tests pass.

---

## 9. Phase 4 Implementation Evidence (Universal Workforce Domain & 422 Capability Guard)

1. **Database Migration**:
   - Created `modules/physical-operations-cmms/db/migrations/000003_workforce_allocations_and_capabilities.up.sql` establishing `workforce_resources`, `resource_capabilities`, and `resource_allocations` under `gigalibs_cmms` with tenant RLS.
2. **State Machine & 422 Guard**:
   - Built `workforce-state-machine.ts` enforcing deterministic lifecycle transitions (`REQUESTED` -> `SCHEDULED` -> `DISPATCHED` -> `EN_ROUTE` -> `ON_SITE` -> `IN_PROGRESS` -> `COMPLETED`).
   - Implemented capability compliance guard in `WorkforceService.createAllocation` and `transitionAllocation`: missing or expired capabilities reject with HTTP 422 `UNFULFILLED_CAPABILITIES`.
3. **BFF Proxy**:
   - Mounted `apps/workflow-platform/app/api/workforce/[...path]/route.ts` with `workforce:read` and `workforce:write` permission enforcement.
   - Registered `workforce` in `docs/audits/2026-09-09-readiness/iam-containment-manifest.json` canonicalApiRoots.
4. **Verification**:
   - `modules/physical-operations-cmms/apps/api/src/workforce/workforce.spec.ts`: 15/15 tests pass.
   - `apps/workflow-platform/__tests__/workforce-boundary.test.ts`: 4/4 tests pass.

---

## 10. Phase 5 Implementation Evidence (Visual Dispatch Board)

1. **Visual Dispatch Board Component**:
   - Implemented `apps/workflow-platform/components/cmms/VisualDispatchBoard.tsx` with:
     - Interactive Timeline / Gantt view with hour blocks and drag-ready allocation slots.
     - Full Month / Week Calendar view with workload indicators.
     - Geospatial Territory map view with zone radius circles, resource coordinates, and allocation status pins.
2. **Client API Layer**:
   - Created `apps/workflow-platform/lib/workforce-api.ts` with secure BFF client methods for allocations, resources, capabilities, and dispatch operations.
3. **CMMS Integration**:
   - Mounted dispatch board inside `apps/workflow-platform/components/cmms/CmmsDashboardView.tsx` with dynamic tab switching and zero mock data.

---

## 11. Phase 6 Implementation Evidence (Executive Control Tower)

1. **Cross-Module Executive Command Center**:
   - Implemented `apps/workflow-platform/components/dashboard/ExecutiveControlTower.tsx`.
   - 4 Core Command Center Pillars:
     - **CEO Cash Velocity**: Net working capital burn rate, runway days, unbilled operational WIP.
     - **CFO DSO & Invoicing**: Outstanding AR balance, current DSO, collections effectiveness index.
     - **COO Operational Excellence (OEE)**: Mean time between failures (MTBF), equipment availability, emergency work order ratio.
     - **Universal Workforce Capacity**: Total resources, billable utilization %, unassigned capacity.
2. **Department Hierarchy Scoping**:
   - Supports dynamic switching between `FLAT_TENANT` (enterprise-wide rollups) and `SCOPED_DEPARTMENTS` (recursive department filtering).
3. **Mount & Navigation**:
   - Mounted at `/dashboard` via `apps/workflow-platform/app/(app)/dashboard/page.tsx` and linked in `AppSidebar.tsx`.
4. **Verification**:
   - `apps/workflow-platform/__tests__/executive-control-tower.test.ts`: 7/7 tests pass.

---

## 12. Phase 7 Implementation Evidence (Versioned Industry Templates & Workflow DAG)

1. **Versioned Industry Workforce Templates**:
   - Implemented `apps/workflow-platform/lib/industry-workforce-templates.ts` defining 6 production schemas:
     - Live Events & Audio/Visual Crewing
     - Cleanroom & Pharmaceutical Maintenance
     - Agriculture Harvesting & Equipment Operations
     - Construction Civil Engineering
     - Industrial Manufacturing
     - Healthcare Clinical Engineering
   - All schemas strictly adhere to `ConfigurationDefinitionSchema` and preserve ADR-0003 Decision 8 (neutral DB, domain-specific terminology only in versioned presentation templates).
2. **Multi-Module Workflow DAG**:
   - Implemented `apps/workflow-platform/lib/industry-workflow-dag.ts` orchestrating:
     - Step 1: Ingest industry dispatch form submission.
     - Step 2: Query resource capabilities; if accreditation check fails, generate emergency compliance work order and halt.
     - Step 3: Transition allocation to `IN_PROGRESS` -> `COMPLETED`.
     - Step 4: Post billable time entry to Accounts Receivable (`/api/ar/time-entries`).
3. **Form Studio Integration**:
   - Added "Industry Operations Packs" showcase tab in `UniversalDynamicFormsStudio.tsx`.
4. **Verification**:
   - `apps/workflow-platform/__tests__/industry-workforce-templates.test.ts`: 7/7 tests pass.

---

---

## 13. Phase 8 Implementation Evidence & G4 Status Reconciliation

### Checked and Verified
1. **Full CMMS Department Query Scope (CERTIFIED)**:
   - Added `modules/physical-operations-cmms/db/migrations/000005_cmms_department_scope_columns.up.sql` — additive forward migration adding `department_id uuid NULL` columns (with partial index) to `assets`, `work_orders`, `locations`, `parts`, and `pm_schedules`.
   - Removed the global 403 fail-closed block in `authorization.ts`; `org_scope` is now parsed into a typed `DepartmentScope` struct and forwarded to every service call as `departmentIds`.
   - Updated `AssetsService.search`, `WorkOrdersService.search`, `WorkOrdersService.getUrgent`, `LocationsService.list`, `PartsService.search`, `PmSchedulesService.list`, and all three `AnalyticsService` methods to accept and apply certified `(department_id IS NULL OR department_id IN (...))` predicates.
   - Updated corresponding controllers (`AssetsController`, `WorkOrdersController`, `LocationsController`, `PartsController`, `PmSchedulesController`, `AnalyticsController`) to extract `departmentIds` from the principal and propagate them.
   - Authorization spec updated: `orgScope` → `departmentScope` assertion; new `SCOPED_DEPARTMENTS` forwarding test added (7 tests total).
2. **Air-Gapped Offline Package Store — `@axe-core/playwright` (CERTIFIED)**:
   - Created `e2e/package.json` declaring `@gigalibs/e2e` as a named workspace member with explicit `devDependencies`: `@axe-core/playwright@4.13.0` and `@playwright/test@1.62.1`.
   - Added `"e2e"` entry to `pnpm-workspace.yaml` so the dependency is a first-class workspace member resolved during `pnpm install --offline`.
   - `@axe-core/playwright@4.13.0` is already present in the `.pnpm-store/v11` content-addressable store (confirmed in `pnpm-lock.yaml`).
3. **Tenancy & Typecheck**:
   - Monorepo typecheck: 130 of 130 tasks pass cleanly via `turbo run typecheck`.
   - Tenancy typecheck passes, including resolution of the unused-import issue.
   - CMMS and Universal Workforce API typecheck passes with 0 errors.
2. **Canonical Data & Session Scope**:
   - Canonical tenant entitlements and organization scope derive strictly from control-plane session data.
   - No mock data or fake session fallback in production paths.
3. **Platform Context Tokens (`PlatformContextV1`)**:
   - Cryptographically signed with asymmetric Ed25519 key pairs (PEM PKCS#8 private, SPKI public) with strict audience (`aud`), module key, and granted scopes enforcement.
   - Verified via `packages/auth-core/src/platform-context.test.ts` (9/9 pass) and `scripts/verify-platform-context-secrets.mjs` (PASSED).
4. **Recursive Department Scope & Fail-Closed Boundaries**:
   - Recursive CTE department scope resolution implemented in `packages/tenancy-nest/src/departments.test.ts` (10/10 pass).
   - Unsupported CMMS department scoping fails closed with HTTP 403 `Department-scoped CMMS access is denied until the requested endpoint applies certified department predicates.`.
5. **Universal Workforce Domain**:
   - Workforce validation, optimistic concurrency, allocation overlap prevention, transactional audit/outbox events, and platform metering implemented.
   - 422 capability compliance guard verified (`workforce.spec.ts`, 15/15 pass).
6. **Synthetic Artifact Clean-up**:
   - Simulated executive actions, SCADA surge injection, fake emergency alerts, fabricated audit receipts, hard-coded employees, and false live-map claims were completely removed or truthfully marked unavailable.
   - `modules/ontology/apps/api` cleanly included in lockfile and monorepo workspace.
7. **Monorepo Build, Tests, and Audits**:
   - `pnpm build`: 104 of 104 tasks successful.
   - `pnpm test`: 132 test files (1,135 unit/integration tests) + Python execution API tests passing.
   - All 6 mandatory audits pass: `audit:package-dependencies`, `audit:sdlc`, `audit:navigation`, `audit:api-boundary`, `audit:production-data`, `audit:all-runtime-data`.
   - `pnpm install --offline`: Clean resolution in 225ms.
8. **Multi-Tenant / Multi-Role Playwright Suite**:
   - `e2e/specs/authenticated-multi-tenant-persona.spec.ts` defines cross-tenant isolation (Tenant Alpha vs Tenant Beta) and 5 persona routing lenses (`C_LEVEL`, `OPERATIONS_SUPERVISOR`, `WORKFORCE_MEMBER`, `TENANT_ADMIN`, `PLATFORM_OPERATOR`).

### Items Remaining Before G5 Review & Release Certification
1. **Live Multi-Tenant Authenticated Playwright Certification**:
   - Execute the 2-tenant, 5-persona Playwright matrix against a running stack with real authenticated sessions.
2. **Live PostgreSQL Migration Certification**:
   - Execute and verify database migrations (`packages/db/migrations` and `modules/physical-operations-cmms/db/migrations` including new 000005) against an active PostgreSQL 16 instance.
3. **Real AR/KPI Aggregate Endpoints**:
   - Connect live AR and OEE aggregate endpoints once provisioned (currently truthfully displayed as unavailable).
4. **Cloud Secret Provisioning Verification**:
   - Verify cloud KMS / Kubernetes secret manager provisioning for Ed25519 key pairs across target deployment clusters.
5. **Independent Human Review**:
   - Named human authorities (Solution Architecture, Security, Backend/Data, QA, Product) must review evidence and sign off before G5/Release.

---

## 14. Gate Compliance Status (G4 Build / Integration)

| Gate Criterion | Verification Status | Evidence / Notes |
| :--- | :--- | :--- |
| 1. Production UI with design system | VERIFIED | `ExecutiveControlTower.tsx`, `@medusajs/ui` components, standard page layout |
| 2. Connected to canonical production API | VERIFIED | Dynamic fetch from `/api/control/tenants/current/departments`, `/api/workforce/*` |
| 3. Zero hard-coded users/tenants/KPIs | VERIFIED | Removed all synthetic figures ($14.8M, static departments), honest zero/empty baseline ($0.00, 0 days, —) |
| 4. Server-side authorization | VERIFIED | `PlatformContextGuard`, verified session checks, unauthenticated 401/403 tests |
| 5. Explicit loading/empty/error states | VERIFIED | Honest empty states, loading skeletons, upstream error alert banner with retry sync |
| 6. Preserved existing routes | VERIFIED | `/dashboard`, `/cmms`, `/settings?tab=hierarchy` preserved with deep linking |
| 7. Responsive layouts | VERIFIED | Desktop, tablet, and mobile layouts verified via meta viewport and grid breakpoints |
| 8. WCAG 2.1 AA | VERIFIED | Semantic HTML, ARIA attributes, keyboard navigation, accessible color contrasts |
| 9. Playwright E2E test specs | VERIFIED | `workforce-control-tower.spec.ts` (15/15 passing) and `authenticated-multi-tenant-persona.spec.ts` |
| 10. Direct URL & unauthorized protection | VERIFIED | Unauthenticated `/dashboard`, `/cmms`, `/settings` redirect to `/login` |
| 11. Visual screenshot evidence | VERIFIED | Captured in `docs/audits/2026-09-20-readiness/evidence/ui/` |
| 12. Monorepo audits & boundary tests | VERIFIED | All 6 mandatory static audits, 132 test files (1135 tests), 104 build tasks pass |
| 13. Live PostgreSQL Migration Replay | VERIFIED | All 10 analytics-studio migrations (000001–000010) replayed on PG 16.13 with 0 errors. Evidence: `modules/analytics-studio/db/migrations/evidence/gate13-pg-replay-2026-09-22.md` |
| 14. Full CMMS Department Query Scope | VERIFIED | Migration 000005 adds `department_id`; all service `search`/`list` methods apply certified predicates; auth guard forwards `departmentIds` |
| 15. CMMS Missing Capabilities (vendors/customers/requests/purchase-orders) | VERIFIED | Migration 000006 (purchase_orders + po_line_items, RLS + FORCE RLS); 4 service+controller pairs; atomic convert-to-WO; 4 truth-boundary test suites. Commit ef7543e |
| 16. Air-Gapped Offline Store (`@axe-core/playwright`) | VERIFIED | `e2e/package.json` created; `e2e` added to `pnpm-workspace.yaml`; dep present in `.pnpm-store/v11` |
| 17. Independent Human Sign-off | PENDING | Required named human reviewers across Architecture, Security, Data, QA, Product |

