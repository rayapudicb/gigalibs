# WI-OI-143: M-CONTR Contractor field safety pass (Safety Operations extension, web and mobile)

- **Status:** **Built** (2026-11-02 on `feat/frontline-suite`). Owner UAT on single-suite deploy before **Done**; commit uncommitted platform + mobile slices.
- **Work item:** WI-OI-143. Evidence: `.pi/work/WI-OI-143.md`. Spec: `docs/products/mobile-suite/07-contractor-safety-pass.md`; ADR-0035.
- **Size:** L

## Goal

Deliver M-CONTR end to end: vendor companies and worker credentials, induction and COI evidence, revocable gate pass QR, check-in/out with live revocation, escort sign-off for restricted areas, evacuation roster, and audit — through real PostgreSQL, module API, web admin, `/mobile/v1` BFF, and `gigalibs_mobile` feature (no mocks).

## Scope

- **May change:** `modules/safety-operations` (migrations, API, web), `@gigalibs/contracts` (contractor pass types), workflow-platform mobile BFF, `gigalibs_mobile` (`mobile-feature-contractor`), generated catalogue/navigation/permissions, compose deployment profile.
- **Must not change:** UAT data without owner backup; secrets; unrelated modules. Spend-management hour sync is a follow-up contract only (no unverified table writes).

## Read first

`.pi/tasks/WI-OI-141.md`, `.pi/work/WI-OI-141.md`, ADR-0035, frontline plan §3 (M-CONTR row), `docs/products/mobile-suite/07-contractor-safety-pass.md`, `gigalibs_mobile/AGENTS.md`.

## Build order

1. Versioned contracts (company, worker, induction quiz, COI document, pass token, visit check-in/out, escort event, roster query).
2. Migrations + RLS + PostgreSQL proof (idempotent client operation ids, append-only audit).
3. Module HTTP API + web workspace (compliance console, live roster, pass issuance).
4. Mobile BFF routes + session grant `contractor` with scoped permissions.
5. Mobile feature + routes; gate scan uses signed pass payload verified server-side (fail closed offline for entry).
6. Tests, `pnpm verify`, mobile lint/typecheck/test; evidence in `.pi/work/WI-OI-143.md`.

## Done when

- [ ] Spec core journeys (induction → pass → gate verify → escort → checkout → roster) work on real DB with negative auth tests.
- [ ] Web admin, BFF, and mobile use the same contracts; no client-trusted tenant/org headers.
- [ ] `pnpm verify` clean except documented pre-existing failures (target: zero new failures).
- [ ] Mobile gates pass; device proof documented or automated where CI allows.
- [ ] Owner UAT journey after single-suite deploy (not agent deploy).
