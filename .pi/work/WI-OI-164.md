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

**Owner (2026-11-04):** finish **164 then 165** implementation in order; **task capture / WI-OI-177 decided later**
(out of scope for 164 "100% implementation").

**Implementation — complete except deploy and device proof:**
1. **Task capture (deferred):** server form manifests not built; detail stays without task capture until a future card
   (tentative WI-OI-177). Not blocking 164 closure for list/detail/actions/sign-off.
2. **App side (`~/dev/gigalibs_mobile`) — built (2026-11-04):** session projection + compile; lens; actions panel;
   sign-off queue; `?selected=` deep link; **Home Today** registers `cmms.work-order.detail` and routes work items
   (`apps/operations/src/home/destinations.ts`); module shortcuts from compiled features on Today.
3. **Deploy + device proof (owner):** ship platform projection and mobile binary together; technician + supervisor
   journeys on UAT (screenshots). Agents do not deploy 5180.

## 2026-11-04 — app compile + session projection (Cursor)

**Platform (`gigalibs-rounds`):** `mobile-session-projection.ts` — `cmms` module at navigation order 360;
capabilities from `cmms.work-orders.read|execute-own|write`; spec WI-OI-164 (16/16 projection tests).

**Mobile (`gigalibs_mobile`):** see item 2 above; evidence commands: `pnpm exec vitest run packages/features/cmms`,
`pnpm --filter @gigalibs/operations-mobile typecheck`, `node --import tsx tooling/validate-architecture/src/index.ts`.
