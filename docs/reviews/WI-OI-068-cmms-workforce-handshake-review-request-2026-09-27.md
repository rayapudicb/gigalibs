# WI-OI-068 CMMS ↔ Workforce work handshake review request (roadmap P6, second adopter)

Date: 2026-09-27  
Profiles: `configuration-local-development-v1` with the Workforce, Geospatial and modules overlays  
Decision requested: bounded Local Development G4 review; Product Owner acceptance (below)

## Implemented outcome

A maintenance manager asks Workforce to staff a work order and sees who is booked, without CMMS holding worker
data:

- **Staffing request on the work order:** window, headcount and capability codes. There is one live request
  per work order; it can be withdrawn with a reason, and cancelling the work order withdraws it.
- **Workforce answers asynchronously:**
  - it opens a requirement sourced from the work order and CMMS shows the request as ACCEPTED; or
  - it refuses (for example an unknown capability), and CMMS shows the request as REJECTED with the reason.
- **Bookings flow back:** as Workforce books, confirms, dispatches or cancels, the work order shows each booking
  (person's display name, window, status). CMMS stores only Workforce ids, the name and the status.
- **Delivery:** ADR-0007 option A.
  - Each module relays its own outbox to the peer's `/internal/v1/inbox`.
  - Each delivery carries an Ed25519 relay token bound to the tenant, the message id and the exact body.
  - Receipts commit with the effect, so redelivery and replay never repeat it.
- **Screen:** CMMS → Work orders → Staffing card (Medusa UI).

## Exact evidence identity

| Artifact | Identity |
| --- | --- |
| CMMS image | `gigalibs/cmms-api:5abfa667bb10-01c4ea9827a7` (schema contract 11) |
| Workforce image | `gigalibs/workforce-api:5abfa667bb10-01c4ea9827a7` (schema contract 8) |
| Other services | unchanged at `5abfa667bb10-7507432cb066` |
| Image policy | `infra/compose/evidence/wi-oi-068-20260927T141002Z`: 0 Critical, 0 High |

## Measured result

- **Chain:** build; tests (211 files, 1,851 tests); the six audits; identity; Workforce and module images. All
  pass.
- **`verify-cmms-workforce-handshake.sh`** passes in 31 s (run `20260927T140814Z`):
  - the full request → requirement → booking → projection path;
  - a keyed refusal;
  - the cascade when a work order is cancelled;
  - a withdrawn request is not resurrected;
  - direct redelivery is a duplicate, and a stale version never overwrites;
  - relay and user tokens are refused on each other's routes;
  - wrong audience, wrong source, tenant mismatch, tampered body and forged key are all refused;
  - outbox replay in both directions (1 requirement, 1:1 receipts, projection unchanged);
  - restart persistence with delivery resumed;
  - tenant B is denied and holds no rows.
- **Re-certified:** CMMS runtime, HTTP and journey; Workforce runtime, HTTP, journey, jobs, availability and
  bookings.

## Incident to acknowledge

At 13:50 UTC, CMMS migration 000011 was applied to the live database outside the migration runner, while the
running CMMS image still expected contract 10. CMMS readiness failed until the certified image was deployed at
14:07 UTC. The applied objects matched the reviewed file, and the runner then confirmed version 11. Local
evidence attributes it to the concurrent Antigravity agent session `29edddb1`, which ran `psql` directly as a
prerequisite for its own unregistered work (see `.pi/work/WI-OI-068.md`). Only the runner, with the matching
image, should apply migrations.

## Open items

- **Web image certification of the Staffing card.** Blocked by the unregistered forms work, which was not
  modified. The card is type-checked and boundary-tested only.
- **PUBLIC `EXECUTE` on the relay functions.** They keep the PostgreSQL default. Schema usage limits them to
  each module's runtime role (verified live). Revoking needs a forward migration once the runner grants
  function privileges.

## Product Owner acceptance run

1. GigaOps → Skills: create capability `MECH-L2`. Resources: add a person with it and an always-available
   pattern.
2. CMMS → Work orders: open a work order. Under Staffing, request 1 person with `MECH-L2` for tomorrow
   08:00–12:00.
3. Press Refresh; the request shows ACCEPTED. GigaOps → Scheduling: book and confirm the person on the new
   requirement.
4. Back on the work order, the booking shows CONFIRMED with the person's name.
5. On another work order, request capability `NOPE`. It shows REJECTED with the reason.
6. Cancel the first work order. Its staffing shows CANCELLED, and in Scheduling the requirement and booking are
   cancelled.

## Review decisions required

1. **Solution Architecture / Product:**
   - option A as the local transport, with Redis/BullMQ later behind the same relay interface;
   - "bookings inform, the manager completes".
2. **Security & Privacy:**
   - the relay token design and key custody (`generate-relay-credentials.sh`);
   - the definer functions as the relay's only cross-tenant access;
   - the inbox's reachability: internal route, never through the BFF.
3. **API Contracts:** `RelayEnvelopeV1`, `CmmsStaffingRequested/CancelledV1`, `WorkforceHandshakeFactV1` (with
   the request key), and `staffing` and `bookings` on `CmmsWorkOrderDetailV1`.
4. **QA/SDET:** the handshake certification scope.
