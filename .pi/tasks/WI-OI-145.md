# WI-OI-145: One Medusa-standard console — navigation, shell and page templates

- **Status:** Approved (owner, 2026-11-02: S1 "fix the below … enhance this with a better solution only if it's
  better"; S2–S6 "go"); Built on `feat/frontline-suite` (evidence gate 2026-11-02). Done after the owner's web deploy and
  UAT check.
- **Work item:** WI-OI-145. Evidence: `.pi/work/WI-OI-145.md`. Review: walk of 95 screens on the 5180 instance
  (2026-11-02), report `ux-report.html` (scratchpad).
- **Size:** L (S1: M)

## Problem

The sidebar mixes daily business modules with administration, integration and diagnostic tools; only modules with a
manifest `menu` expand; the landing page (`/modules`) shows every catalogue entry, locked ones included, with
maturity badges and engineering readiness notes; Solution Packs was meant to be hidden but the hide list names a key
that does not exist (`solutions` instead of `solution-packs`); Approval Queues reads only the AP action queue yet is
shown to frontline workers; the persona dropdown overflows the sidebar and covers the first letter of every page
title.

## S1 — Daily sidebar and a Settings area (this slice)

- **Settings area (Medusa settings layout):** new sidebar group `Settings` (`PlatformModuleArea`). Its entries leave
  the daily sidebar and appear in a Settings sidebar, shown on their routes and under `/settings`, sectioned by
  `area`: Workspace (Workspace settings, Organization & hierarchy, Modules & plan), Integrations (Connected apps,
  Connections), Automation (Workflows, Forms & apps, Run history, Processing exceptions), Platform (Platform Control
  Tower, operators only), Account (My profile & security, everyone). A Settings link sits at the foot of the daily
  sidebar.
- **Renamed to one plain name each (name = label):** Tenant RBAC & Settings → Workspace settings; Personal Security &
  Profile → My profile & security; 1-Click OAuth Studio → Connected apps; Connections & Adapters → Connections;
  Workflow Studio & DAG Canvas → Workflows; Configuration Studio → Forms & apps; Execution Telemetry → Run history;
  Exceptions & Quarantine → Processing exceptions; Approval Queues → Invoice approvals (Finance group, next to 3-Way
  Match, because it reads only the AP action queue).
- **Audiences:** Run history, Processing exceptions and Workflows no longer appear for C-level or supervisor lenses
  (administrators only); Invoice approvals no longer appears for frontline workers; My profile & security appears for
  every lens; Executive Control Tower for C-level, Tenant Admin and Platform Operator only (sidebar and page).
- **Home:** `/modules` becomes Home: only the modules this person can open, grouped like the sidebar, without locks,
  maturity or readiness notes; administrators get a link to Modules & plan, platform operators to the full catalogue
  (`/modules?view=catalogue`, the former page).
- **Fixes:** Solution Packs hidden (correct key); persona switcher no longer overflows (the select replaces the
  duplicate badge when the person can switch).
- **Not changed:** routes (every bookmark and link keeps working), permissions, entitlements, the Business Value
  Ledger (already C-level only; nesting it under Analytics needs its page under `/analytics`, deferred to S3).

## Later slices (owner "go")

- **S2 Shell frame:** one `ModulePage` frame in the layout (padding, width, header), breadcrumb from catalogue + menu,
  Settings page tabs become Settings sidebar items, distinct icons.
- **S3 Menus:** `menu` + child routes for every multi-screen module; remove in-page primary tab bars (CMMS, IoT,
  Workforce, Manufacturing duplicates).
- **S4 Templates:** `ModulePage`, `DataTable`, `Tabs`, `StatusBadge`, empty and error states in `@gigalibs/web-sdk`;
  every workspace migrated.
- **S5 Wording:** no enum codes, API paths, work-item IDs or claim badges; formatted amounts; people by name.
- **S6 Guard:** `audit:ui-shell` in `pnpm verify`.
- **Separate card:** cross-module approvals inbox in the top bar, once modules publish approval tasks (CMMS permits,
  calibration, Workforce timesheets and absences, Rounds skips, Procurement requisitions, AP).

## Definition of Done (S1)

Navigation equivalence test records every group, label and lens change with this work item; generated catalogue and
navigation regenerated; web build; design-token, navigation and layer audits; `pnpm verify` with only the four known
failures; evidence in `.pi/work/WI-OI-145.md`.
