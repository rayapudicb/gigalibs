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
| **R8** record sharing | 🟢 **GAP → built this session** (`contracts/rbac/record-sharing`, pure resolver; per-module share table flagged) |
| **R9** column rules | 🟢 **GAP → built this session** (`contracts/rbac/column-rules`) |
| **R12** explainable access | 🟢 **GAP → built this session** (`contracts/rbac/explainable-access`) |
| **X4** my-work inbox | ✅ `notifications-core` + module `inbox.service` |
| **X5** search everywhere | 🟢 **GAP → built this session** (`contracts/search`, pure merge+rank; per-module providers + index flagged) |
| **Apply to CMMS + Workforce** | 🟡 **started** — S13 numbering now wired into CMMS (work-order + request numbers go through `renderDocumentNumber`); the rest of the per-module wiring remains |

## Built this session (pure engine gaps, contracts + tests)

- **S13 numbering** (`contracts/src/numbering/`): `NumberingSeriesSchema`/`NumberingPatternSchema`, `renderDocumentNumber`
  (`PO-{YYYY}-{SEQ:5}` → `PO-2026-00042`) and `sequencePeriodKey` (NEVER/YEARLY/MONTHLY/DAILY). The pure core;
  atomic sequence allocation (a per-series, per-period counter) is the thin service on top (flagged).
- **R12 explainable access** (`contracts/src/rbac/explainable-access.ts`): `explainAccess(grants, required)` → decision +
  reason (wildcard-all / family-wildcard / exact / not-granted / malformed) + the matching grant + a one-line message.
- **R9 column rules** (`contracts/src/rbac/column-rules.ts`): `resolveColumnAccess` / `visibleColumns` — per-column
  view/edit gating (edit requires view), wildcard-aware.

Tests: `numbering.test.ts` (5), `explainable-access.test.ts` (6), `column-rules.test.ts` (6). Then a second pass added
the last two pure gaps and the first module-apply slice:
- **R8 record sharing** (`contracts/src/rbac/record-sharing.ts`): `resolveRecordShareAccess` (shares + principal →
  VIEW/EDIT/null; EDIT wins; user- and role-grantees) + `CreateRecordShareSchema`. Tests (6).
- **X5 search everywhere** (`contracts/src/search/index.ts`): `scoreSearchResult` + `rankSearchResults` — the
  deterministic merge/rank of every module's hits (exact > starts-with > contains > subtitle, recency tiebreak).
  Tests (4).
- **S13 → CMMS (first apply slice):** CMMS work-order and maintenance-request numbering now go through the shared
  `renderDocumentNumber` (identical `WO-######` / `REQ-######` output) instead of hand-rolled `padStart`. CMMS
  typecheck green.

All pure cores: contracts typecheck green, source files lint clean (420+ contracts tests). Wiring each into module
screens/services is per-module work.

## Remaining to truly close Phase 4 (not an autonomous pass)

- **Apply the rest of the engine to CMMS and Workforce** — document-lifecycle, custom-fields, audit history, i18n,
  approval policies, column rules, record sharing, inbox, search providers, etc. into both modules' services/screens,
  and prove it. (S13 numbering is now wired into CMMS as the first slice.) Integration work that needs running modules
  and the Done checklist.
- **A unified home for the partial capabilities:** S4 quantity, S8 reports, S10 attachments, S12 templates, S14
  import/export, R7/R10 rights (each exists in part; consolidating them is refactor/integration, not greenfield).
- **Per-gap persistence/integration:** R8 a per-module share table + authorise-read/write wiring; X5 per-module search
  providers + an index.
- **Reviews:** Accounting reviewer for posting; Security for the access layers.

## Update 2026-10-27 — last pure-core gap closed; the rest is integration

- **X5 aggregator core built** (`90e0f48e`, `contracts/search`): `SearchProvider` + `SearchContext` and the pure
  `aggregateSearch(providers, query, context, options)` — parallel query, per-provider failure isolation
  (`failedModules`), malformed-row drop, dedup, then `rankSearchResults`. Tests 11/11; typecheck + biome clean. This
  was the **last cleanly build-once pure-core gap**; the concrete per-module providers + a host endpoint + the search
  box are integration.
- **Honest ceiling:** with that, the autonomously-completable Phase 4 work (the shared pure cores) is **done**. Every
  remaining item above — apply the engine into CMMS's services/screens, consolidate the partial capabilities, add the
  per-gap persistence (R8 share table, X5 providers/index) — is per-module integration that needs the **running stack**
  to prove (and the Accounting/Security reviews need named people). Building it blind would repeat exactly the
  unverified-integration pattern WI-OI-119 flagged. The realistic path: **deploy the release** (so there is a running
  stack), then do the apply slices against it with real HTTP proofs, module by module.
