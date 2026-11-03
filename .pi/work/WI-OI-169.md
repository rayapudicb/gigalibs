# WI-OI-169 evidence — a booked technician can execute the work order

## 2026-11-03 — built (queue item 8, claimed by Claude)

**Why:** CMMS asks Workforce for staff and keeps the bookings on the work order, but "execute own" accepted only the
work order's assignee, so a technician booked through Workforce could not start or complete the work they were booked
for.

**Built:**
- Contracts: `resourcePlatformUserId` (optional) on the Workforce handshake fact; `resourceUserRef` on
  `CmmsWorkOrderBookingV1`; `CMMS_EXECUTING_BOOKING_STATUSES` (CONFIRMED, DISPATCHED, ON_SITE).
- Workforce: booking created and status-changed facts carry the booked person's login (null when they have none).
- CMMS migration `000034_booking_user_reference` (nullable `resource_user_ref` on `work_order_bookings`, partial index;
  additive, forward-only); pins moved to 34 (runtime manifest, `CMMS_SCHEMA_CONTRACT_VERSION`, Compose ×2;
  `verify-migration-pins` agrees).
- CMMS inbox: stores the login; a later fact without it keeps the one already known.
- Execute-own (the command's `lockForChange` and the record path's `assertCanExecute`): the assignee **or** a login with
  a live booking on the work order; every other guard unchanged. The WI-OI-163 offers use the same rule
  (`bookedUsers`), so web and mobile show the buttons to the booked technician.

**Tests:**
- `work-orders/booked-execute.pg.test.ts` (new; PostgreSQL 16 with CMMS migrations 1–34 and a runtime login that is
  neither superuser nor BYPASSRLS, grants as the migration job gives them; container `wi169-cmms-proof`, kept): the login
  arrives through the real inbox and survives a fact without it; the booked technician starts the work, another is
  refused `CMMS_OUT_OF_SCOPE`; once the booking is cancelled the right ends. 3/3. The existing permits database test
  passes on the same database (5/5).
- Offers: a booked technician is offered start; someone not booked is not. CMMS and Workforce unit tests 549 pass
  (`relay.test.ts` updated for the added projection parameter).

**Not in this card:** a lead-technician rule for crews (any live booking may execute, as the card allows); the phone's
"my work orders" listing booked work is WI-OI-164.

**Verification:** `pnpm verify` PASS (19 steps); compiled CMMS and Workforce app modules load under Node. Status:
**Built**. Security review (access change) before the owner deploys, with WI-OI-167's.
