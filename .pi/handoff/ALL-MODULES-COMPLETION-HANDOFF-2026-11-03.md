# Hand-over to any agent: complete every module, web and mobile

Date: 2026-11-03. For Claude, Codex, Cursor or any other agent continuing the work. The owner asked for all modules to
be consolidated into one plan with their mobile scope, the earlier assessments corrected, and the work handed over so
any agent can finish it. This brief tells you where to start and how not to repeat the old mistakes.

## Start here (state on 2026-11-04, Claude stopped)

- **UAT runs `ef8d7dad`** (owner deploy, 2026-11-04): milestone A, WI-OI-167 Workforce scope, WI-OI-163 record
  offers, WI-OI-169 booked technicians, WI-OI-164's server side. Migrations: Workforce 30, CMMS 34.
- **Not yet done for that release:** the read-only retest (`e2e/specs/uat-milestone-a.spec.ts`, the bench, journeys and
  read-only e2e as in `.pi/work/WI-OI-151.md`, plus checks for 163, 167 and 169 below) and the independent Security
  review of 167, 169 and the 164 mobile routes (record it in their evidence files).
- **The active slot holds WI-OI-164** and its owner stopped: continue it (do not claim anything else). Its remaining
  list, in order, is in `.pi/work/WI-OI-164.md` → "Remaining": (1) task capture needs server form manifests — propose
  to the owner first; (2) the app side: session projection of a `cmms` module, compile the `cmms` feature (release
  containment and both app profiles), routes over the existing screens, copy, offered actions and reasons, the lens and
  the supervisor queue; (3) the device proof with the owner's logins.
- **Then the queue:** 9a WI-OI-176 (reference data viewer, operator versions, a right "No access"), 10 WI-OI-165, 11
  WI-OI-154, 12 WI-OI-155, 13 WI-OI-156 B–C, and on (§6a).
- **Retest checks for `ef8d7dad`:** WI-OI-163 — on a work order you completed, Sign off is not offered and the reason
  shows; another supervisor is offered it. WI-OI-169 — a technician booked through Workforce (execute-own only) can
  start the work order. WI-OI-167 — a supervisor limited to one unit sees and books only that unit's people (needs a
  limited login from the owner; the candidate list answers pages with `nextOffset`).

## Read first, in this order

1. `AGENTS.md`: the mandatory reading order, the Done checklist and the verification commands.
2. `.pi/NOW.md`: what is current.
3. [`docs/plans/all-modules-completion-plan.md`](../../docs/plans/all-modules-completion-plan.md): the module
   register (§3), the **corrections** (§2), the mobile scope (§5), the new cards (§6) and the completion stages (§7).
4. The one ordered queue: §6a of
   [`docs/plans/master-data-foundation-execution-plan.md`](../../docs/plans/master-data-foundation-execution-plan.md).
5. The card you claim (`.pi/tasks/WI-OI-NNN.md`) and its ADRs.
6. [`MASTER-DATA-FOUNDATION-HANDOFF-2026-11-03.md`](MASTER-DATA-FOUNDATION-HANDOFF-2026-11-03.md): the rules you must
   keep and the Definition of Done (they apply to every card here too).

## Where things are

| What | Where |
| --- | --- |
| Platform source and status | `~/dev/gigalibs-rounds`, branch `feat/frontline-suite` (the only place to read status) |
| Mobile source | `~/dev/gigalibs_mobile`, branch `main`; mobile work only inside the platform card that names it |
| UAT (production) | `http://127.0.0.1:5180`, built by the owner from `~/dev/gigalibs-release-5180b`; read-only to agents |
| Not yours | `~/dev/gigalibs` (an older release line with other sessions' uncommitted work, including WI-OI-131 Analytics) |
| Order | queue §6a; after item 26, the completion stages C1–C11 |
| Status words | Built (code exists), On UAT (deployed **and** verified, release named), Done (Done checklist plus the owner's acceptance) |

## The next item

1. **Item 4a, not a card:** after the owner's milestone A deploy (`bd852946`) and the reference load, retest on UAT
   (read-only): the Master data area and counts, reference and currency pickers, the workspace profile, standard units
   in Products, then the read-only e2e suite, journeys and bench (`.pi/work/WI-OI-151.md` commands); update the
   workbook (`e2e/ux-benchmark/workbook-content.mjs`, then regenerate).
2. **Item 5, WI-OI-167 Workforce scope completion:** claim it (row In Progress with your name, id in
   `config/sdlc-governance.json` → `workInProgressLimits.activeImplementationWorkItems`), then follow the card.
   Step 5 of the card (workspace-wide codes) has a recommended default that the owner confirms at claim.

## Mistakes that earlier assessments made (do not repeat them)

- Reading the catalogue label `PLANNED` as "not built". It means "not released to customers". The 12 module-host
  modules are built and running on UAT.
- Assuming code waits for a deploy because a row says Built. Check whether the card's commit is in the running
  release (`git merge-base --is-ancestor <commit> 38aa9017`, or the newer release named in `NOW.md`).
- Counting mobile features from one package. The app compiles 11 field features and `/mobile/v1` has 42 routes;
  Workforce is the part that is mostly planned.
- Treating "a person's own scope" and "a role given at a unit or place" as the same thing. Workforce roles cannot be
  given at a scope until WI-OI-167 is done.
- Building on the retired WFO tables (`wfo_*`). They are empty and unreachable; use them as a design reference only.
- Reading `~/dev/gigalibs`. Its uncommitted files belong to other sessions; never edit, stash or commit them.
- Trusting stale lines in `NOW.md` or older hand-overs (deploy instructions for code already running, verify failures
  that no longer happen). WI-OI-168 removes them; until then the corrections table in the plan wins.

## Mobile, in one paragraph

The phone and tablet use the same login, permissions, scopes and records as the web. A mobile feature needs: a
control-plane adapter in `packages/auth-nest/src/mobile/` that forwards to the module with the caller's token (pattern:
`mobile-logbook.controller.ts`), its routes in `apps/workflow-platform/lib/mobile-bff.ts` `MOBILE_ROUTES`, contracts
in `packages/contracts/src/mobile/`, then the feature in `gigalibs_mobile/packages/features/<name>` compiled in
`apps/operations/src/navigation/compiled-features.ts` with its entitlement and permissions. The module re-checks
everything. Prove it on a signed device against a test workspace on UAT (WI-OI-165 method). The scope per module is
the plan's §5.

## Open owner decisions you may meet

- The six not-wired relays (keys, after a look at the waiting events): `.pi/work/WI-OI-160.md`.
- Workflow Studio: start its service on UAT or hide its screens.
- WI-OI-131 Analytics: finish it in its own session and bring it into the queue (stage C9), or park it.
- The starter loads and other owner clicks listed by WI-OI-168.
- A named country reviewer before each country pack, and a payroll reviewer before any pack prices real pay.

## Finish every card the same way

`pnpm verify` green; for code that runs in an image, load the compiled app modules under Node and run `next build`
for web changes; evidence in `.pi/work/WI-OI-NNN.md`; row to Built and the id out of the slot; `.pi/NOW.md` updated;
a short report ending with one clear next step for the owner. Agents do not deploy; commit only on the owner's
"commit".
