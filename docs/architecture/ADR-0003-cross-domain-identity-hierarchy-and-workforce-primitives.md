# ADR-0003: Cross-domain identity, opt-in hierarchy, persona routing, and universal workforce primitives

- Status: Proposed (Phase 0 Architecture Decision; independent reviews pending)
- Date: 2026-09-20
- Owners: GigaLibs Solution Architecture, Security & Privacy, and Platform Engineering
- Work item: `WI-OI-042`
- Reviewers required before Phase 1 Build: Named human authorities for Solution Architecture, Security & Privacy, Backend & Data, QA/SDET, and Product.

---

## 1. Context and Problem Statement

GigaLibs is an operational-intelligence and execution platform operating across diverse physical and financial domains (Accounts Receivable, Spend Management, Physical Operations/CMMS, Geospatial, eSignature, Document Scanning, and Saga Orchestration).

An architectural review of the platform and field operations requirements identified several critical structural risks:

1. **Fragmented Identity and Authority**: Two competing control-plane models exist in the repository:
   - Canonical control plane: `packages/db` (`schema.prisma`), `apps/playground-api`, and `apps/workflow-platform/app/api/control/[...path]/route.ts`.
   - Secondary platform implementation: `modules/platform-rbac`, containing duplicate `platform_tenants`, `platform_users`, and tenant RBAC tables.
   Leaving both paths active creates a high-severity security and data integrity risk (split-brain user records, inconsistent session revocation, uncoordinated tenant lifecycle).
2. **Industry-Specific Semantic Jargon in Database Schemas**: Proposed field operations designs imported vertical jargon ("technician", "crewing", "doctor", "fsm_appointments", "rigger"). In an industry-agnostic enterprise platform, hardcoding vertical terminology into SQL migrations, table names, or API contracts pollutes the core kernel and prevents reuse across events, healthcare, agriculture, manufacturing, and construction.
3. **The "Three Worlds" Fallacy**: The initial mental model assumed separate applications for vendor control, tenant administration, and frontline execution. Top-tier enterprise architectures (Salesforce, Workday, ServiceNow) prove that a single unified control plane with persona-based routing and a "Tenant #0" dogfooding model is vastly more secure, maintainable, and coherent.
4. **Hierarchy Gating Anti-Pattern**: Attempting to implement organizational hierarchy via conditional branching (`IF hierarchy_enabled`) scatters coupling logic through every module.
5. **Cross-Service Coupling**: Allowing domain modules (CMMS, Spend, AR) to own users or create cross-database foreign keys to control-plane tables violates service boundaries.

---

## 2. Architectural Decisions

### Decision 1: Canonical Identity and Tenancy Owner
- **Canonical Owner**: `packages/db/schema.prisma` managed through `apps/playground-api` is the **sole authoritative system of record** for:
  - Global Users (`users` table, `UserStatus`, MFA credentials, external identities)
  - Platform Tenants (`tenants` table, `TenantStatus`, `TenantIsolationMode`, domains)
  - Tenant Memberships (`tenant_members` table, `MemberRole`, `MemberStatus`, custom permissions)
  - Platform Role Assignments (`platform_role_assignments` table, `PlatformRole`)
  - Module Entitlements (`tenant_module_entitlements` table, `TenantModuleEntitlementStatus`)
  - Authenticated Sessions (`sessions` table)
- **Constraint**: Domain modules (`modules/*`) must **never** create their own `users` or `tenants` tables, must never accept raw user credentials, and must never maintain independent password stores.

### Decision 2: Platform Authority Model & Granular Permissions
- Platform authority authorizes cross-tenant administration and infrastructure operations.
- Platform authority is **strictly decoupled** from tenant-scoped roles. A tenant administrator (`TENANT_ADMIN`) must **never** be able to grant or inherit platform authority.
- The broad permission `cross_tenant_observability` described in preliminary drafts is **rejected**.
- Instead, platform operations require granular platform permissions mapped to explicit platform roles (`PLATFORM_OWNER`, `PLATFORM_ADMIN`, `PLATFORM_AUDITOR`):
  - `platform:metrics:read` (aggregate compute/storage/health metrics)
  - `platform:billing:read` (aggregate commercial metrics without exposing customer PII/payloads)
  - `platform:tenants:provision` (create, lifecycle-change, suspend, activate tenants)
  - `platform:entitlements:manage` (assign/revoke module entitlements)
  - `platform:users:admin` (platform operator lifecycle)
  - `platform:support:impersonate` (time-bounded, audited, customer-consented break-glass support sessions)

