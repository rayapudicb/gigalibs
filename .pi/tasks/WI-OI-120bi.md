# WI-OI-120bi: Supervisor sign-off closes a completed work order

- **Status:** Built (release worktree `38aa3120`; UAT deploy pending owner)
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

## Independent Security review of `72837662` (2026-10-18): block until fixed

The reviewer was the Claude session, read-only; the producer was Cursor. Tests run by the reviewer:
- the sign-off, work-order and gateway tests, 50 of 50;
- CMMS, contracts, control plane and web, 1,460 passed, none failed.
- The migration pins agree at 21.
- `pnpm verify --audits` adds no new failure. The existing ones are design tokens, and the layers, S16 and
  deployment-profile defects from Table 2.

**Confirmed sound:**
- **Permission:** `cmms.work-orders.write` on the REST route (`@RequirePermissions`), the record action and the
  gateway (write only).
- **Scope:** `lockForChange` reads the row `FOR UPDATE` through `visibleRow`, then calls `assertWritableScope`.
- **Rules:** the version check; four-eyes from the latest `STATUS_CHANGED → COMPLETED` event; once signed off, every
  change through `work-orders.service.ts` is refused.
- **Migration 21:** its checks (sign-off only on `COMPLETED`, all three fields together, note 1–4,000 characters) are
  correct. Existing rows pass, and no trigger blocks the update.
- **The screen:** the **Closed** badge is exact text in the detail panel, and the note is required.
- **Honesty:** nothing fake (no timers, no invented text), and the journey file is unchanged.

**Findings, to fix before the release:**
1. **High, release blocker:** `modules/physical-operations-cmms/web/src/components/CmmsWorkOrders.tsx:755` passes
   `required` to `Field`, which does not accept it (TS2322). `next.config.mjs` does not ignore build errors, so the web
   image build fails. Remove `required` from `Field`; the `Textarea` already has it. Check with
   `cd apps/workflow-platform && npx tsc --noEmit -p .`; it must show 0 errors.
2. **Medium:** `000021_work_order_sign_off.down.sql` does not remove ledger row 21. Migration 20's down file does.
   - After a rollback with this file, CMMS still reports version 21.
   - The `3bc0c1f` images require exactly 20, so they would not start, and the rollback fails.
   - Add `DELETE FROM gigalibs_cmms.schema_migrations WHERE version = 21;` before `COMMIT`.
3. **Medium:** `recordFailureAttribution` (`apps/api/src/reliability/reliability.service.ts`, ~L395–445) locks the
   work order itself and has no status or sign-off check.
   - A `cmms.assets.write` holder can change a closed work order's failure codes after sign-off. That breaks the
     card's "a signed-off work order cannot be changed".
   - Fix: select `signed_off_at` in that locked read and refuse with `CMMS_WORK_ORDER_SIGNED_OFF`. Add a test.
4. **Low:** the outbox payload carries the free-text sign-off note to other modules; no other work-order event
   carries notes. Keep the note in the work-order event and the audit record, and send only `signedOffBy` on the
   outbox.
5. **Low, missing tests:**
   - sign-off outside the caller's write scope is refused (`CMMS_OUT_OF_SCOPE`);
   - a stale `expectedVersion` is refused;
   - failure attribution after sign-off is refused (with finding 3).
6. **Low, UX:**
   - "Signed off by" shows the raw subject id, not a name;
   - "Sign off" shows for people without write, and the server then refuses;
   - the metadata window offers "Sign off" again on a signed-off work order, because its condition checks the status
     only.

   None is a security issue. Fix them if cheap; otherwise record them as deferred.

**Info:**
- The `CMMS_ALREADY_SIGNED_OFF` branch in `signOff` cannot be reached: `lockForChange` refuses first with
  `CMMS_WORK_ORDER_SIGNED_OFF`. Remove it, or keep it and say why.
- Four-eyes allows a sign-off when no completion event exists (older work orders). That is acceptable; record it.
- The new `as any` in `cmms-record-adapters.ts` follows that file's existing pattern (81 uses). It is not blocking.

**Verdict:** block until findings 1–3 are fixed with tests. Then approve with conditions (4–6 fixed or recorded). A
re-check of the fix commit is enough; a new full review is not needed.

## Security fix follow-up (Cursor, 2026-10-18)

**Fixed (findings 1–3, with tests):**
1. Removed invalid `required` prop from `Field` (sign-off dialog); `Textarea` stays required.
2. `000021` down migration deletes `schema_migrations` row 21 (`migration-000021-down.spec.ts`).
3. `recordFailureAttribution` refuses when `signed_off_at` is set (`r5-access-boundary.spec.ts`).

**Also fixed:** finding **4** — outbox payload carries `signedOffBy` only (note stays in event + audit).

**Finding 5 (extra tests):** sign-off out-of-scope and stale-version tests in `work-orders.sign-off.service.spec.ts`.

**Deferred (finding 6, UX — not security):**
- Show signer display name instead of raw subject (needs identity lookup).
- Hide **Sign off** in `CmmsWorkOrders.tsx` when the user lacks `cmms.work-orders.write` (needs permissions wired into the legacy screen).
- Metadata **Sign off** action visibility when already signed off (needs compound `visibilityCondition`; window builder only supports a single field today).

**Release conditions:**
- release from the release worktree on `3bc0c1f`, with only this card's product files;
- rebuild contracts `dist`;
- before the deploy, read-only: CMMS is at 20, and the three sign-off columns do not exist;
- after the deploy: CMMS is at 21;
- the journey's sign-off step passes with no new blocker.

## Release prepared (2026-10-18, not deployed)

- **Main product tip:** `b8ded67e` (`72837662` + security fix).
- **Release worktree:** `/Users/rayapudi/dev/gigalibs-release-wf120u`, branch `release/wi120u-workforce`, commit
  **`38aa3120`** (CMMS-only cherry from `b8ded67e`; no Table 2).
- **Identity:** `38aa3120ebfcf780f33f0b6e59dbfd81d24c7d47` /
  `4cb1f260d82bf347975f8e45b205cd529fb5d20756cc8f38652242d5e607b19d` /
  `local-20261018T082458Z-38aa3120ebfc-4cb1f260d82b`.
- **Images:** tag `38aa3120ebfc-4cb1f260d82b` (five builds completed). Content check: `sign-off` in `cmms-api`
  controller bundle.
- **Pre-deploy read-only:** CMMS migration **20**; **`signed_off_at` absent** (0 columns).
- **Backup:** `gigalibs_backup_20261018_084749Z` (predecessor running **`3bc0c1f`**).
- **Deploy tool:** retargeted to **`WI-OI-120bi`**; `deploy-uat.test.mjs` **33 pass**; **`deploy-uat.sh --check`** →
  **CHECK PASSED** (nothing deployed).
- **UAT still running:** **`3bc0c1f46c27-b896d4b59517`** (owner has not run `--deploy` yet).
- **Owner deploy:**
  `cd /Users/rayapudi/dev/gigalibs-release-wf120u && bash .pi/handoff/proof-scripts/deploy-uat.sh --deploy --backup gigalibs_backup_20261018_084749Z`
- **Rollback:** keep **`3bc0c1f`** images; backup above; if DB reaches 21, run `000021_work_order_sign_off.down.sql`
  before rolling images back.
