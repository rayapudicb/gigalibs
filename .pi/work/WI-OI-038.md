# WI-OI-038 — Physical Operations CMMS scope and completeness remediation

Status: Proposed  
Owner: SDLC Orchestrator / Requirements Spec with Maintenance Domain and Backend  
Requirements: proposed mapping FR-01–FR-06, FR-08–FR-12, FR-14–FR-16; NFR-GOV-001–003, NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003, NFR-UX-001–004, NFR-OBS-001–004, NFR-OPS-001–004  
Independent reviewers: Maintenance Domain, Architecture, Security & Privacy, QA/SDET, Product  
Gate: G0 discovery; no Build, product acceptance or release authorization

## Outcome and ownership correction

An authorized maintenance team receives an attributable request or asset reading, assigns and performs work, evidences completion, accounts for parts/labour and verifies service restoration. Audit WI-OI-036 found a partial real module with seeded BFF fallback and disconnected automation. Further planning inspection found transaction/concurrency gaps in work orders and stock movements; those are source findings, not new runtime certifications.

The current CMMS manifest refers to WI-OI-031, whose canonical scope is solution packs. This proposed item separates CMMS discovery/acceptance without changing the manifest or silently treating its scope as approved. Correct the manifest and requirement trace within the reviewed implementation change. Existing FR IDs are retained; detailed maintenance acceptance requires Maintenance Domain/Product review.

## Proposed scope and exit criteria

CM-01–CM-07 in the [implementation plan](../../docs/plans/audit-remediation-implementation-plan.md): authoritative assets/locations; work orders; transactional stock/costs; governed meter-to-work automation; durable preventive schedules; scoped request/procurement handoffs; source-derived maintenance reporting.

Before Ready: accept customer/asset types, roles, completion/checklist policy, part units/valuation, integration boundaries, data sources, maintenance metrics, supported deployment and test profile. Full EAM parity, safety-critical control, predictive AI and native offline mobile are not silently added to this scope. One-module Build limit and current AR priority remain in force. No readiness claim follows from this work-item creation.

---

## Roadmap P4 — CMMS core recovery (2026-09-27, continuous mode, WI-OI-062)

Sole active Build item after WI-OI-064 entered Review. Scope is the roadmap P4 phase and CMMS plan Phase 1:
assets, work orders, preventive maintenance, meters and parts for real sites. People, Dispatch, requests,
vendors, customers, purchase orders, import/export and IoT ingress stay contained.

### G0 — existing-code inventory (findings)

| # | Finding | Evidence |
| --- | --- | --- |
| F1 | CMMS cannot serve any real tenant: every tenant and user column is `uuid`, but control-plane tenant, user and department ids are cuids (`cmudintsr002…`). `set_config('app.tenant_id', cuid)` then `::uuid` fails. | `000001_cmms_foundation` (`tenant_id uuid`, `created_by uuid`, `assigned_to uuid`); `000002` policies cast to `uuid` |
| F2 | No CMMS runtime exists in any profile: no image target, no compose service; `CMMS_API_URL` is empty, so every CMMS screen answers 502. | `infra/compose/docker/Dockerfile`, compose overlays |
| F3 | Mixed authority: EdDSA platform context with the shared key **or** any OIDC token from a remote JWKS; a development token issuer (`oidc-dev`) is mounted; no session revocation; dotted `cmms.*` permissions no role can hold. | `auth/authorization.ts`, `auth/oidc-dev.*`, `app.module.ts` |
| F4 | The migration directory mixes the core with unapproved prototypes: 000003/000004 (a CMMS-local workforce model, superseded by Workforce), 000005 (uuid department columns), 000006 (purchase orders), 000007–000009 (import/export, frozen under WI-OI-043 and hash-protected). The local target is at version 2 with zero rows. | `db/migrations/`, `gigalibs_cmms.schema_migrations` |
| F5 | Meter readings are range-partitioned only through 2026-12; every reading after 2027-01-01 would fail. | `000001` `meter_readings_2026_09…12` |
| F6 | CMMS keeps its own `locations` hierarchy, duplicating the Geospatial places delivered in P2 (roadmap rule 3). | `locations` table and controller |
| F7 | Writes and audit/outbox are separate statements (assets, parts, PM); asset updates have no version predicate; there is no body validation on assets, parts or PM. | `assets.service.ts`, `parts.service.ts`, `pm-schedules.service.ts` |
| F8 | Stock: `TRANSFER`/`ADJUSTMENT` always add; there is no idempotency; valuation sums across currencies. | `parts.service.ts:201`, `analytics.service.ts` |
| F9 | PM trigger creates the work order and advances the schedule in separate transactions; there is no occurrence key, so a retry duplicates. | `pm-schedules.service.ts` `triggerWorkOrder` |
| F10 | The web UI calls routes the API does not have (`work-orders/:id/change-status` as POST, `comments`, `labors`, `parts-used`, `tasks/:id`), so execution screens cannot work. The average cycle time always returns null (alias mismatch). | `components/cmms/*`, `analytics.service.ts` |
| F11 | People, workload, calendar, vendors, purchase orders, requests and the portal pages are already contained (`CapabilityStatus`); seeded views (`WoWorkloadView`, …) are unreachable dead code. | `app/(app)/cmms/*` |

