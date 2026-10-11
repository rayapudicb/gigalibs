# WI-OI-120z (R5 CMMS): Scoped maintenance access

- **Status:** Discovery in Review, 2026-10-08. The owner approved the first bounded discovery slice after the R2
  release handoff. Its [access-boundary report](../../docs/plans/cmms-r5-access-boundary-2026-10-08.md) is complete
  for owner and independent Security review. No product implementation, scope-gate change or deployment is
  authorized by this approval; implementation boundaries and entity/role decisions remain open.
- **Work item:** WI-OI-120; follows WI-OI-120w/120y, precedes T3 and WI-OI-120t (M-CM1).
- **Size:** L; re-estimate after the access-path inventory and dependency decisions, not a fixed 10–12-day promise.
- **Trace:** FR-14, FR-15; NFR-SEC-001, NFR-GOV-001–003, NFR-DATA-003, NFR-REL-001–002.

## Goal

A CMMS customer's maintenance permissions apply only to the authorized units/places for each assignment, without
combining one assignment's write permission with another's read scope. Existing access must not silently widen.

## First approved slice: resolve the enforcement boundary

1. Freeze CMMS's access-path matrix: list, read, create/update/delete, actions, lookup, report/export, jobs and caches;
   classify every entity as unit-owned, tenant-shared or either, and trace direct API and BFF paths.
2. Trace all consumers of maintenance-role permissions, including Workforce and Maps and the platform. Resolve
   `geospatial-studio`/`geospatial` mapping. Treat Connector mapping as an explicit shared prerequisite or separate
   card, not automatic CMMS scope. `maps.nodes.read` is platform-checked, so merely enabling CMMS/Geospatial in the
   allow-list cannot make the present role assignable at units/places.
3. Recommend a scoped role/dependency design for owner approval: preserve supported business outcomes, do not grant
   extra modules to a CMMS-only tenant, remove platform attribution without evidence, or weaken the scope gate.
   Any role split or permission change needs existing-member compatibility/access reconciliation.
4. Before opening the gate, protect `syncDefaultRoles` changes and their transitive inclusion holders with the same
   transition/enforcement checks as manual role edits. The current exception is safe only while the gate is empty.
5. Record freshness behavior and reconcile ADR-0034's revocation wording with the as-built current-request checks;
   do not assume refreshing browser context invalidates every previously minted context.

**Discovery result:** the source-path inventory covers 50 generated CMMS gateway templates and 72 method mappings.
It identifies currently reachable scope gaps in part/work-order issue and return, storerooms/balances, meter
triggers/batch, spaces/CAD and Reliability work-order actions. The report distinguishes these source findings from
authenticated exploit proof and proposes a legacy-gap repair before enabling per-assignment unit or place scopes.
Owner decisions on entity ownership, CMMS-only versus companion roles, ordering and cross-domain action permissions
are listed in the report. The full R5 Done-when checks below are not met.

## Implementation boundaries to approve after discovery

- Reuse the SDK's `scopeFor` and existing organization/place authorities; no new tenant or role engine.
- Prove each dimension before adding it to `SCOPE_ENFORCING_MODULES`; add CMMS to
  `PER_ASSIGNMENT_SCOPE_MODULES` only when all applicable paths use per-permission scope.
- No applied migration edits, UAT database writes, deployments, protected CMMS import/export edits or unrelated
  module rewrites. Forward migrations, if needed, require their own reviewed compatibility/recovery proof.
- Technician `execute-own`, request-to-close and metadata conversion remain WI-OI-120t. T3 owns place-identity
  migration. This card must not silently duplicate them or certify M1a by itself.

## Done when (for the approved implementation slices)

- [ ] Owner-approved matrix and role/dependency boundaries are recorded, with no unowned cross-module consumer.
- [ ] Two tenants, two sites/units, read-only scope, mixed assignments, shared records and stale tree versions are
  tested through real authenticated HTTP; direct-ID, lookups, reports/exports, jobs and caches cannot bypass scope.
- [ ] Role grant/edit/revoke/inclusion and manifest synchronization preserve the boundary, including concurrency;
  old contexts and next-request behavior are explicitly tested and documented.
- [ ] Existing-member reconciliation proves no unexplained gain/loss; migrations, if any, have isolated proof.
- [ ] Full applicable verification and independent Security review pass; owner deploy/post-deploy proof are recorded
  separately. M1a still requires the later T3/M-CM1 customer journey.

## Read first / stop conditions

AGENTS, NOW, ADR-0003/0018/0034, platform plan D6/R5, R2 evidence and scope/permission catalogues, the affected
module guards/services and module roles. Stop for owner decisions on role composition, shared-entity policy,
cross-module scope expansion or any existing-data change. Never enable an unproved scope as a shortcut.
