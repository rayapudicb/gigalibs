# ADR-0018: Universal organization hierarchy and enterprise scope

- **Status:** Decisions D1–D6 accepted by the owner on 2026-10-01 ("go", with the scaling change in §3); independent
  review pending. Supersedes ADR-0003 Decision 4 ("Department hierarchy model and organization scoping"); ADR-0003's
  other decisions stand.
- **Date:** 2026-10-01.
- **Work item:** WI-OI-109 (`.pi/tasks/WI-OI-109.md`); evidence in `.pi/work/WI-OI-109.md`.
- **Builds on:** ADR-0003 (identity, tenancy, persona), ADR-0006 (places and spatial scope), ADR-0016 F1 (the kernel
  owns tenants, roles, permissions and policy), ADR-0017 (kernel jobs), WI-OI-107 (packs).
- **Reviewers required before acceptance:** Solution Architecture, Security & Privacy, Backend/Data, Product.

## Context

Every customer has an organization: a company with divisions and stores, a ministry with directorates and offices, a
cooperative with farms. Today GigaLibs has one opt-in `departments` tree (ADR-0003 D4): edited in place, effective at
once, with no types, versions, dates or approval. The signed context carries the member's department and everything
under it (`org_scope: SCOPED_DEPARTMENTS`); Workforce and CMMS filter on it; Analytics and Geospatial carry it but do
not apply it. The reconciliation (WI-OI-109a evidence) found:

- **No live organization data:** 0 departments, 0 member assignments, 0 tenants with a parent tenant. One tenant
  (`gigalibs-global`) has the `organization-hierarchy` feature on. 60 CMMS rows carry placeholder department ids
  (`dept-cert-1`, `dept-cert-2`) in module-only certification tenants.
- **Implicit shared data:** Workforce and CMMS show records with no department to every scoped member (and Workforce
  refuses scoped writes to them), so "no department" silently means "shared across the tenant".
- **Unused tenant parenting:** `Tenant.parentTenantId` has no runtime reader or writer.
- **Immediate authority:** department edits change runtime access the moment they are saved.

iDempiere (reference only) shows what to keep and what to avoid. Keep: org-aware records, role org access that is
read-only or read-write per organization, summary organizations expanded through a tree, several trees per tenant,
organization information (parent, type, location, tax identity). Avoid: the magic Org 0 that every member can read,
global mutable session context, numeric magic ids, and letting any tree a role picks grant access.

## Decision

### 1. Ownership and boundaries

- The organization model is a **kernel** capability (ADR-0016 F1: tenants, roles, permissions and policy). Its one
  write authority is the control plane (`packages/tenancy-nest`, Prisma schema); modules never write it and receive it
  only in the signed context and in events.
- **Tenant stays the hard isolation boundary.** No organization row or edge crosses tenants; every table is
  tenant-bound with composite keys and forced RLS. `Tenant.parentTenantId` is deprecated (no readers, no data) and
  dropped later with its own approval; groups of tenants are out of scope.
- **Place stays the physical hierarchy** (ADR-0006). An organization unit may operate or own places through
  effective-dated links; a link never grants place access, and place scope stays a separate, independent dimension.

### 2. Model

