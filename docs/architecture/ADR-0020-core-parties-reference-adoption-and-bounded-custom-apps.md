# ADR-0020: Core Parties Reference Adoption and Bounded Custom Applications

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Enterprise Architecture, Platform Engineering, Security & Privacy, Data Architecture
- **Consulted:** SDLC Orchestrator, Core Modules & Solutions Domain
- **Informed:** All Engineering Domains
- **Work Item:** WI-OI-111 (Enterprise Architecture Phase 3)
- **Supersedes/Extends:** Extends ADR-0002 (Governed Metadata Configuration), ADR-0013 (Core Modules and Solutions), ADR-0016 (Kernel Capability Modules and Foundation), ADR-0018 (Organization Hierarchy and Enterprise Scope), ADR-0019 (Application Dictionary Compiler and Runtime Manifests).

---

## 1. Context and Problem Statement

In Enterprise Architecture Phase 2 (ADR-0019 / WI-OI-110), GigaLibs established an immutable, checksummed Application Dictionary compiler extending the Configuration Studio foundation. The runtime dictionary resolves platform baselines, module contributions, and tenant overlays into deterministic manifests for web, tablet, and future mobile clients with zero runtime DDL.

Phase 3 requires establishing:
1. **Core Parties:** A canonical, shared master domain model representing organizations and persons acting in multiple governed business roles (Customer, Supplier, Contractor, Agency, Carrier, Partner). Historically, ERP systems like iDempiere coupled all counterparties into `C_BPartner` with direct SQL triggers and shared numeric IDs. In GigaLibs, Core Parties must provide a clean identity foundation while maintaining strict SaaS tenant boundaries, WI-OI-109 organization hierarchy scoping, and module independence.
2. **Reference Adoption without Silent Rewrites:** Existing frozen slices (AR Customer, AP Supplier, CMMS Vendor, Workforce Worker) have their own local authority. We must not destructively migrate or silently rewrite their foreign keys. Instead, Phase 3 establishes canonical Party reference contracts and a deterministic mapping registry.
3. **Bounded Custom Applications:** Tenant administrators frequently need domain-adjacent operational records (e.g. site access logs, compliance check records, custom assets) without requiring a full code release. GigaLibs must provide bounded custom applications without permitting arbitrary runtime DDL, generic SQL execution, or untrusted script eval.

---

## 2. Decision Drivers

1. **Zero Runtime DDL:** Production database schemas must be strictly version-controlled, reviewed, and migrated via forward-only Prisma/PostgreSQL migrations. Tenants cannot execute `CREATE TABLE` or `ALTER TABLE`.
2. **Single Identity, Multiple Roles:** An organization (e.g. "Acme Corp") or a person can be both a Customer and a Supplier, or a Contractor and a Partner, without duplicating their fundamental identity, identifiers, addresses, and contacts.
3. **Module Sovereignty & Reference Mapping:** Existing business domains (AR, AP, CMMS, Workforce) retain their operational data. Core Parties provides the canonical identity and reference contract; adoption is additive and opt-in via integration contracts, never destructive schema mutation.
4. **Server-Enforced Tenant & Org Scoping:** Database tables must be isolated by `tenantId` with Row-Level Security (RLS) and composite foreign keys (`[tenantId, partyId]`). Organization assignments (`PartyOrgAssignment`) narrow visibility within a tenant, but never widen or cross tenant boundaries.
5. **Safe Metadata Extensibility:** Core identity fields (`code`, `name`, `status`, `classification`) are locked and module-owned. Tenants may add custom extension fields (`x_...`) and UI layouts only through reviewed Application Dictionary packages bounded by the safe AST and platform schema limits.
6. **No Arbitrary Code Execution:** All actions, validation AST rules, and lifecycle handlers resolve only to pre-compiled, audited TypeScript handlers.

---

## 3. Reconciliation Matrix: iDempiere `C_BPartner` vs. GigaLibs Core Parties

| Concept / Table | iDempiere Architecture | GigaLibs Decision | GigaLibs Implementation | Rationale & Boundaries |
| :--- | :--- | :--- | :--- | :--- |
| **Identity Entity** | `C_BPartner` (monolithic table mixing customer, vendor, employee flags) | **Adapt** | `Party` (`packages/db`) + `PartyRole` | De-couples identity from roles. A Party has zero to many roles (CUSTOMER, SUPPLIER, etc.). No boolean flag sprawl. |
| **Location / Address** | `C_BPartner_Location` (postal address + phone/fax) | **Adapt** | `PartyAddress` + `PartyContactPoint` | Modern structured addresses (GeoJSON/place support, validation status) separate from communication channels (email, phone, webhook). |
| **Contacts / Users** | `AD_User` (overloaded for both login users and partner contacts) | **Adapt** | `PartyContactPoint` & separate platform `User` | Platform authentication and IAM remain distinct from external counterparty contacts. |
| **Identifiers** | Tax ID, DUNS, etc. directly on `C_BPartner` | **Adapt** | `PartyIdentifier` | Typed, country-scoped, effective-dated identifiers with explicit classification and field-level masking for PII/tax IDs. |
| **Relationships** | Direct parent-child pointers (`C_BPartner.C_BPartner_Parent_ID`) | **Adapt** | `PartyRelationship` | Typed, directed, effective-dated relationships (PARENT_SUBSIDIARY, AGENCY_CLIENT, CARRIER_BROKER) with cycle detection. |
| **Org Scope** | `AD_Org_ID` (Org 0 = global, single org column) | **Reject / Adapt** | `PartyOrgAssignment` + WI-OI-109 | Rejects Org 0 bypass. Replaces single column with granular org assignments scoped to WI-OI-109 primary/rollup trees. |
| **Custom Fields** | Direct `ALTER TABLE C_BPartner ADD COLUMN` | **Reject / Adapt** | `PartyConfigurationAdapterV1` + `ConfigurationExtensionValue` | Rejects runtime DDL. Extends Party via Phase 2 Application Dictionary and typed JSON extension storage. |
| **Validation Rules** | `AD_ValRule` (raw SQL where clauses) | **Reject / Adapt** | Safe Validation AST (`packages/configuration-core`) | Rejects arbitrary SQL. Enforces bounded expressions (comparison, logic, regex) evaluated safely in TypeScript. |

