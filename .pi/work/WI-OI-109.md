# WI-OI-109 evidence: universal organization hierarchy and enterprise scope

## Authority and state

- Owner approved `.pi/tasks/WI-OI-109.md` on 2026-10-01 with “continue”.
- WI-OI-109 is the sole active implementation item.
- WI-OI-103 and WI-OI-106 live deployment/proofs are deferred, not accepted or waived. They will be rerun after
  organization-scope integration.
- Gemini's uncommitted corrections in `.pi/work/WI-OI-103.md` and
  `scripts/verify-manufacturing-no-developer.mjs` are preserved and excluded from this item's change set.

## 109a reconciliation and ADR (2026-10-01, Claude; started by Codex)

### Writers and readers today

| Item | Writer | Readers | Live data |
|---|---|---|---|
| `departments` (tree, ADR-0003 D4) | `tenancy-nest` department CRUD (`/tenants/current/departments`), edits effective at once | `auth-nest` `resolveOrganizationScope` (recursive CTE, depth 10, active only) | 0 rows |
| `TenantMember.departmentId` | `tenancy-nest` member update | the same resolver | 0 assigned |
| `organization-hierarchy` tenant feature | `tenancy-nest` organization settings (audited) | the resolver (off: `FLAT_TENANT`) | 1 tenant (`gigalibs-global`) |
| Signed `org_scope` | `auth-core` `buildPlatformContext` | Workforce (`jobs.service` predicates and write check), CMMS (`auth/scope.ts`, import/export), web session; Analytics and Geospatial carry it unused | per session |
| Module `department_id` columns | Workforce positions; CMMS assets, parts, PM schedules, work orders | each module's own scope predicates | 60 CMMS rows with placeholder ids `dept-cert-1/2` in module-only certification tenants; 0 in Workforce |
| `Tenant.parentTenantId` | none at runtime (two verification scripts) | none | 0 |
| Settings page `/settings/organization` | `TenantOrganizationHierarchyManager` (departments, member assignment, the two feature switches) | — | — |

### Findings

- Department edits change runtime access immediately: no draft, version, approval or effective date.
- Workforce and CMMS treat a record with no department as visible to every scoped member (Workforce refuses scoped
  writes to it): "no department" silently means tenant-shared, the implicit equivalent of iDempiere's Org 0.
- Analytics and Geospatial receive `org_scope` and do not apply it (Analytics applies place scope since WI-OI-105).
- CMMS and Workforce match place scope exactly (no descendants); recorded under WI-OI-105 as an owner decision.
- No live organization data needs migrating; the compatibility path must still keep module `department_id` meaning.

### iDempiere concepts (reference `/Users/rayapudi/idem`, `MOrg`, `MOrgInfo`, `MTree`, `MTree_Node`, `MRole`,
`MRoleOrgAccess`)

- Kept: org-aware records; role org access read-only or read-write per organization; summary organizations expanded
  through a tree (`MRole.loadOrgAccessAdd` over `AD_Tree_Org_ID`); several trees per tenant; organization information
  (parent, type, location, tax identity).
- Not adopted: Org 0 that every member can always read (`MRole` "can always read common org"), global mutable context,
  numeric magic ids, any role-chosen tree granting access.
- Deeper cross-check at the owner's request (2026-10-01): table access levels and client share
  (`X_AD_Table.ACCESSLEVEL_*`, `MClientShare`, `PO.doOrganizationCheckForSave`), shared-record writes (`MRole.canUpdate`),
  summary expansion at login (`Login.getOrgsAddSummary`), automatic tree insertion (`MOrg.afterSave`), the duplicate
  parent in `AD_OrgInfo.Parent_Org_ID`, the transaction organization (`AD_OrgTrx_ID`) and organization details
  (`X_AD_OrgInfo`). The ADR's "Cross-check against iDempiere" table records each behaviour and what this design does
  instead; it added per-entity ownership policies, refusal instead of silent rewriting, grouping versus record-holding
  unit types, one parent source, no automatic placement, no session organization, and reporting/cost unit dimensions.

### Decision record

- `docs/architecture/ADR-0018-organization-hierarchy-and-enterprise-scope.md` (Proposed): ownership, model (unit
  types with capabilities, units, versioned primary and alternate trees, closure, effective-dated grants, explicit
  tenant-shared data), runtime scope and its compatibility field, Department bridge (ids kept), threat model, data
  classification, permission matrix, migration and forward-fix plan.
- Owner decisions D1–D6 accepted 2026-10-01 ("go"), with the scaling change: the signed context carries granted
  units and the tree version; modules expand from their own copy of the published tree (WI-OI-105 pattern).
