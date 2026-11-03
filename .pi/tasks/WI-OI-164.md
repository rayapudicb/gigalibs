# WI-OI-164: Mobile CMMS work — Today to my work orders, execute, complete and sign off

- **Status:** Approved (owner, 2026-11-03). Order: `docs/plans/master-data-foundation-execution-plan.md` §6 "The one ordered queue". Start only when this card is
  the first unfinished item and the active slot (`config/sdlc-governance.json` `activeImplementationWorkItems`) is free. Needs WI-OI-163.
- **Work item:** WI-OI-164. Evidence goes in `.pi/work/WI-OI-164.md`. Spans this repository (the `/mobile/v1`
  producer) and `~/dev/gigalibs_mobile` (the native app).
- **Size:** L, three slices (A read, B execute and complete, C supervisor sign-off).

## Goal

A technician opens the app, sees today's work orders, opens one, starts, records notes and checklist, completes it;
a supervisor sees completed work awaiting sign-off and signs it off on a tablet — the same rules as the web, proven
on a signed device against UAT.

## Scope

- **May change (platform):** a `MobileCmmsWorkOrdersController` in `packages/auth-nest/src/mobile/` over
  `mobile-cmms-forward.ts` (list with Today, Upcoming, Previous lenses and state filters; detail with record version
  and the WI-OI-163 offers; start, hold, resume, complete, sign-off commands with idempotency key and expected version);
  allow-list in `apps/workflow-platform/lib/mobile-bff.ts`; contracts; tests.
- **May change (mobile):** a new versioned work-order detail contract in `packages/mobile-contracts/src/cmms.ts`
  (the strict v1 is not changed silently); `packages/features/cmms`; the empty route
  `apps/operations/app/(authenticated)/cmms/work-orders/`; Home's Today handoff to accepted work destinations.
- **Must not change:** CMMS command rules; parts and stock flows (they wait for WI-OI-157 slice 5). Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Steps

1. A — read: list and detail through `/mobile/v1`; Today, Upcoming, Previous are date filters, not statuses; the
   detail shows only offered actions with reasons.
2. B — execute: start, hold with reason, resume, notes and checklist, complete; receipts accepted, denied or
   conflict; no fake success offline.
3. C — sign-off: supervisor queue "Completed, awaiting sign-off"; sign-off with the completer refused.
4. Device proof on UAT with a technician and a supervisor login (owner provides), recorded with screenshots.

## Done when

- [ ] Each slice proven on a signed device against UAT; denials and conflicts shown plainly
- [ ] `pnpm verify` here and the mobile repository's lint, typecheck, tests and architecture validation pass
- [ ] Evidence in `.pi/work/WI-OI-164.md`; `.pi/NOW.md` updated

## Stop and ask if

- a needed login or device is not available, or a journey needs a CMMS state that does not exist (for example Closed).

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
