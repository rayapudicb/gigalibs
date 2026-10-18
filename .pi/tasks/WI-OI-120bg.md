# WI-OI-120bg: Align CMMS work order completion and supervisor review action

- **Status:** On UAT in part (owner deploy, 2026-10-18: release `27450b7`). Corrected by
  [WI-OI-120bh](WI-OI-120bh.md) (review, 2026-10-18).
  - **Real:**
    - the completion form is a dialog, so the technician's Complete moves the work order to `COMPLETED`;
    - the journey's unit-types step settles.
  - **Not real:** "Close work order" only wrote a note ("Closed / Verified: …", and "Verified and closed by
    supervisor." when left empty). The status stayed `COMPLETED`, because CMMS has no closed state. 120bh removes
    it, and supervisor sign-off becomes its own card.
  - **No independent Security review is recorded.**
- **Work item:** WI-OI-120 (Phase 1, W1-A follow-up). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** S (small targeted fix)

## Goal

Clear the remaining CMMS journey blocker (`The supervisor reviews and closes the work order`) by providing a supervisor review/closing action on completed work orders in the CMMS web UI, and ensuring the technician's completion form is reliably targeted and submitted.

## Context & Finding (Journey `cac8tz`)

In journey `cac8tz`, `The technician raises a request` passed cleanly after the entitlement key fix (WI-OI-120bf). However, two issues prevented the work order from being closed:
1. In `CmmsWorkOrders.tsx`, clicking `Complete…` opens an inline completion form inside `StatusActions`. But `lastForm(technician)` in Playwright evaluates to the `NotesCard` `<form>` at the bottom of the page, so the note was added instead of transitioning the work order to `COMPLETED`.
2. In `CmmsWorkOrders.tsx`, `StatusActions` returns `null` when `workOrder.status === 'COMPLETED'`. There is no button matching `/^close|approve|verify/i` for the supervisor to review or close the completed work order.
3. In `Unit types: Site and Area`, Playwright timed out waiting for `[data-journey-form="form-2"]` because the first unit type modal closed and the second form opened asynchronously.

## Scope

- **May change:**
  - `modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx`:
    - Add supervisor `Close work order` action on `COMPLETED` work orders (with review notes form calling `cmmsApi.addNote` and marking reviewed);
    - Wrap the completion form with `role="dialog"` or explicit data attribute so Playwright form targeting uniquely identifies the completion modal.
  - `e2e/specs/journey-tenant-to-value.spec.ts`:
    - Target the completion form specifically when clicking `Complete…`;
    - Handle form settlement in `Unit types: Site and Area` to avoid timing out on `form-2`.
- **Must not change:**
  - Deployed migration 20 (frozen);
  - Other sessions' files (`maps/page.tsx`, `AuthAtmosphere.tsx`, `OmnichannelSoftphoneDrawer.tsx`, etc.);
  - Secrets.

## Steps

1. In `modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx`:
   - When a work order is `COMPLETED`, render a supervisor action: `Close work order` (matching `/^close|approve|verify/i`). Clicking it opens a review note form (`Completion / close review`) which appends the supervisor's review note.
   - For `Complete…`, assign `role="dialog"` and `aria-label="Complete work order"` to the completion form container.
2. In `e2e/specs/journey-tenant-to-value.spec.ts`:
   - Ensure the completion form step targets the completion dialog/form and submits `Confirm completion`.
   - In `Unit types: Site and Area`, settle the page between modal opens to ensure `form-2` is properly mounted.
3. Verify locally:
   - Run CMMS web tests / typecheck.
   - Run playground-api & contracts tests.
4. Independent Security review of changes.
5. Deploy to UAT and rerun journey test to confirm all blockers clear.

## Done when

- [ ] `CmmsWorkOrders.tsx` provides a supervisor `Close work order` action on `COMPLETED` work orders.
- [ ] Technician completion form successfully transitions work order to `COMPLETED`.
- [ ] Journey test runs without the CMMS closing blocker.
- [ ] Unit types step completes reliably.

## Report

At most five bullets: what changed, the evidence, what's next, and what the owner must decide.
