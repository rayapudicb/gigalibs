<!-- WI-OI-119 auditor working report, copied verbatim except for masked dev-default credentials. -->
> **Provenance.** Read-only auditor report produced for WI-OI-119 on 2026-10-04/05. It covers deliverables E (API gaps), F (database/migration gaps), H (event matrix), J (journeys, backend), authority conflicts, proof-script classification.
> Findings marked CONFIRMED were reproduced by the auditor from code or commands; PLAUSIBLE ones were not. The primary
> agent re-checked every P0/P1 it relies on; that verification, and any severity changes, are in `README.md` and
> `.pi/work/WI-OI-119.md`, which take precedence over this appendix.

# WI-OI-119 — P3 Backend / Data / Integration audit

Auditor: P3 (backend, data, integration). Scope: committed files on `feat/gigaops-convergence-core` @ 76b9452 (`git ls-files`),
read-only. Untracked items are excluded except where noted (the committed migration runner and Dockerfile reference them).
Method: static trace. Nothing was executed against a database. **CONFIRMED** means the defect follows deterministically from
the committed code and SQL (for example a NOT NULL column with no default that an INSERT omits). **PLAUSIBLE** means it depends
on runtime configuration or PostgreSQL/Prisma behaviour that I did not execute.

Primary-agent facts used (supplied by the coordinator, not re-verified by me): the two untracked control migrations were
applied to the local `gigalibs` DB at 2026-10-04 06:41Z; `gigalibs_finance.schema_migrations` holds versions 1–7 with only
(version, applied_at), and each was applied before its commit; no financial-operations service is deployed.

---

## 0. Summary counts

| Severity | Count | Headline |
|---|---|---|
| P0 | 8 | GL journals committed outside the subledger transaction, followed by a deterministic failure (orphan or duplicate GL); three module APIs have no auth and take the tenant from a header; SCIM privilege escalation; AR payment webhooks with built-in fallback secrets and the tenant taken from the payload; fabricated CTA in the FX revaluation; the Connector Hub inbound webhook takes the tenant from a header and its signature check fails open; certification claims for 094–118 that the code cannot meet; the Communications BFF falls back to an in-memory store that reports messages as DELIVERED and returns fake voice tokens |
| P1 | 16 | The module host cannot boot (finance migration contract is 6 vs 7). Every hosted ERP route except catalogue returns 503 (revocation table mismatch). Phase 11–14 outbox writes fail. No consumer exists for any ERP `consumes:`. Inbox endpoints can be forged with user permissions. Procurement has no DoA, SoD, budget check or audit. Close and subledger locks can be bypassed. Masters are split across modules. Money is computed in floating point. Tenant GUC binding is not transactional. The committed migration runner points at uncommitted files. Partial allocations break. Insecure-OIDC defaults in prototypes. Governor tenant spoofing. Frozen AR module modified. Commitment/budget gate is never called |
| P2 | 17 | No revocation producer; org versions are not synced to 4 ERP modules; FORCE RLS is missing in 10 modules; finance org-replica tables have no RLS; no idempotency on finance/orders/procurement money commands; no org-unit scoping; no audit in inventory/procurement; orphaned outboxes and inboxes; event-name mismatches; modified migrations (kernel_job_schedules, analytics 4–10); the module runner has no checksum; GL lines can be inserted after posting; NCI is not computed; FX truncation; sequence race; relay path vs host prefix; the module host runs with NODE_ENV=development |
| P3 | 4 | Dev OIDC controllers ship in production images (gated); count+1 numbering; free-text names duplicated beside IDs; INTEGER cents in legacy control tables |

Event declarations (deliverable H): **73** manifest `emits`/`consumes` entries in the 6 event-declaring manifests:
- finance 26 + 6;
- inventory 8 + 4;
- orders 7 + 4;
- procurement 5 + 4;
- catalogue 6 + 2;
- AR 1 + 0.

None of the 73 is runtime-wired, and 17 other manifests declare no events. Separately, **6** relay edges are runtime-wired (static trace):
CMMS↔Workforce (both directions), Hub→Analytics, Hub→Geospatial, Geospatial→Analytics and Workforce→Analytics. None of them is declared in a manifest.

---

## 1. Findings register (P0 / P1)

### P0-1 GL journals post in their own committed transaction, then the subledger write fails deterministically (orphan or duplicate GL) — CONFIRMED (static)
- `FinanceService.postJournal()` always opens its own transaction: `modules/financial-operations/apps/api/src/finance/finance.service.ts:402-403`.
- Costing opens transaction A (`costing/costing.service.ts:184`) and calls `financeService.postJournal` inside it (`:254`, `:394`, `:567`, `:761`). That call commits a GL journal on a different pooled connection. Transaction A then writes the cost layer and
  `INSERT INTO outbox_events (id, tenant_id, topic, event_type, payload, status)` (`:138`, `:310`, `:469`, `:651`, `:821`).
- `gigalibs_finance.outbox_events` has `aggregate_type`, `aggregate_id`, `aggregate_version`, `correlation_id` and `schema_version` as
  NOT NULL with no default (`db/migrations/000001_finance_general_ledger_foundation.up.sql:85-104`). No later migration
  alters the table (grep of 000002–000007 shows no hit). Every costing command therefore rolls back transaction A after the GL journal has committed.
- Consolidation runs every statement in its own transaction (`consolidation/consolidation.service.ts:45-53`). It posts elimination
  journals through `postJournal` (`:510`), inserts the run, entries and eliminations as separate commits (`:556-620`), then inserts into
  `${SCHEMA}.outbox` (`:124`, `:652`, `:710`). **No such table exists** (finance migrations create only `outbox_events`).
- Effect: inventory, GRNI, COGS, landed-cost, revaluation and IC-elimination journals reach the GL with no subledger row. The API
  returns 500, and a retry posts the journal again because finance has no idempotency key (0 references). Subledger and GL diverge. This is ledger corruption.

### P0-2 Workflow Studio, Universal Rule Pro and Universal Data Studio APIs: no authentication, tenant chosen by the caller — CONFIRMED
- `modules/workflow-studio/apps/api/src/workflows/workflows.controller.ts:8-14,47-55`: tenant comes from `X-Tenant-Id`, `?tenant_id` or `body.tenant_id`.
- `modules/universal-rule-pro/apps/api/src/rules/rules.controller.ts:8-12`: the same pattern.
- `modules/universal-data-studio/apps/api/src/contracts/contracts.controller.ts:19-27,68`.
- `git grep 'UseGuards|APP_GUARD|CanActivate'` over all three `apps/api/src` returns nothing (exit 1). They bind to `0.0.0.0` by default
  (`main.ts:17/21/21`) and bind RLS to the header value (`workflow-studio/.../database.service.ts:84`).
- Only the BFF overwrites the header (`apps/workflow-platform/lib/bff-proxy.ts:74`, `app/api/data-studio/[...path]/route.ts:58`).
  Anyone who can reach the module port gets full cross-tenant read and write. The web pages also hard-code tenants
  (`app/(app)/data-contracts/page.tsx:357`, `rules/studio/page.tsx:142`). The BFF overrides them, but they are production-reachable literals.

### P0-3 SCIM: any authenticated tenant member can provision or elevate users (any role, including SUPER_ADMIN) — CONFIRMED
- `apps/playground-api/src/scim.controller.ts:53-130`: no `@RequirePermissions` or `@RequireRoles` on any route (only `@Public` on
  discovery). The global `RbacGuard` returns true when nothing is required (`packages/rbac-nest/src/guards/rbac.guard.ts:30-32`).
- `scim.service.ts:180-215`: `role = input.roles[0].value as MemberRole`, with no allow-list. It upserts membership for any email, including an existing
  user of another tenant. `:282-300`: PATCH sets `role` for any member, including the caller.
