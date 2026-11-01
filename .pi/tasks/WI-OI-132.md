# WI-OI-132: Frontline mobile product suite architecture and implementation plan

- **Status:** Approved (owner, 2026-10-30: "i will go as per your recommendation"); architecture planning only. Product build and deploy need their own cards and release position.
- **Work item:** WI-OI-132 (row in `.pi/WORK_ITEMS.md`). Evidence: the plan and its gap register.
- **Size:** L (planning across 12 products; each implementation needs its own bounded card).

## Goal

Reconcile the 12 mobile-first product specs with the existing 19-module catalogue and accepted foundations. Set an explicit backend API, data, admin configuration, then mobile implementation order without treating proposed integrations as built.

## Scope

- **May change:** `docs/plans/frontline-mobile-suite-implementation-plan.md`, the suite boundary ADR, planning notes in the 12 `docs/products/mobile-suite/` specs, `.pi/WORK_ITEMS.md`, `.pi/NOW.md`.
- **Must not change:** product code, schemas, module manifests, services, credentials, another agent's work, CMMS import/export, or the web on port 5180.

## Read first

`.pi/NOW.md`; the 12 specs; `.pi/PLAN.md`; the WI-OI-132 row; requirements baseline, SDLC guide and module completeness standard; ADR-0001, 0007, 0016, 0018 and 0033; WI-OI-120cf mobile BFF card; solution architecture and backend domain role instructions.

## Steps

1. Inventory every product claim against actual owners, contracts, migrations and runtime status.
2. Propose one authority per concept, dependency order, data and API contract rules, governed admin surfaces and mobile sync rules.
3. Record unresolved choices and a per-product Definition of Ready. Record the owner's accepted direction and reconcile it with existing planned owners before creating build cards or changing product behavior.

## Done when

- [x] The plan maps all 12 product codes and keeps them distinct from the owner's historical 19-module list and today's generated catalogue/manifests.
- [x] Unverified integration/table/route/compliance claims are identified as proposals.
- [x] Backend and admin before mobile is expressed as the order *inside* each full-module build, consistent with the no-partial-commit rule.
- [x] Planning-only `pnpm verify --audits` run on 2026-10-30: 3 unrelated failures (`analytics-charts` undeclared `vitest`; WI-OI-131/WI-OI-122 SDLC statuses; Analytics hard-coded colour classes). All other executed audits passed. Full log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-30T08-05-40-551Z.log`.
- [x] After owner approval and boundary-ADR update, `pnpm verify --audits` repeated with the same three failures and no new findings. Full log: `/var/folders/jp/fkzm1c3s1d52rj_9cvjv6kx00000gn/T/gigalibs-verify/verify-2026-10-30T08-16-00-659Z.log`.
- [x] Owner approved the recommended ownership principle, backend/admin-before-mobile order inside a complete module build, and M-RND as the first **design** pilot (2026-10-30).
- [ ] Architecture and Security reviewers reconcile the boundary ADR with M-CM2 permits, M-WF3 handovers and other existing owners; the owner assigns a deploy slot in the fixed sequence. Then register bounded build cards.

## Stop and ask if

- The owner intends a global backend/admin pass across all 12 before any mobile build, which would require an explicit exception to the full-module build and commit rule.
- A runtime owner, life-safety interlock, anonymous access policy or deploy slot must be accepted.

## Report

Summarize the plan, evidence, gaps and owner decisions in at most five bullets.
