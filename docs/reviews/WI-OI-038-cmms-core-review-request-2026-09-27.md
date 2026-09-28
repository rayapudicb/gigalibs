# WI-OI-038 CMMS core recovery review request (roadmap P4)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review of the CMMS core; Product Owner acceptance (below)

## Implemented outcome

A maintenance manager can run assets, preventive maintenance, meters, parts and work orders for real sites,
with CMMS entitled on its own and without any Workforce screen:

- **The module now works for real tenants.** The prototype keyed tenants and users as `uuid`, but platform ids
  are cuids, so no real tenant could ever write to CMMS. There was also no CMMS runtime in any profile.
- **Canonical schema through an ordered manifest.**
  - `db/runtime-manifest.txt` installs 000001, 000002 and 000010. The prototype migrations 000003–000009 (a
    CMMS-local workforce model, uuid department columns, purchase orders and the frozen import/export) are never
    installed.
  - 000010 replaces the empty prototype core, and refuses if data or prototype tables exist.
  - The new core has text tenant, user and department references and `site_ref` (a Geospatial place id,
    replacing the duplicate CMMS locations). It holds append-only work-order history, labour, meter readings and
    stock movements, plus the Workforce-shaped audit, outbox and revocation tables. Every table has forced RLS.
- **Authority.**
  - CMMS accepts only the BFF-signed `PlatformContextV1`, with its own key, its own audience and the
    `asset-maintenance` entitlement.
  - Session revocation is checked on every request. Department and place scope fail closed.
  - Tenant Administrators receive `cmms:*`.
  - The OIDC/JWKS path and the development issuer are gone.
- **Correct maintenance behaviour.**
  - One transaction per command: state, history, audit and outbox together.
  - Work-order numbers come from a counter row, and a repeated request key returns the original work order.
  - Lifecycle rules: required checklist tasks and a signature gate completion; terminal states are final.
  - Stock can never go negative, even under concurrent issues. Every stock change is an idempotent ledger
    movement, returns are bounded by what was issued, and adjustments need a reason.
  - A preventive occurrence can produce only one work order, and the schedule advances in its own time zone.
  - Meters accept out-of-order readings without corrupting the latest value, and a counter cannot run
    backwards.
  - Costs and valuation are totalled per currency, never summed across currencies.
- **Screens (Medusa UI).**
  - `/cmms` overview; work orders with an execution panel (start, checklist, labour, parts, notes, signed
    completion, history); asset register with a Geospatial site picker; preventive maintenance; meters; parts
    and the stock ledger.
  - People, dispatch, calendar, vendors, requests, purchase orders, reliability and the floor kiosk stay
    contained, each with its reason.

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| Source revision | `5abfa667bb105143ba8c00bc07b1fb4e6d9ac7d6` |
| Source-state identity | `7507432cb066` (full SHA-256 in `infra/compose/.env`) |
| Images | control-plane-migrations, playground-api, workflow-platform, workforce-api, geospatial-api, analytics-api, connector-hub-api, **cmms-api** at tag `5abfa667bb10-7507432cb066` |
| Image policy evidence | `infra/compose/evidence/wi-oi-038-20260927T033319Z`: 8 images, 0 Critical, 0 High (unfixed included) |

## Measured result

- Build 106/106; tests 201/201 files; six repository audits pass.
- The live local CMMS schema upgraded from version 2 to 10 on deploy. The runtime role is neither superuser nor
  BYPASSRLS.
- Runtime: clean install; upgrade 2→10; populated prototype refused; 14 tables with forced RLS; two-tenant
  isolation; append-only history and ledger; read-only revocations.
- Signed-context matrix: every negative case refused (401/403); contained routes and the development issuer
  absent.
- Journey:
  - five concurrent issues against three on hand: three succeed, two are refused;
  - the stock ledger equals the balance, with exactly one reorder request;
  - one work order per preventive occurrence; request-key replay;
  - completion blocked until required tasks and the signature are recorded;
  - cost totalled per currency (USD 150);
  - department, place and empty scope enforced;
  - records survive a restart; tenant B is denied 11 operations;
  - 31 audit facts match 31 outbox facts;
  - the `pg_dump`/`pg_restore` round trip is identical.
- Real web login: CMMS records are keyed by the canonical cuid tenant and user ids.
- Full live regression across P0–P4: 19/19 checks and 14 page routes pass.

## P4 exit criteria

| Criterion | Status |
| --- | --- |
| CMMS entitled without Workforce screens | Met |
| Clean install, upgrade, two-tenant denial, restart, restore | Met |
| Human acceptance | **Product Owner run required** (below) |

## Product Owner acceptance run

1. Enable Asset & Maintenance for a tenant (Platform administration → tenant entitlements).
2. As a Tenant Administrator: register two assets at Geospatial sites, add a part with an opening quantity and a
   counter meter, and create a monthly schedule with a checklist that requires a signature.
3. Generate the due preventive work order. Start it, record the checklist, log labour, issue parts and complete
   it with a signature; the completion should be blocked until the checklist is recorded.
4. Confirm that the stock ledger, the overview and the cost total match what you entered.
5. Confirm that a Member without Asset & Maintenance access is refused, and that the People and Dispatch pages
   explain that they are not connected.

## Review decisions required

1. Solution Architecture / Product:
   - the guarded rebuild in 000010 and the runtime manifest;
   - retiring CMMS locations in favour of Geospatial `site_ref`;
   - the contained scope;
   - Tenant Admin `cmms:*`.
2. Security & Privacy:
   - the signed-context guard and the revocation check;
   - the scope predicates;
   - append-only and read-only tables;
   - no development issuer.
3. Maintenance Domain:
   - lifecycle and completion proof (required tasks, signature);
   - stock semantics (receipt, issue, return, adjustment; non-stock parts);
   - PM interval model and time zones;
   - meter handling.
4. Backend/Data: the migration guard, constraints, the counter numbering and the concurrency behaviour.
5. API Contracts: `packages/contracts/src/cmms` V1.
6. Web/Accessibility: the six CMMS screens and their states.
7. QA/SDET: the live scripts and unit tests listed in `.pi/work/WI-OI-038.md`.

## Registered limitations (not silently dropped)

- **Place scope** matches only the exact scope places. Places below a scope root appear once a place directory
  projection exists (WI-OI-072).
- **Revocation propagation:** events reach module schemas only through the certification path, the same as
  Workforce, Geospatial and Analytics.
- **Deferred to their own items:**
  - automatic PM generation with a lease (CM-05, durable jobs);
  - meter-threshold automation and IoT ingress (CM-04);
  - requests, vendors and procurement (CM-06);
  - downtime capture and reliability (CM-07);
  - stock transfers between stores;
  - the Workforce booking handshake (P6, WI-OI-068);
  - custom maintenance roles for managers and technicians (P1).
- **Pre-existing:** `audit:configuration-deployment-profile` reports `WORKFORCE_API_URL` contract drift from
  WI-OI-060/061.

## Decision boundaries

No production, cloud, customer distribution or external-provider use.