- Tenant: `headerTenantId || queryTenantId || 'default-system-tenant'` (`:62,78,91,107,118,128`). TenantBoundaryGuard checks
  an explicit header against the session (`packages/tenancy-nest/src/guards/tenant-boundary.guard.ts:32-96`), but when no header is sent the
  controller falls back to a **default tenant**, which AGENTS.md forbids.

### P0-4 AR payment webhooks: built-in fallback HMAC secrets, tenant and invoice taken from the payload — CONFIRMED (code); exploitable when the env var is unset
- `modules/accounts-receivable/apps/api/src/payments/webhooks.controller.ts:47`: `STRIPE_WEBHOOK_SECRET ?? 'whsec_local_development_secret'`;
  `:96`: `ADYEN_HMAC_KEY ?? 'adyen_local_development_secret'`. No production refusal exists (`git grep STRIPE_WEBHOOK_SECRET` finds only this line).
- `:61-79`, `:107-127`: `tenantId` comes from `metadata.tenantId` or `additionalData.tenantId`, then `processWebhookPayment` writes payments and settles
  invoices under that tenant (`payments.service.ts:589-777`). With the default secret, anyone can mark any tenant's invoice paid.
  One platform-wide secret also means there is no per-tenant binding. (AR is the frozen WI-OI-019.)

### P0-5 Multi-currency "revaluation" report fabricates a CTA figure and labels it GAAP/IFRS — CONFIRMED
- `modules/multi-currency/apps/api/src/revaluation/revaluation.service.ts:55-59`: `netExposure = SUM(converted_amount_minor) - SUM(source_amount_minor)` mixes all
  currencies. `cta = Math.round(netExposure * 0.005) // 50 bps estimated`.
- It returns `revaluationStandard: 'GAAP ASC 830 / IAS 21 ...'` and `status: 'CURRENT'` (`:66,74`), with a silent `'USD'` default (`:30-31`).
- `db.query()` here has no tenant binding (`database/database.service.ts:46-57`), so under forced RLS it reads nothing and still
  returns "CURRENT". This is fake success on a financial figure.

### P0-6 Connector Hub inbound webhook: unauthenticated, tenant from `x-tenant-id`, signature optional — CONFIRMED (code); exposure depends on ingress
- `modules/universal-connector-hub/apps/api/src/webhooks/webhooks.controller.ts:8-23`: no guard, and `tenantHeader = headers['x-tenant-id']`.
- `webhooks.service.ts:131-155`: the HMAC is checked only `if (connection.webhook_secret)`, so a connection with no secret accepts anything. The signature is computed
  over `JSON.stringify(parsed)`, not the raw body. In the local profile there is no host port, and the BFF does not expose webhooks
  (`apps/workflow-platform/lib/connector-hub-proxy.ts:12`). Any production ingress for "outside senders" makes this
  cross-tenant record injection.

### P0-7 Certification claims for WI-OI-094/095/114–118 cannot be true for the committed services (fake success at the evidence layer) — CONFIRMED
- `.pi/WORK_ITEMS.md:139-145` claims "13/13 / 12/12 real-database certification" and "certified across 12/14/16 PostgreSQL 16 database scenarios".
- The scripts behind these claims (`scripts/verify-financial-operations.mjs`, `verify-treasury-reconciliation.mjs`, `verify-fixed-assets.mjs`,
  `verify-consolidation.mjs`, `verify-inventory-costing.mjs`, `verify-budgeting-and-commitment-control.mjs`,
  `verify-period-close-and-forecasting.mjs`) contain **0 `fetch(` calls and no service construction**. They insert rows with hand-written SQL
  and call pure engines (for example `evaluateSpendAvailability`, `calculateDepreciationSchedule`).
- The service SQL they claim to certify fails deterministically: P0-1, P1-2 and P1-3. The module's own
  `apps/api/scripts/real-database-proof.ts` (171 lines) is raw SQL only. It asserts only `rows[0].version == '1'` (`:20`), never uses
  `TENANT_B`, and connects as `gigalibs` (`:6`).

### P0-8 Communications: the BFF fakes delivery from an in-memory seeded store — CONFIRMED
- `modules/communications` has no committed API (only `module.yaml` and migration 000001).
- `apps/workflow-platform/app/api/communications/[...path]/route.ts:66-96` proxies only when `COMMUNICATIONS_API_URL` is set. Otherwise
  `:96-201` serves `communicationsStore`, a process-memory `Map` store seeded with defaults (`apps/workflow-platform/lib/communications-store.ts:124-135,391`).
- New messages are recorded `status: 'DELIVERED'` with no provider call (`:460`). `voice/token` returns a fabricated string
  (`twilio-jwt-voice-…` or `webrtc-auth-token-…`) instead of a signed provider JWT (`route.ts:186-201`).
- This breaks the AGENTS.md rules against silent fixture fallback, fake provider results and local-only business persistence.

### P1-1 The module host cannot start: finance migration contract 7 vs deployed 6 — CONFIRMED
- `modules/financial-operations/apps/api/src/config.ts:9` sets `SCHEMA_CONTRACT_VERSION = 7`. `packages/module-sdk/src/module-runtime-config.ts:43-48,113-118`
  requires `*_EXPECTED_MIGRATION_VERSION` to lie between 7 and 7.
- `infra/compose/generated/compose.module-host.yaml:165` sets `FINANCIAL_OPERATIONS_EXPECTED_MIGRATION_VERSION: "6"` (and `:18` sets the runner to expect 6).
  `modules/financial-operations/db/runtime-manifest.txt` stops at 000006, so 000007 is never shipped.
- Config load throws, and `NestFactory.create(HostModule)` fails. All 5 hosted modules (finance, catalogue, inventory, orders,
  procurement) go down together (`apps/module-host/src/host.module.ts:13-19`).

### P1-2 Every authenticated route of finance, inventory, orders and procurement returns 503 (revocation schema mismatch) — CONFIRMED (static)
- `SignedContextGuardBase.canActivate` → `ModuleDatabase.isContextRevoked` queries `revocation_type, session_id, subject_id,
  invalid_through_auth_version` (`packages/module-sdk/src/database.ts:139-150`). Any SQL error becomes `ServiceUnavailableException`
  (`signed-context.ts:144-155`).
- These tables lack those columns: finance `000001:76-82` (token_id, reason); inventory `000001:462-469`; orders
  `000001:73-79`; procurement `000001:105-110` (subject only). No later migration fixes them. Only product-catalogue
  (`000001:333-342`) matches. The HTTP path of these four modules has never succeeded, which is consistent with every "proof" bypassing HTTP.

### P1-3 Phase 11–14 commands fail on outbox writes — CONFIRMED
- Budgeting `budgeting.service.ts:117,287,767,791` and costing (P0-1) omit the NOT NULL aggregate and correlation columns.
- Close `close.service.ts:128-130,269-271,387-389,601-603,784-786` omits even `event_type` (NOT NULL).
- Consolidation targets a non-existent `outbox` table (`:124,652,710`).
- Result: budget structure, revision activation, commitment recording, subledger lock, checklist, amortization schedule/line,
  year-end close, cost profile/layer/COGS/landed cost/revaluation and consolidation group/run all fail at runtime.
- Only GL journal, period lock, FA and treasury-seal outbox inserts are complete (`finance.service.ts:1194`,
  `fixed-assets.service.ts:789`, `treasury.service.ts:709`). Treasury never emits `finance.bank.statement.imported.v1`.

