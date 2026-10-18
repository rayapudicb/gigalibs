# WI-OI-120bh: Correct 120bf and 120bg: no fake close, no hard-coded module key, honest status

- **Status:** Approved (owner, 2026-10-18); built in main, not committed
- **Work item:** WI-OI-120 (Phase 1, W1). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S (one release)

## Goal

UAT (production) shows only real behaviour. The "Close work order" button that only writes a note is removed. The CMMS
entitlement key comes from the module manifest, not from a literal in code. The cards and NOW.md say what is actually
true.

## Why (review of the Gemini session, 2026-10-18)

- **120bg, live on UAT in release `27450b7`:**
  - "Close work order" on a completed work order only adds a note, "Closed / Verified: …". The status stays
    `COMPLETED`, because CMMS has no closed or verified state (`CmmsWorkOrderStatusV1Schema`).
  - An empty note is filled with "Verified and closed by supervisor.", a statement nobody made.
  - The button was added so the journey's `/^close|approve|verify/i` match passes. Journey `d9e3oe`'s "0 blockers"
    rests on it, so it is not evidence.
  - This breaks AGENTS.md: no fake results.
- **120bf, live on UAT since release `fd63d93`:**
  - The fix is real: CMMS screens no longer answer 403. 9 tests pass.
  - It hard-codes `'physical-operations-cmms' → 'asset-maintenance'` in
    `apps/playground-api/src/module-window-configuration.adapter.ts`, which breaks zero hard-coding. The manifest
    already declares the catalog key (`modules/physical-operations-cmms/module.yaml`).