- The owner asked for accounting per organization, intercompany, consolidation, fiscal calendars, warehouses per
  organization and record-level access: possible, and kept as follow-on capabilities after WI-OI-109 (finance
  foundation, intercompany and consolidation, inventory with warehouses, record-level access); the model keeps their
  hooks (legal entities with currency, legal alternate tree, place links, per-entity ownership policy). Not yet
  registered as work items (owner to confirm).
- Five reference structures (retail, government, manufacturing, agriculture, healthcare) recorded in the ADR appendix
  as WI-OI-109g fixtures.

## 109b contracts and persistence

Implemented 2026-10-01. Owner approved applying the migration to the running database ("commit , approved"); a
backup was taken (`gigalibs_backup_20261001_075648Z.dump`), but the agent's live `prisma migrate deploy` was refused
by the session permission classifier, so the migration is **not yet applied live**; the owner runs it (command in
NOW.md) or grants the permission.

- Contracts: `packages/contracts/src/organization/index.ts` (unit types, units with minimal legal identity, trees,
  versions and edges, activation, place links, grants, ownership policy, `OrganizationScopeV2` carrying roots and the
  tree version only; write roots must be read roots). 13 contract tests in `organization.test.ts`.
- Persistence: migration `20261001000000_organization_hierarchy` and Prisma models; additive only, `departments`
  untouched. Ten tenant-bound tables with composite tenant keys under forced RLS for the NOLOGIN, NOBYPASSRLS role
  `gigalibs_org_tenant`. In the database: maker-checker, one primary tree per tenant, one open draft per tree,
  forward-only lifecycle, published versions immutable and undeletable, edges frozen after validation, closure written
  once while publishing and only for units of that version, activations append-only and only of a published version
  of the same tree, grants only for a member of the same tenant. `org_validate_hierarchy_version` reports cycles,
  depth beyond 16, root and parent-type breaches and archived units.
- Classification: the ten models are core in `config/package-layers.json`; tenant export exports eight sections,
  excludes the closure as derived (new `EXCLUDE_DERIVED` disposition) and the idempotency records as security
  material; edge rows export ordered by version and unit.
- Evidence (representative upgrade): latest backup `gigalibs_backup_20261001_041633Z.dump` (checksum OK) restored
  (`public` schema, 49 migrations, 272 tenants, 587 users, 382 members) into a throwaway PostgreSQL 16.14 on
  127.0.0.1; `prisma migrate deploy` applied the migration, a second deploy was a no-op, all ten tables show RLS
  enabled and forced, existing row counts unchanged; `packages/db/src/organization-hierarchy.integration.test.ts`
  6/6 passed as the tenant role; container removed. The first run caught a lineage foreign key declared before its
  key; fixed before the passing run.
- Schema drift (`prisma migrate diff` database → `schema.prisma`) on the restored copy: the migration removes every
  organization line from the diff and adds none; the remaining 126 lines are older drift in other tables.
- Clean install: not proven; blocked by FOUNDATION-CLOSE item 7 (fresh install fails before this migration).
- `pnpm verify`: PASS (2114 tests passed, 142 skipped; the known WORKFORCE_API_URL profile drift). The governance
  active item moved from WI-OI-103 to WI-OI-109 to match the work register.

## 109c domain and APIs

Implemented 2026-10-01; not deployed. Place links and the Department bridge move to 109e, as the card orders them.

- API: `OrganizationController` and `OrganizationService` in `packages/tenancy-nest`, 31 operations under
  `/api/v1/tenants/current/organization`: unit types and units (create, change, archive, restore, search with cursor
  pages), trees, drafts copied from the active version, one-level edge reads for tree views, place/move/remove
  changes, validation, impact preview (added, removed, moved units and the grants they touch), submit, withdraw,
  approve (never the author or submitter), reject, publish (closure and checksum built once), dated activation
  (idempotent, never in the past), as-of reads and activation history, member grants (idempotent, members of the
  tenant only, at most 200 each) and revocation.
- Every transaction runs as `gigalibs_org_tenant` under forced RLS with the tenant set; audit rows, outbox events and
  membership checks step out to the control plane inside the same transaction. Optimistic versions in request bodies
  (409 on a stale version), ETag on single reads, safe 409/422 messages for database refusals, 500 for anything else.
- Events in `platform_outbox_events`: `organization.unit-type.changed.v1`, `organization.unit.changed.v1`,
  `organization.hierarchy.activated.v1`, `organization.scope-grant.changed.v1`.