### P1-4 Declared ERP consumers do not exist; no relay runs for any ERP module — CONFIRMED
- `FinanceService.ingestSubledgerEvent()` (`finance.service.ts:744`) has **0 callers** (`git grep ingestSubledgerEvent`).
- `financial-operations/apps/api/src/app.module.ts:22-47` registers no inbox controller and no relay.
- Inventory, orders and procurement define relay definer functions (`database.service.ts:5-8` in each), but nothing
  instantiates `OutboxRelay` (`git grep 'extends OutboxRelay'` finds only CMMS, gigaops, geospatial and connector-hub).
- Product-catalogue has `definerFunctions: []` (`database.service.ts:11`).
- The SDK relay posts to the absolute path `/internal/v1/inbox` (`packages/module-sdk/src/outbox-relay.ts:157`). Hosted modules live under
  `/<name>` (`apps/module-host/src/host.module.ts:16`), and `relayOrigin` forbids a path (`relay-config.ts:63`), so a hosted module
  cannot be a relay target even if an inbox were added.

### P1-5 Inbox endpoints that a user can forge (no relay token, `any` body) — CONFIRMED
- Orders `POST v1/inbox/invoices` needs only `orders:read` and takes `@Body() body: any` (`orders.controller.ts:168-175`). It upserts AR invoice projections
  (`orders.service.ts:788-868`), records `correlation_id = orderId` (`:826`), and keys dedupe on body `id`.
- Procurement `POST inbox/receipts` needs `procurement:match` and takes `any` (`procurement.controller.ts:181-189`). It upserts receipt projections that feed
  3-way match (`procurement.service.ts:646-733`). A matcher can manufacture receipts.
- AR `POST inbox/fulfillments` needs `ar.invoices.write` and takes `any` (`accounts-receivable/apps/api/src/invoices/invoices.controller.ts:135-146`). It
  issues **sealed invoices** priced from body `unitPriceMinor` (`invoices.service.ts:839`, `unitAmountMinor: Number(l.unitPriceMinor)`,
  which is also a Number cast of minor money). The dedupe key is body `fulfillmentId` (`:731`). The whole path spans `invoices.service.ts:706-1013`.
  This was added to the **frozen** AR module by WI-OI-113 (`git log`: e532d98).

### P1-6 Procurement controls: no DoA, no SoD, no budget check, no audit, no events — CONFIRMED
- `approveRequisition` (`procurement.service.ts:241-264`): no policy evaluation (policies are only listed or created, `:1256-1334`), no
  requester ≠ approver check, approves from DRAFT, writes no audit and no outbox.
- `approveVendorBill` (`:1090-1107`): the same gaps, and nothing posts to AP or GL.
- `matchReceipt` (`:520-645`) accepts a manual received quantity without any inventory receipt when `receiptLineId` is omitted.
- No audit inserts; 0 outbox writes against 5 declared emits (`module.yaml` events). `git grep -i 'budget|commitment|encumbr'` over the
  procurement API finds nothing (lead G).

### P1-7 Period and subledger close can be bypassed — CONFIRMED
- `CloseService.verifySubledgerOpen` (`close/close.service.ts:153`) is called only at `:467` (accrual posting, 'GL').
- `postJournal` rejects only `LOCKED` (`finance.service.ts:413`) and accepts `FUTURE` and `SOFT_CLOSED` (status set `000001:236`). The DB trigger
  likewise checks only LOCKED (`000001:299-322`).
- `period_subledger_locks` (`000007:16`) is checked by no AP, AR, inventory, FA, treasury or costing path. AR and procurement do not post to finance at all.

### P1-8 Split masters and authority conflicts — CONFIRMED (see section 6)

### P1-9 Floating-point money — CONFIRMED
- AR `work-sources/work-sources.service.ts:164-168`: `Math.round(rec.quantity * billedRateMinor)`.
- Workforce `expenses/wfo-expenses.service.ts:31,119`: `Number((miles*rate).toFixed(2))` with a hard-coded IRS rate.
- CMMS `parts/parts.service.ts:521-528` and `work-orders/work-orders.service.ts:767,812-822`: `Math.round(x*100)/100` cost roll-ups.
- Multi-currency `revaluation.service.ts:59` (see P0-5).
- Procurement variance percent uses float (`procurement.service.ts:813,921`), which is not money.

### P1-10 Tenant GUC binding is not transactional: `set_config(..., true)` outside BEGIN — CONFIRMED (code) / effect PLAUSIBLE
- `queryWithTenant` with no BEGIN appears in: AR `database.service.ts:85-92`, autonomous-recovery `:60-68`, document-scanner `:67-74`, esignature `:54-62`,
  multi-currency `:60-68`, ontology `:66-73`, saga `:66-73`, tax `:77-84`. The local setting ends with the implicit statement transaction,
  so the next query runs with no `app.tenant_id`.
- Callers include ontology (16), saga (11), scanner (7), ARS (5) and CMMS import/export.
- Under forced RLS with a non-superuser role this fails closed: empty reads and rejected writes. Several of these modules allow superuser or BYPASSRLS outside
  production (for example `tax-configuration/.../database.service.ts:57-61`), in which case isolation rests only on `WHERE tenant_id`.
- Multi-currency `query()` binds no tenant at all (`:46-57`).

### P1-11 The committed control-migration runner references uncommitted files — CONFIRMED
- `packages/db/package.json:24` → `node ../db-migrations-runtime/run-control-migrations.mjs`.
- `packages/db-migrations-runtime/package.json:8`.
- `infra/compose/docker/Dockerfile:26-27,171` COPY and CMD `run-control-migrations.mjs` and `control-migration-policy.mjs`.
- Both files are untracked (`git ls-files packages/db-migrations-runtime` lists only package.json and prisma.config.mjs). A clean checkout cannot build
  the image or run `db:migrate`.
- The switch from `prisma migrate deploy` was made inside a commit titled "docs(governance): record WI-OI-093 commit hash"
  (007e686; `git show 007e686 -- packages/db/package.json`).
- The untracked runner (read only) marks three committed migrations (`20260927110000/120000/130000_*`) applied without running them,
  then runs `prisma migrate deploy` over the whole `migrations` directory. **It would therefore pick up both untracked
  migrations** (`20260923590000_tp2_cancelled_enum_predecessor`, `20261002000000_database_extensions_foundation`). There is no filter.
  `20260923590000` sorts before 31 already-applied migrations, and Prisma `deploy` still applies it.
- The coordinator reports both were applied to the local DB at 2026-10-04 06:41Z. The local DB therefore no longer matches the committed candidate.
- The untracked repair's own header says committed `20260924000000_tp2_durable_export_and_outbox` cannot fresh-install
  (`ADD VALUE 'CANCELLED'` at `:4`, then used in a constraint at `:96`, same transaction). PLAUSIBLE: the committed migration set alone has no clean-install path.

### P1-12 Orders allocation: a second partial allocation of a line always fails — CONFIRMED
- `orders.service.ts:500-505` emits with `aggregate_type 'sales_order_line', aggregate_id=line.id, aggregate_version 1`.
- `gigalibs_orders.outbox_events` has UNIQUE on (tenant, aggregate_type, aggregate_id, aggregate_version, event_type) (`000002:23`).
  The second allocation on the same line violates it and rolls back. The same constant-version pattern applies to `finance.service.ts:1197` (period
  lock: re-locking a reopened period fails) — PLAUSIBLE.

### P1-13 Prototype modules fail open on auth by default — CONFIRMED
- document-scanner, ontology and saga: `allowInsecureOidc = parseBoolean(..., nodeEnv !== 'production')`
  (`document-scanner/.../runtime-config.ts:24`, `ontology/...:22`, `saga-orchestrator/...:22`). There is no production refusal, unlike AR, spend, tax and others.
- In insecure mode the guard accepts `x-tenant-id` and grants `documents:admin` / `*:admin` (`document-scanner/.../auth/authorization.ts:69-108`).
- The BFF proxies to them with only `x-tenant-id` (`app/api/scanner/[...path]/route.ts:60-70`), so the BFF path works only in insecure mode.

