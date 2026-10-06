# Platform parity and beyond: the complete implementation plan

Date: 2026-10-06. Programme: WI-OI-120. Status: **Proposed; corrected 2026-10-06** after a read-only review (GPT,
against GigaLibs `7485aec` and iDempiere `9a80664`). The executable plan is `platform-implementation-plan.md`
(version 2); where the two differ, that plan governs.

> **Corrections in this revision.** (1) iDempiere does customize windows per client, role and user
> (`MUserDefWin`), so GigaLibs is not "ahead" on customization unless versioned preview and rollback are verified.
> (2) Field permissions are enforced on the server in the record dispatcher, not only in windows. (3) CMMS and
> Workforce relays are wired; only the chain that posts ERP documents to the ledger is missing. (4) Finance's
> source-document unique index lacks the document version ADR-0033 D3 requires. (5) Row-level security is forced in
> the running SDK modules, but Spend enables it without forcing it; "forced everywhere" is not established. (6) The
> 273 gateway entries are 265 routes and 8 unavailable declarations. (7) ADR-0018, accepted by the owner, keeps
> tenant-wide authority for platform roles; changing it is an amendment. (8) ADR-0003 and ADR-0006 are still
> Proposed. (9) Several items marked NEW extend existing decisions (menus, processes and messages are mapped in
> ADR-0019; several roles and delegated administration are in WI-OI-120p). Each item below is delivered as a card the owner approves first; this plan
grants no implementation, deployment or data authority by itself. Production stays NO-GO until G5–G7.

## 0. What this plan is

It consolidates what is already decided and planned, so nothing is built twice:

- **Decisions:** ADR-0003 (identity, persona, Workforce ownership), ADR-0006 (places), ADR-0007 (CMMS–Workforce
  handshake), ADR-0018 (organization hierarchy and scope), ADR-0019 (dictionary compiler), ADR-0020 (parties),
  ADR-0033 (metadata windows F0, document lifecycle F1, posting F2).
- **Plans:** `docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md` (functional parity, authoritative for business areas),
  `remediation-backlog.md` (U1–U29), `tenant-to-value-all-modules-implementation-and-e2e-plan.md` (acceptance),
  WI-OI-120m (journey), WI-OI-120n (batch 1), WI-OI-120p (access model and people administration).

It adds only what no decision or card covers yet (marked **NEW**), the "better than iDempiere" commitments (§4), a
measurable user-experience standard (§5), one sequence (§6) and a definition of 100 % (§7).

iDempiere (`/Users/rayapudi/idem`, GPL v2) is a functional reference only: concepts, never code (decision D8).

## 1. Overlap check: the 2026-10-06 "corrected order" against existing decisions

| Proposed step | Already decided or planned | Built | New in this plan |
| --- | --- | --- | --- |
| Several roles per person, inheritance | — | No | **NEW** (WI-OI-120p slice 2) |
| One permission format and matcher | ADR-0016 F16 (colon codes); CMMS, Workforce, Geospatial chose dotted codes | Batch 1 accepts both | **NEW:** one vocabulary and one SDK matcher |
| One scope model, enforced everywhere | ADR-0018 (units, versions, grants, `organization` claim); ADR-0006 (places) | Units and places built; enforcement uneven | Enforcement in every module (WI-OI-120p slice 9) |
| Approval policies (amount limits, approve own) | ADR-0033 D2: approval as a transition guard | No | **NEW:** configurable approval policy |
| Personas from roles | ADR-0003 D5 (persona is a routing lens, never a permission) | Lens built | Derive defaults from roles; "View As" for admins only |
| Record and column rules | ADR-0003 D9 (`user_resource_acls` to converge); ADR-0033 D1 (field permissions) | Field permissions in windows only | Record rules (**NEW** card) |
| Platform roles inside a workspace | ADR-0003 D2 ("strictly decoupled", Proposed); ADR-0018 (accepted) keeps tenant-wide authority for platform roles | Any platform role gets workspace-wide data authority when a member | An ADR-0018 amendment for the owner (plan D2, R11) |
| One people list | ADR-0003 D7: Workforce `workforce_resources` is the worker | Batch 1 links logins | Converge `wfo_workers` (U20a) and CMMS's copy (ADR-0007 projections) |
| One department model | ADR-0018 (units replace departments); ADR-0003 D9 | Units built; legacy departments and CMMS departments remain | Retire both (card) |
| One place hierarchy | ADR-0006: Geospatial is the system of record; others hold `site_ref` | CMMS keeps CAFM spaces with optional `site_ref` | CMMS spaces become rooms under a Geospatial site (EAM-001) |
| Set-up wizard | — | Per-module panels only | **NEW** card |
| Shared document engine | ADR-0033 D2 (F1): shared primitives, each document its own graph | **Not built** | — (F1 as decided) |
| Posting and cross-module | ADR-0033 D3 (F2); U22, U23 | Finance posts exactly once; relays not wired | — (F2, U22 as decided) |
| Field logic, menus, processes, reports, money, translations, print | ADR-0033 D1 (display, read-only, mandatory rules); ADR-0019 maps menus, processes and messages | Partly | Extensions completing ADR-0019 and ADR-0033; money and quantity fields and print formats are new |
| Gateway generated from declared routes | ADR-0019 tenet 11 (no table CRUD) | 265 routes and 8 unavailable declarations, hand-listed | Generate only explicitly exported, policy-annotated routes (S15) |