- Permissions `organization:read|draft|approve|activate|grant`; Tenant Admin holds `organization:*`; an organization
  steward is a custom role. Registered on the tenancy kernel module with the four events.
- Contracts: `packages/contracts/src/organization/api.ts` holds the route table and builds
  `docs/contracts/organization/openapi.json` and `asyncapi.json` (`node scripts/write-organization-contracts.mjs`).
- Evidence: `packages/tenancy-nest/src/organization.integration.test.ts` 8/8 on a throwaway PostgreSQL 16 restored
  from the latest backup plus the migration (container removed): three-level retail tree, maker-checker refusal,
  publish with closure, idempotent activation and key reuse, as-of reads, impact with an affected grant, validation
  problems, whole-branch removal, archive guards, grant and revocation rules, tenant B sees nothing, audit and outbox
  counts. Parity tests: controller routes, permissions and statuses equal the route table; committed documents equal
  the contracts; SQL refusals map to safe errors. `pnpm verify` PASS (2123 tests passed, 150 skipped).
- Not yet: an HTTP-level run through the real guards (109g live proof), and deployment: the API image must not ship
  before the 109b migration is applied to the running database.

## 109d administration UI

Implemented 2026-10-01; not deployed (needs the 109b migration live, then the API and web images).

- Settings › Organization (`/settings?tab=hierarchy`) now opens `OrganizationAdministration`
  (`apps/workflow-platform/components/organization/`), Medusa UI with ui-* tokens, four sections:
  - Structure: create the primary tree or rollup trees; the version in force, or as of any moment; the one draft
    with place/move/remove, validation problems by unit, impact preview (moves and touched grants), submit,
    withdraw, approve (disabled with the reason for the author or submitter), reject, publish, activate from now or
    a later time; activation history with "view as of".
  - Units: search, type and status filters, cursor pages; create and edit with dates, time zone, manager, contact,
    address, and legal identity only for legal-entity types; deactivate, archive (with the server's guard
    explained), restore.
  - Unit types: names, grouping or record-holding, capabilities, where each may sit; archive and restore.
  - Access: grant a member a unit and everything below it (optional end), revoke with a reason; revoked shown on
    request.
- States: loading, empty (guided first steps), denied (no organization:read; per-step permission reasons),
  validation (server problems and field issues), conflict and missing (Reload), outage (Try again), session
  ended (Sign in), success messages announced (role=status). Trees load one level at a time; nested lists with
  disclosure buttons for keyboard and screen readers.
- The old department manager stays below in a collapsed "Departments (legacy)" section: it is still the only place
  that sets a member's department and employment type, which Workforce and CMMS scope read until the 109e bridge.
- API addition: `ids` filter on the unit list (up to 200) to show names in grants, impact and problems; docs
  regenerated.
- Evidence: `e2e/specs/organization-admin.spec.ts` 2/2 in Chrome on a throwaway stack (restored backup plus
  migration; new API on 127.0.0.1:3399 and web on 127.0.0.1:5190 from the current build, storage pointed nowhere;
  removed afterwards): two administrators build three levels, three units and a tree; self-approval refused on
  screen; second administrator approves; publish; activate; in-force tree read by level; a breach listed by unit;
  impact shows the move; withdraw; grant and revoke; a stale edit shows the conflict with Reload; axe WCAG 2.2 AA
  scan of all four sections clean; a member without permission sees the refusal and the API answers 403.
  `__tests__/organization-client.test.ts` 11/11 (error mapping, permissions, maker-checker steps). Service and
  database integration 14/14 on a throwaway database. `pnpm verify` PASS (2134 passed, 150 skipped).
- Found while proving: Medusa's `Input type="search"` draws an unlabeled role=img icon (axe role-img-alt); the
  organization screens use a labeled text input instead. Other screens using it are not changed here.


## 109e plan (owner "go" 2026-10-01: decisions accepted as recommended)

Current path: the control plane resolves `orgScope` per verified session from departments (`auth.service`
`resolveOrganizationScope`); the web signs it into `PlatformContextV1.org_scope`; Workforce (`jobs.service`) and CMMS
filter on `department_ids`; Analytics and Geospatial ignore it. The context schema strips unknown claims, so a new
claim is safe for modules not yet updated.

- 109e1 core scope: a tenant becomes organization-scoped when its primary tree has a version in force. Then tenant-wide
  roles get `TENANT`, other members get `UNITS {tree_version, read_roots, write_roots}` from their current grants
  (none means only tenant-shared records). Signed as a new `organization` claim; the legacy `org_scope` is derived
  from the same grants (expanded unit ids, at most 1,000, else fail closed) until each module moves. Revocation:
  the next context issue (minutes), sessions re-verify. Department bridge and place-link API/UI here.
