# ADR-0007: Workforce ↔ CMMS work handshake and cross-module event delivery

- Status: Accepted — option A (owner instruction 2026-09-27: proceed with the recommended option); built and
  certified under WI-OI-068; independent reviews and human acceptance remain open
- Date: 2026-09-27
- Programme: WI-OI-062, phase P6
- Related: ADR-0003 (Workforce owns people), ADR-0005 (module-owned outbox and inbox; replaceable transport),
  ADR-0006 (plain place references), WI-OI-067 (demand and booking, certified)

## Context

CMMS owns maintenance work orders; Workforce owns people, demand and bookings (WI-OI-067). A maintenance
manager must staff a work order with a qualified, available person without CMMS copying worker data, and see
who is booked. Both modules already write Delta 5 envelopes to their own outbox in the same transaction as the
state change. No module-to-module delivery exists: the local profile has no Redis/BullMQ runtime, and module
APIs accept only BFF-signed user contexts.

## Decision

1. **Contracts (versioned, logical ids only).**
   - **CMMS → Workforce, `CmmsStaffingRequestedV1`:** tenant, work order id and number, `site_ref`, window,
     headcount, required capability codes, request key.
   - **Workforce → CMMS, `ResourceBookingCreatedV1` / `ResourceBookingStatusChangedV1`:** requirement id,
     booking id, source `CMMS_WORK_ORDER:<id>`, resource id and display name, window, status.
   - **Workforce → CMMS, `WorkRequirementRequested/CancelledV1` and `StaffingRequestRejectedV1`:** the
     requirement id (or the refusal code and reason) and the CMMS request key the fact answers.
   - **Storage:** CMMS stores each staffing request (`work_order_staffing`: window, headcount, capability codes,
     request key, the Workforce requirement id once accepted, the refusal reason) and a booking projection
     (`work_order_bookings`: booking id, resource id and display name, window, status, Workforce version). It
     stores no worker master data. Workforce stores the source reference on the requirement (one live
     requirement per work order, enforced by the database).
2. **Idempotency.**
   - The consumer writes an `inbox_receipts` row keyed by `(consumer, message_id)` in the same transaction as
     its effect. A redelivered message is acknowledged without a second effect.
   - *As built:* each staffing request has its own random request key (a work order can be re-staffed after a
     withdrawal), and CMMS allows one live request per work order. A replayed request cannot create a second
     requirement: the inbox receipt, Workforce's request-key replay and the one-live-requirement index each
     stop it. Workforce facts carry the request key, so CMMS settles exactly the request they answer; a late
     acceptance never resurrects a withdrawn request.
   - Booking facts are projected only when their Workforce version is newer than the stored one, so
     out-of-order or replayed facts converge on the latest state.
3. **Delivery (owner decision required).** The recommendation is **option A**.
   - **A. Relay over internal HTTP with a relay credential.** Each producing module runs an outbox relay
     (claim, deliver, mark published, back-off, dead letter). It POSTs the envelope to the consumer's
     `/internal/v1/inbox` on the private compose network. It is authenticated by a dedicated Ed25519 relay key
     per consumer: audience `<module>-inbox`, claim `kind: 'relay'`, the tenant from the envelope, and no user
     scopes. The inbox route rejects user contexts, and user routes reject relay contexts.
     - *As built:* header `typ: relay+jwt`, issuer `gigalibs-module-relay`, `sub` the source module, audience
       `gigalibs-cmms-inbox` / `gigalibs-workforce-inbox`, bound to the tenant, the message id and the SHA-256
       of the exact body, at most 120 s. The relay leases rows through two SECURITY DEFINER functions per
       module, limited to the handshake event types; they are its only cross-tenant access. 2xx publishes; a
       4xx other than 408/429 is a permanent failure; anything else retries with back-off up to ten attempts.
     - *Ordering (added 2026-09-27 after a defect):* delivery is FIFO per work order. The lease takes a fact only
       when no earlier fact of the same work order is pending, so a retrying fact holds back its successors;
       outbox rows are stamped with `clock_timestamp()`. A dead-lettered fact releases its successors and needs
       operator attention.
     - No new infrastructure; the consumer verifies every message; it fits the current signed-context model.
   - **B. Redis/BullMQ as in ADR-0005 §4.** This adds a pinned Redis service to the local profile, needing its
     own scan, restore and credential evidence. It matches the long-term transport and later swaps behind the
     same relay interface.

   Either way the transport sits behind a relay interface; outbox rows and inbox receipts stay authoritative,
   and replay from the outbox is always possible.
4. **Failure handling.**
   - An unknown event type or version goes to dead letter with a reason. The producer is never blocked.
   - A consumer effect that fails validation (for example an unknown site, or a capability code the tenant
     lacks) is receipted as `FAILED` with a code. It surfaces on the CMMS work order as "staffing request
     rejected: <reason>".
5. **No cross-module reads.** CMMS never queries Workforce tables and vice versa; the UI composes through the
   BFF.

## Consequences

- P6 exit "work order → booking → completion idempotent and replayable" becomes testable by replaying outbox
  rows and redelivering inbox messages.
- Option A adds two key pairs (CMMS inbox, Workforce inbox) to the credentials generator and one internal
  route per module.
- Option B adds a Redis image and backup scope to the local profile.

## Owner decisions

1. **Option A**, chosen 2026-09-27 (recommended option, per the owner's standing instruction).
2. Completing bookings only **informs** the work order (the projection shows each booking's status); the
   maintenance manager completes it with evidence. Recorded as the recommended default and open to owner
   change.

## Residual items

- The relay functions keep PostgreSQL's default PUBLIC `EXECUTE`. Only the module runtime role can use each
  schema, so no other role can reach them; revoking PUBLIC needs a forward migration once the runner grants
  function privileges.
- Option B remains the long-term transport; the relay interface lets it replace HTTP without changing outbox or
  inbox semantics.
