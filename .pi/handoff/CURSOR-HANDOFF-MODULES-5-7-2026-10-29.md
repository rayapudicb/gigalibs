# Handoff to Cursor — complete the 7 iDempiere-parity modules to 100%

**Audience:** Cursor (AI coding agent) working in this repo, and the developer driving it.
**Date:** 2026-10-29. **Branch:** `feat/gigaops-convergence-core`. **Owner deploys the 7-module batch once, at the end — do not deploy.**

---

## 0. Read these first (canonical, in order)

1. `AGENTS.md` — mandatory reading order, Definition of Done, verification commands, delivery rules.
2. `docs/plans/idempiere-parity-modules-plan.md` — the per-module slices/screens/handshakes (Modules 1–7).
3. `.pi/WORK_ITEMS.md` — canonical status (WI-OI-122 foundation; WI-OI-123..129 = Modules 1..7; WI-OI-130 = IoT).
4. `.pi/NOW.md` — current frontier.
5. ADR-0018, ADR-0033, ADR-0007 — the accepted contracts that replace the plan's older Org-0/cross-module shorthand.

**UAT is production** (owner decision): each card passes its Done checklist on UAT instead of separate G5–G7 gates. The owner runs the single batch deploy after all seven are built. You build + prove **locally on throwaway PostgreSQL** — never touch UAT or `gigalibs-configuration-local-*` containers or data.

---

## 1. Status snapshot (what is committed)

| # | Module (WI) | State | Commits |
|---|---|---|---|
| 1 | Business Partner (123) | Built; windows + credit/netting/holds/exposure adapters | `326ef336`, `133985ae`, `544f368d` … |
| 2 | Material Ledger (124) | **Built, proven 28/28** | `8af23bbf` |
| 3 | Advanced SCM (125) | Backend + Kanban/Radar UI + GL clearance committed | `2a0269b2`, `0d60db97` |
| 4 | Manufacturing/MRP (126) | **Backend proven, host boots, 28/28** | `7bf1fb5f`, `fa98cb2e` |
| 5 | Landed Cost (127) | **NOT STARTED** | — |
| 6 | Returns/RMA (128) | **NOT STARTED** | — |
| 7 | Project Accounting/WBS (129) | **NOT STARTED** | — |

Modules 1–4 are committed and the module host boots all of them (verified via the DB-proof suite, 28/28). Program ≈ 50%.

### Open items on already-started modules (finish these for true 100%)
- **Module 4 (126):** S5/S6 UI differentiators (shortage badges, FocusModal execution UX, graph BOM editor); relay credentials (`infra/compose/scripts/generate-generated-module-credentials.sh universal-manufacturing`); compensation/pending states across a failed issue or receipt; `pnpm module:conformance universal-manufacturing --live` (needs the deployed stack); clean full `pnpm verify`.
- **Module 3 (125):** `--live` conformance + relay credentials (deploy-time).
- **Modules 1–2:** live UAT journey — happens in the owner's batch deploy only.
- The deploy-gated items (`--live`, live UAT journeys) are the owner's batch-deploy step; build + locally-prove everything else.

---

## 2. CRITICAL conventions and gotchas (these cost real time — do not relearn them)

### 2.1 NestJS DI will silently break the module host — and unit tests WILL NOT catch it
- **Constructor-injected classes must be VALUE imports**, never `import type`. `import type { DatabaseService }` erases the runtime symbol, so Nest can't resolve the dependency and **the whole module host fails to boot**.
- **`biome check --write` auto-converts these to `import type`** (its `useImportType` rule). Do **not** run `biome --write` on files with `@Injectable()`/constructor-injected classes. The flag is a tolerated false positive — leave the value import; add a one-line comment why.
- **A controller can only inject providers in its own module's scope.** If you put a controller in a separate `@Module` and inject a service that lives in `AppModule`, DI fails. Register inbox/relay controllers directly in the module's `AppModule` (where the service is provided), or make a shared module that exports the service. (This exact bug — `ProcurementInventoryInboxController` → `ProcurementService` — was a deploy blocker; see `fa98cb2e`.)
- **These breaks only surface when the module host boots.** `typecheck`, unit tests, and `module:conformance` (static) all PASS with a DI-broken host because tests instantiate services directly. **The only check that catches it is the `module-host-http (U2)` DB proof** — always run it (see §3).

### 2.2 Verification is a layered recipe — the DB proofs are not optional
Static green (typecheck + conformance + unit tests) is necessary but **not sufficient**. You must also run the DB proofs, which boot the real module host.