### P1-14 Governor: caller-chosen tenant and no permission on tier change — CONFIRMED
- `apps/playground-api/src/governor.controller.ts:54-62` `POST governor/consume` is `@Public` and takes the tenant from body or header (default
  `'default-system-tenant'`), so it can drain any tenant's bucket.
- `:141-155` `POST governor/tier` has no permission check. Any member can set their own tenant's tier.
- `governor.guard.ts:37-41` and `governor-persistent.guard.ts:53-57` key throttling on the spoofable header. They are registered as providers but not as guards.

### P1-15 Frozen AR module modified by a later work item — CONFIRMED
- e532d98 (WI-OI-113) changed `modules/accounts-receivable/apps/api/src/invoices/invoices.service.ts` and `.controller.ts` and added migration
  `000014_ar_orders_inbox_receipts`. WI-OI-019 is frozen (ADR-0026 `:13`). See P1-5.

### P1-16 Budget and commitment gate is never called by spend producers — CONFIRMED
- `BudgetingService` availability and commitment APIs (`budgeting/budgeting.controller.ts`) are reachable only by HTTP from a user.
- No procurement, spend or AP code calls them: `git grep -i budget` over procurement and spend APIs finds nothing related to finance.
- `finance.budget.commitment.recorded.v1` is never written successfully (P1-3).

---

## 2. Deliverable H — Event matrix

Legend: **RW** Runtime-wired (static trace) · **PD** Present-but-disconnected · **M** Missing · **NM** Name-mismatch.
"Outbox in tx" means the outbox INSERT uses the same client and transaction as the domain write.

### 2.1 Relay mechanics (shared)
- Publisher: `packages/module-sdk/src/outbox-relay.ts:49-141`. It is a setInterval relay started in `onApplicationBootstrap` only when
  `relayConfig.outbound` is set (`:63-70`). It does HTTP POST to the single peer `/internal/v1/inbox` (`:157`) with an Ed25519 body-bound relay token
  (`:151-155`).
- Retry: exponential backoff 5s…900s, max 10 attempts (`:115-124`). 4xx except 408/429 goes to dead letter as FAILED (`:169-174`). No DLQ table; the
  outbox row stays FAILED.
- Ordering: lease one per aggregate (claimed), batch sorted by created_at (`:89-93`).
- Correlation id: carried in the envelope and `X-Correlation-Id`.
- Inbox guard: `relay-inbox-guard.ts:37-68` checks signature, audience, source, body hash, tenant and messageId match. This is signed source and tenant identity.
- Dedupe: `inbox-receipts.ts:29-68`, unique on (tenant_id, consumer_name, message_id), in the caller's transaction.
- Schema validation: per consumer (not in SDK).
- No broker. `packages/broker` and `packages/event-bus` are not used by any module API (`git grep`). There is no Kafka/Rabbit/Redis channel for module facts.

### 2.2 Module edges

| Producer → Consumer | Event | Producer write (file:line, tx?) | Relay started? | Consumer handler / registration | Status |
|---|---|---|---|---|---|
| CMMS → Workforce | `CMMS_STAFFING_*_V1` | CMMS outbox (relay/outbox-relay.ts:18) | yes, `physical-operations-cmms/apps/api/src/app.module.ts:61` | `gigaops/apps/api/src/relay/inbox.service.ts:45-47`, `gigaops.module.ts:85`; receipts; signed | RW (undeclared in manifests) |
| Workforce → CMMS | `WORKFORCE_*_V1` | gigaops outbox | yes, `gigaops.module.ts:132` | `physical-operations-cmms/.../relay/inbox.service.ts:42,58-64`; `app.module.ts:48` | RW |
| Connector Hub → Analytics | hub facts | hub outbox | yes, `universal-connector-hub/.../relay/analytics-relay.ts:62,87` | `analytics-studio/.../inbox/connector-hub-inbox.ts:381`; `app.module.ts:28` | RW |
| Connector Hub → Geospatial | place facts | hub outbox | yes, `analytics-relay.ts:49,88` | `geospatial/.../inbox/hub-places-inbox.ts:95,240`; `geospatial.module.ts:20-23` | RW |
| Geospatial → Analytics | place facts | geo outbox | yes, `geospatial/.../relay/analytics-relay.ts:36,57` | analytics inbox (GeospatialInboxGuard `:100`) | RW |
| Workforce → Analytics | workforce facts | gigaops outbox | yes, `gigaops.module.ts:133` | analytics inbox (WorkforceInboxGuard `:107`) | RW |
| AR → Finance | `ar.invoice.issued.v1` | `accounts-receivable/apps/api/src/invoices/invoices.service.ts:498-535,968-1000` (in tx) | AR worker posts to **one generic HMAC webhook** (`apps/worker/src/outbox-worker.ts:65-74`, `config.ts:7`), not a module inbox | Finance: none (`ingestSubledgerEvent` uncalled, `finance.service.ts:744`) | M / PD |
| AR → Orders | `ar.invoice.issued.v1` | as above | as above | Orders `POST inbox/invoices` (`orders.controller.ts:168`) is a user route (orders:read), with a payload shape different from the AR event; not in the Orders manifest | PD + NM |
| Orders → Finance | `orders.fulfillment.dispatched.v1` | `orders.service.ts:762-780` (in tx) | no relay class | none | PD |
| Orders → AR | `orders.fulfillment.dispatched.v1` | as above | no relay | AR `POST inbox/fulfillments` user route (`invoices.controller.ts:135-146`) | PD (forgeable, P1-5) |
| Inventory → Finance | `inventory.receipt.completed.v1` | `inventory.service.ts:834-842` (in tx, full columns) | no relay | none | PD |
| Inventory → Procurement | `inventory.receipt.completed.v1` | as above | no relay | `POST inbox/receipts` user route (`procurement.controller.ts:181`) | PD (forgeable) |
| Inventory → Finance | `inventory.stock.issued.v1` | `inventory.service.ts:1175-1183` (in tx) | no relay | none | PD + NM (not in inventory `emits`) |
| Inventory (manifest) | `inventory.stock.moved.v1` | `:538-544` minimal columns (defaults `aggregate_id=''`, `correlation_id=''`, 000002:5-15) | no relay | — | PD (degenerate envelope) |
| Inventory (manifest) | `inventory.kit.staged.v1`, `inventory.kit.issued.v1` | `:1275-1281`, `:1377-1383` minimal columns | no relay | CMMS has no inventory consumer | PD |
| Inventory (manifest) | `inventory.balance.changed.v1`, `reservation.changed`, `count.closed`, `adjustment.approved` | **none** (contracts only, `packages/contracts/src/inventory/inventory.ts:720-788`) | — | — | M |
| ? → Orders | `inventory.stock.adjusted.v1` (Orders consumes) | **no module declares or writes it** | — | none | NM / M |
| Orders (manifest) | `orders.quote.created/accepted`, `order.created/confirmed/allocated`, `orders.invoice.issued.v1` | not written; contracts say `sales-order.created.v1` (`packages/contracts/src/orders/orders.ts:539,552`) | — | — | M + NM |
| Orders (code only) | `orders.allocation.requested.v1` | `orders.service.ts:500-505` | no relay | no consumer (inventory has none) | PD + NM (undeclared) |
| Procurement (manifest) | 5 `procurement.*` events | **0 outbox writes** in the procurement service | — | — | M |
| Procurement → AP/GL | posted vendor bill | no event exists (lead F) | — | — | M |
| Catalogue → Inventory/Orders/Procurement | `product.created.v1`, `product.updated.v1` … | `recordMutation` writes `PRODUCT_CREATED_V1`… (`packages/module-sdk/src/module-command.ts:118-128`; `catalogue.service.ts:195-860`, in tx) | none (`definerFunctions: []`) | no consumer in any module | NM + PD |
| Finance (manifest 26 emits) | `finance.*` | GL, lock, FA and treasury-seal complete; budgeting, costing and close inserts fail (P1-3); consolidation targets a missing table; `bank.statement.imported` not written | definer fns exist (`database.service.ts:5-8`), no relay class | no consumers anywhere | PD / broken |
| Control plane → modules | `platform.authorization.revoked.v1` | **no producer**; `auth_revocation_events` is READ-ONLY for runtime roles (`compose.module-host.yaml` `MODULE_READ_ONLY_TABLES`) | — | — | M |
| Control plane → modules | `platform.organization.version.v1` | kernel worker HTTP push, signed context (`apps/playground-api/src/kernel-worker/module-call.job.ts:71-75,158-164`) | worker | only gigaops, analytics and product-catalogue; finance, inventory, orders and procurement have `organization.controller.ts` but are not targeted | RW (3) / PD (4) |
| Spend → "Action Gateway / Accounting" | expense facts | `spend-management/.../expenses/expenses.service.ts:359,439`, `imprest.service.ts:251` | none | none | PD (outbox never drains) |
| → Multi-currency, Tax, Workflow Studio | inbound | `CurrencyInboxService`, `TaxInboxService`, `WorkflowInboxService` exist (`inbox/inbox.service.ts:21`) | — | **no controller or caller** (`git grep` finds only module files) | PD |