- **Unit types** (per tenant): code, labels (singular and plural), allowed parent types, whether units of the type
  **hold records** or only group other units (iDempiere's summary organizations), and controlled **capabilities**:
  `LEGAL_ENTITY`, `OPERATIONAL`, `REPORTING`, `WORKFORCE`, `COST_ACCOUNTING`, `PLACE_OPERATING`. No level is fixed in
  code; a pack may propose a set of unit types as a template (WI-OI-107), which a tenant administrator adopts
  explicitly; it is never activated silently.
- **Units:** code, name, type, status, effective dates, time zone, contact details, a manager (today's
  `Department.managerId`), an address or a linked place, and details by capability (a legal entity holds identity only:
  legal name, registration and tax identifiers, country, functional currency). A unit has **no parent field**: its
  parent exists only in a hierarchy version, so there is one source of truth for the tree. Fiscal calendars and
  warehouses are later capabilities.
- **Placement is explicit:** a new unit enters a tree only through a published version; nothing is placed
  automatically.
- **Hierarchy versions:** each tenant has one **primary tree** that alone carries authority, and may have **alternate
  trees** (reporting, cost, legal) that are read for rollups and never grant access. A tree changes only through an
  immutable version: draft → validated → submitted → approved (a second administrator) → published → activated, with an
  effective-from date. Runtime reads the active version; history is read as of any date.
- **Edges and traversal:** each version stores parent–child edges and a closure table built at publish; cycles,
  cross-tenant edges and parent-type rule breaches are refused at validation; depth is bounded (16).
- **Member scope grants:** a member holds grants on units (read or read-write, effective-dated); a grant covers the unit
  and its descendants in the active primary tree, skipping inactive units. Tenant-wide authority stays a role property
  (tenant administrators, platform roles), as today. A member of an organization-scoped tenant with no grant sees
  nothing (fail closed). There is no "current organization" in the session: authority is the whole grant set, and a
  screen may only narrow what it shows.
- **Ownership policy per entity:** each module entity declares whether its records must belong to a unit (`UNIT`),
  are always tenant-shared (`SHARED`), or may be either (`EITHER`); a tenant may narrow `EITHER` for its own data
  (iDempiere's table access level and client share). A record may be owned only by a unit whose type holds records.
  A write that breaks the policy is refused, never silently changed.
- **Tenant-shared data is explicit:** a record is owned by a unit or marked tenant-shared; there is no special shared
  unit. Shared records are readable by every member with the entity's read permission and changeable only with
  tenant-wide authority (as iDempiere limits Org 0 records to client-level roles, and as Workforce already refuses
  scoped writes to records with no department). (Owner decision D3 sets how existing records with no unit are treated.)
- **Other unit dimensions:** a record may also carry reporting or cost units (iDempiere's transaction organization,
  `AD_OrgTrx_ID`) that roll up in alternate trees; authority always uses the owning unit only.

### 3. Runtime scope

- The control plane resolves scope at session issue from the active primary version and the member's current grants.
  The signed context carries only the **granted units and the tree version**, so its size does not grow with the tree:
  `{ mode: 'TENANT' }` or `{ mode: 'UNITS', tree_version, read_roots, write_roots }`, failing closed (`DENIED`) when
  unresolvable (owner, 2026-10-01: a retailer with 5,000 stores or a ministry with 20,000 offices must not put every
  unit id in every request).
- **Modules expand the roots themselves**, from their own copy of the published tree (the WI-OI-105 place-directory
  pattern): the control plane publishes each activated version as an event; each module keeps the version's closure
  and resolves descendants locally, cached by version. A module that does not hold the context's `tree_version` yet
  refuses the request until it has caught up (fail closed), never falls back to a wider scope.
- **Compatibility:** during the transition the context also carries today's `org_scope` (`SCOPED_DEPARTMENTS`) derived
  from the same grants, so Workforce and CMMS keep working unchanged until each moves to the new field.
- Modules apply tenant and organization predicates in APIs, jobs, events, exports, caches, Analytics answers and
  reports; caches key on the scope version. Revocation takes effect at the next context issue (minutes) and at once
  through the existing revocation events for removed grants.

### 4. Departments

- Existing `departments` rows (none today) become units of a tenant-defined `DEPARTMENT` type, **keeping their ids**, so
  any module reference stays valid. The department endpoints become a compatibility facade over units and then retire;
  there is no permanent dual write.
- **As built (109e1, owner "go" 2026-10-01):** an administrator brings departments in (`POST …/departments/import`):
  same ids, nested in the primary tree's draft, each member's department a read-write grant; repeatable. Once the
  primary tree has a version in force, department changes and department assignment are refused with a pointer to
  Settings › Organization, so units and grants are the one authority. A department-writing facade was not built: no
  tenant has departments.

### 109e decisions (owner "go", 2026-10-01)

- A tenant follows its organization once its **primary tree has a version in force**; until then the department scope
  applies unchanged and the `organization` claim is absent.
- The signed context carries `organization` (`TENANT` for tenant-wide roles, otherwise `UNITS` with the version and the
  member's current grant roots). The legacy `org_scope` is derived from **read-write grants only** (expanded, at most
  1,000 units, else empty), so a read-only grant never unlocks a write in a module that still reads department ids.
- The tree reaches modules through kernel jobs (the WI-OI-107 pack channel); a module refuses a context naming a
  version it does not hold. Workforce → Analytics → Reports is the first complete path.

## Cross-check against iDempiere (`/Users/rayapudi/idem`, read 2026-10-01)

| iDempiere behaviour | Where | Here |
|---|---|---|
| Every record carries an organization | `AD_Org_ID` on all tables | Owning unit, by the entity's ownership policy |
| Per-table access level (system, client, organization, client+organization) and per-tenant client share | `X_AD_Table.ACCESSLEVEL_*`, `MClientShare`, `PO.doOrganizationCheckForSave` | Per-entity policy `UNIT`, `SHARED`, `EITHER`, narrowable per tenant |
| A record at the wrong level is silently reset to Org 0 | `PO.doOrganizationCheckForSave` ("Set Org to 0") | Refused with a clear error; never rewritten |
| Org 0 readable by every role; writable only by client-level roles | `MRole.isOrgAccess`, `MRole.canUpdate` | Explicit tenant-shared marker; read by all with permission, change with tenant-wide authority |
| Summary organizations group; their access expands recursively to active children through the role's org tree | `MRole.loadOrgAccessAdd`, `Login.getOrgsAddSummary` | Grouping unit types; grants expand down the primary tree, skipping inactive units |
| Any org tree a role chooses can carry access | `AD_Role.AD_Tree_Org_ID` | Only the primary tree carries authority (D1) |
| Role org access or user org access, read-only or read-write | `MRoleOrgAccess`, `MUserOrgAccess`, `IsUseUserOrgAccess` | Member grants, read or read-write; role-level grants later if needed |
| A new organization is inserted at the root of every org tree | `MOrg.afterSave` → `PO.insert_Tree` | Placement only through a reviewed, published version |
| Parent kept both in the tree and in `AD_OrgInfo.Parent_Org_ID` | `MOrgInfo` | One source: edges in hierarchy versions only |
| Tree edits take effect at once; no versions or dates | `MTree_Node` | Immutable versions, maker-checker, effective dates, as-of reads |
| Login selects one organization into a global context | `Login`, `Env` | No session organization; scope is the signed grant set |
| Transaction organization beside the owning one | `AD_OrgTrx_ID` | Reporting and cost units on records; authority by owner only |
| Organization details: type, location, time zone, calendar, supervisor, tax id, logo, warehouses | `X_AD_OrgInfo` | Type, address or place link, time zone, manager, tax identity; calendars and warehouses later |

## Threat model (STRIDE, summary)

| Threat | Control |
|---|---|
| Spoofing a scope from the client | Scope is resolved server-side and signed per module; clients never send unit ids for authority. |
| Tampering with the tree to widen access | Only published, approved (maker-checker) versions affect runtime; drafts never do; audit and outbox on every step. |
| Repudiation of a change | Append-only audit of each version transition with actor, reason and impact preview. |
| Information disclosure across tenants or siblings | Composite tenant keys, forced RLS, no cross-tenant edges; sibling isolation tests at API and database level. |
| Denial of service by deep or wide trees | Bounded depth (16), unit count limits per tenant, closure built once per publish, paginated reads. |
| Elevation through stale grants | Effective-dated grants, revocation events, cache keys on scope version, fail-closed resolution. |

## Data classification

Unit names and structure: tenant-internal. Legal entity identifiers (registration, tax): confidential business data,
readable only with `organization:read`, exported only with `organization:export`, never in logs. Member grants:
tenant-internal personal data (who may see what), audited. Government classifications are not modelled (owner
decision D5). Tenant portability export carries types, units, trees, versions, activations, edges, place links and
grants; it leaves out the closure (rebuilt from edges) and idempotency records.

## Permission matrix

| Action | Permission | Tenant admin | Organization steward | Member |
|---|---|---|---|---|
| Read the active tree | `organization:read` | yes | yes | own scope only |
| Edit drafts (types, units, edges, links) | `organization:draft` | yes | yes | no |
| Approve a version (not its author) | `organization:approve` | yes | yes | no |
| Publish and activate | `organization:activate` | yes | no | no |
| Grant member scope | `organization:grant` | yes | no | no |
| Read history and as-of | `organization:read` | yes | yes | no |

## Migration and forward-fix plan

- **Additive only:** new tables beside `departments`; forward migrations; no rename or drop in WI-OI-109. Clean-install
  and representative-upgrade proofs before deploy; backup before every deploy.
- **Bridge:** a one-time step copies any department into a unit with the same id (none exist today), and the
  department API becomes a facade. `departments` and `parentTenantId` are dropped only after consumers are gone, with
  the owner's approval.
- **Forward fix:** a bad version is fixed by activating a corrected version (or re-activating the previous one); no
  data is rewritten in place.

## Owner decisions (accepted 2026-10-01: D1–D6 as recommended, with the §3 scaling change)

- **D1, one authority tree:** only the primary tree grants access; alternate trees serve rollups (recommended), or any
  tree may grant access (iDempiere's model: more flexible, more ways to widen access by mistake).
- **D2, inheritance:** a grant covers the unit and everything below it (recommended, as today), or grants are exact
  units only.
- **D3, records with no unit:** each entity gets an ownership policy; today's records with no department count as
  tenant-shared (readable by scoped members, changed only with tenant-wide authority, as Workforce already does), and
  new records must name a unit or be marked shared as their entity's policy allows (recommended); or legacy records with
  no unit become hidden from scoped members (fail closed, may surprise current users of the test tenants).
- **D4, legal entities:** identity attributes only now; financial consolidation, intercompany and tax semantics later
  under their own ADR (recommended); or design consolidation now.
- **D5, government classification and data residency:** out of scope for WI-OI-109, recorded as future capabilities
  (recommended); or include them.
- **D6, place links:** a unit's place links never grant place access; place scope stays separate (recommended); or a
  unit grant also grants its linked places.

## Consequences

- One governed model serves companies, governments and cooperatives without code changes; the tree changes only
  through reviewed, dated versions.
- Modules move from department ids to unit scope one at a time behind the compatibility field.
- More moving parts in the control plane (versions, closure, grants) and a larger signed context; bounded by depth and
  unit limits and cached by version.

## Appendix: reference structures (test fixtures for WI-OI-109g)

Each is configured by a tenant administrator with no code. [LE] legal entity, [G] grouping only, [R] holds records,
⌂ operates a place (Geospatial). Only the primary tree grants access; alternate trees roll up.

1. **Retail (FreshMart Group):** Company [LE][G] → Head office functions [R]; Regions [G] → Districts [G] → Stores [R] ⌂;
   Logistics [G] → Distribution centres [R] ⌂ warehouse. Alternate trees: legal (retail and logistics companies), store
   format. Grants: a regional manager on a Region (read-write); a store manager on one Store; a buyer on Buying
   (read-write) and the company (read-only).
2. **Government (State Health Department):** Department [LE][G] → Secretariat [R]; Directorates [G] → District offices [R]
   → Taluk offices [R] → Community health centres [R] ⌂ → Primary health centres [R] ⌂ → Sub-centres [R] ⌂. Alternate trees:
   budget heads, programmes. Grants: a district health officer on a District office; a programme officer with read grants
   on several districts. Classification and residency are out of scope (D5).
3. **Manufacturing (Acme Industries):** Group [G] → Companies [LE][G] (two countries) → Corporate [R]; Plants [G] ⌂ →
   Production [R] ⌂ lines, Maintenance [R] (owns CMMS work orders and assets), Quality [R], Plant stores [R] ⌂ warehouse.
   Alternate trees: cost centres, product lines. Grants: a plant manager on a Plant; a maintenance planner on one
   plant's Maintenance; group finance read-only on the Group.
4. **Agriculture (Green Valley Plantations):** Company [LE][G] → Head office [R]; Estate groups [G] → Estates [R] ⌂ →
   Divisions [R] ⌂ fields, Factory [R] ⌂. Fields stay places (WI-OI-105). Alternate trees: crop, cost. Grants: an estate
   manager on an Estate; a division supervisor on one Division. A cooperative follows the same pattern
   (Clusters [G] → Collection centres [R] ⌂, member farms as places).
5. **Healthcare (CarePlus Hospitals):** Group [G] → Companies [LE][G] (hospitals, diagnostics) → Group services [R];
   Hospitals [G] ⌂ → Clinical and support departments [R] ⌂ wards, labs, pharmacy. Alternate trees: specialty (all
   cardiology across hospitals), legal. Grants: a hospital administrator on a Hospital; a head of department on one
   department; the group chief medical officer read-only on both hospitals.

