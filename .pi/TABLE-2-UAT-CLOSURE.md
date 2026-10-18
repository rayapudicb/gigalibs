# Table 2 — UAT closure runbook (owner)

**Release tip:** git **`0a0e787`** or later on `feat/gigaops-convergence-core`.  
**UAT today:** **`3bc0c1f`** — Table 2 Inventory/Finance stack is **not** live until you deploy.  
**Agents:** prepare evidence scripts and docs only; **do not** run `deploy-uat.sh --deploy`.

---

## A. One deploy closes most rows

Follow [WI-OI-120fp](tasks/WI-OI-120fp.md) end-to-end:

| Step | Closes Table 2 rows |
|------|---------------------|
| Security review + Postgres backup | (process) |
| Build/deploy from **`0a0e787`+** | **#5, #8, #10–16, #18, #20** (code on UAT) |
| Finance migrations **10–11**, Inventory **5** | **#14–16** |
| Relay keys + `FINANCE_INVENTORY_POSTING_DATABASE_URL` | **#11–15** |
| Live receipt → inbox → journal → `posting-reconciliation` balanced | **#11–14, #18** (negative test: gap blocks close) |
| `pnpm e2e:uat:inventory` (with `e2e/uat.env`) | **#5, #20**; supports **#6** |
| Record tag, backup id, run ids in `.pi/work/WI-OI-120.md` | all UAT rows |

Module-host already sets **`FINANCIAL_OPERATIONS_DATABASE_URL`** → F1.4 period guard active without extra env (optional `FINANCE_PERIOD_LOCK_DATABASE_URL` override).

---

## B. Row-by-row evidence to record in `.pi/work/WI-OI-120.md`

| # | Engine | Evidence |
|---|--------|----------|
| 5 | F0.5 | Playwright pass + `/inventory` warehouses grid screenshot or journey id |
| 6 | F0.6 | Same walkthrough: catalogue picker → item on receipt (partial OK if noted) |
| 8 | F1.2 | One journal draft submit/approve on UAT (lifecycle) |
| 10 | F1.4 | Complete receipt with **locked** period → refused; open period → succeeds |
| 11–14 | F2.1–F2.4 | Relay delivery log; inbox PROCESSED; reconciliation API JSON `balanced: true` |
| 15 | F2.5 | Receipt window shows Posted / Awaiting / Rejected as applicable |
| 16 | F2.6 | Next-day reconciliation job log or manual sweep output (no unbounded gaps) |
| 17 | F2.7 | Already certified in CI: `verify-inventory-finance-relay-http.mjs` + `PROOF_DATABASE_URL` |
| 18 | F2.8 | Attempt period lock with posting gap → 409; balanced → lock allowed |
| 19 | F2.9 | Accountant §6 in [F2.9 packet](work/F2.9-INVENTORY-RECEIPT-POSTING-ACCOUNTING-REVIEW.md) |
| 20 | Tooling | Playwright run id + tenant |

---

## C. Agent-side certifications (already green before deploy)

```bash
node scripts/verify-inventory-finance-relay.mjs
node scripts/verify-inventory-finance-posting-reconciliation.mjs
# Optional isolated DB:
# PROOF_DATABASE_URL=… node scripts/verify-inventory-finance-relay-http.mjs
```

---

## D. When Table 2 is **Done**

Update [TABLE-2-ENGINES.md](TABLE-2-ENGINES.md): every **UAT / evidence** column **Done** (or owner-deferred **#19** in NOW.md).  
Tick [WI-OI-120fp](tasks/WI-OI-120fp.md) Done when checklist complete.