### 2.3 Consumer-quality attributes for the 6 runtime-wired edges
- Inbox dedupe: `inbox_receipts` UNIQUE (tenant_id, consumer_name, message_id) through `receiveOnce` (`packages/module-sdk/src/inbox-receipts.ts:38-55`).
- Transaction boundary: receipt and projection share the tenant transaction.
- Retry and backoff: on the producer side only.
- DLQ: an outbox row ending FAILED. There is no DLQ table, replay tool or alert.
- Ordering: per-aggregate lease.
- Signed tenant and source: yes.
- Schema validation: per consumer.
- Correlation id: yes.
- Telemetry: logger warn only (`outbox-relay.ts:126-129`). There is no metric or alert on FAILED backlog (P2).

The ERP "consumers" (orders `projectArInvoice`, procurement `projectInventoryReceipt`, AR `issueInvoiceFromFulfillment`) do not meet this bar:
- they dedupe through SELECT-then-INSERT with no ON CONFLICT (race);
- they have no signed source, no schema validation, and no failure or FAILED path;
- the outbox `correlation_id` is wrong (`orders.service.ts:826` uses orderId).

---

## 3. Deliverable E — API gap register (per module API)

Tenant derivation key:
- **SC** = SDK `SignedContextGuardBase`. The tenant comes only from a verified PlatformContextV1 (`packages/module-sdk/src/signed-context.ts:105-160`).
- **SC\*** = the module's own signed-context guard.
- **OIDC** = JWKS JWT with a tenant claim.
- **HDR** = caller header, query or body (P0).

| Module (WI) | Ctrl/routes | Auth / tenant | Perms | Validation | Pagination | Idempotency | Concurrency | Tx | Audit | Key gaps |
|---|---|---|---|---|---|---|---|---|---|---|
| financial-operations (094/095/114–118) | 9 / 98 | SC (`authorization.ts:7-20`) | every route (96 decorators) | zod shared contracts via `parse()` | 6 `LIMIT` in 98 routes; most lists unbounded | **0** | 2 expectedVersion refs | per-service tx; postJournal is a separate tx (P0-1); consolidation commits per statement | 1 insert (`finance.service.ts`) | P1-1 host down, P1-2 503, P1-3, P0-1; no org-unit scoping (0 refs) |
| universal-inventory (091) | 3 / 28 | SC | yes (26) | zod partly; `any` body `inventory.controller.ts:221`; inline-typed `:258,:269,:316` | 8 LIMIT | keys present (25 refs) | none (FOR UPDATE on rows) | yes | none in `audit_events` | P1-2 503 |
| universal-orders (093) | 3 / 27 | SC | yes (25); **inbox needs only orders:read** | `any` `orders.controller.ts:172`; inline `:62,:163` | `LIMIT 50` fixed, no cursor | **0** | **0** | yes | 8 inserts | P1-2, P1-5, P1-12; issues customer invoices and credit memos (authority) |
| universal-procurement (092) | 3 / 28 | SC | yes (26) | `any` `procurement.controller.ts:186` | **0 LIMIT** | **0** | **0** | yes | **0** | P1-2, P1-5, P1-6 |
| product-catalogue (112) | 9 classes / 39 | SC | yes (37) | zod | 5 LIMIT | yes (22) | yes (20) | yes, `recordMutation` | yes | the best-formed module; down only through P1-1; event names mismatch |
| physical-operations-cmms (038) | 12 / 92 | SC\* | 89 | zod partial (5) + DTO | 19 | 19 | 30 | yes | 51 | float cost (P1-9); split stock and asset masters |
| gigaops / Workforce (060) | 32 / 188 | SC\* | 69 decorators for 188 routes (controller-level likely; spot-check advised) | 57 | 32 | 8 | 40 | yes | 54 | float expenses (P1-9) |
| analytics-studio (064) | 16 / 64 | SC\* + relay inbox | 61 | 32 | 23 | 12 | 1 | yes | 0 direct | — |
| geospatial (063) | 4 / 17 | SC\* + relay inbox | 14 | 7 | 3 | 0 | 7 | yes | 3 | FORCE RLS missing (sec. 4) |
| universal-connector-hub (026) | 4 / 18 | SC + **HDR on webhooks** | 15 | 9 | 6 | 16 | 0 | yes | 2 | P0-6 |
| accounts-receivable (019, frozen) | 12 / 50 | OIDC (`AR_ALLOW_INSECURE_OIDC` refused in prod, `runtime-config.ts:23-24`) + **public webhooks** | 41 | 46 | 18 | 75 | 21 (ETag) | yes | 16 | P0-4, P1-5, P1-9, P1-10, P1-15 |
| spend-management (020) | 9 / 27 | OIDC | 22 | **TS-only DTOs, no runtime validation** (0 parse) | **0 LIMIT** | 4 | 8 | yes | 3 | outbox never relayed; no FORCE RLS |
| tax-configuration (021) | 8 / 17 | OIDC | 13 | 2 | 4 | 18 | 0 | yes | 2 | P1-10; superuser allowed outside prod |
| multi-currency (022) | 8 / 15 | OIDC | 11 | **0** | 8 | 24 | 1 | partial | 2 | P0-5, P1-10 |
| esignature (proto) | 5 / 12 | OIDC | 8 | 0 | 7 | 2 | 1 | — | 7 | P1-10 |
| autonomous-recovery-studio (027) | 6 / 15 | OIDC | 11 | 0 | 1 | 2 | 1 | — | 2 | P1-10; no FORCE RLS |
| document-scanner / ontology / saga (proto) | 2/7, 2/11, 2/5 | OIDC; **insecure default → HDR** | 6/10/4 | 0 | 1/0/0 | 0 | 0 | — | 0 | P1-13, P1-10 |
| workflow-studio (025) | 4 / 13 | **none → HDR** | **0** | 0 | 4 | 9 | 0 | — | 2 | **P0-2** |
| universal-rule-pro (024) | 5 / 14 | **none → HDR** | **0** | 0 | 1 | 2 | 0 | — | 5 | **P0-2** |
| universal-data-studio (023) | 6 / 15 | **none → HDR** | **0** | 2 | 3 | 2 | 0 | — | 3 | **P0-2** |
| communications (041) | **no committed API** | the BFF route falls back to an **in-memory seeded store** that marks messages `DELIVERED` and returns fabricated voice tokens | — | — | — | — | — | — | — | **P0 (fake success, add to P0 list as P0-8)**: `apps/workflow-platform/app/api/communications/[...path]/route.ts:66-108,186-201`; `apps/workflow-platform/lib/communications-store.ts:124-135,460` |
| Control plane `apps/playground-api` | 15 ctrls | global `JwtAuthGuard` + `TenantBoundaryGuard` + `RbacGuard` (`app.module.ts:259-261`) | most routes; **SCIM 0, Governor 0** | mixed | — | parties yes | settings yes | prisma tx | audit-nest | P0-3, P1-14 |

