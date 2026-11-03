# WI-OI-165: Frontline journeys WI-OI-133–143 proven on a signed device against UAT

- **Status:** Approved (owner, 2026-11-03). Order: `docs/plans/master-data-foundation-execution-plan.md` §6 "The one ordered queue". Start only when this card is
  the first unfinished item and the active slot (`config/sdlc-governance.json` `activeImplementationWorkItems`) is free.
- **Work item:** WI-OI-165. Evidence goes in `.pi/work/WI-OI-165.md`.
- **Size:** M (mostly proof; small fixes).

## Goal

Each frontline product already built on the platform (calibration, commissioning, spares, logbook, SOP, equipment
check, problem report, hazard and incident, permits and LOTO, contractor pass, rounds) works end to end on a phone or
tablet against UAT, so its card can move from Built to On UAT.

## Facts (review of 2026-11-03)

The producers exist: cards Built on `feat/frontline-suite`, mobile controllers in `packages/auth-nest/src/mobile/`,
and they are in the release on UAT (02b3353a contains `62b580b3`). The mobile atlas wrongly read them as absent (it
inspected `~/dev/gigalibs`). Contractor cannot be reached on a device: `contractor` is missing from the mobile
config's feature keys (`packages/mobile-config/src/index.ts`) and from both app profiles (`app-profiles/*.json`).

## Scope

- **May change:** `~/dev/gigalibs_mobile` feature keys, app profiles and small consumer fixes; platform fixes only
  where a journey fails against UAT; evidence.
- **Must not change:** module rules or contracts without the module's card. Never, on any card:
  - the CMMS import/export files (`modules/physical-operations-cmms/apps/api/src/import-export/`);
  - another agent's work (uncommitted files in `~/dev/gigalibs`, other branches);
  - secrets;
  - the web on port 5180 (UAT is production and read-only to agents).

## Steps

1. Add `contractor` to the feature keys and both app profiles.
2. For each journey: the persona login, the steps of its card, screenshots, receipts; record pass or the exact failure.
3. Fix small consumer faults; raise anything larger as a bug with the module's card.

## Done when

- [ ] Each of the eleven journeys passes on a signed device against UAT, or has a recorded bug with its owner
- [ ] Evidence in `.pi/work/WI-OI-165.md`; the eleven rows move to On UAT only with the release named

## Stop and ask if

- a persona login is missing, or a journey would write regulated data (permits, LOTO) on UAT without the owner's OK.

## Report

At most five bullets: what changed, the evidence, what is next, and what the owner must decide.
