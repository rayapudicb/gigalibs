# Asset & Maintenance (CMMS)

> GigaLibs module · API port 4200 · schema `gigalibs_cmms` · multi-tenant · work items WI-OI-038 (roadmap P4),
> WI-OI-068 (Workforce staffing handshake, P6)

## What runs

The CMMS core covers assets, work orders, preventive maintenance, meters, and parts with a stock ledger.
Maintenance teams use it for real sites (Geospatial places). It is entitled on its own (`asset-maintenance`),
without any Workforce screen.

| Area | Routes (`/v1`) | Permission |
| --- | --- | --- |
| Assets | `assets/search`, `assets/:id`, `assets` (create), `assets/:id` (PATCH, `expectedVersion`), `assets/:id/archive` | `cmms.assets.read` / `.write` |
| Work orders | `work-orders/search`, `work-orders/:id`, `…/history`, `work-orders` (create with `requestKey`), `…/status`, `…/tasks`, `…/tasks/:taskId`, `…/labour`, `…/parts`, `…/notes`, `…/staffing`, `…/staffing/cancel` | `cmms.work-orders.read` / `.write` |
| Preventive maintenance | `pm-schedules`, `pm-schedules/:id`, `…/generate` | `cmms.pm.read` / `.write` |
| Meters | `meters`, `meters/:id/readings` | `cmms.meters.read` / `.write` |
| Parts | `parts/search`, `parts/:id`, `parts`, `parts/:id/movements` | `cmms.parts.read` / `.write` |
| Overview | `analytics/work-orders/overview`, `analytics/inventory/summary` | `cmms.analytics.read` |
| Health | `health/live`, `health/ready` | none |

Tenant Administrators hold `cmms:*`, which covers every permission above.

## Architecture

- **Authority:** only a `PlatformContextV1` signed by the web BFF with the CMMS key.
  - The token must carry audience `gigalibs-cmms-api` and the `asset-maintenance` entitlement.
  - Session revocation is checked on every request.
  - Tenant, user and scope come only from the token.
  - There is no OIDC path and no development token issuer.
- **Scope:**
  - Department scope keeps tenant-wide records visible.
  - Place scope is exact (only the listed places, never unsited records).
  - Empty scope lists see nothing.
  - Writes by a scoped member must land inside their scope.
- **Persistence:**
  - PostgreSQL 16 with forced RLS on `app.tenant_id` for every table.
  - Each command runs in one tenant-bound transaction: state, history, audit and outbox (`cmms.facts.v1`)
    commit together.
  - The runtime role is neither superuser nor BYPASSRLS. It may only read `auth_revocation_events`, and
    `audit_events`, `work_order_events`, `work_order_labour`, `meter_readings` and `stock_movements` are
    append-only.
- **Behaviour:**
  - Work-order numbers come from a per-tenant counter row.
  - A repeated `requestKey` returns the original work order.
  - Completion needs every required checklist task recorded and, when required, a signature.
  - Stock changes only through conditional, idempotent ledger movements (receipt, issue to a work order,
    return, reasoned adjustment), so stock can never go negative.
  - A preventive occurrence yields at most one work order, and the schedule advances in its own time zone.
  - Meter readings may arrive out of order without replacing a newer value; counters cannot run backwards.
  - Costs and valuation are totalled per currency.
- **Sites:** `site_ref` is a Geospatial place id held as a plain reference. CMMS has no locations table of its
  own.
- **Staffing (WI-OI-068, ADR-0007 option A):**
  - A work order asks Workforce for people (window, headcount, capability codes). There is one live request
    per work order, and cancelling the work order withdraws it.
  - The outbox relay delivers `CMMS_STAFFING_*` facts to Workforce's `/internal/v1/inbox`. Each delivery is
    signed with the Workforce-inbox relay key and bound to the tenant, the message and the body.
  - Workforce's answers arrive at CMMS's own `/internal/v1/inbox`, which accepts only Workforce relay tokens.
    Each answer is receipted once and settles the exact request its key names.
  - Bookings are projected with the Workforce id, display name, window and status, and only from newer
    versions. CMMS stores no worker master data.
  - `internal/v1/inbox` is not reachable through the web BFF.

## Database

`db/runtime-manifest.txt` is the ordered chain the image installs: 000001, 000002, 000010 and 000011 (staffing,
booking projection, inbox receipts and the relay's lease/settle functions). 000010 replaces
the empty prototype core with the canonical one and refuses to run if data or prototype tables exist.
Migrations 000003–000009 are prototype inventory that no supported target installs: a CMMS-local workforce
model, uuid department columns, purchase orders, and import/export (frozen and hash-protected under WI-OI-043).

## Contained (registered, not silently dropped)

- CMMS-local people and dispatch: Workforce owns people; staffing goes through Workforce (WI-OI-068).
- Requests, vendors and procurement (CM-06).
- IoT ingress and meter automation (CM-04).
- Automatic PM generation with a lease (CM-05).
- Downtime capture and reliability reporting (CM-07).
- Stock transfers between stores.
- Import/export (WI-OI-043).

## Verification

`infra/compose/scripts/verify-cmms-runtime.sh`, `verify-cmms-http.sh`, `verify-cmms-journey.sh`,
`verify-cmms-workforce-handshake.sh` (with Workforce running and `generate-relay-credentials.sh` applied), and
`pnpm --filter @gigalibs/app-playground-api verify:cmms-web-path`.