- 109e2 tree distribution: activation enqueues a kernel `organization.sync` job per entitled module (the WI-OI-107
  pack-apply channel); the module stores the version's edges and closure and refuses a context naming a version it
  does not hold yet. Shared expansion code in `@gigalibs/module-sdk`.
- 109e3 vertical path: Workforce records owned by units (ownership policy, write needs a read-write root), unit on
  the events Workforce sends Analytics, Analytics answers and Reports filtered by the member's units.

Decisions for the owner: transport (kernel push vs module pull); department bridge (one-time conversion plus
read-only departments once a tree is in force vs a full facade); legacy field derivation; vertical path (Workforce vs
CMMS); when a tenant becomes organization-scoped (tree in force vs the existing feature switch).

## 109e1 core scope, department bridge, place links

Implemented 2026-10-01; not deployed (owner option B: one release after 109e).

- Scope: `packages/auth-nest/src/organization-scope.ts` (`primaryVersionInForce`, `resolveTreeScope`), used by
  `AuthService.resolveOrganizationScope` for both web sessions and kernel-job subjects. Tree in force: tenant-wide roles
  `TENANT`; others `UNITS {tree_version, read_roots, write_roots}` from current grants on placed, non-archived units
  (none means shared records only); legacy `org_scope` from read-write grants only (expanded, active units, at most
  1,000, else empty with a warning). No tree in force: departments exactly as before, no claim.
- Claim: `PlatformContextV1.organization` (optional; contracts strip-parse, so modules not yet updated ignore it);
  `buildPlatformContext` adds it; the web session validator accepts it only when it matches the contract.
- Department bridge: `POST /organization/departments/import` (same ids, nested in the primary draft, member grants,
  repeatable); department create/update/delete and member department changes refused once a tree is in force.
  "Bring in departments" on the Structure screen.
- Place links: list, create (no overlapping period per unit/place/relation), end on a date; event
  `organization.unit-place-link.changed.v1`; "Places" on the Units screen (Maps places when readable, else a place id).
  Links never grant place access (D6).
- Evidence: service and scope integration 11/11 on a throwaway restored database (scope from grants, read-only grant
  kept out of the legacy write path, revocation empties roots, place-link periods, department import twice, tenant
  isolation); signed-claim tests (web mint and verify 3/3, contract refusal of write roots outside read roots);
  department read-only unit test; parity (35 routes, documents regenerated); Playwright 2/2 in Chrome on the throwaway
  stack including departments refused after activation, the import action, place link and end, axe clean.

## 109e2 delivering versions to modules

Implemented 2026-10-01; not deployed (owner option B).

- Core: the platform outbox relay dispatches `organization.hierarchy.activated.v1` and
  `organization.hierarchy.sync-requested.v1` to `KernelOrganizationSyncService`, which queues one kernel `module.call`
  job per entitled module (Workforce `gigaops`, Analytics `analytics-studio`), run as the activating or requesting
  member, idempotent per activation or request and module. A dispatch failure keeps the event pending (relay retry and
  quarantine). `POST /organization/trees/{treeId}/sync` (organization:activate) and "Send to modules again" resend.
- Kernel worker: `workforce.organization-sync` and `analytics.organization-sync` read the published version
  (`organization-versions.ts`, tenant-scoped, byte order) and post pages of 500 units then a completion, signed with
  the module's key; 4xx is final (visible), 5xx retries.
- Modules: `OrganizationReplica` in `@gigalibs/module-sdk` (tables generated by `organizationReplicaDdl`; Workforce
  migration 000017, Analytics 000027, schema pins 17 and 27). Endpoints `POST v1/organization/versions/{id}/units` and
  `/complete` (organization:activate); a version is held only when count, parents and checksum agree, then immutable.
  Module permission matching now also accepts another family's wildcard (`organization:*`), as the core does.
- Rules clarified (ADR-0018): byte-order checksum on both sides; a grant on an inactive unit is paused, roots cover
  everything below.
- Evidence: end-to-end on a throwaway restored database 4/4 (activation event → one queued job as the activator;
  signed pages → module replica under forced RLS as a runtime role → checksum agreement with mixed-case and
  punctuated codes → expansion; tenant B sees nothing; a retry changes nothing; tampered, orphaned and short versions
  refused; resync request). Job unit tests 4/4 (1,001 units → 3 pages; refusals final; outage retried). Migration
  parity tests. Earlier organization suites still pass (17). Playwright 2/2 including the resend action.
