# WI-OI-121i: Assistant Release Qualification, Playwright Journey & WCAG Accessibility

> **Withdrawn, 2026-10-14.** The Assistant preview was reverted from the branch (WI-OI-120aj, execution plan v3 step 0.3)
> and was never deployed. GU1–GU7 in `docs/plans/gigalibs-execution-plan-v3.md` replace it. Every claim below of Done,
> G5–G7, production readiness or release is withdrawn; this file is kept as a record.

- **Status:** Replaced by GU1–GU7, steps 1.4–1.10 (plan v3 §5; step 0.6, 2026-10-15). Withdrawn 2026-10-14 (WI-OI-120aj). Was: Done (owner approved 2026-10-10, qualification verified).
- **Work item:** WI-OI-121 (`.pi/WORK_ITEMS.md`); evidence in `.pi/work/WI-OI-121.md`.
- **Size:** M, bounded G5 qualification and browser certification.

## Goal

Qualify the sovereign GigaLibs Assistant candidate under the G5 release gate: execute an automated Playwright browser journey, run automated WCAG 2.2 AA accessibility testing via `@axe-core/playwright`, verify forward/rollback migration safety, and compile the qualification evidence package.

## Scope

- **May change:** dedicated Playwright journey and accessibility verification scripts under `apps/workflow-platform/scripts/` or `scratch/`; disposable schema migration drill; qualification evidence in `.pi/work/WI-OI-121.md`; this card and `.pi/NOW.md`.
- **Must not change:** running UAT services, ports or databases; production credentials; existing tenant data, grants or messages; CMMS import/export files; another agent's work; external cloud providers.

## Read first

`.pi/NOW.md`; `WI-OI-121h.md` and evidence; `docs/SDLC_DEVELOPMENT_GUIDE.md`; `docs/ENGINEERING_MODULE_PRODUCTION_COMPLETENESS_STANDARD.md`; WCAG 2.2 AA standard; `apps/workflow-platform/scripts/verify-configuration-studio-accessibility.mjs`.

## Steps

1. Create and execute an automated Playwright browser test exercising the live UI on `http://127.0.0.1:5180/assistant`: authenticate a test session, verify private thread creation, send a CMMS work order prompt, assert live citation link rendering (`/cmms/work-orders`), send a general inquiry, assert local `llama3.2` streaming, and verify the audit event on `/assistant/audit`.
2. Run automated WCAG 2.2 AA accessibility audits with `@axe-core/playwright` on `/assistant` and `/assistant/audit`, verifying ARIA attributes, semantic structure, focus states, and contrast compliance.
3. Perform a migration roll-forward and rollback drill for `000001_assistant_private_threads` on a disposable database schema, proving clean idempotency and rollback safety.
4. Run full repository verification audits (`node scripts/verify.mjs --audits`) and compile the G5 qualification evidence summary for release authority review.

## Done when

- [x] Automated Playwright journey executes end-to-end against the live Next.js app with zero failures.
- [x] Automated WCAG 2.2 AA scan reports zero critical/serious accessibility violations on `/assistant` and `/assistant/audit`.
- [x] Migration rollback and roll-forward drill cleanly verifies on a disposable test schema.
- [x] Repository audits pass with only known pre-existing drift recorded.
- [x] Qualification evidence is assembled in `.pi/work/WI-OI-121.md` and `.pi/NOW.md` is updated.

## Stop and ask if

- A test or drill would touch production or UAT customer data;
- An unresolvable WCAG 2.2 AA defect requires UX design changes outside the approved Claude/ChatGPT aesthetic;
- Independent Security or Legal human review raises an unresolved policy question.

## Report

At most five bullets: Playwright journey results, WCAG 2.2 AA audit results, migration drill evidence, platform audit verification, and release sign-off readiness.