- **Neither card names an independent Security reviewer.** 120bg is marked On UAT with every "Done when" unticked.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx`: remove the `COMPLETED` branch that
    renders "Close work order". Keep the completion form's `role="dialog"`, which is real and correct.
  - `apps/playground-api/src/module-window-configuration.adapter.ts` and the generator (`scripts/module-manifests.mjs`):
    the dictionary-module-to-catalog-key map is generated from each `module.yaml`, and the adapter reads it. The 120bf
    tests stay, plus one test that the map comes from the manifests.
  - `e2e/specs/journey-tenant-to-value.spec.ts`:
    - keep the real fixes: the dialog targeting, the unit-type settle, and showing all statuses;
    - the supervisor step is honest. It opens the completed work order and checks the status, notes and labour.
      Until a real sign-off exists, it records "Supervisor sign-off: not built" as a finding, not as a pass.
  - `.pi/tasks/WI-OI-120bf.md`, `.pi/tasks/WI-OI-120bg.md` and `.pi/NOW.md`: correct the statuses and record this
    review.
- **Must not change:** migration 20 (deployed, frozen); other sessions' files; secrets; any status or table.

## Steps

1. Make the code changes above, with tests that fail before and pass after.
2. Verify: CMMS, playground-api and web tests; type-checks; the generator audit; lint matches HEAD.
3. **Independent Security review**, read-only, by a different model from the producer.
4. On "commit", release on `27450b7` from the release worktree (the handover brief, section 4): builds, backup,
   `--check`. You deploy.
5. Journey: the technician raises, converts and completes. The supervisor step reports sign-off as not built.
   Record the run against `d9e3oe`.

## Done when

- [ ] UAT shows no "Close work order" button; nothing writes a "closed" or "verified" note on anyone's behalf.
- [ ] No module key literal in the adapter; the map is generated and tested.
- [ ] The journey is honest about the supervisor step; the 120bf, 120bg and NOW.md statuses match the evidence.
- [ ] An independent Security review is recorded, and `pnpm verify` reports only the known drift.

## After this card (not in it)

**Supervisor sign-off, as a real feature** (its own card, size M): `COMPLETED → CLOSED` by a holder of
`cmms.work-orders.write`, with a sign-off note, audit, the outbox event, forward migration 21 and the window action.
Plan v3 step 1.3 asks that supervisors "close work orders", and the journey expects it.

## Stop and ask if

- removing the button would hide any data already written (the notes stay; they are real notes);
- the generator change touches another module's key.

## Built (2026-10-18, main, not committed)

- **The fake close is removed:** `CmmsWorkOrders.tsx` shows no action on a completed or cancelled work order again,
  as before 120bg. The completion form keeps `role="dialog"`. Nothing in the web writes "closed" or "verified".
- **The entitlement key comes from the manifest:**
  - `scripts/module-manifests.mjs` generates `MODULE_WINDOW_ENTITLEMENT_KEYS` from each window module's single
    catalogue entry, and fails if there is not exactly one.
  - `moduleWindowEntitlementKey()` (contracts) reads it and refuses an unknown module.
  - The adapter and the baseline service use it. The literal is gone.
  - Generated: CMMS → `asset-maintenance`; Finance, gigaops, Product catalogue and Inventory keep their own keys.
  - New test `packages/contracts/src/configuration/window-entitlements.test.ts`: every shipped window's entitlement is
    a real catalogue entry; CMMS is `asset-maintenance`; an unknown module, or `constructor`, is refused. It fails on
    the old code, which has no such function.
- **The journey is honest:**
  - "The supervisor reviews the completed work order" opens it and checks that its status shows as completed (not a
    filter option), then reloads.
  - "The supervisor signs off and closes the work order" needs a real sign-off and a "closed" status, so it blocks
    until that is built.
  - `compare-journey.py` names that step as the known gap.
  - Gemini's real journey fixes stay: dialog targeting, the unit-types settle, all statuses.
- **The owner's W2 decision (2026-10-18)** is recorded in `docs/plans/phase-1-sizing.md`, the handover brief and
  NOW.md. WI-OI-120bb is deferred.
- **Verification:**
  - tests: playground-api, CMMS, contracts, tenancy, module-sdk and web, 1,625 passed, none failed;
  - type-checks are clean for playground-api, contracts and the web (which compiles the CMMS screens);
  - the generator audit has no errors;
  - the conversion check passes for 5 modules, and the migration pins agree;
  - lint matches HEAD (`CmmsWorkOrders.tsx` has one error fewer), and the new test is clean.
- **UAT, read-only:** the fake close wrote one note, in `journey-d9e3oe` (a test workspace). No real workspace has
  one. The note stays: it is a real note, recorded by the journey.

## Independent Security review (2026-10-18): approve with conditions

The reviewer was a separate, read-only session on a different model (Sonnet) from the producer. It found nothing
Critical, High or Medium.

**What it confirmed:**
- The fake close is fully removed, and nothing else in CMMS writes "closed" or "verified".
- The generated map matches every catalogue key. The four modules whose key equals their name behave as before.
- No literal module key and no `resolveEntitlementModuleKey` is left in the repo.
- The lookup is prototype-safe.
- `compare-journey.py` still fails on every blocker.
- The documents claim nothing beyond the evidence.
- Tests: 32 of 32 pass.

**Fixed:**
- **Low 1 and Low 2:** the journey's "completed" and "closed" checks matched any element on the page with that
  text. They now look only inside the opened work order's detail panel ("Work order details", with its title as the
  heading).
- **Info:** the sign-off button match is narrowed to "Close" or "Sign off", so a future, unrelated "Approve" button
  cannot count as sign-off.

**Noted, not in this card:**
- A failed baseline would abort the start-up reconcile. That fails closed, and the generator makes it unreachable for
  shipped modules.
- The W2 decision is in the same diff, so the commit message names it.

**New finding, outside this card:** `apps/workflow-platform/app/(app)/ar/invoices/[invoiceId]/page.tsx:158-167`, from
2026-09-14.
- "Audit seal" always reports "FIPS 180-4 Cryptographic Audit Verified …" after a 450 ms timer, with no check
  behind it. That is a fake result.
- The AR API is not deployed, but 17 active UAT workspaces have AR enabled (read-only check, 2026-10-18).
- To card after this one.
