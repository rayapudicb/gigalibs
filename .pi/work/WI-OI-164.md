# WI-OI-164 evidence — mobile CMMS work (Today → my work orders, execute and complete, sign-off)

## 2026-11-03 — platform side built (queue item 9, claimed by Claude); the app side and the device proof remain

**Platform (`~/dev/gigalibs-rounds`) — built:**
- CMMS search gains `mine` (assigned to me, or a live Workforce booking for me — WI-OI-169), `awaitingSignOff`
  (completed, not signed off) and `dueFrom` (additive to `SearchCmmsWorkOrdersV1`).
- `MobileCmmsWorkOrdersController` (`packages/auth-nest/src/mobile/mobile-cmms-work-orders.controller.ts`), answering
  the app's strict v1 shapes:
  - `GET mobile/cmms/work-orders` — my work as `mobile-cmms-work-order-page.v1`; the app's v1 list input (query,
    status, priority, place, cursor, page size) plus an optional `lens` (today, upcoming, previous: due-date windows in
    UTC days, never statuses); opaque page cursor;
  - `GET mobile/cmms/work-orders/awaiting-sign-off` — the supervisor's queue (needs `cmms.work-orders.write`);
  - `GET mobile/cmms/work-orders/{id}` — `mobile-cmms-work-order-detail.v1`;
  - `GET mobile/cmms/work-orders/{id}/actions` — the WI-OI-163 offers (offered or not, with the reason);
  - `POST mobile/cmms/work-orders/{id}/actions/{start|hold|resume|complete|sign-off}` — with the version read (hold
    and sign-off need a reason); CMMS checks the action's own permission and every guard; answers the refreshed
    detail; a conflict is `MOBILE_WORK_ORDER_CONFLICT` (new mobile problem, 409).
- `/mobile/v1` front door: the routes above, UUID-bound, unknown actions refused; the two lists are the only routes a
  query passes, rebuilt from checked keys (anything else answers 400); every other route still drops the query.
- Not claimed: the place reference (needs Geospatial's identity) is `null`; task capture is not offered yet (below).

**Tests:** adapter (6: my work with mine and lens, cursor paging, input and permission refusals, detail and offers,
actions with the version and reason, conflicts, the sign-off queue, lens windows); front door (the routes, the checked
query, refusals, query still dropped elsewhere; 19 pass); database proof that "mine" lists the booked technician's work
only (`booked-execute.pg.test.ts`, 4 of 4 on the throwaway CMMS database).

**Remaining (for the next agent, in this order):**
1. **Task recording on mobile** needs the app's form manifests on the server (`GET /mobile/v1/forms/manifests/...`,
   manifest version and checksum, `mobile-form-submission.v1` → `MobileFormSubmissionResultV1`). No such server route
   exists yet; until it does, the detail answer offers no task capture. Propose it to the owner as its own slice or card.
2. **App side (`~/dev/gigalibs_mobile`)** — started: the contracts (`CmmsWorkOrderActionOffersV1`,
   `CmmsWorkOrderActionInputV1`, the list `lens`) and the client calls (`getCmmsWorkOrderActions`,
   `runCmmsWorkOrderAction`, `listCmmsWorkOrdersAwaitingSignOff`) with tests; mobile lint, typecheck, architecture
   validation and 242 tests in the affected packages pass. Still to do: project a `cmms` module with its capabilities
   in the mobile session (`packages/auth-nest/src/mobile/mobile-session-projection.ts`, shipped together with the
   app's compile step so neither side runs ahead), compile the `cmms` feature (release containment and both app profiles:
   feature `cmms`, capabilities for my work, execute and sign-off), the routes in
   `apps/operations/app/(authenticated)/cmms/work-orders/` over the existing `WorkOrdersScreen` and
   `WorkOrderDetailScreen`, the offers contract and client calls (`/actions`, `/actions/{action}`, the sign-off
   queue), the lens on the list, offered actions and their reasons on the detail, and the supervisor queue; then the
   repository's lint, typecheck, tests, profile and architecture validation.
3. **Device proof** on UAT with a technician and a supervisor login (owner provides), after the owner's deploy.