## 2. Platform parity matrix (iDempiere mechanism → GigaLibs)

Statuses: **Built** (verified on UAT), **Partial**, **Planned** (decided, card exists), **Missing** (no card),
**Ahead** (GigaLibs exceeds iDempiere).

### 2.1 Screens and metadata

| iDempiere | GigaLibs | Status | Card |
| --- | --- | --- | --- |
| `AD_Window`/`AD_Tab`/`AD_Field` windows | F0 metadata windows (grid, sections, parent-child tabs, lookups, actions) | Built; 19 windows in 3 of 23 modules | U8–U20, U29 conversions |
| `AD_Reference`, `AD_Val_Rule`, info windows | Lookup resolvers, "Add new"/"Open" (F0.6) | Built | — |
| Display, read-only, mandatory logic | Safe-AST rules; action visibility | Partial (fields) | **Renderer completion** (NEW) |
| `AD_Menu` with role access | `module.yaml` menus, persona lens, permission | Partial | **Dictionary menus** (NEW) |
| `AD_Process` and parameters, reports | Hand-built panels | Missing | **Processes and reports in the dictionary** (NEW) |
| Print formats, PDF documents | — | Missing | **Document templates** (NEW) |
| `_Trl` translations | Shell i18n only | Partial | **Dictionary translations** (NEW) |
| Amount type with currency precision | Minor units typed by people | Missing | **Money field** (NEW) |
| Change log per record | Audit tables; no per-record timeline | Partial | Record history (S9) |
| Attachments, notes | Module-specific (CMMS manuals, eSign) | Partial | **Attachments and notes** (NEW) |
| Document numbering (`AD_Sequence`) | Each module numbers its own | Partial | **Configurable numbering** (NEW) |
| Import loader (`I_*` tables) | Catalogue CSV; CMMS import (protected) | Partial | **Dictionary import/export** (NEW) |
| Window customization per client, role and user (`MUserDefWin`) | Per-workspace overlays with versioned publish and activate | Comparable; ahead only once preview and rollback are verified (S5) | S5 |

### 2.2 Document lifecycle, posting, workflow

| iDempiere | GigaLibs | Status | Card |
| --- | --- | --- | --- |
| `DocAction`/`DocumentEngine` | F1 shared primitives, per-document graphs (ADR-0033 D2) | Planned (not built) | F1 |
| `Doc_*` posting with accounting schema | F2 event-to-ledger, reconciliation (ADR-0033 D3) | Partial: Finance's source-document index lacks the document version; CMMS and Workforce relays exist; the ERP posting chain is not wired | E2, E3, E4 |
| `MMatchPO`/`MMatchInv` | Procurement match service | Partial (not fed) | U9, U22 |
| `AD_Workflow` approvals | Workflow Studio; Approval Queues | Partial (Studio not deployed) | U21, U29 |
| Period control everywhere | Finance only; F1 period guard planned | Partial | F1, U18 |

### 2.3 Access control

| iDempiere | GigaLibs | Status | Card |
| --- | --- | --- | --- |
| `AD_Role` with window/process/form/workflow access | Permissions per module action; module roles (batch 1) | Partial | WI-OI-120p |
| `AD_User_Roles` (many roles, chosen at login) | One base role + one custom role | Missing | WI-OI-120p slice 2 |
| `AD_Role_Included` (inheritance) | Base roles only | Missing | WI-OI-120p |
| `AD_Role_OrgAccess`, "access all orgs" | Unit grants (ADR-0018), places (ADR-0006) | Built; enforcement uneven | WI-OI-120p slice 9 |
| Central access SQL (`MRole.addAccessSQL`) | SDK helpers per module (`organizationReadCondition`) | Partial | WI-OI-120p slice 9 |
| `AD_Document_Action_Access` | Per-action permissions in code | Partial | **Configurable action access** (NEW) |
| `AmtApproval`, `IsCanApproveOwnDoc` | Maker-checker coded per module | Missing | **Approval policies** (NEW) |
| `AD_Record_Access`, `AD_Column_Access` | Field read and write permissions enforced in the record dispatcher | Partial (not yet reports and exports) | R8 record sharing, R9 column rules (ADR-0003 D9) |
| Export, report rights; query limits | — | Missing | WI-OI-120p |
| User level (System/Client/Org) | Platform vs workspace vs unit | Built | — |
| Signed per-call context, row-level security, maker-checker | — | Ahead only once verified per module (Spend enables RLS without forcing it) | D6, R5 |