### G1 — outcome, acceptance and negative cases

A maintenance manager registers assets at real sites (Geospatial place ids), raises and executes work orders
(checklist tasks, labour, parts, signature, completion), runs preventive schedules, records meter readings and
keeps a stock ledger. The value measure is work orders completed with evidence per site per week.

Acceptance: CMMS can be entitled without Workforce screens; a Tenant Admin works through the web BFF; data
survives a restart and a restore; a second tenant sees nothing. Negative cases: wrong audience, key, module or
scope; revoked session; stale version (409); an invalid transition; completion blocked by a missing signature or
an unfinished required task; duplicate work-order request key; issuing more stock than is on hand; concurrent
final-stock issues; a repeated stock idempotency key; a repeated PM occurrence; out-of-order meter readings;
a spatially scoped member outside their places; a departmentally scoped member outside their departments;
cross-tenant ids.

### G2 — design decisions

1. **Ordered runtime manifest.** `db/runtime-manifest.txt` lists the chain the image installs: 000001, 000002
   (already installed, immutable), then 000010+. Prototypes 000003–000009 stay as inventory and are never
   installed; the import/export files keep their WI-OI-043 hashes.
2. **Canonical core rebuild (000010).** It is forward-only and guarded: it refuses if any row exists in the
   000001 tables or if any prototype table (3–9) is present. It then replaces the prototype core with the canonical
   layout:
   - text tenant, user and department references;
   - `site_ref` (a Geospatial place id) on assets, work orders, PM schedules and parts, replacing CMMS `locations`;
   - unpartitioned append-only meter readings;
   - the Workforce security and delivery foundation: `auth_revocation_events` (read-only), `audit_events`
     (append-only) and `outbox_events` (Delta 5 envelope, topic `cmms.facts.v1`);
   - forced RLS on `app.tenant_id` for every table.

   Supported upgrade: version 2 → current. Recovery: the guard aborts the transaction and leaves version 2
   intact.
3. **Authority.** Only a BFF-signed `PlatformContextV1`:
   - its own audience `gigalibs-cmms-api` and its own Ed25519 key pair (`CMMS_PLATFORM_CONTEXT_*`);
   - module key `asset-maintenance`;
   - revocation checked on every request;
   - `*`, `cmms:*` or the exact `cmms.<area>.<action>` permission.

   OIDC, JWKS and `oidc-dev` are removed. **Tenant Admin receives `cmms:*`** (decision, mirroring
   `workforce:*`); custom maintenance roles follow P1.
4. **Scope.**
   - **Org scope** (`SCOPED_DEPARTMENTS`, snake-case): records whose `department_id` is null (tenant-wide)
     or in scope; writes may only target in-scope departments; an empty list sees nothing.
   - **Spatial scope** (`SCOPED_PLACES`): records whose `site_ref` is one of the scope place ids. This is exact
     and fail-closed: descendants of a scope root are not visible until a place directory projection exists
     (registered limitation); `site_ref` null is excluded; an empty list sees nothing.
5. **Transactions.** Every command runs in one tenant-bound transaction: state, version, history, audit and
   outbox together.
   - Work-order numbers come from a per-tenant counter row (`INSERT … ON CONFLICT DO UPDATE … RETURNING`).
   - A duplicate create with the same `requestKey` returns the original work order.
   - Stock changes are conditional (`quantity_on_hand + delta >= 0`) with a unique idempotency key; the ledger
     sum equals the balance.
   - PM generation is keyed by `(schedule, occurrence)`, and the schedule advances in the same transaction.
6. **Contracts.** `packages/contracts/src/cmms` holds versioned zod schemas shared by the API and the web
   (additive, V1).
