# Wave: Table 1 module closure (owner 2026-10-19)

**Rule for this wave:** no commits until owner says so; E2E after code wave; agents do not stop for per-slice approval.

## iDempiere vs GigaLibs

Table 1 maps **iDempiere business areas** (reference ERP model) to **GigaLibs modules** reimplemented on our stack: Nest module APIs, PostgreSQL schemas, Next.js BFF + metadata (`module-sdk`), Docker compose profile — **not** iDempiere Java/AD. See [TABLE-1-IDEMPIERE-MAP.md](TABLE-1-IDEMPIERE-MAP.md).

## Definition of “100%” for this wave

| Tier | Meaning |
|------|--------|
| **A — Local compose healthy** | Module API + migrations on `configuration-local`; BFF signed gateway; metadata windows where applicable; `proof:*-compose-health` |
| **B — Table 1 git complete** | Tier A + root `pnpm build` / `pnpm test`; no mock UI on primary routes |
| **C — UAT + E2E** | Owner deploy, Security review, journey evidence (after wave commit) |

This wave targets **Tier B** for every row marked **Implement** in the audit. **Tier C** is explicitly after the wave (owner E2E).

## Module closure matrix (single tracker)

| Module | iDempiere area | Tier now | Tier B remaining |
|--------|----------------|----------|------------------|
| Control plane | Platform | B | — |
| CMMS | Maintenance | B on UAT | Journey 0 blockers (env password) |
| Workforce / Geospatial / Analytics / Connector | Supporting | B partial | Certification only |
| Product catalogue | Products | B partial | Price into Orders/Proc |
| Inventory | WMS | B code / T2 | Table 2 UAT closure (separate owner deploy) |
| Procurement | P2P | B git | UAT journey |
| Orders | O2C | B git | Shipment/ATP; UAT journey |
| **Accounts receivable** | AR | **A blocked** | Fix `DATABASE_URL`; `proof:ar-compose-rebuild`; done |
| Financial operations | GL/AP | B partial | Table 2 posting proofs |
| **Tax** | Tax | Coded, no compose | M-AR0-style: workspace, Docker, compose, gateway, metadata |
| **Multi-currency** | FX | Coded, no compose | Same as Tax |
| Treasury / Budget / FA / Consolidation | Finance ext | Code only | Full implement (later wave) |
| Tax + Currency | — | — | **Wave 2 (in progress)** |
| Spend | P2P ext | Quarantined | Out of wave |
| Communications | Integrations | Off stack | Out of wave |
| MRP / Projects / RMA | — | Net-new | Out of wave |

## Execution order (agents)

1. **Unblock AR** — owner aligns `DATABASE_URL` with `gigalibs-postgres:5440` (or agent adds non-destructive sync helper from `docker/.env` if present).
2. **Tax + Multi-currency** — clone M-AR0 pattern (WI-OI-120hj / 120hk): runtime manifests, Docker workspace, compose services, credentials, gateway in `module.yaml`, regen gateways.
3. **CMMS journey** — `E2E_JOURNEY_PASSWORD` then WI-OI-120gd.
4. **O2C/P2P** — compose E2E extensions (AR in minimal O2C flow) after AR healthy.
5. **Table 2** — owner deploy track; not mixed into this wave’s commits.

## Evidence when wave ends

- `pnpm verify` (full)
- `pnpm proof:ar-compose-rebuild` (+ tax/currency health scripts when added)
- Owner-scheduled E2E batch
