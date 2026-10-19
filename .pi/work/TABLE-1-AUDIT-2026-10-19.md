# Table 1 audit — evidence and backlog (2026-10-19)

Prompt: [TABLE-1-AUDIT-PROMPT-2026-10-18.md](../handoff/TABLE-1-AUDIT-PROMPT-2026-10-18.md).  
Owner rhythm: [OWNER-DEV-RHYTHM-2026-10-19.md](../OWNER-DEV-RHYTHM-2026-10-19.md).  
Baseline map: [TABLE-1-IDEMPIERE-MAP.md](../TABLE-1-IDEMPIERE-MAP.md).

**Evidence run:** git `f56ae886` pushed; Table 1 deliverable 2026-10-19. **WI-OI-120ge:** `infra/compose/docker/pnpm-workspace.yaml` adds `document-lifecycle` + `posting-rules`; profile + `.env.example` add `WORKFORCE_API_URL` → `pnpm audit:configuration-deployment-profile` **PASS** (2026-10-19). UAT tip **`1d8d2634`** / CMMS mig **22**.

---

## 1. Reconciliation matrix (29 rows)

Legend: **UAT†** = in owner UAT compose history / local configuration-local stack (cmms, workforce, geospatial, module-host ERP modules, analytics, connector per plan §7B). **Meta** = dictionary windows in git (`window-baselines.generated.ts` / module `dictionary/`). **T2** = defer engine proof to [TABLE-2-ENGINES.md](../TABLE-2-ENGINES.md).

| # | Area | Folder | Repo evidence | UAT† | Meta | T2 | E2E UAT | Verdict | Gap (1 line) | Phase | WI-OI |
|---|------|--------|---------------|------|------|-----|---------|---------|--------------|-------|-------|
| 1 | Platform & tenant | control plane, tenancy, org | `packages/auth-nest`, `packages/tenancy-nest`, settings org UI | Yes | N/A | — | Partial (journey sign-up) | Enhance | R5 on all modules; org publish journey hardening in `f56ae886` | 1–3 | 120w, 120bk, 120ax |
| 2 | AD & UI | module-sdk, configuration | `packages/module-sdk`, `pnpm modules:catalog` | Yes | Partial | F0 | Partial CMMS | Enhance | F0 every ERP screen; Table 2 F0.5 inventory | 1–4 | 120f, 120fp |
| 3 | Partners | kernel `/parties` | `apps/workflow-platform/app/(app)/parties`, contracts parties | Yes | Partial | — | No | Enhance | Party on PO/SO/invoice lines | 5B | T4 track |
| 4 | Products & pricing | `product-catalogue` | `modules/product-catalogue`, host in `modules.json` | Yes | 8 | — | Isolated | Enhance | Price into Orders/Proc | 4–5 | 112 |
| 5 | Inventory | `universal-inventory` | `modules/universal-inventory`, mig 5 | Yes | 6 | **Yes** | No | Enhance | T2 UAT + docker workspace deps | 5A | 091, 120fl–gb |
| 6 | P2P | procurement, spend | `modules/universal-procurement`, spend quarantined/off stack | Proc yes | Hard UI | **Yes** | No | Enhance | Metadata UI; receipt leg; F2 AP | 5B | 092 |
| 7 | O2C | orders, AR | orders UAT; `accounts-receivable` not in compose profile | Orders | Hard UI | Partial | No | Implement | AR on compose; metadata; shipment | 5C | 093, M-AR |
| 8 | AR | `accounts-receivable` | module code; 120bj web zero-mock on UAT | No | None | Partial | No | Implement | SDK + compose + windows | 5C | M-AR0 |
| 9 | AP | proc → finance | match APIs in procurement | Partial | — | **Yes** | No | Enhance | Vendor bill metadata + F2 | 5B–5C | 092 |
| 10 | Payments | finance treasury | sub-domain in `financial-operations` | No | — | **Yes** | No | Enhance | After AR/AP exist | 5C | 094 |
| 11 | Treasury | finance | treasury code paths | Partial | — | — | No | Implement | Real bank ingest; no fake balances | 5C | M-TRE |
| 12 | GL | `financial-operations` | GL windows 5; mig 11 | Yes | 5 | **Yes** | No | Enhance | F2 all events; F2.9 sign-off | 5A | 094, 120ga–gb |
| 13 | Tax | `tax-configuration` | module exists | No | — | — | No | Implement | Compose + line tax | 5+ | — |
| 14 | Multi-currency | `multi-currency` | module exists | No | — | — | No | Implement | Rates + wire ERP | 5+ | — |
| 15 | Costing | finance costing | sub-domain code | No | — | **Yes** | No | Enhance | Receipt/issue cost + F2 | 5D | M-COST |
| 16 | Budget | finance budgeting | sub-domain code | No | — | — | No | Implement | Encumbrance on req/PO | 5D | M-BUD |
| 17 | Fixed assets | finance FA | sub-domain code | No | — | — | No | Implement | Depreciation; CMMS link T6 | 5D/6 | M-FA |
| 18 | Period close | finance close | F2.8 coded | Partial | — | **Yes** | No | Enhance | Checklist UI + F1 all docs | 5D | 120gc track |
| 19 | Consolidation | finance | sub-domain code | No | — | — | No | Implement | Group eliminate | 5D | M-CONS |
| 20 | MRP | — | plan U24 | No | — | — | No | Net-new | Not built | 6+ | U24 |
| 21 | Projects | — | plan U25 | No | — | — | No | Net-new | Not built | 6+ | U25 |
| 22 | RMA | — | plan U26 | No | — | — | No | Net-new | Not built | 6+ | U26 |
| 23 | CMMS | `physical-operations-cmms` | cmms-api, 8 windows; mig 22 sign-off | Yes | 8 | — | **Partial** | Enhance | Journey 0 blockers after `f56ae886`; Phase 1 exit | 1 | 120bi/bk/be |
| 24 | Helpdesk/CRM | CMMS requests, parties | requests window; no pipeline | Partial | Partial | — | No | Net-new ext | §7D unless scoped | 6+ | 108 |
| 25 | Workflow | `workflow-studio` | definitions; limited UAT | Partial | — | F1 | No | Enhance | Approval queue Phase 4 | 4 | — |
| 26 | POS | — | — | No | — | — | No | Net-new | — | ext | — |
| 27 | Commission | — | — | No | — | — | No | Net-new | — | ext | — |
| 28 | Reporting | `analytics-studio` | UAT service | Yes | Partial | Post-F2 | No | Enhance | S8 + finance reports | 4+ | 103 |
| 29 | Integrations | connector, comms | connector UAT; comms off | Partial | — | — | No | Enhance | Certified connectors S14 | 4+ | — |

