# WI-OI-120bw: SPEED S3 — the `process-safety-screening` module scaffold and Projects

- **Status:** Built, committed `48fa7aaf` on `feat/speed-s3-module`, with S1 (`797aae0c`) and S2b (`1cdb47bb`) merged into
  it (owner, 2026-10-21: "continue speed to close it"; "commit"). Under the approved WI-OI-120bn. Implementer:
  Claude Code, in worktree `/Users/rayapudi/dev/gigalibs-speed-s3`, branch `feat/speed-s3-module` from main `5fdaed2d`.
- **Work item:** WI-OI-120bn, slice S3 (plan v1.4 §5.1); screen spec §2.1 (Projects).
- **Size:** M.

## Goal

SPEED becomes a real module of its own in the catalogue: its schema, API, roles, navigation and entitlement, with
Projects as its first real CRUD through a metadata window, so S4 can add substances, routes and steps.

## Decisions taken from precedent (no new owner decision)

| Item | Choice | Precedent |
| --- | --- | --- |
| Names | Module key `process-safety-screening`; schema `gigalibs_speed`; route `/speed`; gateway `/api/speed`; permissions `speed.*` | CMMS: key `physical-operations-cmms`, schema `gigalibs_cmms`, `/cmms`, `cmms.*`; plan §1, §4.4 |
| Hosting | Inside the module host (`hosting: host`), category business, entitlement-eligible, readiness PLANNED | Product Catalogue, Inventory, Orders |
| Site | The project's owning unit: a REFERENCE to the platform lookup `organization-units`; ownership policy UNIT; reads and writes through `organizationAccess` and `scopeFor` | Orders, Procurement (WI-OI-120u); module SDK (WI-OI-109e3, WI-OI-120w) |
| Owner | A REFERENCE to the platform lookup `workspace-members`; the server sets the current user when empty | WI-OI-120u |
| Audit | The module's append-only `audit_events`, each write with old values, new values and the reason. S2 moves this to the platform's field-level audit; the schema does not go live before S2 | Plan §5.3 ("S2 before S3's schema goes live") |
| Sidebar group | "Intelligence", icon `shield-alert`, label "SPEED" (catalogue metadata; changeable without code) | — |

| Window permission | Windows require `module:action`, so the window and navigation use `speed:read`, which every SPEED role carries beside `speed.routes.read` | CMMS `cmms:read`, Workforce `workforce:read` |
| Row version field | `version` on change and archive bodies (the live conformance probe sends it) | `pnpm module:new` template |
| Editing a saved project | Through the API with a reason. The window locks a saved project's fields until S2 brings the reason-for-change prompt; it creates and archives (with a reason) | Plan §3.1 ("Reason for change: R1, S2 + S4") |
| Events | No `emits` declared yet: the outbox writes `PROJECT_*_V1` facts on `speed.facts.v1`; published event names come with their first consumer (R2) | — |
| `speed-lab` bundle and `pharma` pack | **Moved to S9** (the pilot's lab instance). Every shipped industry pack must carry a Workforce vocabulary (Workforce's packs service and the catalogue compiler assume it), and that vocabulary is the pilot customer's terminology, not something to invent | Plan §5.1 S9 |
| Personas | `OPERATIONS_SUPERVISOR` and `WORKFORCE_MEMBER`, so lab leads and chemists see SPEED in the sidebar; `speed:read` still decides | Product Catalogue, Inventory |

## Scope

- **May change:** `modules/process-safety-screening/**` (new); what `pnpm module:new` and `pnpm modules:catalog`
  regenerate (catalogue, gateways, upstreams, navigation, pages, runtime overlay, the module host's dependency list);
  `packages/contracts` (SPEED API contracts); the Docker workspace list; the navigation and gateway equivalence tests
  (the new module, as each addition is listed); `scripts/module-conformance.mjs` (S13 accepts the module's own
  `speed:` codes and the kernel's organization delivery routes) and `scripts/verify-module-conversion.mjs` (SPEED
  joins the converted modules).
- **Must not change:** other modules; Cursor's files on main; UAT or any running service; secrets.
- **Moved to later slices:** module settings (criteria in force arrives with criteria in S5; default units with S4);
  the Projects window's "Routes" child tab arrives with routes (S4).

## Steps

1. Worktree; `pnpm module:new process-safety-screening --title "SPEED Process Safety Screening" --group Intelligence
   --icon shield-alert --prefix SPEED`; rename to the plan's names.
2. Foundation migration (structure only, forced RLS, tenant on every row): `projects` (code unique per workspace, name,
   owning unit, owner subject, notes, status ACTIVE or ARCHIVED, row version, request key), the organisation replica
   tables, and the template's audit, outbox and revocation tables.
3. Projects API under `/api/speed/v1/projects`: list (paginated, search, scoped to readable units), get, create
   (idempotency key), update (row version and reason), archive (reason). Errors per the API conventions.
4. Roles (plan §3.2, R1 permissions only): Chemist, Engineer, Safety reviewer, QA, Administrator.
5. Window `speed-projects` (`dictionary/windows.mjs`), record routes, and the `/speed` page.
6. (Moved to S9: `solutions/speed-lab.yaml` and the `pharma` industry pack.)
7. Tests on a real PostgreSQL: each operation for permission, tenant isolation, unit scope, concurrency, reason and
   idempotency; a role without `speed.routes.read` gets 403; no entitlement means no navigation.

## Done when

- [x] The module generates and `pnpm audit:module-manifests`, `audit:layers` and `module:conformance` (static) pass:
      manifests 0 errors; static conformance 15/15; window conversion PASS (1 window, 1 record type).
- [x] Projects CRUD tests pass against PostgreSQL (permission, tenant, unit scope, concurrency, reason, idempotency):
      24/24 (12 unit, 12 on a throwaway PostgreSQL 16 as the least-privileged runtime role, readiness checked; removed
      after the run). Also proven: audit is append-only (42501) and a project cannot be deleted (55000).
- [x] `pnpm verify` passes, or reports only the known drift: build and every audit pass (layers, manifests, design tokens,
      deployment profile, windows); 3125 tests pass. It fails only where the base commit already fails: Finance's
      `finance-product-standard-costs` window, which its dispatcher does not register (from `b85a4244`; conversion check
      and one Finance test), and two Playground tests that need `CONTROL_PAYLOAD_KEY_VERSION` in the environment. The
      first run also caught four S3 gaps, all fixed: the Docker workspace, the navigation and gateway equivalence lists,
      and the industry pack (moved to S9).
- [x] Card, `.pi/NOW.md` and evidence updated; committed on the owner's "commit".

## Stop and ask if

- a step would start, change or restart a running service or database (the live conformance run needs the module host on
  `gigalibs-test`);
- the generator or the manifest audit requires a platform change.
