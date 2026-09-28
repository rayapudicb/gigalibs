# WI-OI-068 — CMMS ↔ Workforce work handshake (roadmap P6, second adopter)

Status: Review — bounded Local G4 Build complete 2026-09-27; independent reviews and human acceptance open  
Owner: SDLC Orchestrator / Workforce Domain / Maintenance Domain  
Requirements: FR-01, FR-04, FR-05, FR-08, FR-10, FR-12; NFR-SEC-001–005, NFR-DATA-001–004, NFR-REL-001–003,
NFR-OBS-001–004  
Independent reviewers: Solution Architecture, Security & Privacy, Backend/Data, API Contracts, QA/SDET, Product

## Outcome

A maintenance manager staffs a CMMS work order with a qualified, available person from Workforce, and sees
the booking on the work order, without CMMS holding worker data. This is the P6 exit "work order → booking →
completion idempotent and replayable".

## Decision

ADR-0007 **option A** (internal HTTP relay with dedicated relay keys), taken on the owner's instruction of
2026-09-27 ("proceed next"; "choose the recommended"). ADR-0007 is Accepted and records the as-built design.
Completing bookings informs the work order; the maintenance manager completes it (recommended default).

## Built

- **Relay token** (`@gigalibs/auth-core` `relay-token.ts`): `typ: relay+jwt`, issuer `gigalibs-module-relay`,
  `sub` the source module, per-inbox audience, bound to tenant, message id and body SHA-256, ≤ 120 s.
- **Per module:** outbox relay (lease/settle through SECURITY DEFINER functions limited to the handshake event
  types, back-off, dead letter on permanent 4xx), `/internal/v1/inbox` guarded by the relay key, inbox receipts
  in the effect's transaction, `rawBody` for the digest. Relay target limited to the peer's Compose origin.
- **CMMS** (migration 000011, contract 11): `work_order_staffing` (one live request per work order),
  `work_order_bookings` projection (no worker master data), `inbox_receipts`, `STAFFING_REQUESTED/UPDATED`
  work-order events; `POST v1/work-orders/:id/staffing` and `/staffing/cancel`; cancelling a work order
  withdraws its staffing; detail carries `staffing` and `bookings`.
- **Workforce** (migration 000008, contract 8): consumes staffing requests and cancellations as the relay
  principal; unknown capabilities and refused requirements are receipted and answered with a keyed refusal
  fact; requirement, refusal and cancellation facts carry the CMMS request key.
- **Matching:** CMMS settles exactly the request a fact answers (request key or requirement id); a withdrawn
  request is never resurrected; booking facts apply only when their Workforce version is newer.
- **Keys:** `infra/compose/scripts/generate-relay-credentials.sh` appends two Ed25519 pairs to `.env.modules`
  and `.env.workforce` (mode 0600, refuses to replace, prints no secrets).
- **Web:** BFF allow-list `POST work-orders/:id/staffing(/cancel)` → `cmms.work-orders.write`; the inbox is
  unreachable through the BFF (tested); Staffing card on the work order (Medusa UI).
- **Fixes found on the way:** requirement-cancel booking reasons and the CMMS cancellation reason are bounded to
  the 500-character columns (a long reason previously caused a 500); relay interval validated (100–60,000 ms).

## Certification — identity `5abfa667bb10-01c4ea9827a7`

- Chain: build, test (211 files / 1,851 tests), six audits, identity, Workforce and module images — exit 0.
- Deployed `cmms-migrations`, `cmms-api`, `workforce-migrations`, `workforce-api` with `--no-deps`; CMMS 11,
  Workforce 8 (000008 applied by the runner).
- `verify-cmms-workforce-handshake.sh` (new) passed, run `20260927T140814Z`: request → requirement → booking →
  projection; unknown capability refused with reason; cascade on work-order cancel; withdrawn request not
  resurrected; redelivery duplicate; stale version ignored; user/relay token cross-refusal; wrong audience,
  wrong source, tenant mismatch, tampered body, forged key refused; outbox replay both ways without a second
  effect; restart persistence; tenant B denied; relay functions reachable only by the two runtime roles.
- CMMS runtime/HTTP/journey and Workforce runtime/HTTP/journey/jobs/availability/bookings re-certified.
- Unit tests: CMMS relay (14), Workforce relay (10), BFF boundary (staffing routes, inbox unreachable).
- Image policy `infra/compose/evidence/wi-oi-068-20260927T141002Z`: 0 Critical, 0 High.