### Decision 3: GigaLibs as Tenant #0 (Internal Dogfooding Model)
- GigaLibs operates as an ordinary tenant (Tenant #0: `slug = gigalibs-internal`) on its own control plane.
- GigaLibs internal business data (our own AR invoices, spend, form schemas, workforce roster) resides inside the GigaLibs tenant schema under standard Row-Level Security (RLS).
- GigaLibs staff who require platform observability access are assigned explicit `PlatformRoleAssignment` records in the control plane.
- Modules do not check `IF tenant_id == 'gigalibs'`. All tenancy rules apply uniformly.

### Decision 4: Department Hierarchy Model & Organization Scoping
- The organizational hierarchy is an **opt-in enrichment** modeled via `departments` (`id`, `tenant_id`, `name`, `code`, `parent_id REFERENCES departments(id)`, `manager_id`, `is_active`).
- **Cycle Prevention & Depth Limit**: Hierarchy trees enforce strict acyclic directed graph invariants (DAG) with a maximum depth of 10 levels.
- **Fail-Closed Explicit Scoping**: Organization scoping must never rely on truthy/falsy null checks. The platform uses an explicit discriminated scope model:
  - `mode: 'FLAT_TENANT'`: The tenant has not configured an active hierarchy, or the user possesses tenant-wide authority. Scope is unbounded within the tenant.
  - `mode: 'SCOPED_DEPARTMENTS'`: The user's authority is constrained. The control plane evaluates a recursive Common Table Expression (CTE) walking downward from the user's assigned department and provides an explicit, non-empty array of authorized department IDs (`department_ids: string[]`).
  - **Fail-Closed Invariant**: Any malformed, missing, stale, or unresolvable scope must result in `mode: 'DENIED'` and reject the request. An unresolvable department scope must **never** fail open to tenant-wide access.
- **Module Query Pattern**: Modules never execute `IF hierarchy_enabled`. Modules apply:
  ```sql
  WHERE tenant_id = :tenantId
    AND (:scopeMode = 'FLAT_TENANT' OR department_id = ANY(:scopedDepartmentIds))
  ```

### Decision 5: Persona Routing vs. Permission Semantics
- **Persona is a routing lens; Permissions are authorization keys.**
- A persona (e.g. `C_LEVEL`, `OPERATIONS_SUPERVISOR`, `WORKFORCE_MEMBER`, `TENANT_ADMIN`, `PLATFORM_OPERATOR`) governs the default UI landing page and navigation layout.
- **Persona never grants permission.** Every backend API operation evaluates cryptographically verified `granted_scopes` and object-level permissions, regardless of the caller's persona.
- Multiple personas may be eligible for a user; one is selected as default, with manual switching available if authorized.
- Routing to an unentitled module or unauthorized screen fails closed to a safe module catalog or permission-denied state without redirect loops.

### Decision 6: Module Context-Token Contract (`PlatformContextV1`)
- Modules must not accept unauthenticated browser requests, unverified headers (`x-tenant-id`, `x-user-id`), or raw forwarded bearer tokens.
- Next.js acts as an authenticated BFF (Backend-for-Frontend). The BFF requests a scoped, signed module context token from the canonical control plane.
- The context token is an asymmetric, short-lived JWT (lifetime $\le 300$ seconds) signed by the control plane's private key.
- **Contract Schema (`PlatformContextV1`)**:
  ```typescript
  interface PlatformContextV1 {
    iss: 'gigalibs-control-plane';
    aud: string; // Target module audience allowlist (e.g., 'gigalibs-cmms-api')
    sub: string; // Canonical User ID (cuid)
    tenant_id: string; // Canonical Tenant UUID/slug
    session_id: string; // Active Session ID
    auth_version: number; // Stale-session rejection counter
    roles: string[]; // Assigned roles within tenant
    granted_scopes: string[]; // Explicit permissions (e.g. ['cmms:allocations:write'])
    persona_type: 'PLATFORM_OPERATOR' | 'C_LEVEL' | 'TENANT_ADMIN' | 'OPERATIONS_SUPERVISOR' | 'WORKFORCE_MEMBER' | 'CUSTOMER_GUEST';
    org_scope: {
      mode: 'FLAT_TENANT' | 'SCOPED_DEPARTMENTS';
      department_ids?: string[]; // Populated only when mode is SCOPED_DEPARTMENTS
    };
    entitlement: {
      module_key: string;
      status: 'ENABLED';
      version: string;
    };
    iat: number;
    exp: number;
    jti: string;
  }
  ```
- **Validation Invariant in Every Module**:
  Every module independently validates:
  1. Cryptographic signature against the Control Plane JWKS / public key.
  2. `iss == 'gigalibs-control-plane'` and `aud == module.audience`.
  3. Not expired (`exp > now`) and not issued in the future (`iat <= now`).
  4. Tenant RLS parameter binding (`SET LOCAL app.tenant_id = :tenant_id`).
  5. Session validity / authorization version against cached revocation bloom filter or control plane check.
  6. Required scope presence in `granted_scopes`.

### Decision 7: Universal Workforce Domain Ownership
- Universal workforce management is a **cross-industry domain capability**. It must not be buried as a private sub-feature of CMMS.
- **Ownership Distribution**:
  - **Control Plane (`packages/db`, `apps/playground-api`)**: Identity, Tenant, Memberships, Departments (Org Tree), Persona, and Module Entitlements.
  - **Universal Workforce Domain (`modules/workforce` or governed physical-operations sub-domain)**:
    - `workforce_resources`: Physical entities capable of performing work. References `user_id` logically (no cross-DB foreign key). Stores work relationship (`FULL_TIME_SALARIED`, `CONTRACTOR_1099`, `GIG_UNION`, `DAILY_CASUAL`), home location coordinates, and base billing/cost classifications.
    - `resource_capabilities`: Certified skills, licenses, and safety passports with explicit validity dates (`valid_from`, `valid_until`, `accreditation_body`).
    - `resource_allocations`: Locked time-space commitments connecting a resource to an operational task/work order. State machine: `DRAFT` $\rightarrow$ `CONFIRMED` $\rightarrow$ `DISPATCHED` $\rightarrow$ `ON_SITE` $\rightarrow$ `COMPLETED` $\rightarrow$ `CANCELLED`.
    - `resource_availability`: Shift calendars, blackout windows, and unallocated capacity.
  - **Physical Operations / CMMS (`modules/physical-operations-cmms`)**: Assets, equipment hierarchy, meter readings, maintenance work orders, preventive maintenance (PM) schedules, and parts inventory. Work orders reference `resource_allocation_id` without duplicating workforce rostering.
  - **Accounts Receivable (`modules/accounts-receivable`)**: Billable charge generation from completed allocations, customer invoicing, and tax settlement.
  - **Universal Dynamic Form Studio (`@gigalibs/configuration-react`)**: Presentation manifests, custom tenant fields, mobile execution checklists, and customer sign-off capture.

### Decision 8: Forbidden Industry-Specific Database Terminology Standard
- **The Absolute Lexicon Rule**:
  The following domain words are **STRICTLY FORBIDDEN** from appearing in any database table name, column name, SQL migration, or core API DTO:
  - `technician`
  - `crewing` / `crew`
  - `fsm` / `fsm_appointment`
  - `doctor` / `nurse` / `clinician`
  - `rigger` / `stagehand` / `sound_engineer`
  - `scout` / `picker` / `agronomist`
  - `mechanic` / `plumber` / `driver`
- **Canonical Replacements**:
  - Instead of `technician` / `crew_member` $\rightarrow$ `workforce_resource`
  - Instead of `crewing` / `scheduling` $\rightarrow$ `resource_allocation`
  - Instead of `skill` / `trade` $\rightarrow$ `resource_capability`
  - Instead of `service_area` $\rightarrow$ `operational_zone` / `dispatch_territory`
  - Instead of `call_sheet` / `inspection_form` $\rightarrow$ Dynamic Form Studio Schema (`ConfigurationDefinition`)
- **Tenant-Facing Presentation**: Industry-specific terminology lives **exclusively** in versioned Form Studio templates (`form-templates-catalog.ts`) and tenant configuration overlays.

### Decision 9: Duplicate Platform-RBAC Inventory & Convergence Plan
- `modules/platform-rbac` represents prototype work that duplicated control-plane responsibilities.
- **Inventory of Duplicate Entities**:
  1. `gigalibs_platform.platform_tenants` $\rightarrow$ Redundant with Prisma `Tenant`.
  2. `gigalibs_platform.platform_users` $\rightarrow$ Redundant with Prisma `User`.
  3. `tenant_<slug>_core.departments` $\rightarrow$ High value; to be converged into canonical Prisma schema as `Department`.
  4. `tenant_<slug>_core.user_resource_acls` $\rightarrow$ High value ReBAC pattern; to be integrated into canonical control-plane authorization engine.
  5. `gigalibs_platform.metering_dimensions` & `tenant_usage_ledger` $\rightarrow$ Useful consumption ledger; to be converged into canonical platform metering owner under `WI-OI-015`.
  6. `modules/platform-rbac/apps/api/src/platform/` $\rightarrow$ Contains prototype routes `/api/platform` and `/api/tenant-rbac`.
- **Convergence Strategy**:
  - In Phase 0: Mark `modules/platform-rbac` as contained prototype inventory. Prevent any BFF or application route from treating it as an identity authority.
  - In Phase 1: Migrate `Department` model into `packages/db/schema.prisma` with forward migration.
  - Decommission duplicate tables only after zero references remain and audit verification confirms no data loss.

---

## 3. API and Data Ownership Matrix

| Business Concept | Authoritative Owner | System of Record | Ingestion / Surface Plane | Downstream Consumers |
| :--- | :--- | :--- | :--- | :--- |
| **Global User Identity** | Control Plane (`apps/playground-api`) | PostgreSQL (`users`, `sessions`) | Platform Admin / Auth Pages | All modules via `PlatformContextV1` |
| **Tenant Fleet & Subdomains** | Control Plane (`apps/playground-api`) | PostgreSQL (`tenants`, `subdomain_bindings`) | Platform Tenant Control (`/platform-admin`) | Ingress router, Tenancy guards |
| **Module Entitlements** | Control Plane (`apps/playground-api`) | PostgreSQL (`tenant_module_entitlements`) | Platform Admin / Marketplace | BFF proxy, Module context token |
| **Organization Departments** | Control Plane (`apps/playground-api`) | PostgreSQL (`departments`) | Tenant Settings (`/settings/organization`) | Recursive CTE scope resolver |
| **Workforce Resources** | Workforce Domain | PostgreSQL (`workforce_resources`) | Operations Workspace / Roster View | Dispatch board, CMMS work orders |
| **Resource Capabilities** | Workforce Domain | PostgreSQL (`resource_capabilities`) | Qualifications Manager | Allocation capability validation guard |
| **Resource Allocations** | Workforce Domain | PostgreSQL (`resource_allocations`) | Visual Dispatch Board (Gantt/Calendar/Map) | Mobile execution view, AR billing |
| **Assets & Equipment** | CMMS (`modules/physical-operations-cmms`) | PostgreSQL (`gigalibs_cmms.assets`) | CMMS Asset Workbench | Maintenance work orders |
| **Work Orders** | CMMS (`modules/physical-operations-cmms`) | PostgreSQL (`gigalibs_cmms.work_orders`)| CMMS Work Order Manager | Workforce allocation, Parts ledger |
| **Form Schemas & Layouts** | Form Studio (`@gigalibs/configuration-react`) | PostgreSQL (`configuration_definitions`) | Universal Dynamic Forms Studio | Mobile execution checklists, Sign-offs |
| **Billable Ledger & Invoices**| Accounts Receivable (`modules/accounts-receivable`)| PostgreSQL (`gigalibs_ar.ar_invoices`)| AR Invoicing Workbench | ERP sync, Customer portal |
| **Cross-Service Transactions**| Saga Orchestrator (`modules/saga-orchestrator`) | PostgreSQL (`gigalibs_saga.saga_instances`)| Background Event Stream | Distributed rollback, Audit ledger |

---

## 4. Additive Migration Plan

All database schema mutations must be strictly additive, forward-only, and zero-downtime compatible:

1. **Step 1 (Control Plane - Phase 1 & 3)**:
   - Add `Department` model to `packages/db/schema.prisma`:
     ```prisma
     model Department {
       id           String       @id @default(cuid())
       tenantId     String
       tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
       name         String
       code         String
       parentId     String?
       parent       Department?  @relation("DepartmentHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
       children     Department[] @relation("DepartmentHierarchy")
       managerId    String?
       manager      User?        @relation("DepartmentManager", fields: [managerId], references: [id], onDelete: SetNull)
       spendingLimit Decimal?    @db.Decimal(12, 2)
       isActive     Boolean      @default(true)
       createdAt    DateTime     @default(now()) @db.Timestamptz(3)
       updatedAt    DateTime     @updatedAt @db.Timestamptz(3)
       members      TenantMember[]

       @@unique([tenantId, code])
       @@index([tenantId, parentId])
       @@map("departments")
     }
     ```
   - Add nullable `departmentId` and `employmentType` to `TenantMember`.
   - Existing tenants have `departmentId = NULL` (seamless `FLAT_TENANT` operation).
2. **Step 2 (Workforce Domain - Phase 4)**:
   - Create migration `000003_workforce_allocations_and_capabilities.up.sql` in the owning workforce module.
   - Tables created:
     - `workforce_resources` (UUID primary key, tenant_id UUID, user_id VARCHAR(64) nullable logical reference, employment_type VARCHAR(32), home_coordinates geometry(Point, 4326), cost_rate_usd NUMERIC(10,2)).
     - `resource_capabilities` (UUID primary key, resource_id UUID, capability_code VARCHAR(64), cert_level VARCHAR(32), valid_from TIMESTAMPTZ, valid_until TIMESTAMPTZ, is_active BOOLEAN).
     - `resource_allocations` (UUID primary key, work_order_id UUID nullable, resource_id UUID, scheduled_start TIMESTAMPTZ, scheduled_finish TIMESTAMPTZ, actual_start TIMESTAMPTZ, actual_finish TIMESTAMPTZ, status VARCHAR(32), checkin_coordinates geometry(Point, 4326), version INT DEFAULT 1).
     - `allocation_status_history` (UUID primary key, allocation_id UUID, previous_status VARCHAR(32), new_status VARCHAR(32), changed_by VARCHAR(64), reason TEXT, recorded_at TIMESTAMPTZ).
   - RLS enabled on all new tables (`tenant_isolation` policy enforcing `current_setting('app.tenant_id', true)::UUID`).

---

## 5. Compatibility, Rollback, and Forward-Fix Strategy

1. **Forward-Only Schema Evolution**: In accordance with GigaLibs standard, `git reset`, `prisma db push`, and destructive down-migrations are strictly prohibited in production.
2. **Rollback Strategy**:
   - If Phase 1/2 control plane changes introduce an issue, feature flag `FEATURE_FLAG_EXPANDED_CONTEXT_V1` can be disabled, causing the BFF to fall back to existing tenant-scoped session contracts.
   - If workforce tables require alteration, forward migration `000004_...` must be applied. Unused columns are deprecated and made nullable, never dropped immediately.
3. **Dual-Read / Single-Write Bridge**:
   - For departments: If any legacy query targets `tenant_<slug>_core.departments`, the database service routes to the canonical `departments` table in the primary schema.
4. **Zero-Downtime Deployment**:
   - All new columns are created nullable or with safe defaults (`isActive = true`, `org_scope.mode = 'FLAT_TENANT'`).
   - Existing running instances of modules continue functioning without interruption during migrations.

---

## 6. Threat Analysis (STRIDE) for Tenant, Hierarchy, Persona, and Workforce

| STRIDE Threat | Attack Vector | Specific Architectural Mitigation in ADR-0003 |
| :--- | :--- | :--- |
| **Spoofing** | Caller injects `x-tenant-id` or `x-user-id` in HTTP headers to impersonate another user or tenant. | **Prevented**: Modules strictly reject unverified headers. All identity context is extracted from the cryptographically signed, short-lived `PlatformContextV1` token signed by the control plane. |
| **Tampering** | Dispatcher alters allocation time to hide overlap or backdate certifications. | **Prevented**: Optimistic concurrency control (`version` column), immutable `allocation_status_history` ledger, and server-side capability validity check (`valid_until >= scheduled_start`) executed inside database transactions before commit. |
| **Repudiation** | Operator claims they did not dispatch an uncertified worker to a high-risk site. | **Prevented**: Cryptographic audit log entry generated on every allocation mutation, recording actor user ID, previous state, new state, and IP digest. |
| **Information Disclosure** | Supervisor queries recursive CTE and crafts malformed department ID to dump sibling or competitor tenant data. | **Prevented**: PostgreSQL Row-Level Security (RLS) is evaluated unconditionally at the database level (`tenant_id = current_setting('app.tenant_id')`). Recursive CTE queries are strictly bounded by `tenant_id`. Cross-tenant retrieval returns zero rows. |
| **Denial of Service** | Malicious tenant creates a cyclic department tree (`A -> B -> C -> A`) to cause infinite recursion in CTE queries. | **Prevented**: Database constraint / CTE cycle detection (`CYCLE id SET is_cycle USING path`) and maximum tree depth limit (10 levels). |
| **Elevation of Privilege** | User manipulates client persona selector to claim `PLATFORM_OPERATOR` or `C_LEVEL` authority. | **Prevented**: Persona is purely a visual lens. All API permissions are enforced by checking `granted_scopes` cryptographically signed in the context token. A user claiming C-Level persona without C-Level roles receives 403 Forbidden on restricted endpoints. |
| **Elevation of Privilege** | Tenant administrator attempts to assign themselves platform-level roles. | **Prevented**: `PlatformRoleAssignment` can only be created by an active `PLATFORM_OWNER`. Tenant settings APIs have zero write pathways to the `platform_role_assignments` table. |

---

## 7. Explicit Exclusions (Out of Scope for this Architecture)

To maintain focus and avoid scope creep, the following capabilities are explicitly excluded from this architecture and deferred to subsequent work items:
1. **Automated Algorithmic Route Optimization**: Traveling salesperson / dynamic AI route dispatch is out of scope. Dispatchers manually assign slots assisted by geospatial proximity distance calculations.
2. **External Payroll Provider API Sync**: Direct transmission of wages to external payroll providers (ADP, Gusto) is excluded. Allocations generate billable/cost records for Accounts Receivable and internal ledger reporting; provider connectors remain under `WI-OI-026`.
3. **Biometric Timeclocks**: Physical hardware integrations (thumbprint scanners, RFID gate turnstiles) are excluded. Time tracking relies on GPS-verified mobile check-in via Form Studio.
4. **Third-Party Subcontractor Self-Service Portal**: Direct subcontractor bidding portals are deferred. Subcontractors are registered as workforce resources by the tenant dispatcher.

---

## 8. Implementation Phase Roadmap

Following this architecture decision, execution will proceed through strictly sequential, independently gated phases:

- **Phase 0**: Architecture Decision (ADR-0003), duplicate authority inventory, governance registration (**Current Phase**).
- **Phase 1**: Canonical Control-Plane Convergence (Department Prisma model, platform-RBAC deprecation plan, negative security tests).
- **Phase 2**: Signed Module Context (`PlatformContextV1` asymmetric token issuing in BFF, module verification middleware, CMMS auth repair).
- **Phase 3**: Optional Organization Hierarchy UI (`/settings/organization` visual tree editor, fail-closed CTE resolver) & Persona Routing table.
- **Phase 4**: Universal Workforce Domain (Migration `000003_workforce_allocations_and_capabilities`, allocation state machine, 422 capability validation guard).
- **Phase 5**: Visual Dispatch Board (Porting Beveren React 19 Gantt, Calendar, and Map scheduler into `@gigalibs/workflow-platform`).
- **Phase 6**: Executive Experience (Persona-routed Executive Control Tower summarizing cross-module cash velocity, OEE, and DSO).
- **Phase 7**: Versioned Industry Templates & Workflow Integration (Form Studio templates for Crewing, Cleanroom, Agri, and Construction).
- **Phase 8**: Production Certification & Release Packet.
