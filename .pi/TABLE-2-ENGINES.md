# Table 2 — architectural engines (ADR-0033 / WI-OI-120)

**Owner rule (2026-10-18):** Finish this list (code + UAT evidence) before any other product track.  
**Canonical deploy tip for UAT:** release commit **`930272f`** or later on `feat/gigaops-convergence-core` (F1 + F2 through F2.8).

Legend: **Code** = merged in git on the Table 2 branch. **UAT** = owner deploy + recorded evidence in `.pi/work/WI-OI-120.md`.

| # | Engine | Task / slice | Code | UAT / evidence | Notes |
|---|--------|--------------|------|----------------|-------|
| 0 | **Prerequisite U2** | Module host HTTP, signed context | Done (ancestry) | On UAT | Needed before F0 HTTP proofs. |
| **F0 — Metadata windows (D1)** |
| 1 | F0.1 | Contract + compiler (decimals, capability checks) | Done | — | WI-OI-120f |
| 2 | F0.2 | Module dictionary publish + window activation | Done | On UAT (prior releases) | |
| 3 | F0.3 | Record dispatcher (`@gigalibs/module-sdk`) | Done | — | |
| 4 | F0.4 | `MetadataWindow` renderer | Done | — | |
| 5 | F0.5 | Inventory metadata windows + domain | Done (`bf049e1`, `2104f91`, …) | **Open** | [WI-OI-120fp](tasks/WI-OI-120fp.md): deploy + `pnpm e2e:uat:inventory` |
| 6 | F0.6 | “Add new” from pickers (Catalogue → Inventory) | Done (git) | Partial | Playwright in `e2e/run-uat-walkthrough.sh` |
| **F1 — Document lifecycle (D2)** |
| 7 | F1.1 / E1 | `@gigalibs/document-lifecycle` package | Done `0d29f8f` | — | [WI-OI-120fl](tasks/WI-OI-120fl.md) |
| 8 | F1.2 / E1 | Finance journal drafts on lifecycle runner | Done `0d29f8f` | **Open** | [WI-OI-120fm](tasks/WI-OI-120fm.md); prove on UAT after deploy |
| 9 | F1.3 | Inventory receipt (or other doc) lifecycle graph | Done | — | [WI-OI-120fy](tasks/WI-OI-120fy.md); `complete` via document-lifecycle |
| 10 | F1.4 | Period-lock guard on financial transitions (cross-module) | Partial | — | Finance drafts; extend per ADR P1-07 |
| **F2 — Posting & reconciliation (D3)** |
| 11 | F2.1 / E3 | Inventory outbox → Finance inbox relay | Done `8a5b487` | **Open** | [WI-OI-120fq](tasks/WI-OI-120fq.md); relay keys + live delivery |
| 12 | F2.2 / E2 | Posting policy + book/period + GL handoff | Done `14845ae` | **Open** | [WI-OI-120fr](tasks/WI-OI-120fr.md) |
| 13 | F2.3 | Inbox reconciliation summary | Done `1e54d17` | **Open** | [WI-OI-120fs](tasks/WI-OI-120fs.md) |
| 14 | F2.4 | Journal register + `GET …/posting-reconciliation` | Done `631c4c7` | **Open** | [WI-OI-120ft](tasks/WI-OI-120ft.md); **Finance migration 10** |
| 15 | F2.5 | UI: awaiting posting / posted / rejected on documents | Done `1fadfa4` | **Open** | [WI-OI-120fv](tasks/WI-OI-120fv.md); Inventory migration **5** |
| 16 | F2.6 | Scheduled reconciliation job (daily) | Done | **Open** | [WI-OI-120fu](tasks/WI-OI-120fu.md); migration **11** on deploy |
| 17 | F2.7 | Isolated HTTP handshake cert (Inventory↔Finance) | Done `1fadfa4` | — | [WI-OI-120fw](tasks/WI-OI-120fw.md); `verify-inventory-finance-relay-http.mjs` |
| 18 | F2.8 | Period close blocked while posting gaps exist | Done `930272f` | **Open** | [WI-OI-120fx](tasks/WI-OI-120fx.md); guard on period lock + Inventory subledger lock |
| 19 | F2.9 | Accounting review of default posting rules | Not started | — | Human gate (WI-OI-119 P1-28) |
| **Tooling (Table 2)** |
| 20 | — | Non-interactive UAT Playwright | Done `36105e4` | **Open** | `e2e/uat.env` + `pnpm e2e:uat:inventory` |

## What “Table 2 complete” means

All rows **1–14** (and **0**) have **Code = Done** and **UAT = Done** with evidence; rows **15–19** are either Done or explicitly deferred by the owner in `.pi/NOW.md`.

## Next work (always pick the first open row)

1. **Owner — #5 [WI-OI-120fp](tasks/WI-OI-120fp.md):** Deploy **`631c4c7`+**, Finance migration **10**, relay keys (`generate-inventory-finance-relay-credentials.sh`), `pnpm e2e:uat:inventory`.
2. **Owner — #11–14:** Same release: complete a receipt on UAT; confirm Finance inbox + `GET /financial-operations/v1/subledger/inventory/posting-reconciliation` → `balanced: true` when book/period/cost profile exist.
3. **Owner — deploy:** release **`1fadfa4`**; set `FINANCE_INVENTORY_POSTING_DATABASE_URL` (= Inventory DSN) for POSTED sync; [WI-OI-120fp](tasks/WI-OI-120fp.md).
4. **Owner — deploy:** ship F2 stack (**F2.5–F2.8** on branch) per [WI-OI-120fp](tasks/WI-OI-120fp.md).
5. **Agent — #10:** F1.4 period-lock guard on financially relevant Inventory transitions (extend Finance pattern).
6. **Owner — commit F1.3** when ready; deploy with Table 2 stack (**`930272f`**+).

*Last updated: 2026-10-18 (F2.8 in git; deploy tip branch tip after F2.8 commit; Finance migrations 10–11, Inventory 5).*