7. **Deferred and registered, not silently dropped:**
   - automatic PM scheduling with a lease (CM-05, D2 durable jobs);
   - meter-threshold automation (CM-04);
   - requests, vendors and procurement (CM-06);
   - downtime capture and reliability (CM-07);
   - stock transfers between sites;
   - the Workforce booking handshake (P6, WI-OI-068).

### G3 — API surface (`/v1`, all through `/api/cmms` on the BFF)

| Area | Routes | Permission |
| --- | --- | --- |
| Assets | `POST assets/search`, `GET assets/:id`, `POST assets`, `PATCH assets/:id` (expectedVersion), `POST assets/:id/archive` | `cmms.assets.read` / `.write` |
| Work orders | `POST work-orders/search`, `GET work-orders/:id` (with tasks, labour, parts, notes), `GET work-orders/:id/history`, `POST work-orders` (requestKey), `PATCH work-orders/:id`, `POST work-orders/:id/status`, `POST …/tasks`, `PATCH …/tasks/:taskId`, `POST …/labour`, `POST …/parts`, `POST …/notes` | `cmms.work-orders.read` / `.write` |
| PM | `GET pm-schedules`, `GET pm-schedules/:id`, `POST pm-schedules`, `PATCH pm-schedules/:id`, `POST pm-schedules/:id/generate` | `cmms.pm.read` / `.write` |
| Meters | `GET meters`, `POST meters`, `POST meters/:id/readings`, `GET meters/:id/readings` | `cmms.meters.read` / `.write` |
| Parts | `POST parts/search`, `GET parts/:id`, `POST parts`, `PATCH parts/:id`, `POST parts/:id/movements`, `GET parts/:id/movements` | `cmms.parts.read` / `.write` |
| Overview | `GET analytics/work-orders/overview`, `GET analytics/inventory/summary` (per currency) | `cmms.analytics.read` |
| Health | `GET health/live`, `GET health/ready` | none |

UI states: loading, empty, denied (403 problem), validation (400 with issues), conflict (409 → reload), failure
(502/503 → retry). Test layers:
- unit tests for the guard, scope predicates, stock, lifecycle and PM;
- live `verify-cmms-http` (signed-context matrix);
- `verify-cmms-runtime` (clean install, upgrade from 2, least privilege, two-tenant RLS, append-only);
- `verify-cmms-journey` (asset → PM → work order → tasks/labour/parts → signature completion, concurrency,
  scope, restart and restore);
- a real-login web path.

## P4 build (2026-09-27) — canonical CMMS core

- **038a runtime convergence:**
  - Ordered runtime manifest `db/runtime-manifest.txt` (1, 2, 10); migration 000010, guarded canonical core
    (see G2).
  - `CmmsAuthorizationGuard`: BFF-signed context only, own audience and key, `asset-maintenance`, revocation,
    `*`/`cmms:*`/exact; the OIDC/JWKS path and `oidc-dev` are removed.
  - Department and place scope predicates (bound parameters, fail-closed); exact schema-contract readiness; live
    and readiness split; runtime config pinned to audience `gigalibs-cmms-api` and contract 10.
  - Uncontained controllers are no longer mounted: locations (replaced by `site_ref`), CMMS-local workforce,
    vendors, customers, requests, purchase orders, import/export, IoT ingress.
  - Import/export stays in the tree, excluded from the build and image, and its protected hashes are unchanged;
    its test-only dependencies (`xlsx`, `exceljs`) are dev-only, so they are not in the image.
- **038b domain:**
  - `packages/contracts/src/cmms` V1 contracts.
  - Services, each command in one tenant transaction with state, events, audit and outbox:
    - assets (tag uniqueness, cycle refusal, archive guarded by open work and children);
    - work orders (per-tenant counter numbering, request-key replay, lifecycle table, required tasks and signature
      on completion, labour, parts issue through the ledger, notes, aggregate version on every change, costs per
      currency);
    - PM schedules (occurrence-keyed generation, time-zone-safe advance);
    - meters (out-of-order readings, counter regression refusal, request-key replay);
    - parts (conditional balance, idempotency, receipt/return/adjustment, return bounded by issued quantity,
      reorder request fact);
    - overview (scoped, cycle time null when unknown, valuation per currency).
- **038c web and platform:**
  - Tenant Admin `cmms:*` (rbac-core; session test).
  - `lib/cmms-proxy.ts` signed proxy with an explicit 26-route allow-list and its own key
    (`CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64`).
  - New Medusa UI workspace (`components/cmms/*`: overview, work orders with execution panel, assets, preventive
    maintenance, meters, parts & stock ledger; Geospatial site picker).
  - `/cmms/analytics` and `/cmms/floor` contained with the reason.
  - 13 unreachable or mismatched legacy components removed.