## Ordering defect and re-certification (same day)

WI-OI-069's regression run found that a staffing withdrawal could reach Workforce before its request. The relay
lease's `UPDATE … RETURNING` does not keep the subquery order, and facts written in one transaction shared
`now()`. The consequence was a Workforce requirement left open for a withdrawn request (test tenants only).

The fix is two forward migrations, CMMS `000012_cmms_relay_ordering` (contract 12) and Workforce
`000010_workforce_relay_ordering` (contract 10):

- the lease takes a fact only when no earlier fact of the same work order is still pending;
- outbox rows use `clock_timestamp()`;
- a partial index supports the lease;
- the relays sort each batch.

`verify-cmms-workforce-handshake.sh` now also asserts per-work-order delivery order in both directions and zero
open requirements for withdrawn staffing. On identity `5abfa667bb10-811bff4d48da` it passed three consecutive
runs, and CMMS runtime (clean install to 12, upgrade 2→12), HTTP and journey were re-certified. Evidence:
`infra/compose/evidence/wi-oi-069-20260927T145011Z` (0 Critical, 0 High).

## Incident during the build

At 13:50 UTC CMMS migration 000011 was applied to the live database outside the migration runner while the
running CMMS image still expected contract 10, so CMMS readiness failed (unhealthy) until the certified image
was deployed at 14:07 UTC. The applied objects matched the file exactly (tables, forced RLS, definer
functions, grants via default privileges); the runner then confirmed version 11.

**Attribution (from local evidence, 2026-09-27):** the concurrent Antigravity/Gemini agent session `29edddb1`
applied it. Its transcript
(`~/.gemini/antigravity/brain/29edddb1-…/.system_generated/logs/transcript.jsonl`) shows:

- 13:50:05 UTC: it read `gigalibs_cmms.schema_migrations`;
- 13:50:33 UTC: it ran `docker exec -i gigalibs-postgres psql -U gigalibs -d gigalibs < modules/physical-operations-cmms/db/migrations/000011_cmms_workforce_handshake.up.sql`;
- 13:50:47 UTC: it recorded "Migration 000011 is successfully applied".

It did this as a prerequisite for its own unregistered "Phase 5 CMMS workforce ledger settlement" work. The
owner's last instruction to that session was "proceed with phase 4". The Claude session was idle from 12:44 to
13:59 UTC.

This bypassed the migration runner and used the superuser, against the rule that schema changes need migration
verification. It also applied an uncommitted, uncertified migration from another item's work in progress. Two
agents building in one repository and one database at the same time also breaks the one-active-item limit.

## Residual / open

- Web image certification of the Staffing card (blocked by the unregistered forms work; type-checked and
  boundary-tested only).
- Relay functions keep PUBLIC `EXECUTE` (schema usage limits reach to each module's runtime role).
- Workforce accepts any `CMMS_WORK_ORDER` source reference; CMMS receipts non-UUID references as invalid (seen
  once for a WI-OI-067 certification record).
- Human acceptance run below.

## Product Owner acceptance run

1. GigaOps → Skills: create capability `MECH-L2`; Resources: a person with it and an always-available pattern.
2. CMMS → Work orders: open a work order → Staffing → request 1 person with `MECH-L2` for tomorrow 08:00–12:00.
3. Refresh: status becomes ACCEPTED. GigaOps → Scheduling: book and confirm the person on the new requirement.
4. Back on the work order: the booking shows as CONFIRMED with the person's name.
5. Request staffing on another work order with capability `NOPE`: it becomes REJECTED with the reason.
6. Cancel the first work order: staffing shows CANCELLED; in Scheduling the requirement and booking are cancelled.

## Production readiness (2026-09-27)

Not production ready; still in Review. See `docs/reviews/production-readiness-WI-OI-068-071-2026-09-27.md`.
Production hardening was re-certified on `5abfa667bb10-7d322fbdc9dd` (CMMS and Workforce schema 13):

- reference pay packs are off unless a profile enables them;
- relay functions are executable only by their own module's runtime role;
- the backup/restore drill passed (`verify-module-restore.sh`);
- the relay-outage drill passed (`verify-cmms-workforce-relay-outage.sh`);
- the full regression passed.

Open: independent review, E2E/WCAG (web image), UAT, frozen source, release authority and the owner decisions.

