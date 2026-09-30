# WI-OI-103e: dashboards, permissions and roles, and Analytics owns reports

- **Status:** In progress. e1, e2 (2026-09-29) and e4 (2026-09-30) are done; e3 (roles) is next. Evidence goes in `.pi/work/WI-OI-103.md`, under "103e".
- **Work item:** WI-OI-103 (acceptance 5 and 6); ADR-0016 F16 and F11, both approved 2026-09-29.
- **Size:** M–L. The owner's deadline for foundation work is 2026-10-04; whatever is unfinished then waits until
  after the agriculture package.

## What exists today (checked 2026-09-29)

- **Permission names:** the kernel accepts only two-part names (`analytics:read`). Three places enforce this:
  `auth-nest` (session permissions), `contracts/tenancy` (custom-role create) and `rbac-nest` (role resolution).
  A three-part name such as `analytics:charts:write` is silently dropped. So only a Tenant admin (`analytics:*`) can
  save charts or approve formulas, and no role can grant them to anyone else.
- **Analytics** uses 13 permission names. ADR F16 names eight (read, connectors, mappings, models, charts,
  dashboards, reports, export); `models:publish` from 103b is the maker-checker step.
- **Routes with no named permission** are open to any entitled member: `v1/query/run`, `v1/charts`,
  `v1/dashboards` and `v1/reports`. The web proxy does not expose them, but the module should refuse them itself.
- **Roles:** each member has one base role (SUPER_ADMIN, TENANT_ADMIN, MANAGER, MEMBER, VIEWER, GUEST), at most
  one tenant custom role, and optional extra permissions. `CustomRole.isSystem` exists but nothing creates system
  roles.
- **Dashboards and reports** bind to the old `chart_definitions` (migration 8), not to chart views.
- **Core `reports` entry:** `/reports` is a UI prototype whose read model returns 503 (F11 removes it).

## Owner decisions (2026-09-29)

- **Roles:** system roles now. A member holds one extra role until WI-OI-077 brings multiple roles.
- **Order:** e1 → e2 → e4 → e3 → e5. Reports are the most likely to slip past Sunday.

## Pieces (each verified and committable)

1. **e1 Permission names (kernel):**
   - Accept `module:resource:action` in the three places; `analytics:*` keeps covering them.
   - `platform:` stays refused.
   - Tests.
2. **e2 Analytics permission set (F16):**
   - Declare the permissions in `module.yaml` with labels.
   - Fold the 13 names into: `read`, `connectors:write`, `mappings:write`, `models:write`, `models:publish`,
     `charts:write`, `dashboards:write`, `reports:write` and `export`.
     - Discovery goes under mappings; sync under connectors.
     - `analytics:action` stays for setup, actions and Demo Lab.
   - The guard fails closed: a route that names no permission is refused. A test checks that every route names one.
   - The web proxy mirrors the module.
3. **e3 Default roles (F16):**
   - Viewer, Analyst and Data steward are declared in the Analytics manifest.
   - They are created as system roles for each tenant entitled to Analytics, and cannot be edited or deleted.
   - Tenant admin stays the base role.
   - Assigned in the existing member screen.
4. **e4 Dashboards with shared filters:**
   - A dashboard holds saved chart views.
   - Shared filters (time range, plus field filters such as farm or crop) apply to every chart whose model has that
     field.
   - Screens: a list, a builder and a view.
   - Needs `analytics:dashboards:write` to change; reading needs `analytics:read`; changes are audited.
   - The old `v1/charts`, `v1/dashboards` and `v1/query/run` routes retire.
5. **e5 Analytics owns reports (F11):**
   - A report is a chart view or dashboard exported as scheduled CSV.
   - It runs with its owner's rights, and recipients are checked at send time.
   - `analytics:reports:write` and `analytics:export` apply.
   - The core `reports` catalogue entry and `/reports` screen are removed.

## Done when

- [ ] e1–e5 pass `pnpm verify`, with tests.
- [ ] On 5190: an Analyst builds a dashboard with a shared filter; a Viewer sees it but cannot change it; a Data
      steward approves a formula made by someone else.
- [ ] Evidence is recorded, and `.pi/NOW.md` is updated.

## Stop and ask if

- a change would alter what an existing base role can do;
- a migration would drop or rewrite existing data (old chart definitions, dashboards or reports).