---

## 2. Corrections to TABLE-1-IDEMPIERE-MAP.md

Applied in map file (2026-10-19):

- UAT tip **`1d8d2634`** / CMMS mig **22** (was `3bc0c1f`).
- Row **23:** sign-off **deployed**; E2E still **partial** until journey **0 blockers** with `f56ae886` multiselect fix.
- Outcomes: maintenance path includes sign-off API; closure blocked on journey evidence only.

---

## 3. End-to-end outcomes

| Outcome | Status | Evidence |
|---------|--------|----------|
| Maintenance: request → assign → execute → **sign-off/close** | **Partial** | UAT mig 22 + supervisor sign-off API; journey `e55hku` failed technician path (fixed in git); re-run needed |
| P2P | **Partial (git)** | Minimal flow + F0 actions + `proof:minimal-p2p`; no UAT journey yet |
| O2C | **Partial (git)** | Minimal flow + F0 actions + `proof:minimal-o2c`; AR still off compose |
| Inventory receipt → subledger → GL | **Not met** on running stack | Table 2 complete in git `0a0e787+`; local profile missing inventory docker deps (audit 2026-10-19) |
| Phase 1 CMMS exit (plan v3) | **Not met** | Checklist row 1 open until 0-blocker journey + owner tick |

---

## 4. Duplication vs Table 2

**Defer to Table 2 closure (do not re-implement in Table 1):** rows **5, 6 (receipt/posting leg), 9, 12, 15, 18** — F0–F2 engines, Finance mig 10–11, Inventory mig 5, relay HTTP proofs ([TABLE-2-UAT-CLOSURE.md](../TABLE-2-UAT-CLOSURE.md)).

**Independent Table 1 work (not Table 2):** rows **1, 2, 3, 4, 7, 8, 10, 11, 13, 14, 16, 17, 19, 23–25, 28–29** — metadata, compose, parties, AR deploy, CMMS Phase 1 journey, connector certification.

---

## 5. Prioritized backlog (owner order)

1. **Finish CMMS Phase 1 (row 23)** — local journey 0 blockers; no redeploy for journey-only fix (`f56ae886`).
2. **Table 2 local profile unblock** — add `document-lifecycle` + `posting-rules` to Docker workspace so inventory/finance stack builds locally (feeds rows 5–6, 12).
3. **Row 7/8 — AR on local compose** — M-AR0 SDK + profile entry (hard gate for O2C).
4. **Row 3 — parties on transactional docs** — procurement/orders first touchpoint.
5. **Row 6 — procurement metadata UI** — replace hard-coded screen (after F0 pattern from CMMS/Inventory).

T3 (**WI-OI-120ad**) stays **after** Table 1 audit sign-off per owner 2026-10-19.

---

## 6. Proposed task cards (top 5, not Table 2)

| Card | Title | Status |
|------|-------|--------|
| [WI-OI-120gd](../tasks/WI-OI-120gd.md) | CMMS Phase 1 journey green on local compose | Proposed → owner waived per dev rhythm |
| [WI-OI-120ge](../tasks/WI-OI-120ge.md) | Local compose: inventory Table 2 docker workspace deps | Proposed |
| [WI-OI-120gf](../tasks/WI-OI-120gf.md) | AR module on configuration-local profile (M-AR0) | Proposed |
| [WI-OI-120gg](../tasks/WI-OI-120gg.md) | Parties required on procurement order lines (slice) | Proposed |
| [WI-OI-120gh](../tasks/WI-OI-120gh.md) | Procurement first metadata window (PO header) | Proposed |

---

## 7. Verification

Docs-only session: `pnpm verify --audits` (after map/NOW updates).