**Caller-supplied tenantId (P0 rule).** The following routes accept it:
- workflow-studio, rule-pro and data-studio (all routes);
- Connector Hub `POST api/connectors/v1/webhooks/:slug`;
- AR `POST v1/payments/webhooks/:provider` (tenant from payload);
- SCIM (header or query, else a default tenant);
- Governor `consume` and `check-budget` (body or header, else a default tenant);
- prototypes in insecure mode.

The TenantBoundaryGuard rejects mismatches only on control-plane routes that are not `@Public`.

**Non-disclosing 404.** ERP services filter by tenant and rely on RLS, so other-tenant ids return 404, which is acceptable. Object-level authorization **below the tenant** (org unit, department, place) is absent in finance, orders and procurement (0 references to `principal.organization` or scope).

---

## 4. Deliverable F — Database and migration register

### 4.1 Migration systems
1. **Control plane: Prisma** (`packages/db/migrations`, 52 tracked dirs, `migration_lock.toml`).
   - The committed `db:migrate` runner is the uncommitted `run-control-migrations.mjs` (P1-11). It would apply both untracked dirs (no filter, Prisma deploy). Both were applied to the local DB at 2026-10-04 06:41Z (coordinator).
   - The committed `20260924000000_tp2_durable_export_and_outbox` probably cannot fresh-install (PLAUSIBLE, P1-11).
2. **Module SQL runner**: `infra/compose/docker/run-module-migrations.mjs:27-65`.
   - Picks up `^\d{6}_.+\.up\.sql$` files in version order, filtered to the module's `db/runtime-manifest.txt` for hosted modules (`copy-hosted-migrations.mjs:14-25`).
   - Applies files whose version is above `MAX(schema_migrations.version)`, under advisory locks.
   - **No checksum or immutability check**: a committed file edited later is silently skipped on existing DBs and applied as edited on new ones (P2).
   - Provisions the runtime role `NOSUPERUSER NOBYPASSRLS` (`:129-140`) and verifies it (`:97-111`). It grants SELECT, INSERT, UPDATE and DELETE on all tables and EXECUTE on all functions (`:147-153`), then revokes per the read-only and append-only env lists.
   - The SDK refuses superuser or BYPASSRLS at boot (`packages/module-sdk/src/database.ts:179-181`). OIDC-era modules only warn outside production (for example `tax-configuration/.../database.service.ts:57-61`).
3. **Parked FastAPI**: Alembic (`apps/workflow-api/alembic`), out of scope. No production route was found that depends on it.

### 4.2 Edited-after-commit migrations (`git log --diff-filter=M` over all migration dirs)
- `packages/db/migrations/20260930010000_kernel_job_schedules/migration.sql`: created in 943d2f8 (2026-09-30 13:15) and modified in 13cd27a (14:07, adds `GRANT DELETE`).
  - The deploy log says it was recorded after the edit (`.pi/work/WI-OI-104.md:253`).
  - Any database that applied 943d2f8 lacks the grant, and Prisma deploy does not re-run it. **P2** (P1 if any environment ran 943d2f8).
- `modules/analytics-studio/db/migrations/000004…000010`: created in 766bd86 and edited about an hour later in 8c6b915 (fixed the ledger column), before first replay. **P2/P3** (pre-deploy).
- `modules/accounts-receivable/db/migrations/README.md`: documentation only.
- **No ERP module migration was modified.** Finance 000001–000007 each have exactly one commit (`git log --follow`).

### 4.3 Finance "7 schema versions"
- These are seven separate forward files (`000001`–`000007`), each added by its own WI commit (a8207c4, b799abd, eb7391a, 51c9ad8, babd0b9, d731c05, 10bbfba). They are not edits of one file.
- Caveats:
  - (a) Per the coordinator, each was applied to the DB **before** being committed, and `schema_migrations` stores no checksum or name. No mechanism proves the committed file equals what ran.
  - (b) The finance proof checks only `version == '1'` (`real-database-proof.ts:20`).
  - (c) Deployment ships 1–6 and the API demands 7 (P1-1).

### 4.4 Per-schema register

FORCE RLS is counted from literal statements plus loop arrays. "RT role" is the module runner's NOSUPERUSER NOBYPASSRLS role unless noted.

| Schema / module | Tables | RLS enabled / forced | Policy key | Gaps |
|---|---|---|---|---|
| gigalibs_finance | 48 (incl. schema_migrations) | 44 / 44 (loop `000001:415-437` + per-file) | `app.tenant_id` | `org_replica_versions/units/closure` have **no RLS** (P2). Double-entry: deferred constraint trigger on the journal header (`000001:408-410`) plus app BigInt check (`finance.service.ts:~427-447`). **Lines can be INSERTed into a POSTED journal**: the line trigger covers only UPDATE and DELETE (`000001:342-343`), and the balance trigger fires only on the header (P2). Period lock trigger is LOCKED-only (`:299-322`). Money BIGINT minor (57 columns). JS money BigInt; FX truncates toward zero (`fx-translation-engine.ts:59-61`, P2). `auth_revocation_events` schema is wrong (P1-2) |
| gigalibs_inventory | 28 | loop covers all 26 + inbox | `app.tenant_id` | Quantities numeric(18,6); costs numeric(18,0); ExactDecimal in JS. Outbox defaults `aggregate_id=''`, `correlation_id=''` (`000002:5-15`). Revocation schema wrong |
| gigalibs_orders | 22 | all (information_schema loop `000001:395-412`) | `app.tenant_id` | Money BIGINT. UNIQUE outbox constant version (P1-12). Revocation schema wrong. `customer_invoices` should be deprecated per ADR-0026 `:34` but is live |
| gigalibs_procurement | 20 | loop covers all | `app.tenant_id` | numeric(18,x) amounts. Revocation schema wrong |
| gigalibs_product_catalogue | 23 | loop | `app.tenant_id` | Correct revocation schema. Reference implementation |
| gigalibs_ar | 30 | 29 / 29 | `app.tenant_id` | BIGINT. JS float in work-sources (P1-9). Tenant GUC not transactional (P1-10) |
| gigalibs_cmms | 65 | 22 literal + 6 loops | `app.tenant_id` | Money numeric decimal (not minor units); JS float roll-ups (P1-9) |
| gigalibs_workforce (gigaops) | 20 | 15 / 15 | `app.tenant_id` | numeric money; JS float expenses |
| gigalibs_analytics | 47 | 43 / 43 | `app.tenant_id` + `app.current_tenant_id` (two keys) | DOUBLE only for geo |
| gigalibs_connectors | 10 | 9 / 4 + loop | `app.tenant_id` | Verify FORCE coverage of the remaining tables |
| gigalibs_spend | 12 | 10 / **0** | `app.tenant_id` | **No FORCE** (P2) |
| gigalibs_tax | 9 | 3 / 2 + loops | `app.tenant_id` | Superuser allowed outside prod |
| gigalibs_currency | 10 | 3 / 2 + loop | `app.tenant_id` | `query()` unbound (P0-5/P1-10) |
| geospatial, ARS, communications, scanner, ontology, saga, data-studio, rule-pro, workflow | 3/7/6/2/4/2/8/6/7 | enabled, **FORCE 0** | mixed (`app.current_tenant_id` in scanner and geospatial) | P2. Without FORCE, a runtime role that owns the tables bypasses RLS. With the module runner's separate role, RLS still applies |
| control plane (Prisma, public) | ~200 | per TP2/TP3 migrations (not exhaustively verified) | — | Legacy `invoices` INTEGER cents (int32 overflow above about $21.4M, P3). DOUBLE PRECISION rates in `20260902030000_legacy_module_baseline` (`:140,144,262,403,616,672`) |

