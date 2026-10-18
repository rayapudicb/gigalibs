# WI-OI-120bi: Supervisor sign-off closes a completed work order

- **Status:** In progress (Cursor, 2026-10-18)
- **Work item:** WI-OI-120 (Phase 1, W1, step 1.3). Evidence goes in `.pi/work/WI-OI-120.md`.
- **Size:** M (one release, with a migration)

## Goal

A supervisor reviews a work order the technician completed, and signs it off with a note. The work order then shows
as **Closed**, for everyone, after a reload. Plan v3 step 1.3 asks that supervisors "close work orders". The journey's
"The supervisor signs off and closes the work order" step passes for real.

## Design (recommended)

- **The sign-off is recorded on the completed work order; the status stays `COMPLETED`.** A new `CLOSED` status
  would change the CMMS import and export files (which no card may change), analytics, and the Workforce hand-off.
  Sign-off fields change none of them.
- **Who may sign off:**
  - a holder of `cmms.work-orders.write` (the planner role), within their units and sites (`assertWritableScope`);
  - **not the person who completed the work** (four-eyes);
  - once only. A signed-off work order cannot be changed.

## Scope

- **May change:**
  - **CMMS migration `000021`, forward only:**
    - `signed_off_at`, `signed_off_by` and `sign_off_note` (1–4,000 characters) on `gigalibs_cmms.work_orders`;
    - checks: sign-off only on `COMPLETED`, and the three fields set together;
    - `down.sql` drops them;
    - the pins raised to 21.
  - **Contracts (`packages/contracts/src/cmms`):** the work order gains `signedOffAt`, `signedOffBy` and
    `signOffNote`; a `SignOffCmmsWorkOrderV1` input (`note`, `expectedVersion`).
  - **CMMS API:** `POST v1/work-orders/{id}/sign-off`. It runs under a row lock and refuses unless the work order is
    `COMPLETED` and not yet signed off. It checks permission, scope and four-eyes, raises the version, and writes the
    work-order event `SIGNED_OFF`, the audit record and the outbox event `cmms.work-order.signed-off.v1`. The record
    API action uses durable idempotency. `module.yaml` gets the gateway route (write only).
  - **The work-order window and screen:** a "Sign off" action for permitted users on completed work orders, with a
    required note. A **Closed** badge, with who signed it off and when, in the detail panel and the list.
  - **The journey:** the sign-off step checks the **Closed** badge in the work order's detail panel, after a reload.
- **Must not change:**
  - the CMMS import and export files;
  - migration 20 (deployed);
  - the status enum and its transitions;
  - other sessions' files;
  - secrets.

## Steps

1. Tests first. They fail before and pass after:
   - the API refuses sign-off when the work order is not completed, already signed off, out of scope, signed by the
     person who completed it, or requested without write;
   - the migration's checks;
   - the window action's permission.
2. Build, regenerate, and verify (tests, type-checks, conversion check, pins, lint against HEAD).
3. Independent Security review, read-only, on a different model.
4. On "commit", release. CMMS goes to migration 21, with a backup first. You deploy. Then the journey runs.

## Done when

- [ ] A planner signs off a completed work order with a note. It shows **Closed**, with the signer and the time,
  after a reload. The technician who completed it cannot sign it off.
- [ ] Every refusal answers with a clear error, and nothing is written.
- [ ] The journey's sign-off step passes on UAT with no new blocker. CMMS is at migration 21.
- [ ] The independent review is recorded, and `pnpm verify` reports only the known drift.

## Stop and ask if

- four-eyes would block a one-person workspace (then the owner decides whether an administrator may sign off their
  own work);
- any consumer (analytics, Workforce, export) would need to change.