---

## 4. Architectural Tenets for Core Parties

1. **Composite Tenant Isolation:** Every Party record (`Party`, `PartyRole`, `PartyAddress`, `PartyContactPoint`, `PartyIdentifier`, `PartyRelationship`, `PartyOrgAssignment`) includes `tenantId`. Composite foreign keys (`REFERENCES "Party"("tenant_id", "party_id")`) guarantee referential integrity cannot cross tenant partitions.
2. **Locking Core Properties:** The core Party descriptor locks fundamental business properties:
   - `id`, `tenantId`, `code`, `legalName`, `displayName`, `partyType` (`ORGANIZATION` | `INDIVIDUAL`), `status` (`ACTIVE`, `INACTIVE`, `PROSPECT`, `ARCHIVED`, `MERGED`), `classification`.
   - Tenants cannot rename, retype, or bypass validation for locked core fields.
3. **Optimistic Concurrency & Audit:** Every mutation increments an integer `version`. Updates require the expected version (or `If-Match` header). Every change writes to the audit log and emits an event to the transactional outbox table (`party.created.v1`, `party.updated.v1`, `party.role.changed.v1`, etc.).
4. **Governed Merge Invariants:** Parties may be merged when duplicates occur:
   - Automated merges are prohibited.
   - Merging requires the `parties:merge` permission, a mandatory audit reason, and two-step preview verification.
   - The retired party is marked `status: MERGED` and receives a pointer to `survivorPartyId`.
   - An immutable record alias is created; existing historical references remain valid and resolve to the survivor.

---

## 5. Architectural Tenets for Bounded Custom Applications

1. **Non-Core Entity Declaration:** Any entity defined by a tenant in Configuration Studio must have `kind: NON_CORE`.
2. **Reserved Names Protection:** Non-core entities and fields cannot use reserved system names (`Party`, `User`, `Tenant`, `Account`, `Invoice`, `Payment`, `WorkOrder`, `Asset`, `Job`, `Audit`, `Role`, `Scope`, `id`, `tenantId`, `createdAt`, `updatedAt`).
3. **Standard Storage Engine:** Custom records are stored in the existing `ConfigurationRecord` and `ConfigurationTemplate` infrastructure. No runtime database tables or columns are provisioned.
4. **Field Quotas & Depth Limits:** Custom entities are subject to platform safety envelopes:
   - Max 50 custom fields per entity.
   - Max 10 custom entities per tenant.
   - Max AST validation expression depth of 10.
   - Max custom record payload size of 64 KB.

---

## 6. Security & Threat Model

| Threat | Mitigation |
| :--- | :--- |
| **Cross-Tenant Data Leakage** | PostgreSQL Row-Level Security (RLS) enabled on all Party tables. Prisma composite foreign keys enforce `[tenantId, partyId]`. Gateway injects authenticated `PlatformContext`. |
| **Unauthorized Organization Access** | Server-side resolution of WI-OI-109 organization scopes against `PartyOrgAssignment`. Inaccessible records return standard 404 (not 403) to prevent presence disclosure. |
| **PII & Sensitive Tax ID Exposure** | Typed `PartyIdentifier` records flag `isRestricted: true`. Requires explicit `parties:restricted.read` permission. Unmasked values are never included in audit logs or outbox events. |
| **Metadata Injection / Arbitrary Execution** | Application Dictionary compiler validates all fields, layout components, and AST nodes against allowlists. Registered action keys resolve strictly to compiled internal handlers. Zero `eval()` or dynamic SQL. |
| **Denial of Service via Record Sprawl** | List endpoints enforce cursor-based pagination with max `pageSize: 100`. Custom app payloads capped at 64 KB. |

---

## 7. Consequences

### Positive
- Unified master data for counterparties across future ERP modules (Invoicing, Procurement, Subcontracting) without schema duplication.
- Tenants can configure rich, validated custom data entry screens and non-core apps safely.
- Zero downtime schema migrations for tenant customizations.

### Negative / Trade-offs
- Custom extension fields stored in `ConfigurationExtensionValue` / JSON payloads require application-layer indexing for complex queries rather than native B-tree database indexes.
- Module integrations must map their local identifiers to Party references through explicit integration contracts.
