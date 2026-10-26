# Phase 4 — the engine every module needs: status & this session's gap fills (2026-10-26)

**Honest summary:** Phase 4's shared engine **already exists, largely as dedicated packages** — it was built ahead of
the module conversions, as the plan intended ("shared capabilities brought forward"). So Phase 4 is **not** greenfield;
its remaining work is (a) a few genuine gaps with no package yet, and (b) the integration-heavy **last step — applying
the engine to CMMS and Workforce** — plus the Accounting/Security reviews. (b) needs running modules and cannot be
"closed" in an autonomous contracts-only pass; it is multi-session per-module work. This session filled the tractable
**pure-logic gaps**.

## Capability → where it lives (verified by recon)

| Capability | State |
| --- | --- |
| **E1** document lifecycle | ✅ `packages/document-lifecycle` (transition runner + tests) |
| **S2** accessibility | Standard/audits: `audit:design-tokens` enforced; X3 manual audit still pending |
| **S3** money fields | ✅ `packages/multi-currency`, `invoices-core`, finance contracts |
| **S4** quantity fields | ~ present in inventory/domain contracts; no dedicated shared package |
| **S5** workspace customization | ✅ `packages/custom-fields-nest`, `configuration-core` |
| **S6** dictionary menus | ✅ `configuration-core` (dictionary windows) |
| **S15** gateway from declared routes | ✅ `packages/module-registry`, `host-kit` (WI-OI-083) |
| **R10** export rights | ~ rbac export codes (`tenant:export`, `configuration:export`); no unified rights layer |
| **R6** approval policies | ✅ `packages/posting-rules` + procurement approval-policies |
| **R7** document-action access | ~ rbac; not a distinct shared layer |
| **S7** processes | ✅ `packages/rule-engine-universal`, workflow |
| **S9** record history | ✅ `packages/audit-core` / `audit-nest` |
| **S8** reports & info windows | ~ web reports-workbench + contracts; no shared engine package |
| **S10** attachments | ~ partial (one implementation) |
| **S11** translations | ✅ `packages/i18n` |
| **S12** document templates | ~ `email-templates` + partial |
| **S13** numbering | 🟢 **GAP → built this session** (`contracts/numbering`) |
| **S14** import & export | ~ `forms-engine-nest` / `privacy-gdpr` export |
| **R8** record sharing | 🔴 **gap** — needs a persisted share model (flagged) |
| **R9** column rules | 🟢 **GAP → built this session** (`contracts/rbac/column-rules`) |
| **R12** explainable access | 🟢 **GAP → built this session** (`contracts/rbac/explainable-access`) |
| **X4** my-work inbox | ✅ `notifications-core` + module `inbox.service` |
| **X5** search everywhere | 🔴 **gap** — needs a search index/integration (flagged) |
| **Apply to CMMS + Workforce** | 🔴 **not done** — CMMS/gigaops do not import the engine packages yet; the integration-heavy last step |

## Built this session (pure engine gaps, contracts + tests)

- **S13 numbering** (`contracts/src/numbering/`): `NumberingSeriesSchema`/`NumberingPatternSchema`, `renderDocumentNumber`
  (`PO-{YYYY}-{SEQ:5}` → `PO-2026-00042`) and `sequencePeriodKey` (NEVER/YEARLY/MONTHLY/DAILY). The pure core;
  atomic sequence allocation (a per-series, per-period counter) is the thin service on top (flagged).
- **R12 explainable access** (`contracts/src/rbac/explainable-access.ts`): `explainAccess(grants, required)` → decision +
  reason (wildcard-all / family-wildcard / exact / not-granted / malformed) + the matching grant + a one-line message.
- **R9 column rules** (`contracts/src/rbac/column-rules.ts`): `resolveColumnAccess` / `visibleColumns` — per-column
  view/edit gating (edit requires view), wildcard-aware.

Tests: `numbering.test.ts` (5), `explainable-access.test.ts` (6), `column-rules.test.ts` (6). Contracts typecheck green;
new files lint clean. These are the "build once" layer; wiring each into module screens/services is per-module work.

## Remaining to truly close Phase 4 (not an autonomous pass)

- **Apply the engine to CMMS and Workforce** — wire document-lifecycle, custom-fields, audit history, i18n, numbering,
  approval policies, column rules, inbox, etc. into those two modules' services/screens, and prove it. Integration work
  that needs running modules and the Done checklist.
- **Remaining gaps:** R8 record sharing (persisted share model), X5 search-everywhere (index), and a unified home for the
  partial ones (S4 quantity, S8 reports, S10 attachments, S12 templates, S14 import/export, R7/R10 rights).
- **Reviews:** Accounting reviewer for posting; Security for the access layers.