---

## 5. Deliverable J — Cross-module business journeys (backend)

Status key: **W** wired at runtime · **P** present but invoked only by a user HTTP call (no automatic link) · **D** present-but-disconnected · **X** missing · **B** present but deterministically broken.
Every ERP hop is also gated by P1-1 (module host cannot boot) and P1-2 (503 on every authenticated route).

**(a) Procure-to-pay**

| Step | Status | Evidence |
|---|---|---|
| Requisition | P | `procurement.service.ts:95` |
| Delegation of authority | **X** | policies stored but never evaluated, `:241-264`, `:1256-1334` |
| Budget check | **X** | finance availability API exists, procurement never calls it (P1-16) |
| Purchase order | P | `:300`, issue `:482`, no event |
| Commitment | **X/B** | no caller; budgeting outbox broken (P1-3) |
| Goods receipt | D | `inventory.service.ts:598-842`; event written, no relay |
| 3-way match | P but bypassable | `:520`, `:735`, `:1335`; manual or forged receipts (P1-5/P1-6) |
| Vendor bill | P | `:935`, approve `:1090`, no SoD |
| AP/GL posting | **X** | no event, no finance consumer |
| AP payment/settlement | **X** | none in procurement; the control-plane `supplier_invoices` AP is a separate island |
| Bank reconciliation | P (standalone) | `treasury.service.ts` |
| Period close | **B** | P1-3, P1-7 |

**(b) Order-to-cash**

| Step | Status | Evidence |
|---|---|---|
| Party | D | `customer_party_id` unvalidated plus free-text `customer_name`, `orders.service.ts:65,210,324` |
| Quote | P | `:26` |
| Order | P | `:180`, `:286` |
| ATP | **X** | `allocateOrderLine :443` is order-local |
| Reservation | D | `orders.allocation.requested.v1` has no consumer; `inventory createReservation :856` is never called by orders |
| Fulfillment/dispatch | P | `:563`, `:673`; `issueId` caller-supplied and unverified |
| Stock issue | P | `inventory.service.ts:1031`, `any` body |
| Costing/COGS | P/B | manual HTTP; P0-1 |
| Canonical AR invoice | **split** | AR `inbox/fulfillments` (user-forgeable, priced by the caller) **and** Orders `createCustomerInvoice :871` |
| Payment allocation | P | AR payments; P0-4 on webhooks |
| Bank reconciliation | **X** | no link to AR payments |
| Returns/credits | **split** | Orders `createCreditMemo :1029` vs AR credit-notes |
| Close | **B** | |

**(c) Inventory-to-margin**

| Step | Status | Evidence |
|---|---|---|
| Receipt → cost layer | **X** | no consumer; `costing.ingestReceiptLayer` is manual and broken (P0-1) |
| Landed cost | **X** | no procurement fact; voucher is manual |
| Issue → COGS | **X** | `inventory.stock.issued.v1` is not consumed |
| Revenue | **X** | AR never posts to GL |
| Margin drill-through | over manual and broken data only | |

Lead I is confirmed: there is no automatic consumption.

**(d) Asset lifecycle**
- CMMS `gigalibs_cmms.assets` (`000010:71`) and Finance `fixed_assets.physical_asset_ref UUID` (`000003:~58`, index `:74`) are linked only by an unvalidated optional UUID. No events flow either way. **X** (lead M).

**(e) Budget-to-close**

| Step | Status |
|---|---|
| Structure / revision | **B** (P1-3) |
| Commitment | **X/B** |
| Actuals | read from GL |
| Checklist | **B** |
| Accruals | **B** |
| Year-end | **B** |
| Subledger locks | unenforced (P1-7) |

**(f) Group close**

| Step | Status | Evidence |
|---|---|---|
| FX translation | P | BigInt rates, truncation; `fx-translation-engine.ts:59-117` |
| IC elimination | **B** | posts journals then fails on missing table (P0-1) |
| CTA | P (plug) | `consolidation.service.ts:362-423` |
| Minority interest | **X** | `ownership_percentage` stored (`:167-186`) but never applied |
| Investment/equity elimination | **X** | |

**(g) Master data**
- Organization: replicated only to Workforce, Analytics and Catalogue (`module-call.job.ts:71-75`).
- Party (control-plane `parties`, `20261003000000_core_parties_foundation:8`): referenced by unvalidated UUID in orders, procurement and inventory, with **free-text names duplicated** (`vendor_name`, `customer_name`).
- Product: `inventory_items.product_id uuid NOT NULL` has no FK or validation (`000001:67-88`). No catalogue events or replica reach any consumer (D).
- UOM and price: Orders and procurement prices are entered per document, not from catalogue price lists. No catalogue lookup exists (`git grep` shows no cross-module fetch). **D**.

**(h) Tenant to first value (control plane)**
- Tenant create sets `provisioningState: 'CONTROL_PLANE_READY'` (`packages/tenancy-nest/src/tenancy.service.ts:158`).
- `tenant.provisioning-requested.v1` is declared (`apps/playground-api/src/app.module.ts:105,125`) but has no producer or consumer.
- Module enablement is by entitlement in the signed context only.
- The org version reaches 3 of the 8 org-aware modules.
- ERP modules cannot serve traffic (P1-1/P1-2). Communications serves in-memory fabricated data. Studio modules (P0-2) depend on network isolation.
- First ERP value is **not reachable** on the committed candidate.

---

## 6. Authority conflicts: one business fact, more than one writer

| Fact | Writers / masters (evidence) | Note |
|---|---|---|
| Customer invoice | `gigalibs_ar.invoices` (`accounts-receivable/db/migrations/000001`, issue in `invoices.service.ts:498-535`); **`gigalibs_orders.customer_invoices`** (`universal-orders/db/migrations/000001:244`, `orders.service.ts:871-1010`); control-plane `invoices` (`packages/db/migrations/20260902030000_legacy_module_baseline:100`) | ADR-0026 `:33-35` makes AR exclusive. Orders still issues |
| Credit memo | AR credit-notes (`credit-notes.service.ts:268`) vs Orders `customer_credit_memos` (`orders 000001:326`, `orders.service.ts:1029`) | |
| Vendor invoice/bill | `gigalibs_procurement.vendor_bills` (`000001:279`) vs control-plane `supplier_invoices` (`20260903000000_ap_outcome_core:94`) with AP matching (`apps/playground-api/src/ap-*.ts`) | two AP engines |
| Inventory balance | `gigalibs_inventory.stock_balances` (`000001:183`) vs CMMS `parts.quantity_on_hand` + `cmms_part_balances` + `stock_movements` + `part_transactions` (`physical-operations-cmms/db/migrations/000010:311`, `000019:32-50`, `parts.service.ts:38,123`) vs finance `inventory_cost_layers.remaining_quantity` (`000005:43`) | CMMS has 0 references to universal-inventory. Inventory has CMMS kits too (lead L) |
| Asset | CMMS `assets` (`000010:71`) vs finance `fixed_assets` (`000003:37`) vs `gigalibs_ontology.assets` vs `gigalibs_spatial.spatial_assets` | lead M |
| Party / customer / vendor | control-plane `parties` (`20261003000000:8`) and `suppliers` (`20260903000000:24`); `gigalibs_ar.customers` (`000001:78`); CMMS `customers`/`vendors` (`000001:469,492`); `gigalibs_ontology.parties`; free-text names in orders and procurement | |
| Product | `gigalibs_product_catalogue.products` (`000001:60`) vs `gigalibs_inventory.inventory_items` vs CMMS `parts` vs `gigalibs_ar.rate_catalog_items` vs control-plane `product_catalog_items` (`20260902030000:253`) | |
| Budget | finance `budget_structures/lines` (`000006`) vs control-plane `budgets`/`budget_categories` (`20260902030000:623,645`) | |
| Tenant/org | control-plane org hierarchy (authority) vs per-module replicas (acceptable) vs Workforce departments (`20260920000000_canonical_departments_and_workforce_memberships`) | replicas missing in 4 ERP modules |
| Commitment | finance `budget_commitments` vs procurement PO (no link) | |