### 2.4 Tenancy and master data

| iDempiere | GigaLibs | Status | Card |
| --- | --- | --- | --- |
| `AD_Client`/`AD_Org` on every row | Workspace isolation (forced RLS) and units | Built | — |
| Initial Client Setup | Trial workspace; per-module panels | Partial | **Set-up wizard** (NEW) |
| One business partner (`C_BPartner`) | Parties (ADR-0020) | Partial | U6 |
| One person per employee | Three lists (WFO workers, Workforce resources, CMMS copy) | Partial | U20a, ADR-0007, people convergence (NEW) |
| One location model | Geospatial places and CMMS spaces | Partial | EAM-001, place convergence (NEW) |
| One department tree | Units, legacy departments, CMMS departments | Partial | Department retirement (NEW) |
| Self-service tenant creation and plans | Trial sign-up, entitlements | Ahead once verified (T8, T11, X2) | T8, T11 |

## 3. Functional parity

`docs/architecture/IDEMPIERE_FUNCTIONAL_MAP.md` §2 remains the authoritative business-area table. Since its 2026-10-05
check: Product Catalogue (U7) and the general ledger (U12) run on metadata windows on UAT; Inventory's windows are
deployed (F0.5); CMMS screens reach their API (U19a). Every other row stands. Manufacturing, projects, returns and
mobile remain U24–U27.

## 4. Better than iDempiere: commitments

Each is a card with a measurable acceptance in the journey suite.

1. **First value in under 30 minutes** from sign-up: guided set-up (organization, roles, sites, first module set-ups)
   and industry solution packs, without a consultant.
2. **Every workspace configures itself:** versioned publish, preview and roll back of windows, menus, roles and
   processes (iDempiere customizes windows per client, role and user, in place; the difference is versioning,
   preview and rollback, to be verified in S5).
3. **Delegated administration:** department heads add people in bulk within their units and allowed roles
   (WI-OI-120p).
4. **One "My work" inbox** across modules: approvals, assigned work, timesheets, exceptions; due dates, delegation and
   out-of-office.
5. **Explainable access:** a refusal names the missing permission, role or scope and who can grant it, only within
   what the person may already see (no disclosure of records or units they cannot see).
6. **Field work on a phone, offline:** technicians execute work orders, punch time and capture evidence offline
   (U27; Workforce already queues punches offline).
7. **Places native:** sites, geofenced clock-in and site-scoped access (ADR-0006).
8. **Analytics on every window:** live KPIs from Analytics Studio beside the records they describe.
9. **Visible integration:** every financially relevant document (by its declared posting policy) shows "awaiting
   posting", "posted" or "rejected", with replay and daily reconciliation (ADR-0033 D3).
10. **Security by construction, verified per module:** signed per-call context, forced row-level security where the
    access-path matrix requires it, maker-checker minimums, SSO/SCIM/MFA, reasons recorded for sensitive changes.

## 5. User-experience standard (measured by the journey recorder)

| Rule | Measure |
| --- | --- |
| Words, not codes or ids | No internal enum code or raw id on screen (business numbers such as a work-order number are fine) |
| Every refusal explains itself | No technical message; each refusal names the next step |
| Empty states guide | No empty table without guidance |
| Nothing hides a control | No covered control; no sideways scroll at 390 px for field screens |
| Accessible | Zero serious or critical axe findings; every control labelled; lists usable by keyboard |
| Saved means saved | Every create survives a reload |
| Fast | First data under 2 s, actions under 1 s (p95, local) |
| Money as people write it | Decimal amounts in the currency's precision |
| Consistent patterns | Grids, forms, tabs and actions behave the same everywhere; maps, dispatch and field work keep their specialized components |
| Nothing dead | No button without an effect or an explanation |

## 6. Sequence

Superseded by `platform-implementation-plan.md` version 2 (§4 there): Stage 0 decisions and registers, then
dependency-checked milestones M1a, M1b, M1c, M2–M7, then G5, G6 and G7 as separate gates.

## 7. Definition of 100 %

Superseded by `platform-implementation-plan.md` version 2 (§6 there): frozen, versioned denominators; Built, Verified
and Accepted kept separate; "ahead" only with verification and task-benchmark evidence; no open Critical or High
finding.

## 8. Owner decisions needed

- Confirm the sequence (§6), in particular Phases A and B before F1 and F2.
- Which industries' solution packs come first (for the set-up wizard).
- D7 named reviewers (Security, Accounting, QA, release authority); D8 Legal on the iDempiere reference.
