# Closing the remaining foundation work (owner decision, 2026-09-30)

The owner chose to finish the open ADR-0016 foundation work before starting the agriculture package.

## Order

1. **WI-OI-103 remainder:**
   - 103c: summaries, cache, limits, and a measured benchmark (95% of dashboard queries under 1 s at 10M rows);
   - 103f: proof on manufacturing data and the no-developer test;
   - retire the old engine: `v1/charts`, `v1/query/run`, `ChartService` and `runQuery`.
2. **WI-OI-104** (F8, F14): Connector Hub adapter framework, the bridge into Analytics, one scheduler and job runner,
   and retiring the connector copies in Analytics and the core API. **Done and live (Review); F8 and F14 closed.**
3. **WI-OI-105** (F15): places with boundaries; area and containment computed in code; place scope enforced in every
   module query. **Done and live 2026-09-30 (Review); F15 closed** (`.pi/work/WI-OI-105.md`).
4. **WI-OI-107** (F10): industry packs at the solution layer; Workforce's packs move into it. **Done and live 2026-10-01 (Review); F10 closed** (`.pi/work/WI-OI-107.md`).
5. **WI-OI-106** (F17): Reports v2, PDF and Excel.
6. **WI-OI-108:** rebuild the contained other-stream forms properly.
7. **Fresh install (found 2026-09-30 by the 104c worker smoke):** `prisma migrate deploy` on an empty database stops
   at two points, so a new client install fails. Fix before the agriculture package ships.
   - `20260924000000_tp2_durable_export_and_outbox` adds an enum value and uses it in the same transaction (55P04).
   - D2 finding A1: `20260927110000_phase3`, `…120000_phase4` and `…130000_phase5` alter the CMMS and Workforce schemas
     from the core, so they need those modules' migrations first. Their home is each module's own migrations.
   - Both are already applied locally; the fix must keep the local history valid (owner review).

8. **Core push intake (named by WI-OI-104f, owner option A, 2026-09-30):** the core API still takes pushed data
   (signed webhooks, checksum-verified file uploads, the events API) into its operational-intelligence data contracts
   and events, which exceptions and the Value page use.
   - Its pull side (REST, CSV over HTTP, PostgreSQL) is retired in favour of Connector Hub.
   - Next: move webhooks and file uploads into Connector Hub, and re-home the event pipeline as a capability, with the
     owner's decisions on the four core connection screens and on the test-tenant data (40 connections).

9. **F3 engine clean-up (added 2026-10-01, owner agreed):** WI-OI-102b decided one engine per job, but two retirements
   are not done: the core API's own workflow controller (`apps/playground-api/src/workflow.*`) moves into Workflow
   Studio, and the rules engines merge into one Rules capability module.

## Decisions (2026-09-30)

- **Jobs and scheduling (F14):** one kernel job interface with two infrastructure backends. The owner's words:
  "keep the logic redis and bullmq as a infrastructure layer pieces and then incorporate where ever needed".
  - **PostgreSQL job table:** durable schedules and runs, audit, retries; claimed with `SKIP LOCKED`.
  - **Redis and BullMQ:** the existing `@gigalibs/queue`, for high-volume or fast queues.
  - Each job type names its backend. Redis holds only transient queue state; the durable truth stays in PostgreSQL.
  - Redis joins the local stack as an infrastructure service.
- **Connector credentials (F8):** encrypted at rest in Connector Hub's own schema with a platform key from its
  environment. Never returned by the API or logged. An external vault can replace the key store later.
- **PDF (F17):** charts are rendered on the server (ECharts to SVG), laid out with `pdfkit` (already used by Accounts
  Receivable). Excel uses `exceljs` (already used by CMMS), with formula-injection protection.
- **Already decided by ADR-0016 and the agriculture plan §8:**
  - Connector Hub is the only integration path (F8).
  - Places are computed in code; PostGIS only with its own ADR and restore drill (F15).
  - Packs live at the solution layer (F10).
  - Speed target: 95% under 1 s at 10M rows.

## Working rules

- One piece at a time, each verified with `pnpm verify` and committed on the owner's "commit".
- Deploys and migrations on the local stack need the owner's OK. The benchmark runs in a throwaway PostgreSQL
  container, never in the owner's database.