---

## 7. Proof-script classification (WI-OI-091 to 118)

Classification key: **HTTP-E2E** = HTTP → API → DB → outbox → relay → consumer · **SVC** = constructs services and calls methods directly against a throwaway DB · **SQL** = hand-written SQL and pure functions only · **STATIC** = reads files and greps.

| Script | WI | Class | Notes |
|---|---|---|---|
| `modules/universal-inventory/apps/api/scripts/real-database-proof.ts` | 091 | SVC | `new InventoryService(db)` (`:100`); throwaway PG (`:78`); bypasses guard, so it cannot see P1-2. No relay or consumer. "11/11" |
| `modules/universal-procurement/.../real-database-proof.ts` | 092 | SVC | `:93` |
| `modules/universal-orders/.../real-database-proof.ts` | 093 | SVC | `:92` |
| `modules/product-catalogue/.../real-database-proof.ts` | 112 | SVC + revocation + RLS | the strongest; outbox count asserted (`:128`) but names mismatch and no relay |
| `modules/financial-operations/.../real-database-proof.ts` | 094 | **SQL** | 171 lines; connects as `gigalibs`; asserts only version '1' (`:20`); `TENANT_B` unused |
| `scripts/verify-financial-operations.mjs` | 094 | SQL | 0 fetch, raw INSERTs |
| `scripts/verify-treasury-reconciliation.mjs` | 095 | SQL + parser (`:27` imports dist parser) | |
| `scripts/verify-fixed-assets.mjs` | 114 | SQL + calculator (`:26`) | |
| `scripts/verify-consolidation.mjs` | 115 | SQL | never runs `consolidation.service`, so it misses the missing `outbox` table |
| `scripts/verify-inventory-costing.mjs` | 116 | SQL | "12 scenarios"; `rls_test_user` NOLOGIN created ad hoc (`:593-608`) |
| `scripts/verify-budgeting-and-commitment-control.mjs` | 117 | SQL + `evaluateSpendAvailability` | "outbox emission" scenario (`:15,:438-451`) calls a pure function and writes no outbox |
| `scripts/verify-period-close-and-forecasting.mjs` | 118 | SQL | creates a **LOGIN role with a hard-coded password `<masked-dev-password>` and GRANT ALL** in the shared DB (`:667-671`, P2) |
| `scripts/verify-commercial-operational-convergence.mjs` | 113 | SQL simulation | hand-INSERTs producer outbox rows **and** consumer inbox receipts (`:193,204,362,427,485,501,639,679,713,730`) and calls lease functions directly (`:757-759`). It simulates the whole handshake with no service, relay or HTTP |
| `scripts/verify-universal-{inventory,orders,procurement}.mjs`, `verify-product-catalogue-and-pricing.mjs`, `verify-core-parties-and-custom-apps.mjs`, `verify-application-dictionary.mjs` | 091–093, 110–112 | STATIC | `readFileSync` only, 0 DB, 0 fetch |
| `scripts/verify-finance-truth-boundary.mjs` | — | HTTP, but to currency and recovery (`:23-51`) | not financial-operations |
| `scripts/verify-finance-suite-browser.mjs` | — | UI render (Playwright `page.goto`) | no API assertions on ERP data |

**Result: no script for 091–118 exercises HTTP → API → DB → outbox → relay → consumer.**

---

## 8. P2 / P3 register

**P2**
1. Revocation never propagates. Nothing writes any module's `auth_revocation_events`, which is READ-ONLY for runtime roles. Exposure is bounded by the 300 s context TTL (`packages/auth-core/src/platform-context.ts:202`).
2. Org versions are not synced to finance, inventory, orders or procurement (`module-call.job.ts:71-75`) although they expose `v1/organization/versions`.
3. FORCE RLS is missing in spend, ARS, communications, scanner, geospatial, ontology, saga, data-studio, rule-pro and workflow-studio (section 4.4). Finance org-replica tables have no RLS.
4. No idempotency keys on money commands in finance (journals, depreciation runs, COGS, consolidation runs), orders or procurement.
5. No org, department or place scoping in finance, orders or procurement services.
6. No audit rows for procurement or inventory commands. Requisition and bill approvals are unaudited.
7. Orphaned outboxes: spend, finance, inventory, orders, catalogue. Orphaned inbox services: currency, tax, workflow.
8. Event names do not match:
   - catalogue writes `PRODUCT_CREATED_V1` but the manifest says `product.created.v1`;
   - orders contracts say `sales-order.*` but the manifest says `orders.order.*`;
   - `inventory.stock.issued.v1` and `orders.allocation.requested.v1` are not declared;
   - `inventory.stock.adjusted.v1` has no producer;
   - `orders.invoice.issued.v1` is declared, which contradicts ADR-0026.
9. Migrations modified after commit (section 4.2). The module runner has no checksum.
10. GL lines can be inserted into a posted journal (no INSERT trigger).
11. Consolidation: NCI is not computed; there is no equity elimination; FX truncates.
12. The relay's absolute inbox path is incompatible with module-host path prefixes.
13. The generated module host runs with `NODE_ENV: development` (`compose.module-host.yaml:159`).
14. No metric or alert on outbox FAILED backlog. No DLQ replay tooling.
15. List endpoints are unbounded: procurement has 0 LIMIT, spend has 0, finance has 6 across 98 routes.
16. TS-only DTOs with no runtime validation: spend, multi-currency, esign, ARS.
17. A proof script creates a persistent LOGIN role with a known password in the shared DB.

**P3**
1. Dev OIDC token issuers ship in production images (gated by `*_ALLOW_INSECURE_OIDC`, refused in prod for AR, spend, tax, currency, esign and ARS).
2. `count+1` sequence numbering races (`close.service.ts:306`).
3. Free-text party and product names are duplicated beside their IDs.
4. INTEGER cents in legacy control tables.

### Note on P0 count
The table in section 3 adds **P0-8** (Communications BFF fake-success fallback). Final tally: **P0 = 8, P1 = 16, P2 = 17, P3 = 4.**

---

## 9. Limits of this audit

- Static only. No database, HTTP or container was run. The 503 (P1-2), boot failure (P1-1) and NOT NULL failures (P0-1/P1-3) follow
  deterministically from committed SQL and code, but no runtime trace confirms them.
- Not exhaustively checked:
  - Workforce route-level permission coverage (69 decorators for 188 routes; likely controller-level);
  - control-plane Prisma RLS per table;
  - Connector Hub FORCE coverage of loop tables.
- The fresh-install failure of the committed `20260924000000_tp2_durable_export_and_outbox` is PLAUSIBLE. It is inferred from the
  untracked repair's header plus PostgreSQL enum semantics.