- **038d runtime and evidence:**
  - Image target `cmms-api` (manifest-only migrations).
  - `cmms-migrations`/`cmms-api` in the modules overlay, with append-only `audit_events`, `work_order_events`,
    `work_order_labour`, `meter_readings`, `stock_movements` and read-only `auth_revocation_events`.
  - Credentials generator appends the CMMS runtime role and key pair; identity refresh covers `CMMS_IMAGE`.
  - Live scripts: `verify-cmms-runtime.sh`, `verify-cmms-http.sh`, `verify-cmms-journey.sh` (+
    `cmms-journey.mjs`), `verify:cmms-web-path`.
- **Tests:**
  - CMMS API: 14 files (guard 6, scope 4, config 4, transaction boundary 3, work-order rules 5, overview 2, and
    the frozen import/export suites).
  - Web: CMMS BFF boundary (4); RBAC and session grants.
- **Pre-existing, not in the mandatory audits:** `audit:configuration-deployment-profile` reports
  `WORKFORCE_API_URL` contract drift from WI-OI-060/061. The CMMS frozen-scope assertion there was narrowed to
  "only the CMMS core API enters the image workspace".

## P4 certification (2026-09-27) — identity `5abfa667bb10-7507432cb066`

- **Repository:** build 106/106 tasks; tests 201/201 files; six audits pass; source identity refreshed; eight
  exact images (control plane, web, Workforce, Geospatial, Analytics, Connector Hub and the new `cmms-api`)
  deployed with all four overlays. The CMMS image runs as 65532, carries exactly migrations 1, 2 and 10 and
  contains no import/export code or `xlsx`.
- **Live upgrade of the real local target:** `gigalibs_cmms` moved from version 2 to 10 on deploy (ledger
  1,2,10); the runtime role `gigalibs_cmms_runtime` is neither superuser nor BYPASSRLS.
- **CMMS certifications:**
  - `verify-cmms-runtime.sh`: clean install without prototypes; upgrade 2→10; a populated prototype refused at
    version 2; 14 tables with forced RLS; two-tenant isolation; unscoped reads empty; cross-tenant write
    refused; five append-only tables; revocations read-only; ledger immutable.
  - `verify-cmms-http.sh`: health live/ready; missing, foreign-key, expired and wrong-audience tokens 401; wrong
    module and missing or foreign scopes 403; granular scopes and `cmms:*`; revoked session 401; contained
    routes and the development issuer absent.
  - `verify-cmms-journey.sh`:
    - full asset → meter → part → PM → work-order journey;
    - 5 concurrent issues against 3 on hand: 3 won, 2 refused;
    - ledger equals balance; exactly one reorder request;
    - one work order per occurrence; request-key replay;
    - required tasks and signature enforced; cost USD 150;
    - department, place and empty scope;
    - restart persistence; tenant B denied 11 reads and writes; 31 audit = outbox facts;
    - `pg_dump`/`pg_restore` round trip identical, with forced RLS.
  - `verify:cmms-web-path`: real Tenant Admin login through the BFF, records keyed by the canonical cuid tenant
    and user ids; Member refused; contained routes 404; cross-site write refused.
- **Full live regression (idle host):** 19/19 checks pass (all earlier phases plus the four CMMS checks) and
  14 page routes answer 200/307, including every CMMS page.
- **Image policy:** 8 images, 0 Critical, 0 High (unfixed included) —
  `infra/compose/evidence/wi-oi-038-20260927T033319Z`.
- **Housekeeping:** superseded identity `b520db0a4d89` removed; current and previous (`991866bbd6a3`) kept.
- **Carried to the next build cycle (a source change would alter this identity):** the CMMS `README.md` still
  describes the prototype runtime; rewrite it with the next certified build.

### P4 exit status

| Exit criterion | Status |
| --- | --- |
| CMMS entitled without Workforce screens | Met — People, workload and calendar contained; CMMS entitlement alone opens the core |
| Clean install | Met (runtime script, exact image) |
| Upgrade | Met — scratch upgrade 2→10 and the live local target upgraded on deploy |
| Two-tenant denial | Met — RLS, API (11 operations) and evidence |
| Restart | Met — journey verify phase after container restart |
| Restore | Met — `pg_dump`/`pg_restore` round trip identical |

Status: technically complete → **Review** (bounded Local Development G4). Independent review and Product Owner
acceptance remain open. Under continuous mode the Build slot passes to P5 (WI-OI-065).