### 2.3 Stale `dist`
The DB proofs boot `apps/module-host/dist/main.js` (built output). After changing any module source, **rebuild before the DB proofs** or you prove a stale build:
```
pnpm --filter "@gigalibs/module-host..." build
```
(The `...` builds the module deps too.)

### 2.4 Throwaway Postgres only
Prove money/stock flows on an isolated PostgreSQL 16 container, never UAT. Two mechanisms:
- Module integration tests spin their own via `modules/<m>/apps/api/scripts/throwaway-postgres.ts`, gated by an env flag (e.g. `INVENTORY_PG_PROOF=1`, `MANUFACTURING_PG_PROOF=1`).
- The verify DB-proof scripts use `PROOF_DATABASE_URL` (one isolated DB; they migrate every module into it).

Run integration tests **one file at a time** — several `throwaway-postgres` containers in parallel exceed the readiness timeout (Docker contention) and flake.

### 2.5 Migrations
Additive only. Each new table: composite `(tenant_id, id)` keys, FK as `(tenant_id, ref_id) REFERENCES … (tenant_id, id)`, `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + a `tenant_isolation` policy on `current_setting('app.tenant_id', true)`, and `GRANT … TO gigalibs_<schema>_runtime` (the canonical runtime role the proof harnesses create — never a `_proof`/`_u2proof` name). Add the file to `db/runtime-manifest.txt`, bump `SCHEMA_CONTRACT_VERSION` in `apps/api/src/config.ts`, and bump any hardcoded `expectedMigrationVersion` in that module's integration tests / proof scripts. Write both `.up.sql` and `.down.sql`.

### 2.6 Pure engines + handshakes
- Business math is a **pure function** using `ExactDecimal` from `@gigalibs/contracts` (string decimals; `toScaledBigInt`/`fromScaledBigInt` for ceil/rounding — there is no `divide`). Unit-test it exhaustively. Examples to copy: `modules/universal-inventory/.../inventory/atp.ts`, `.../replenishment.ts`, `modules/business-partners/.../credit/exposure.ts`, `.../netting.ts`.
- Cross-module handshakes are **signed outbox facts → relay → inbox**. The producer writes an `outbox_events` row (topic from `config.TOPIC`, a versioned `event_type`, `PENDING`); the consumer module has an inbox controller+guard. Copy the inventory↔finance relay and `inventory.replenishment.po-draft.v1` → procurement inbox patterns.

### 2.7 UI
Two options, both render in the Next.js web shell (`apps/workflow-platform`, port 5180) via the module's web package:
- **Metadata windows** (record grids/forms): author in `modules/<m>/dictionary/windows.mjs`, run `node scripts/generate-windows.mjs <m>` (+ `--check`), then `pnpm modules:catalog`. Served by the record dispatcher at `v1/records/<entity>`.
- **Custom React panels** (boards, wizards, dashboards): `modules/<m>/web/src/<Panel>.tsx`, `'use client'`, fetch `/api/<gateway>/v1/...` with `credentials: 'include'`, style with `ui-*` design tokens only (no hard-coded colours — `audit:design-tokens` enforces it). Compose them as tabs in the module's `Workspace` component. Copy `modules/universal-inventory/web/src/KanbanTransferBoard.tsx` / `ReplenishmentRadarPanel.tsx` and how `UniversalInventoryWorkspace.tsx` wires tabs.

### 2.8 Gateway + permissions
Every controller route needs a matching `spec.gateway.routes` entry in `module.yaml` (the `audit:api-boundary` + manifest route-uniqueness checks enforce this — watch for duplicate/overlapping templates). New permissions go through the module's roles/catalog and `pnpm modules:catalog` regenerates `packages/contracts/src/**/**.generated.ts`, `infra/compose/generated/*`, `apps/workflow-platform/lib/generated/module-gateways.ts`.

---

## 3. The verification recipe (run all of it before calling a module done)

```bash
# per changed module
pnpm --filter @gigalibs/<module>-api typecheck                 # 0 errors
pnpm module:conformance <module>                               # 15/15 static (build + unit tests)
node scripts/generate-windows.mjs --check <module>             # windows match source (if it has windows.mjs)
pnpm modules:catalog                                           # 0 errors; regenerates gateways/compose/catalogues

# isolated-Postgres integration proof (one file at a time)
<MODULE>_PG_PROOF=1 pnpm --filter @gigalibs/<module>-api exec vitest run --root ../../../.. <path/to/integration.test.ts>

# whole-batch DB proofs — MUST rebuild the host first, then one throwaway Postgres
pnpm --filter "@gigalibs/module-host..." build
docker run -d --name gl-proof-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=postgres -p 127.0.0.1:55999:5432 postgres:16
PROOF_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55999/postgres pnpm verify --audits   # expect RESULT: PASS, incl. "module host starts with all five modules"
docker rm -f gl-proof-pg
```
A module is **not** done until: every named slice/screen/handshake works on real persistence; migration + roll-forward + relay-replay + E2E evidence is recorded in `.pi/work/WI-OI-1NN.md`; `pnpm verify` is clean; the module-completion commit is made; `.pi/WORK_ITEMS.md` + `.pi/NOW.md` are updated.

---

## 4. Remaining modules to build

Scaffold each new module with `pnpm module:new` (WI-OI-085 generator), then follow the plan's slices. Build order is fixed by the dependency graph: **5 → 6 → 7**. Build and commit each module fully before the next.

### Module 5 — Landed Cost (WI-OI-127) — extend `universal-procurement` + `financial-operations/costing`
- **Schema:** `landed_costs`, `landed_cost_allocations`; writes `cost_records` adjustments + GL.
- **Slices:** S1 schema; **S2 allocation engine** (4 bases — Qty/Value/Weight/Volume — pure, rounding-exact, exhaustive unit tests); S3 inventory cost true-up handshake (adjust `cost_records` via gateway); S4 sold-goods → COGS variance posting to GL; S5 3-step allocation wizard FocusModal + Original→Landed→Adjusted impact table; S6 E2E ($3k freight / 500 units = +$6.00/unit).
- **Handshake:** consumes `inventory.receipt.v1` + vendor-bill lines; posts true-up / COGS variance to Finance GL.

### Module 6 — Returns / RMA (WI-OI-128) — new `universal-returns` (`gigalibs_returns`)
- Orders already owns `customer_returns` + `customer_credit_memos`; RMA owns **authorization, inspection, disposition**, then calls the existing Orders credit-memo action (Orders stays the financial document owner). **Add a compatibility/migration plan so a return cannot be processed twice.**
- **Schema:** `rma`, `rma_lines`, `rma_types`, `dispositions`.
- **Slices:** S1 schema + anti-fraud qty guard (pure: returned ≤ invoiced); S2 RMA DocAction linked to SO/Invoice; S3 disposition routing (restock → `inventory.receive` to sellable ATP / quarantine / scrap → expense GL); S4 credit-memo → AR handshake; S5 processing-checklist UI (RadioGroup disposition, one-click credit-memo modal); S6 E2E (damaged return → scrap + partial credit).

### Module 7 — Project Accounting & WBS (WI-OI-129) — new `project-operations` (`gigalibs_projects`) — most cross-cutting
- **Schema:** `projects`, `project_phases`, `project_tasks`, `project_lines`, `project_issues`, `timesheets`, `labor_rates`.
- **Slices:** S1 WBS schema; S2 cost-accrual engine (material + labor, pure); S3 WIP GL posting; **S4 T&M billing engine** (unbilled timesheets × rate) + milestone trigger → `ar.invoice.draft`; S5 Gantt + budget-vs-actual burn panel; S6 timesheet approval queue; S7 E2E (Phase-1 complete → drafts milestone invoice).
- **Handshake:** material issue → `inventory.issue` charges WIP; timesheets → labor cost; milestone/T&M → AR; WIP → GL.

The `> iDempiere` lines in the plan are **differentiators (beyond parity)** — nice-to-have, not required for a module to be "Built"; do them last or defer.

---

## 5. Commit discipline
- One scoped commit per module (incremental commits within a module are fine — see how WI-OI-123/124 were committed in pieces). Stage only that module's paths + the files its `modules:catalog` regenerated; **exclude unrelated pre-existing WIP** (`modules/communications-textfly/`, `apps/playground-api/src/kernel-worker/*` — both were dirty before this work and are not yours to commit). `dist/` is gitignored — never commit build output.
- End every commit message with: `Co-Authored-By: ...` per the active attribution rule. Do not deploy; do not touch UAT.

---

## 6. One-paragraph summary for the driver
Modules 1–4 are built, committed, and boot together (DB proofs 28/28). Cursor should finish Module 4's UI differentiators + compensation, then build Modules 5 (Landed Cost), 6 (RMA), 7 (Project Accounting) in that order, each: scaffold → migration (RLS + `gigalibs_<schema>_runtime` grant) → pure engine (ExactDecimal, unit-tested) → API + gateway + handshake → UI → PG integration proof → **rebuild host + run the DB-proof suite (the only check that catches DI boot breaks)** → scoped commit → update WORK_ITEMS/NOW. The owner runs the single batch deploy of all seven at the end.