- Noticed, not changed: `KernelSchedulesService` throws "Called end on pool more than once" when the API shuts down
  (pre-existing, WI-OI-104). Adding `@gigalibs/module-sdk` as an API dev dependency also re-resolved one vitest
  tooling entry in `pnpm-lock.yaml`.

## 109e3 organization-aware Workforce to Analytics to Reports path

Implemented 2026-10-02; not deployed.

- Workforce positions now use canonical `organizationUnitId`; the deprecated `departmentId` alias remains for
  compatibility and mismatched dual input is refused. Reads and writes expand only active units from an immutable
  replica version, require the module to hold the signed version and require write roots to be inside read roots.
- Workforce emits versioned `WorkforcePositionFactV1` facts transactionally. Migration 000018 adds the dedicated
  relay, whose credentials are separate from other module channels. Analytics migrations 000028–000029 add the
  module-event source without treating Workforce as a connector.
- Analytics verifies the Workforce key, source and event type, validates and deduplicates the fact, then lands it in
  the existing raw-record, discovery, mapping and dataset pipeline. Query, dashboard, cache and report paths apply
  the caller's server-signed organization scope; Reports re-resolve under that same principal.
- Organization replicas now exclude inactive units from lookup and expansion, and tenant-wide contexts still verify
  that the named immutable tree version is held locally.

## 109f mobile and client contract readiness

Implemented 2026-10-02; not deployed.

- `OrganizationClientManifestV1` and `GET /api/v1/tenants/current/organization/client-manifest` publish versioned
  operations, permissions, phone/tablet layouts, form presentation metadata, ownership fields and limits.
- The manifest is server-authored and capability-driven. It contains no client-side authorization, hierarchy
  mutation authority or tenant-specific hardcoding, and this slice does not modify the separate mobile repository.
- OpenAPI was regenerated from the same contract used by the controller.

## 109g local certification checkpoint

Completed 2026-10-02 for the pre-deployment local slice.

- A marked throwaway PostgreSQL 16 run passed 29/29 integration cases: database hierarchy 6, five reference
  structures plus sibling isolation 6, organization service 11 and module synchronization 6. Retail, government,
  manufacturing, agriculture and healthcare structures were created and published through the same APIs with no
  industry-specific hierarchy code.
- Focused organization, scope, relay, Analytics and client-contract suites passed 82/82; the organization-aware
  Reports suite passed 46/46. `git diff --check` passed.
- `pnpm verify` passed: build, tests, all seven audits, layers and module manifests; 255 test files and 2,177 tests
  passed, 22 files and 165 tests skipped. Only the known `WORKFORCE_API_URL` deployment-profile drift remains. Full
  log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-02T00-55-04-819Z.log`.
- At this pre-deployment checkpoint the running stack remained at Analytics schema 25 and Workforce schema 16.
  The later bounded local deployment is recorded below; it is still not release certification.

## Bounded local deployment and native-organization cleanup (2026-10-02)

- Before the database change, backup `infra/compose/backups/gigalibs_backup_20261002_083056Z.dump` was created and
  its SHA-256 sidecar verified. A rollback-only dry run passed before the same bounded transaction was committed.
- For active tenant `gigalibs-global` (`cmtzhwgew0015v8jbvo1uvcay`), the transaction removed rejected draft history
  and its cascading edges, alternate test trees `clenaing` and `Power Area`, and imported sample units
  `OPS-HOUSEKEEPING` and `FLOORCLEANING`. No activation, scope-grant or Place-link record existed for those objects.
- Post-cleanup SQL proof: exactly one tree remains (`primary`, `Organization`, `PRIMARY`); alternate trees, units,
  versions, edges and legacy departments are all zero. The primary tree is therefore an empty native starting point.
- `OrgStructurePanel` no longer imports `OrgDepartmentImportV1`, wires `importDepartments` or renders the
  `Bring in departments` action. The browser specification now asserts that the migration action is absent. The
  backend compatibility endpoint remains in place but is no longer advertised in the UI.
- Exact local images were rebuilt and deployed consumer-first as `3da222030dc2-a0ca08f61655`; every application
  container reports healthy, the control-plane and web readiness endpoints return ready, Analytics is at schema 29
  and Workforce at schema 19. A scan of the compiled running `.next` artifact reports `LEGACY_LABEL_ABSENT`.
- `pnpm --filter @gigalibs/workflow-platform typecheck`, `pnpm verify --audits` and `git diff --check` pass; only the
  registered `WORKFORCE_API_URL` deployment-profile drift remains. This cleanup does not close WI-OI-109: the wider
  live organization/vertical-path/accessibility proof, fresh-install repair/proof and independent reviews remain.
